import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';

import { AdminUserSummary, AuthAccount, AuthRole, AuthSession, AuthUserStatus } from './auth.types';

export function parseAuthRole(role: unknown): AuthRole {
  const str = String(role ?? '');
  if (str === 'admin' || str === 'manager' || str === 'provider' || str === 'user' || str === 'customer') {
    return str as AuthRole;
  }
  return 'user';
}

export class DuplicateAuthEmailError extends Error {
  constructor() {
    super('DUPLICATE_AUTH_EMAIL');
  }
}

// A refresh response can be lost in transit when the client aborts the request
// mid-flight (hard navigation, reload, or tab teardown while the page is still
// restoring its in-memory session). The server may have already committed the
// rotation, so the browser keeps the old cookie and replays it on the next
// load. Within this short grace window such a replay — of a just-consumed token
// whose replacement session is still untouched — is treated as that benign
// race and rolled forward. Outside the window, or once the replacement has
// already been used or revoked, genuine reuse detection still applies.
export const REFRESH_REUSE_GRACE_MS = 10_000;

function resolveReuseGraceMs(raw: unknown): number {
  const parsed = Number(raw ?? REFRESH_REUSE_GRACE_MS / 1_000);
  if (!Number.isFinite(parsed)) return REFRESH_REUSE_GRACE_MS;
  return Math.min(Math.max(parsed, 0), 300) * 1_000;
}
export type RefreshRotation =
  | { state: 'ROTATED'; account: AuthAccount; session: AuthSession }
  | { state: 'REUSE_DETECTED'; account: AuthAccount; familyId: string }
  | { state: 'EXPIRED'; account: AuthAccount; familyId: string }
  | { state: 'INVALID' };

export type ResetConsumption =
  | { state: 'CONSUMED'; account: AuthAccount }
  | { state: 'INVALID' };

export interface TwoFactorRecord {
  actorId: string;
  secret: string;
  enabled: boolean;
  backupCodes: string[];
}

export interface AuthRepository {
  createUser(account: AuthAccount): Promise<AuthAccount>;
  createUserWithSession(account: AuthAccount, session: AuthSession, providerMeta?: { providerType?: string; businessName?: string; address?: string }): Promise<AuthAccount>;
  getUserByEmailNormalized(emailNormalized: string): Promise<AuthAccount | undefined>;
  getUserById(id: string): Promise<AuthAccount | undefined>;
  listUsers(page: number, pageSize: number): Promise<{ items: AdminUserSummary[]; total: number }>;
  updateProfile(id: string, patch: { fullName?: string; phone?: string; avatarUrl?: string; language?: string; timezone?: string; onboardingCompletedAt?: string }): Promise<AuthAccount | undefined>;
  updateUserStatus(id: string, status: AuthUserStatus): Promise<AuthAccount | undefined>;
  updateUserRole(id: string, role: AuthRole): Promise<AuthAccount | undefined>;
  createSession(session: AuthSession): Promise<AuthSession>;
  getSessionByRefreshHash(refreshTokenHash: string): Promise<AuthSession | undefined>;
  rotateRefreshToken(currentHash: string, nextSession: AuthSession, now: string): Promise<RefreshRotation>;
  revokeFamilyByRefreshHash(refreshTokenHash: string, reason: string, now: string): Promise<{ account: AuthAccount; familyId: string } | undefined>;
  revokeAllUserSessions(userId: string, reason: string, now: string): Promise<void>;
  revokeFamily(userId: string, familyId: string, reason: string, now: string): Promise<boolean>;
  listSessionsForUser(userId: string): Promise<AuthSession[]>;
  getActiveUserForSession(userId: string, familyId: string, issuedAtSeconds: number): Promise<AuthAccount | undefined>;
  updatePasswordAndRevokeSessions(userId: string, passwordHash: string, now: string, reason: string): Promise<AuthAccount | undefined>;
  createPasswordResetToken(value: { id: string; userId: string; tokenHash: string; expiresAt: string; createdAt: string }): Promise<void>;
  consumePasswordResetToken(tokenHash: string, passwordHash: string, now: string): Promise<ResetConsumption>;
  getTwoFactor(actorId: string): Promise<TwoFactorRecord | undefined>;
  saveTwoFactorSetup(actorId: string, secret: string, backupCodes: string[]): Promise<void>;
  enableTwoFactor(actorId: string): Promise<void>;
  disableTwoFactor(actorId: string): Promise<void>;
  consumeTwoFactorBackupCode(actorId: string, codeHash: string): Promise<boolean>;
  close(): Promise<void>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isUsableStatus(status: AuthUserStatus): boolean {
  return status === 'active';
}

export class InMemoryAuthRepository implements AuthRepository {
  private readonly usersById = new Map<string, AuthAccount>();
  private readonly usersByEmail = new Map<string, string>();
  private readonly sessionsById = new Map<string, AuthSession>();
  private readonly sessionsByRefreshHash = new Map<string, string>();
  private readonly resetTokens = new Map<string, { id: string; userId: string; tokenHash: string; expiresAt: string; createdAt: string; usedAt?: string }>();
  private readonly twoFactor = new Map<string, TwoFactorRecord>();

  constructor(private readonly refreshReuseGraceMs = REFRESH_REUSE_GRACE_MS) {}

  async createUser(account: AuthAccount): Promise<AuthAccount> {
    if (this.usersByEmail.has(account.emailNormalized)) throw new DuplicateAuthEmailError();
    this.usersById.set(account.id, clone(account));
    this.usersByEmail.set(account.emailNormalized, account.id);
    return clone(account);
  }

