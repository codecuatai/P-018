import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { isEmail } from 'class-validator';

import { CoreStore } from '../core/core.module';
import { issueAccessToken, verifyAccessToken } from './auth.token';
import { AuthStore, DuplicateAuthEmailError } from './auth.repository';
import { AccessTokenClaims, AdminUserSummary, AuthAccount, AuthSession, AuthSessionSummary, AuthUser, AuthUserStatus, IssuedAuthSession } from './auth.types';
import { PasswordResetDelivery } from './password-reset.delivery';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const PASSWORD_COMPLEXITY_REGEX = /(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9])/;
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
} as const;

export interface AuthRequestMetadata {
  userAgent?: string;
  ip?: string;
}

export interface GatewayAuthConfiguration {
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  resetTokenTtlSeconds: number;
  issuer: string;
  audience: string;
  refreshCookieName: string;
  devResetTokenCapture: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly store: AuthStore,
    private readonly core: CoreStore,
    private readonly passwordResetDelivery: PasswordResetDelivery,
  ) {}

  get settings(): GatewayAuthConfiguration {
    return {
      accessTokenTtlSeconds: this.config.getOrThrow<number>('AUTH_ACCESS_TOKEN_TTL_SECONDS'),
      refreshTokenTtlSeconds: this.config.getOrThrow<number>('AUTH_REFRESH_TOKEN_TTL_SECONDS'),
      resetTokenTtlSeconds: this.config.getOrThrow<number>('AUTH_RESET_TOKEN_TTL_SECONDS'),
      issuer: this.config.getOrThrow<string>('AUTH_ISSUER'),
      audience: this.config.getOrThrow<string>('AUTH_AUDIENCE'),
      refreshCookieName: this.config.getOrThrow<string>('AUTH_REFRESH_COOKIE_NAME'),
      devResetTokenCapture: this.config.get<boolean>('AUTH_DEV_RESET_TOKEN_CAPTURE') === true,
    };
  }

  async register(input: { email: string; fullName: string; password: string }, metadata: AuthRequestMetadata, correlationId: string): Promise<IssuedAuthSession> {
    const emailNormalized = normalizeEmail(input.email);
    const fullName = normalizeFullName(input.fullName);
    assertPasswordPolicy(input.password);
    const now = new Date().toISOString();
    const account: AuthAccount = {
      id: randomUUID(),
      email: emailNormalized,
      emailNormalized,
      fullName,
      role: 'customer',
      status: 'active',
      passwordHash: await argon2.hash(input.password, ARGON2_OPTIONS),
      passwordChangedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    const next = this.newSession(account.id, randomUUID(), metadata);
    try {
      await this.store.createUserWithSession(account, next.session);
    } catch (error) {
      if (error instanceof DuplicateAuthEmailError) {
        throw new ConflictException({ code: 'ACCOUNT_ALREADY_EXISTS', detail: 'Không thể tạo tài khoản với email này.', retryable: false });
      }
      throw error;
    }
    const issued = this.issueFor(account, next.session, next.refreshToken);
    await this.audit('REGISTER', account.id, correlationId, issued.session.familyId);
    return issued;
  }

  async login(input: { email: string; password: string }, metadata: AuthRequestMetadata, correlationId: string): Promise<IssuedAuthSession> {
    const emailNormalized = normalizeEmail(input.email);
    const account = await this.store.getUserByEmailNormalized(emailNormalized);
    const matches = account ? await safelyVerifyPassword(account.passwordHash, input.password) : false;
    if (!account || !matches || account.status !== 'active') {
      await this.audit('LOGIN_FAILURE', account?.id, correlationId, undefined, { reason: 'invalid_credentials' });
      throw invalidCredentials();
    }
    const issued = await this.createSessionFor(account, metadata);
    await this.audit('LOGIN_SUCCESS', account.id, correlationId, issued.session.familyId);
    return issued;
  }

  getGoogleAuthUrl(): string {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const callbackUrl = this.config.get<string>('GOOGLE_CALLBACK_URL');
    if (!clientId || !callbackUrl) {
      throw new BadRequestException({ code: 'GOOGLE_AUTH_NOT_CONFIGURED', detail: 'Chức năng đăng nhập Google chưa được cấu hình trên hệ thống.', retryable: false });
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async loginWithGoogle(input: { code: string; redirectUri?: string }, metadata: AuthRequestMetadata, correlationId: string): Promise<IssuedAuthSession> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const callbackUrl = this.config.get<string>('GOOGLE_CALLBACK_URL');
    if (!clientId || !clientSecret) {
      throw new BadRequestException({ code: 'GOOGLE_AUTH_NOT_CONFIGURED', detail: 'Chức năng đăng nhập Google chưa được cấu hình trên hệ thống.', retryable: false });
    }
    const redirectUri = input.redirectUri || callbackUrl;
    if (!redirectUri) {
      throw new BadRequestException({ code: 'GOOGLE_REDIRECT_URI_MISSING', detail: 'Thiếu thông tin redirect URI.', retryable: false });
    }

    let tokenData: { access_token?: string; id_token?: string };
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: input.code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        await this.audit('GOOGLE_AUTH_EXCHANGE_FAILED', undefined, correlationId, undefined, { error: errorText });
        throw new UnauthorizedException({ code: 'GOOGLE_AUTH_FAILED', detail: 'Mã xác thực Google không hợp lệ hoặc đã hết hạn.', retryable: false });
      }
      tokenData = (await response.json()) as { access_token?: string; id_token?: string };
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) throw error;
      throw new UnauthorizedException({ code: 'GOOGLE_AUTH_FAILED', detail: 'Không thể kết nối đến máy chủ Google OAuth.', retryable: false });
    }

    if (!tokenData.access_token) {
      throw new UnauthorizedException({ code: 'GOOGLE_AUTH_FAILED', detail: 'Không nhận được mã truy cập từ Google.', retryable: false });
    }

    let profile: { sub: string; email: string; email_verified?: boolean; name?: string; picture?: string };
    try {
      const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (!userinfoResponse.ok) {
        throw new UnauthorizedException({ code: 'GOOGLE_AUTH_FAILED', detail: 'Không thể lấy thông tin người dùng từ Google.', retryable: false });
      }
      profile = (await userinfoResponse.json()) as { sub: string; email: string; email_verified?: boolean; name?: string; picture?: string };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException({ code: 'GOOGLE_AUTH_FAILED', detail: 'Lỗi khi lấy thông tin người dùng Google.', retryable: false });
    }

    if (!profile.email || profile.email_verified === false) {
      throw new UnauthorizedException({ code: 'GOOGLE_EMAIL_UNVERIFIED', detail: 'Tài khoản Google của bạn chưa được xác thực email.', retryable: false });
    }

    const emailNormalized = normalizeEmail(profile.email);
    let account = await this.store.getUserByEmailNormalized(emailNormalized);
    if (account) {
      if (account.status !== 'active') {
        await this.audit('LOGIN_FAILURE', account.id, correlationId, undefined, { reason: 'account_disabled' });
        throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED', detail: 'Tài khoản của bạn đã bị vô hiệu hóa.', retryable: false });
      }
      if (profile.picture && !account.avatarUrl) {
        await this.store.updateProfile(account.id, { avatarUrl: profile.picture });
      }
    } else {
      const now = new Date().toISOString();
      const newAccount: AuthAccount = {
        id: randomUUID(),
        email: emailNormalized,
        emailNormalized,
        fullName: normalizeFullName(profile.name || emailNormalized.split('@')[0]),
        avatarUrl: profile.picture,
        role: 'customer',
        status: 'active',
        passwordHash: await argon2.hash(randomBytes(32).toString('hex'), ARGON2_OPTIONS),
        passwordChangedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      const initial = this.newSession(newAccount.id, randomUUID(), metadata);
      try {
        await this.store.createUserWithSession(newAccount, initial.session);
      } catch (error) {
        if (error instanceof DuplicateAuthEmailError) {
          account = await this.store.getUserByEmailNormalized(emailNormalized);
        } else {
          throw error;
        }
      }
      if (!account) {
        const issued = this.issueFor(newAccount, initial.session, initial.refreshToken);
        await this.audit('REGISTER_GOOGLE', newAccount.id, correlationId, issued.session.familyId);
        return issued;
      }
    }

    const issued = await this.createSessionFor(account, metadata);
    await this.audit('LOGIN_GOOGLE_SUCCESS', account.id, correlationId, issued.session.familyId);
    return issued;
  }

  async refresh(refreshToken: string, metadata: AuthRequestMetadata, correlationId: string, triggerCorrelationId?: string): Promise<IssuedAuthSession> {
    const currentHash = tokenHash(refreshToken);
    const current = await this.store.getSessionByRefreshHash(currentHash);
    if (!current) throw invalidRefreshToken();
    const next = this.newSession(current.userId, current.familyId, metadata);
    const rotation = await this.store.rotateRefreshToken(currentHash, next.session, new Date().toISOString());
    if (rotation.state === 'REUSE_DETECTED') {
      await this.audit('REFRESH_TOKEN_REUSE_DETECTED', rotation.account.id, correlationId, rotation.familyId, triggerCorrelationId ? { trigger_correlation_id: triggerCorrelationId } : undefined);
      throw new UnauthorizedException({ code: 'REFRESH_TOKEN_REUSED', detail: 'Phiên đăng nhập không còn hợp lệ.', retryable: false });
    }
    if (rotation.state !== 'ROTATED') throw invalidRefreshToken();
    await this.audit('REFRESH_TOKEN_ROTATED', rotation.account.id, correlationId, rotation.session.familyId, triggerCorrelationId ? { trigger_correlation_id: triggerCorrelationId } : undefined);
    return this.issueFor(rotation.account, rotation.session, next.refreshToken);
  }

  async logout(refreshToken: string | undefined, correlationId: string): Promise<void> {
    if (!refreshToken) return;
    const revoked = await this.store.revokeFamilyByRefreshHash(tokenHash(refreshToken), 'logout', new Date().toISOString());
    if (revoked) await this.audit('LOGOUT', revoked.account.id, correlationId, revoked.familyId);
  }

  async logoutAll(user: AuthUser, correlationId: string): Promise<void> {
    await this.store.revokeAllUserSessions(user.sub, 'logout_all', new Date().toISOString());
    await this.audit('LOGOUT_ALL', user.sub, correlationId);
  }

  async listSessions(user: AuthUser, currentRefreshToken?: string): Promise<AuthSessionSummary[]> {
    const currentHash = currentRefreshToken ? tokenHash(currentRefreshToken) : undefined;
    const current = currentHash ? await this.store.getSessionByRefreshHash(currentHash) : undefined;
    const now = Date.now();
    const grouped = new Map<string, AuthSession[]>();
    for (const session of await this.store.listSessionsForUser(user.sub)) {
      if (session.revokedAt || Date.parse(session.expiresAt) <= now) continue;
      const family = grouped.get(session.familyId) ?? [];
      family.push(session);
      grouped.set(session.familyId, family);
    }
    return [...grouped.entries()]
      .map(([familyId, sessions]) => {
        const newest = [...sessions].sort((left, right) => Date.parse(right.lastUsedAt) - Date.parse(left.lastUsedAt))[0];
        return {
          id: familyId,
          created_at: new Date(Math.min(...sessions.map((session) => Date.parse(session.createdAt)))).toISOString(),
          last_used_at: newest.lastUsedAt,
          expires_at: new Date(Math.max(...sessions.map((session) => Date.parse(session.expiresAt)))).toISOString(),
          current: current?.familyId === familyId,
          ...(newest.userAgent ? { user_agent: newest.userAgent } : {}),
        };
      })
      .sort((left, right) => Date.parse(right.last_used_at) - Date.parse(left.last_used_at));
  }

  async revokeSession(user: AuthUser, familyId: string, correlationId: string): Promise<void> {
    const revoked = await this.store.revokeFamily(user.sub, familyId, 'user_revoked', new Date().toISOString());
    if (!revoked) throw new NotFoundException({ code: 'SESSION_NOT_FOUND', detail: 'Không tìm thấy phiên đăng nhập.', retryable: false });
    await this.audit('SESSION_REVOKED', user.sub, correlationId, familyId);
  }

  async changePassword(user: AuthUser, input: { currentPassword: string; newPassword: string }, correlationId: string): Promise<void> {
    assertPasswordPolicy(input.newPassword);
    const account = await this.store.getUserById(user.sub);
    if (!account || !await safelyVerifyPassword(account.passwordHash, input.currentPassword)) {
      throw new UnauthorizedException({
        code: 'CURRENT_PASSWORD_INVALID',
        detail: 'Mật khẩu hiện tại không đúng.',
        retryable: false,
      });
    }
    const nextHash = await argon2.hash(input.newPassword, ARGON2_OPTIONS);
    const updated = await this.store.updatePasswordAndRevokeSessions(user.sub, nextHash, new Date().toISOString(), 'password_changed');
    if (!updated) {
      throw new UnauthorizedException({
        code: 'CURRENT_PASSWORD_INVALID',
        detail: 'Mật khẩu hiện tại không đúng.',
        retryable: false,
      });
    }
    await this.audit('PASSWORD_CHANGED', user.sub, correlationId);
  }

  async requestPasswordReset(email: string, correlationId: string): Promise<{ deliveryAvailable: boolean; devResetToken?: string }> {
    const account = await this.store.getUserByEmailNormalized(normalizeEmail(email));
    if (!account || account.status !== 'active') return { deliveryAvailable: false };
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    await this.store.createPasswordResetToken({
      id: randomUUID(),
      userId: account.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(now.getTime() + this.settings.resetTokenTtlSeconds * 1_000).toISOString(),
      createdAt: now.toISOString(),
    });
    const delivery = await this.passwordResetDelivery.deliver({ userId: account.id, email: account.email, token, expiresAt: new Date(now.getTime() + this.settings.resetTokenTtlSeconds * 1_000).toISOString() });
    await this.audit('PASSWORD_RESET_REQUESTED', account.id, correlationId);
    return this.settings.devResetTokenCapture ? { deliveryAvailable: delivery.deliveryAvailable, devResetToken: token } : delivery;
  }

  async resetPassword(token: string, newPassword: string, correlationId: string): Promise<void> {
    assertPasswordPolicy(newPassword);
    const result = await this.store.consumePasswordResetToken(tokenHash(token), await argon2.hash(newPassword, ARGON2_OPTIONS), new Date().toISOString());
    if (result.state !== 'CONSUMED') throw new BadRequestException({ code: 'RESET_TOKEN_INVALID', detail: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.', retryable: false });
    await this.audit('PASSWORD_RESET_COMPLETED', result.account.id, correlationId);
  }

  async authenticateAccessToken(token: string): Promise<AuthUser | undefined> {
    const claims = verifyAccessToken(token, this.config.getOrThrow<string>('JWT_SECRET'), this.settings.issuer, this.settings.audience);
    if (!claims) return undefined;
    const account = await this.store.getActiveUserForSession(claims.sub, claims.sid, claims.iat);
    return account ? this.toPublicUser(account, claims.sid) : undefined;
  }

  async listUsers(page = 1, pageSize = 50): Promise<{ items: AdminUserSummary[]; total: number }> {
    return this.store.listUsers(page, pageSize);
  }

  async updateUserStatus(id: string, status: AuthUserStatus): Promise<AuthAccount | undefined> {
    const updated = await this.store.updateUserStatus(id, status);
    if (status === 'disabled') {
      await this.store.revokeAllUserSessions(id, 'ADMIN_DISBANDED', new Date().toISOString());
    }
    return updated;
  }

  async updateProfile(user: AuthUser, patch: { fullName?: string; phone?: string; avatarUrl?: string; language?: string; timezone?: string; onboardingCompletedAt?: string }): Promise<AuthUser> {
    const updated = await this.store.updateProfile(user.sub, patch);
    if (!updated) throw new NotFoundException({ code: 'USER_NOT_FOUND', detail: 'Không tìm thấy hồ sơ.', retryable: false });
    await this.audit('PROFILE_UPDATED', user.sub, user.session_id ?? 'profile');
    return this.toPublicUser(updated, user.session_id);
  }

  toPublicUser(account: AuthAccount, sessionId?: string): AuthUser {
    return {
      id: account.id,
      sub: account.id,
      email: account.email,
      full_name: account.fullName,
      ...(account.phone ? { phone: account.phone } : {}),
      ...(account.avatarUrl ? { avatar_url: account.avatarUrl } : {}),
      ...(account.language ? { language: account.language } : {}),
      ...(account.timezone ? { timezone: account.timezone } : {}),
      ...(account.onboardingCompletedAt ? { onboarding_completed_at: account.onboardingCompletedAt } : {}),
      role: account.role,
      status: account.status,
      ...(sessionId ? { session_id: sessionId } : {}),
      authentication_kind: 'real',
    };
  }

  private async createSessionFor(account: AuthAccount, metadata: AuthRequestMetadata): Promise<IssuedAuthSession> {
    const next = this.newSession(account.id, randomUUID(), metadata);
    await this.store.createSession(next.session);
    return this.issueFor(account, next.session, next.refreshToken);
  }

  private newSession(userId: string, familyId: string, metadata: AuthRequestMetadata): { session: AuthSession; refreshToken: string } {
    const now = new Date();
    const refreshToken = randomBytes(48).toString('base64url');
    return {
      refreshToken,
      session: {
        id: randomUUID(),
        userId,
        familyId,
        refreshTokenHash: tokenHash(refreshToken),
        expiresAt: new Date(now.getTime() + this.settings.refreshTokenTtlSeconds * 1_000).toISOString(),
        createdAt: now.toISOString(),
        lastUsedAt: now.toISOString(),
        ...(metadata.userAgent ? { userAgent: boundedUserAgent(metadata.userAgent) } : {}),
        ...(metadata.ip ? { ipHash: ipHash(metadata.ip, this.config.getOrThrow<string>('JWT_SECRET')) } : {}),
      },
    };
  }

  private issueFor(account: AuthAccount, session: AuthSession, refreshToken: string): IssuedAuthSession {
    const user = this.toPublicUser(account, session.familyId);
    return {
      accessToken: issueAccessToken(user, session.familyId, this.config.getOrThrow<string>('JWT_SECRET'), this.settings.issuer, this.settings.audience, this.settings.accessTokenTtlSeconds),
      expiresIn: this.settings.accessTokenTtlSeconds,
      refreshToken,
      session,
      user,
    };
  }

  private audit(action: string, actorId: string | undefined, correlationId: string, resourceId?: string, metadata?: Record<string, unknown>): Promise<void> {
    return this.core.audit({ action, actorId, correlationId, resourceId, metadata });
  }
}

export function normalizeEmail(value: string): string {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized || !isEmail(normalized)) throw new UnprocessableEntityException({ code: 'EMAIL_INVALID', detail: 'Email không hợp lệ.', retryable: false });
  return normalized;
}