  async createUserWithSession(account: AuthAccount, session: AuthSession, _providerMeta?: { providerType?: string; businessName?: string; address?: string }): Promise<AuthAccount> {
    if (account.role === 'provider') {
      account.providerType = _providerMeta?.providerType || account.providerType || 'ride_driver';
      account.tenantId = account.tenantId || `partner-${account.id.slice(0, 8)}`;
    }
    const created = await this.createUser(account);
    await this.createSession(session);
    return clone(this.usersById.get(created.id) ?? created);
  }

  async getUserByEmailNormalized(emailNormalized: string): Promise<AuthAccount | undefined> {
    const id = this.usersByEmail.get(emailNormalized);
    const account = id ? this.usersById.get(id) : undefined;
    return account ? clone(account) : undefined;
  }

  async getUserById(id: string): Promise<AuthAccount | undefined> {
    const account = this.usersById.get(id);
    return account ? clone(account) : undefined;
  }

  async listUsers(page: number, pageSize: number): Promise<{ items: AdminUserSummary[]; total: number }> {
    const all = [...this.usersById.values()]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    const start = (Math.max(page, 1) - 1) * pageSize;
    return { total: all.length, items: all.slice(start, start + pageSize).map(adminUserFromAccount) };
  }

  async updateProfile(id: string, patch: { fullName?: string; phone?: string; avatarUrl?: string; language?: string; timezone?: string; onboardingCompletedAt?: string }): Promise<AuthAccount | undefined> {
    const account = this.usersById.get(id);
    if (!account) return undefined;
    if (patch.fullName !== undefined) account.fullName = patch.fullName;
    if (patch.phone !== undefined) account.phone = patch.phone || undefined;
    if (patch.avatarUrl !== undefined) account.avatarUrl = patch.avatarUrl || undefined;
    if (patch.language !== undefined) account.language = patch.language || undefined;
    if (patch.timezone !== undefined) account.timezone = patch.timezone || undefined;
    if (patch.onboardingCompletedAt !== undefined) account.onboardingCompletedAt = patch.onboardingCompletedAt || undefined;
    account.updatedAt = new Date().toISOString();
    return clone(account);
  }

  async updateUserStatus(id: string, status: AuthUserStatus): Promise<AuthAccount | undefined> {
    const account = this.usersById.get(id);
    if (!account) return undefined;
    account.status = status;
    account.updatedAt = new Date().toISOString();
    return clone(account);
  }

  async updateUserRole(id: string, role: AuthRole): Promise<AuthAccount | undefined> {
    const account = this.usersById.get(id);
    if (!account) return undefined;
    account.role = role;
    account.updatedAt = new Date().toISOString();
    return clone(account);
  }

  async createSession(session: AuthSession): Promise<AuthSession> {
    this.sessionsById.set(session.id, clone(session));
    this.sessionsByRefreshHash.set(session.refreshTokenHash, session.id);
    return clone(session);
  }

  async getSessionByRefreshHash(refreshTokenHash: string): Promise<AuthSession | undefined> {
    const id = this.sessionsByRefreshHash.get(refreshTokenHash);
    const session = id ? this.sessionsById.get(id) : undefined;
    return session ? clone(session) : undefined;
  }

  async rotateRefreshToken(currentHash: string, nextSession: AuthSession, now: string): Promise<RefreshRotation> {
    const current = await this.getSessionByRefreshHash(currentHash);
    if (!current) return { state: 'INVALID' };
    const account = await this.getUserById(current.userId);
    if (!account) return { state: 'INVALID' };
    // A revoked member is always a genuine replay: the family was already
    // torn down by logout, prior reuse, password change, or another revoke.
    if (current.revokedAt) {
      await this.revokeAllInFamily(current.userId, current.familyId, 'refresh_token_reuse', now);
      return { state: 'REUSE_DETECTED', account, familyId: current.familyId };
    }
    if (current.consumedAt) {
      const replayPath = this.findBenignReplayPath(current, account, now);
      if (replayPath) {
        for (const session of replayPath) {
          session.consumedAt ??= now;
          session.lastUsedAt = now;
          session.replacedBySessionId = nextSession.id;
        }
        await this.createSession(nextSession);
        return { state: 'ROTATED', account, session: clone(nextSession) };
      }
      await this.revokeAllInFamily(current.userId, current.familyId, 'refresh_token_reuse', now);
      return { state: 'REUSE_DETECTED', account, familyId: current.familyId };
    }
    if (Date.parse(current.expiresAt) <= Date.parse(now) || !isUsableStatus(account.status)) {
      await this.revokeAllInFamily(current.userId, current.familyId, 'refresh_token_expired', now);
      return { state: 'EXPIRED', account, familyId: current.familyId };
    }
    const storedCurrent = this.sessionsById.get(current.id);
    if (!storedCurrent) return { state: 'INVALID' };
    storedCurrent.consumedAt = now;
    storedCurrent.lastUsedAt = now;
    storedCurrent.replacedBySessionId = nextSession.id;
    await this.createSession(nextSession);
    return { state: 'ROTATED', account, session: clone(nextSession) };
  }

  private findBenignReplayPath(current: AuthSession, account: AuthAccount, now: string): AuthSession[] | undefined {
    if (!current.consumedAt || Date.parse(now) - Date.parse(current.consumedAt) > this.refreshReuseGraceMs || !isUsableStatus(account.status)) return undefined;
    const path: AuthSession[] = [];
    const visited = new Set<string>();
    let cursor = this.sessionsById.get(current.id);
    for (let index = 0; cursor && index < 64; index += 1) {
      if (visited.has(cursor.id)) return undefined;
      visited.add(cursor.id);
      path.push(cursor);
      if (!cursor.consumedAt) {
        return !cursor.revokedAt && Date.parse(cursor.expiresAt) > Date.parse(now) ? path : undefined;
      }
      cursor = cursor.replacedBySessionId ? this.sessionsById.get(cursor.replacedBySessionId) : undefined;
    }
    return undefined;
  }

  async revokeFamilyByRefreshHash(refreshTokenHash: string, reason: string, now: string): Promise<{ account: AuthAccount; familyId: string } | undefined> {
    const session = await this.getSessionByRefreshHash(refreshTokenHash);
    if (!session) return undefined;
    const account = await this.getUserById(session.userId);
    if (!account) return undefined;
    await this.revokeAllInFamily(session.userId, session.familyId, reason, now);
    return { account, familyId: session.familyId };
  }

  async revokeAllUserSessions(userId: string, reason: string, now: string): Promise<void> {
    for (const session of this.sessionsById.values()) {
      if (session.userId === userId && !session.revokedAt) {
        session.revokedAt = now;
        session.revokedReason = reason;
      }
    }
  }

  async revokeFamily(userId: string, familyId: string, reason: string, now: string): Promise<boolean> {
    let found = false;
    for (const session of this.sessionsById.values()) {
      if (session.userId === userId && session.familyId === familyId) {
        found = true;
        if (!session.revokedAt) {
          session.revokedAt = now;
          session.revokedReason = reason;
        }
      }
    }
    return found;
  }

  async listSessionsForUser(userId: string): Promise<AuthSession[]> {
    return [...this.sessionsById.values()].filter((session) => session.userId === userId).map(clone);
  }

  async getActiveUserForSession(userId: string, familyId: string, issuedAtSeconds: number): Promise<AuthAccount | undefined> {
    const account = await this.getUserById(userId);
    if (!account || !isUsableStatus(account.status) || Math.floor(Date.parse(account.passwordChangedAt) / 1_000) > issuedAtSeconds) return undefined;
    const now = Date.now();
    const activeSession = [...this.sessionsById.values()].some((session) => session.userId === userId && session.familyId === familyId && !session.revokedAt && Date.parse(session.expiresAt) > now);
    return activeSession ? account : undefined;
  }

  async updatePasswordAndRevokeSessions(userId: string, passwordHash: string, now: string, reason: string): Promise<AuthAccount | undefined> {
    const account = this.usersById.get(userId);
    if (!account) return undefined;
    account.passwordHash = passwordHash;
    account.passwordChangedAt = now;
    account.updatedAt = now;
    await this.revokeAllUserSessions(userId, reason, now);
    return clone(account);
  }

  async createPasswordResetToken(value: { id: string; userId: string; tokenHash: string; expiresAt: string; createdAt: string }): Promise<void> {
    for (const token of this.resetTokens.values()) {
      if (token.userId === value.userId && !token.usedAt) token.usedAt = value.createdAt;
    }
    this.resetTokens.set(value.tokenHash, clone(value));
  }

  async consumePasswordResetToken(tokenHash: string, passwordHash: string, now: string): Promise<ResetConsumption> {
    const token = this.resetTokens.get(tokenHash);
    if (!token || token.usedAt || Date.parse(token.expiresAt) <= Date.parse(now)) return { state: 'INVALID' };
    const account = await this.updatePasswordAndRevokeSessions(token.userId, passwordHash, now, 'password_reset');
    if (!account) return { state: 'INVALID' };
    token.usedAt = now;
    return { state: 'CONSUMED', account };
  }

  async getTwoFactor(actorId: string): Promise<TwoFactorRecord | undefined> {
    const record = this.twoFactor.get(actorId);
    return record ? clone(record) : undefined;
  }

  async saveTwoFactorSetup(actorId: string, secret: string, backupCodes: string[]): Promise<void> {
    this.twoFactor.set(actorId, { actorId, secret, enabled: false, backupCodes: [...backupCodes] });
  }

  async enableTwoFactor(actorId: string): Promise<void> {
    const record = this.twoFactor.get(actorId);
    if (record) record.enabled = true;
  }

  async disableTwoFactor(actorId: string): Promise<void> {
    this.twoFactor.delete(actorId);
  }

  async consumeTwoFactorBackupCode(actorId: string, codeHash: string): Promise<boolean> {
    const record = this.twoFactor.get(actorId);
    if (!record) return false;
    const index = record.backupCodes.indexOf(codeHash);
    if (index < 0) return false;
    record.backupCodes.splice(index, 1);
    return true;
  }

  async close(): Promise<void> {}