export function assertPasswordPolicy(password: string): void {
  if (typeof password !== 'string') {
    throw new UnprocessableEntityException({ code: 'PASSWORD_POLICY', detail: 'Mật khẩu dài từ 8 đến 128 ký tự, bao gồm chữ, số và ký tự đặc biệt.', retryable: false });
  }
  const length = Array.from(password).length;
  if (length < MIN_PASSWORD_LENGTH || length > MAX_PASSWORD_LENGTH || !PASSWORD_COMPLEXITY_REGEX.test(password)) {
    throw new UnprocessableEntityException({ code: 'PASSWORD_POLICY', detail: 'Mật khẩu dài từ 8 đến 128 ký tự, bao gồm chữ, số và ký tự đặc biệt.', retryable: false });
  }
}

function normalizeFullName(value: string): string {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!name || Array.from(name).length > 160) throw new UnprocessableEntityException({ code: 'FULL_NAME_INVALID', detail: 'Họ và tên không hợp lệ.', retryable: false });
  return name;
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function ipHash(ip: string, secret: string): string {
  return createHash('sha256').update(`${secret}:${ip}`).digest('hex');
}

function boundedUserAgent(value: string): string {
  return value.slice(0, 512);
}

async function safelyVerifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({ code: 'INVALID_CREDENTIALS', detail: 'Email hoặc mật khẩu không đúng.', retryable: false });
}

function invalidRefreshToken(): UnauthorizedException {
  return new UnauthorizedException({ code: 'REFRESH_TOKEN_INVALID', detail: 'Phiên đăng nhập không còn hợp lệ.', retryable: false });
}