  private async revokeAllInFamily(userId: string, familyId: string, reason: string, now: string): Promise<void> {
    await this.revokeFamily(userId, familyId, reason, now);
  }
}

export class PostgresAuthRepository implements AuthRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string, private readonly refreshReuseGraceMs = REFRESH_REUSE_GRACE_MS) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 4 });
  }

  async createUser(account: AuthAccount): Promise<AuthAccount> {
    return this.transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO users (id,email,email_normalized,full_name,phone,role,status,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (email_normalized) DO NOTHING
         RETURNING *`,
        [account.id, account.email, account.emailNormalized, account.fullName, account.phone ?? null, account.role, account.status, account.createdAt, account.updatedAt],
      );
      if (!inserted.rows[0]) throw new DuplicateAuthEmailError();
      await client.query(
        `INSERT INTO user_credentials (user_id,password_hash,password_changed_at,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [account.id, account.passwordHash, account.passwordChangedAt, account.createdAt, account.updatedAt],
      );
      return account;
    });
  }

  async createUserWithSession(account: AuthAccount, session: AuthSession, providerMeta?: { providerType?: string; businessName?: string; address?: string }): Promise<AuthAccount> {
    if (account.role === 'provider') {
      account.providerType = providerMeta?.providerType || account.providerType || 'ride_driver';
      account.tenantId = account.tenantId || `partner-${account.id.slice(0, 8)}`;
    }
    return this.transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO users (id,email,email_normalized,full_name,phone,role,status,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (email_normalized) DO NOTHING
         RETURNING id`,
        [account.id, account.email, account.emailNormalized, account.fullName, account.phone ?? null, account.role, account.status, account.createdAt, account.updatedAt],
      );
      if (!inserted.rows[0]) throw new DuplicateAuthEmailError();
      await client.query(
        `INSERT INTO user_credentials (user_id,password_hash,password_changed_at,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [account.id, account.passwordHash, account.passwordChangedAt, account.createdAt, account.updatedAt],
      );
      await client.query(
        `INSERT INTO user_sessions (id,user_id,refresh_token_hash,token_family_id,expires_at,created_at,last_used_at,user_agent,ip_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [session.id, session.userId, session.refreshTokenHash, session.familyId, session.expiresAt, session.createdAt, session.lastUsedAt, session.userAgent ?? null, session.ipHash ?? null],
      );
      if (account.role === 'provider') {
        const providerType = account.providerType || 'ride_driver';
        const tenantId = account.tenantId || `partner-${account.id.slice(0, 8)}`;
        await client.query(
          `INSERT INTO provider_profiles (user_id, provider_type, tenant_id, status, business_name, phone, address, created_at, updated_at)
           VALUES ($1, $2, $3, 'active', $4, $5, $6, now(), now())
           ON CONFLICT (user_id) DO UPDATE
           SET business_name = COALESCE(EXCLUDED.business_name, provider_profiles.business_name),
               phone = COALESCE(EXCLUDED.phone, provider_profiles.phone),
               address = COALESCE(EXCLUDED.address, provider_profiles.address),
               updated_at = now()`,
          [account.id, providerType, tenantId, providerMeta?.businessName ?? account.fullName, account.phone ?? null, providerMeta?.address ?? null],
        );
      }
      return account;
    });
  }

  async getUserByEmailNormalized(emailNormalized: string): Promise<AuthAccount | undefined> {
    const result = await this.pool.query(this.accountSelect('u.email_normalized=$1'), [emailNormalized]);
    return result.rows[0] ? this.accountFromRow(result.rows[0] as Record<string, unknown>) : undefined;
  }

  async getUserById(id: string): Promise<AuthAccount | undefined> {
    const result = await this.pool.query(this.accountSelect('u.id=$1'), [id]);
    return result.rows[0] ? this.accountFromRow(result.rows[0] as Record<string, unknown>) : undefined;
  }

  async listUsers(page: number, pageSize: number): Promise<{ items: AdminUserSummary[]; total: number }> {
    const safePage = Math.max(page, 1);
    const safePageSize = Math.min(Math.max(pageSize, 1), 100);
    const [count, rows] = await Promise.all([
      this.pool.query('SELECT count(*)::int AS count FROM users'),
      this.pool.query('SELECT id,email,full_name,phone,role,status,onboarding_completed_at,created_at,updated_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2', [safePageSize, (safePage - 1) * safePageSize]),
    ]);
    return { total: Number(count.rows[0]?.count ?? 0), items: rows.rows.map((row) => adminUserFromRow(row as Record<string, unknown>)) };
  }

  async updateProfile(id: string, patch: { fullName?: string; phone?: string; avatarUrl?: string; language?: string; timezone?: string; onboardingCompletedAt?: string }): Promise<AuthAccount | undefined> {
    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown): void => { fields.push(`${column}=$${values.length + 1}`); values.push(value); };
    if (patch.fullName !== undefined) add('full_name', patch.fullName);
    if (patch.phone !== undefined) add('phone', patch.phone || null);
    if (patch.avatarUrl !== undefined) add('avatar_url', patch.avatarUrl || null);
    if (patch.language !== undefined) add('language', patch.language || null);
    if (patch.timezone !== undefined) add('timezone', patch.timezone || null);
    if (patch.onboardingCompletedAt !== undefined) add('onboarding_completed_at', patch.onboardingCompletedAt || null);
    if (!fields.length) return this.getUserById(id);
    values.push(id);
    const result = await this.pool.query(`UPDATE users SET ${fields.join(',')},updated_at=now() WHERE id=$${values.length} RETURNING id`, values);
    return result.rows[0] ? this.getUserById(id) : undefined;
  }

  async updateUserStatus(id: string, status: AuthUserStatus): Promise<AuthAccount | undefined> {
    const result = await this.pool.query('UPDATE users SET status=$1, updated_at=now() WHERE id=$2 RETURNING id', [status, id]);
    return result.rows[0] ? this.getUserById(id) : undefined;
  }

  async updateUserRole(id: string, role: AuthRole): Promise<AuthAccount | undefined> {
    const result = await this.pool.query('UPDATE users SET role=$1, updated_at=now() WHERE id=$2 RETURNING id', [role, id]);
    return result.rows[0] ? this.getUserById(id) : undefined;
  }

  async createSession(session: AuthSession): Promise<AuthSession> {
    const result = await this.pool.query(
      `INSERT INTO user_sessions (id,user_id,refresh_token_hash,token_family_id,expires_at,revoked_at,revoked_reason,consumed_at,replaced_by_session_id,created_at,last_used_at,user_agent,ip_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [session.id, session.userId, session.refreshTokenHash, session.familyId, session.expiresAt, session.revokedAt ?? null, session.revokedReason ?? null, session.consumedAt ?? null, session.replacedBySessionId ?? null, session.createdAt, session.lastUsedAt, session.userAgent ?? null, session.ipHash ?? null],
    );
    return this.sessionFromRow(result.rows[0] as Record<string, unknown>);
  }

  async getSessionByRefreshHash(refreshTokenHash: string): Promise<AuthSession | undefined> {
    const result = await this.pool.query('SELECT * FROM user_sessions WHERE refresh_token_hash=$1', [refreshTokenHash]);
    return result.rows[0] ? this.sessionFromRow(result.rows[0] as Record<string, unknown>) : undefined;
  }

  async rotateRefreshToken(currentHash: string, nextSession: AuthSession, now: string): Promise<RefreshRotation> {
    return this.transaction(async (client) => {
      const found = await client.query(
        `${this.accountSelect('s.refresh_token_hash=$1', 's')} FOR UPDATE`,
        [currentHash],
      );
      const row = found.rows[0] as Record<string, unknown> | undefined;
      if (!row) return { state: 'INVALID' };
      const account = this.accountFromRow(row);
      const current = this.sessionFromRow(row);
      if (current.revokedAt) {
        await this.revokeFamilyWithClient(client, current.userId, current.familyId, 'refresh_token_reuse', now);
        return { state: 'REUSE_DETECTED', account, familyId: current.familyId };
      }
      if (current.consumedAt) {
        const replayPath = await this.lockReplayPath(client, current);
        if (this.isBenignReplay(current, replayPath, account, now)) {
          await client.query(
            'UPDATE user_sessions SET consumed_at=COALESCE(consumed_at,$1),last_used_at=$1,replaced_by_session_id=$2 WHERE id=ANY($3::uuid[])',
            [now, nextSession.id, replayPath.map((session) => session.id)],
          );
          const inserted = await client.query(
            `INSERT INTO user_sessions (id,user_id,refresh_token_hash,token_family_id,expires_at,created_at,last_used_at,user_agent,ip_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [nextSession.id, nextSession.userId, nextSession.refreshTokenHash, nextSession.familyId, nextSession.expiresAt, nextSession.createdAt, nextSession.lastUsedAt, nextSession.userAgent ?? null, nextSession.ipHash ?? null],
          );
          return { state: 'ROTATED', account, session: this.sessionFromRow(inserted.rows[0] as Record<string, unknown>) };
        }
        await this.revokeFamilyWithClient(client, current.userId, current.familyId, 'refresh_token_reuse', now);
        return { state: 'REUSE_DETECTED', account, familyId: current.familyId };
      }
      if (Date.parse(current.expiresAt) <= Date.parse(now) || !isUsableStatus(account.status)) {
        await this.revokeFamilyWithClient(client, current.userId, current.familyId, 'refresh_token_expired', now);
        return { state: 'EXPIRED', account, familyId: current.familyId };
      }
      await client.query(
        'UPDATE user_sessions SET consumed_at=$1,last_used_at=$1,replaced_by_session_id=$2 WHERE id=$3',
        [now, nextSession.id, current.id],
      );
      const inserted = await client.query(
        `INSERT INTO user_sessions (id,user_id,refresh_token_hash,token_family_id,expires_at,created_at,last_used_at,user_agent,ip_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [nextSession.id, nextSession.userId, nextSession.refreshTokenHash, nextSession.familyId, nextSession.expiresAt, nextSession.createdAt, nextSession.lastUsedAt, nextSession.userAgent ?? null, nextSession.ipHash ?? null],
      );
      return { state: 'ROTATED', account, session: this.sessionFromRow(inserted.rows[0] as Record<string, unknown>) };
    });
  }

  private async lockReplayPath(client: PoolClient, current: AuthSession): Promise<AuthSession[]> {
    const path: AuthSession[] = [current];
    const visited = new Set<string>([current.id]);
    let replacementId = current.replacedBySessionId;
    for (let index = 0; replacementId && index < 63; index += 1) {
      if (visited.has(replacementId)) break;
      const result = await client.query('SELECT * FROM user_sessions WHERE id=$1 FOR UPDATE', [replacementId]);
      if (!result.rows[0]) break;
      const replacement = this.sessionFromRow(result.rows[0] as Record<string, unknown>);
      visited.add(replacement.id);
      path.push(replacement);
      if (!replacement.consumedAt) break;
      replacementId = replacement.replacedBySessionId;
    }
    return path;
  }

  private isBenignReplay(current: AuthSession, path: AuthSession[], account: AuthAccount, now: string): boolean {
    const candidate = path.at(-1);
    if (!candidate || candidate.id === current.id || !current.consumedAt) return false;
    const withinGrace = Date.parse(now) - Date.parse(current.consumedAt) <= this.refreshReuseGraceMs;
    const candidateUsable = !candidate.revokedAt && !candidate.consumedAt && Date.parse(candidate.expiresAt) > Date.parse(now);
    return withinGrace && candidateUsable && isUsableStatus(account.status);
  }

  async revokeFamilyByRefreshHash(refreshTokenHash: string, reason: string, now: string): Promise<{ account: AuthAccount; familyId: string } | undefined> {
    return this.transaction(async (client) => {
      const found = await client.query(`${this.accountSelect('s.refresh_token_hash=$1', 's')} FOR UPDATE`, [refreshTokenHash]);
      const row = found.rows[0] as Record<string, unknown> | undefined;
      if (!row) return undefined;
      const account = this.accountFromRow(row);
      const session = this.sessionFromRow(row);
      await this.revokeFamilyWithClient(client, session.userId, session.familyId, reason, now);
      return { account, familyId: session.familyId };
    });
  }

  async revokeAllUserSessions(userId: string, reason: string, now: string): Promise<void> {
    await this.pool.query('UPDATE user_sessions SET revoked_at=$1,revoked_reason=$2 WHERE user_id=$3 AND revoked_at IS NULL', [now, reason, userId]);
  }

  async revokeFamily(userId: string, familyId: string, reason: string, now: string): Promise<boolean> {
    const result = await this.pool.query('UPDATE user_sessions SET revoked_at=$1,revoked_reason=$2 WHERE user_id=$3 AND token_family_id=$4 AND revoked_at IS NULL', [now, reason, userId, familyId]);
    if (result.rowCount) return true;
    const exists = await this.pool.query('SELECT 1 FROM user_sessions WHERE user_id=$1 AND token_family_id=$2', [userId, familyId]);
    return Boolean(exists.rowCount);
  }

  async listSessionsForUser(userId: string): Promise<AuthSession[]> {
    const result = await this.pool.query('SELECT * FROM user_sessions WHERE user_id=$1 ORDER BY created_at DESC', [userId]);
    return result.rows.map((row) => this.sessionFromRow(row as Record<string, unknown>));
  }

  async getActiveUserForSession(userId: string, familyId: string, issuedAtSeconds: number): Promise<AuthAccount | undefined> {
    const result = await this.pool.query(
      `${this.accountSelect("u.id=$1 AND u.status='active' AND EXISTS (SELECT 1 FROM user_sessions active_session WHERE active_session.user_id=u.id AND active_session.token_family_id=$2 AND active_session.revoked_at IS NULL AND active_session.expires_at > now())")}`,
      [userId, familyId],
    );
    const account = result.rows[0] ? this.accountFromRow(result.rows[0] as Record<string, unknown>) : undefined;
    return account && Math.floor(Date.parse(account.passwordChangedAt) / 1_000) <= issuedAtSeconds ? account : undefined;
  }

  async updatePasswordAndRevokeSessions(userId: string, passwordHash: string, now: string, reason: string): Promise<AuthAccount | undefined> {
    return this.transaction(async (client) => {
      const credential = await client.query('UPDATE user_credentials SET password_hash=$1,password_changed_at=$2,updated_at=$2 WHERE user_id=$3 RETURNING user_id', [passwordHash, now, userId]);
      if (!credential.rows[0]) return undefined;
      await client.query('UPDATE users SET updated_at=$1 WHERE id=$2', [now, userId]);
      await client.query('UPDATE user_sessions SET revoked_at=$1,revoked_reason=$2 WHERE user_id=$3 AND revoked_at IS NULL', [now, reason, userId]);
      const account = await client.query(this.accountSelect('u.id=$1'), [userId]);
      return account.rows[0] ? this.accountFromRow(account.rows[0] as Record<string, unknown>) : undefined;
    });
  }

  async createPasswordResetToken(value: { id: string; userId: string; tokenHash: string; expiresAt: string; createdAt: string }): Promise<void> {
    await this.transaction(async (client) => {
      await client.query('UPDATE password_reset_tokens SET used_at=$1 WHERE user_id=$2 AND used_at IS NULL', [value.createdAt, value.userId]);
      await client.query('INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at,created_at) VALUES ($1,$2,$3,$4,$5)', [value.id, value.userId, value.tokenHash, value.expiresAt, value.createdAt]);
    });
  }

  async consumePasswordResetToken(tokenHash: string, passwordHash: string, now: string): Promise<ResetConsumption> {
    return this.transaction(async (client) => {
      const found = await client.query(`${this.accountSelect('reset.token_hash=$1', 'reset')} FOR UPDATE`, [tokenHash]);
      const row = found.rows[0] as Record<string, unknown> | undefined;
      if (!row || row.used_at || Date.parse(String(row.reset_expires_at)) <= Date.parse(now)) return { state: 'INVALID' };
      const account = this.accountFromRow(row);
      await client.query('UPDATE user_credentials SET password_hash=$1,password_changed_at=$2,updated_at=$2 WHERE user_id=$3', [passwordHash, now, account.id]);
      await client.query('UPDATE users SET updated_at=$1 WHERE id=$2', [now, account.id]);
      await client.query('UPDATE password_reset_tokens SET used_at=$1 WHERE id=$2 AND used_at IS NULL', [now, String(row.reset_id)]);
      await client.query("UPDATE user_sessions SET revoked_at=$1,revoked_reason='password_reset' WHERE user_id=$2 AND revoked_at IS NULL", [now, account.id]);
      const refreshed = await client.query(this.accountSelect('u.id=$1'), [account.id]);
      return refreshed.rows[0] ? { state: 'CONSUMED', account: this.accountFromRow(refreshed.rows[0] as Record<string, unknown>) } : { state: 'INVALID' };
    });
  }

  async getTwoFactor(actorId: string): Promise<TwoFactorRecord | undefined> {
    const result = await this.pool.query('SELECT actor_id,secret,enabled,backup_codes FROM user_two_factor WHERE actor_id=$1', [actorId]);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return { actorId: String(row.actor_id), secret: String(row.secret), enabled: row.enabled === true, backupCodes: Array.isArray(row.backup_codes) ? row.backup_codes.map(String) : [] };
  }

  async saveTwoFactorSetup(actorId: string, secret: string, backupCodes: string[]): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_two_factor (actor_id,secret,enabled,backup_codes,created_at,updated_at)
       VALUES ($1,$2,false,$3,now(),now())
       ON CONFLICT (actor_id) DO UPDATE SET secret=$2,enabled=false,backup_codes=$3,updated_at=now()`,
      [actorId, secret, backupCodes],
    );
  }

  async enableTwoFactor(actorId: string): Promise<void> {
    await this.pool.query('UPDATE user_two_factor SET enabled=true,updated_at=now() WHERE actor_id=$1', [actorId]);
  }

  async disableTwoFactor(actorId: string): Promise<void> {
    await this.pool.query('DELETE FROM user_two_factor WHERE actor_id=$1', [actorId]);
  }

  async consumeTwoFactorBackupCode(actorId: string, codeHash: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE user_two_factor SET backup_codes=array_remove(backup_codes,$2),updated_at=now()
       WHERE actor_id=$1 AND $2 = ANY(backup_codes) RETURNING actor_id`,
      [actorId, codeHash],
    );
    return result.rowCount === 1;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private accountSelect(where: string, sessionAlias?: string): string {
    const sessionJoin = sessionAlias === 's' ? 'JOIN user_sessions s ON s.user_id=u.id' : '';
    const sessionFields = sessionAlias === 's'
      ? 's.id AS session_id,s.user_id AS session_user_id,s.refresh_token_hash,s.token_family_id,s.expires_at,s.revoked_at,s.revoked_reason,s.consumed_at,s.replaced_by_session_id,s.created_at AS session_created_at,s.last_used_at,s.user_agent,s.ip_hash'
      : 'NULL::uuid AS session_id,NULL::uuid AS session_user_id,NULL::text AS refresh_token_hash,NULL::uuid AS token_family_id,NULL::timestamptz AS expires_at,NULL::timestamptz AS revoked_at,NULL::text AS revoked_reason,NULL::timestamptz AS consumed_at,NULL::uuid AS replaced_by_session_id,NULL::timestamptz AS session_created_at,NULL::timestamptz AS last_used_at,NULL::text AS user_agent,NULL::text AS ip_hash';
    const resetJoin = sessionAlias === 'reset' ? 'JOIN password_reset_tokens reset ON reset.user_id=u.id' : '';
    const resetFields = sessionAlias === 'reset'
      ? 'reset.id AS reset_id,reset.used_at,reset.expires_at AS reset_expires_at'
      : 'NULL::uuid AS reset_id,NULL::timestamptz AS used_at,NULL::timestamptz AS reset_expires_at';
    return `SELECT u.id,u.email,u.email_normalized,u.full_name,u.phone,u.avatar_url,u.language,u.timezone,u.onboarding_completed_at,u.role,u.status,u.created_at,u.updated_at,c.password_hash,c.password_changed_at,
      p.provider_type,p.tenant_id,
      ${sessionFields}, ${resetFields}
      FROM users u JOIN user_credentials c ON c.user_id=u.id LEFT JOIN provider_profiles p ON p.user_id=u.id ${sessionJoin} ${resetJoin} WHERE ${where}`;
  }

  private accountFromRow(row: Record<string, unknown>): AuthAccount {
    return {
      id: String(row.id),
      email: String(row.email),
      emailNormalized: String(row.email_normalized),
      fullName: String(row.full_name),
      phone: row.phone ? String(row.phone) : undefined,
      avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
      language: row.language ? String(row.language) : undefined,
      timezone: row.timezone ? String(row.timezone) : undefined,
      onboardingCompletedAt: row.onboarding_completed_at ? new Date(String(row.onboarding_completed_at)).toISOString() : undefined,
      role: parseAuthRole(row.role),
      status: String(row.status) === 'disabled' ? 'disabled' : 'active',
      passwordHash: String(row.password_hash),
      passwordChangedAt: new Date(String(row.password_changed_at)).toISOString(),
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
      providerType: row.provider_type ? String(row.provider_type) : undefined,
      tenantId: row.tenant_id ? String(row.tenant_id) : undefined,
    };
  }

  private sessionFromRow(row: Record<string, unknown>): AuthSession {
    const id = row.session_id ?? row.id;
    return {
      id: String(id),
      userId: String(row.session_user_id ?? row.user_id),
      familyId: String(row.token_family_id),
      refreshTokenHash: String(row.refresh_token_hash),
      expiresAt: new Date(String(row.expires_at)).toISOString(),
      revokedAt: row.revoked_at ? new Date(String(row.revoked_at)).toISOString() : undefined,
      revokedReason: row.revoked_reason ? String(row.revoked_reason) : undefined,
      consumedAt: row.consumed_at ? new Date(String(row.consumed_at)).toISOString() : undefined,
      replacedBySessionId: row.replaced_by_session_id ? String(row.replaced_by_session_id) : undefined,
      createdAt: row.session_created_at ? new Date(String(row.session_created_at)).toISOString() : new Date().toISOString(),
      lastUsedAt: new Date(String(row.last_used_at)).toISOString(),
      userAgent: row.user_agent ? String(row.user_agent) : undefined,
      ipHash: row.ip_hash ? String(row.ip_hash) : undefined,
    };
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private revokeFamilyWithClient(client: PoolClient, userId: string, familyId: string, reason: string, now: string): Promise<unknown> {
    return client.query('UPDATE user_sessions SET revoked_at=$1,revoked_reason=$2 WHERE user_id=$3 AND token_family_id=$4 AND revoked_at IS NULL', [now, reason, userId, familyId]);
  }
}

@Injectable()
export class AuthStore implements OnModuleDestroy {
  readonly repository: AuthRepository;

  constructor(config: ConfigService) {
    const refreshReuseGraceMs = resolveReuseGraceMs(config.get<number>('AUTH_REFRESH_REUSE_GRACE_SECONDS'));
    // A PostgreSQL URL is accepted only by the explicit integration-test seam.
    // Normal unit/HTTP tests remain isolated and never accidentally touch a DB.
    const integrationDatabaseUrl = process.env.NODE_ENV === 'test' ? process.env.AUTH_TEST_DATABASE_URL : undefined;
    this.repository = integrationDatabaseUrl
      ? new PostgresAuthRepository(integrationDatabaseUrl, refreshReuseGraceMs)
      : process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID
        ? new InMemoryAuthRepository(refreshReuseGraceMs)
        : new PostgresAuthRepository(config.getOrThrow<string>('DATABASE_URL'), refreshReuseGraceMs);
  }

  createUser(account: AuthAccount): Promise<AuthAccount> { return this.repository.createUser(account); }
  createUserWithSession(account: AuthAccount, session: AuthSession, providerMeta?: { providerType?: string; businessName?: string; address?: string }): Promise<AuthAccount> { return this.repository.createUserWithSession(account, session, providerMeta); }
  getUserByEmailNormalized(email: string): Promise<AuthAccount | undefined> { return this.repository.getUserByEmailNormalized(email); }
  getUserById(id: string): Promise<AuthAccount | undefined> { return this.repository.getUserById(id); }
  listUsers(page: number, pageSize: number): Promise<{ items: AdminUserSummary[]; total: number }> { return this.repository.listUsers(page, pageSize); }
  updateProfile(id: string, patch: { fullName?: string; phone?: string; avatarUrl?: string; language?: string; timezone?: string; onboardingCompletedAt?: string }): Promise<AuthAccount | undefined> { return this.repository.updateProfile(id, patch); }
  updateUserStatus(id: string, status: AuthUserStatus): Promise<AuthAccount | undefined> { return this.repository.updateUserStatus(id, status); }
  updateUserRole(id: string, role: AuthRole): Promise<AuthAccount | undefined> { return this.repository.updateUserRole(id, role); }
  createSession(session: AuthSession): Promise<AuthSession> { return this.repository.createSession(session); }
  getSessionByRefreshHash(hash: string): Promise<AuthSession | undefined> { return this.repository.getSessionByRefreshHash(hash); }
  rotateRefreshToken(hash: string, session: AuthSession, now: string): Promise<RefreshRotation> { return this.repository.rotateRefreshToken(hash, session, now); }
  revokeFamilyByRefreshHash(hash: string, reason: string, now: string): Promise<{ account: AuthAccount; familyId: string } | undefined> { return this.repository.revokeFamilyByRefreshHash(hash, reason, now); }
  revokeAllUserSessions(userId: string, reason: string, now: string): Promise<void> { return this.repository.revokeAllUserSessions(userId, reason, now); }
  revokeFamily(userId: string, familyId: string, reason: string, now: string): Promise<boolean> { return this.repository.revokeFamily(userId, familyId, reason, now); }
  listSessionsForUser(userId: string): Promise<AuthSession[]> { return this.repository.listSessionsForUser(userId); }
  getActiveUserForSession(userId: string, familyId: string, issuedAt: number): Promise<AuthAccount | undefined> { return this.repository.getActiveUserForSession(userId, familyId, issuedAt); }
  updatePasswordAndRevokeSessions(userId: string, hash: string, now: string, reason: string): Promise<AuthAccount | undefined> { return this.repository.updatePasswordAndRevokeSessions(userId, hash, now, reason); }
  createPasswordResetToken(value: { id: string; userId: string; tokenHash: string; expiresAt: string; createdAt: string }): Promise<void> { return this.repository.createPasswordResetToken(value); }
  consumePasswordResetToken(hash: string, passwordHash: string, now: string): Promise<ResetConsumption> { return this.repository.consumePasswordResetToken(hash, passwordHash, now); }
  getTwoFactor(actorId: string): Promise<TwoFactorRecord | undefined> { return this.repository.getTwoFactor(actorId); }
  saveTwoFactorSetup(actorId: string, secret: string, backupCodes: string[]): Promise<void> { return this.repository.saveTwoFactorSetup(actorId, secret, backupCodes); }
  enableTwoFactor(actorId: string): Promise<void> { return this.repository.enableTwoFactor(actorId); }
  disableTwoFactor(actorId: string): Promise<void> { return this.repository.disableTwoFactor(actorId); }
  consumeTwoFactorBackupCode(actorId: string, codeHash: string): Promise<boolean> { return this.repository.consumeTwoFactorBackupCode(actorId, codeHash); }
  onModuleDestroy(): Promise<void> { return this.repository.close(); }
}

function adminUserFromAccount(account: AuthAccount): AdminUserSummary {
  return {
    id: account.id,
    email: account.email,
    full_name: account.fullName,
    ...(account.phone ? { phone: account.phone } : {}),
    role: account.role,
    status: account.status,
    ...(account.onboardingCompletedAt ? { onboarding_completed_at: account.onboardingCompletedAt } : {}),
    created_at: account.createdAt,
    updated_at: account.updatedAt,
  };
}

function adminUserFromRow(row: Record<string, unknown>): AdminUserSummary {
  return {
    id: String(row.id),
    email: String(row.email),
    full_name: String(row.full_name),
    ...(row.phone ? { phone: String(row.phone) } : {}),
    role: parseAuthRole(row.role),
    status: String(row.status) === 'disabled' ? 'disabled' : 'active',
    ...(row.onboarding_completed_at ? { onboarding_completed_at: new Date(String(row.onboarding_completed_at)).toISOString() } : {}),
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}
