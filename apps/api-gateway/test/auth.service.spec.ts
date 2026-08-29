import { ConfigService } from '@nestjs/config';

import { CoreStore } from '../src/modules/core/core.module';
import { AuthStore } from '../src/modules/auth/auth.repository';
import { AuthService } from '../src/modules/auth/auth.service';
import { PasswordResetDelivery } from '../src/modules/auth/password-reset.delivery';

const values: Record<string, unknown> = {
  AUTH_ACCESS_TOKEN_TTL_SECONDS: 900,
  AUTH_REFRESH_TOKEN_TTL_SECONDS: 2_592_000,
  AUTH_REFRESH_REUSE_GRACE_SECONDS: 10,
  AUTH_RESET_TOKEN_TTL_SECONDS: 1_800,
  AUTH_ISSUER: 'x-one',
  AUTH_AUDIENCE: 'x-one-web',
  AUTH_REFRESH_COOKIE_NAME: 'xone_refresh',
  AUTH_DEV_RESET_TOKEN_CAPTURE: true,
  JWT_SECRET: 'test-jwt-secret-12345',
  GOOGLE_CLIENT_ID: 'test-google-client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  GOOGLE_CALLBACK_URL: 'http://localhost:3000/auth/callback/google',
};

function makeService(): { service: AuthService; store: AuthStore; core: CoreStore } {
  const config = {
    getOrThrow: <T>(key: string): T => values[key] as T,
    get: <T>(key: string): T | undefined => values[key] as T | undefined,
  } as unknown as ConfigService;
  const store = new AuthStore(config);
  const core = new CoreStore(config);
  return { service: new AuthService(config, store, core, new PasswordResetDelivery()), store, core };
}

const metadata = { userAgent: 'jest-browser', ip: '127.0.0.1' };
const password = 'a reliable local passphrase 123!@#';

describe('real local authentication', () => {
  it('registers a normalized email with an Argon2id-only password hash', async () => {
    const { service, store, core } = makeService();
    const issued = await service.register({ fullName: 'Nguyễn An', email: '  AN@Example.Test ', password }, metadata, 'cor-register');
    const saved = await store.getUserById(issued.user.sub);

    expect(issued.user).toMatchObject({ email: 'an@example.test', full_name: 'Nguyễn An', role: 'customer', status: 'active' });
    expect(saved?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(issued)).not.toContain(password);
    expect(JSON.stringify((core.repository as unknown as { audits: unknown[] }).audits)).not.toContain(password);
    await expect(service.register({ fullName: 'Nguyễn An', email: 'an@EXAMPLE.test', password }, metadata, 'cor-duplicate')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'ACCOUNT_ALREADY_EXISTS' }) });
  });

  it('keeps unknown-user and wrong-password login failures indistinguishable', async () => {
    const { service } = makeService();
    await service.register({ fullName: 'Nguyễn An', email: 'an@example.test', password }, metadata, 'cor-register');

    const wrongPassword = await service.login({ email: 'an@example.test', password: 'not the passphrase' }, metadata, 'cor-wrong').catch((error: unknown) => error);
    const unknown = await service.login({ email: 'nobody@example.test', password: 'not the passphrase' }, metadata, 'cor-unknown').catch((error: unknown) => error);
    expect(wrongPassword).toMatchObject({ response: expect.objectContaining({ code: 'INVALID_CREDENTIALS', detail: 'Email hoặc mật khẩu không đúng.' }) });
    expect(unknown).toMatchObject({ response: expect.objectContaining({ code: 'INVALID_CREDENTIALS', detail: 'Email hoặc mật khẩu không đúng.' }) });
  });

  it('tolerates a benign replay of a just-consumed refresh token while its replacement is still fresh', async () => {
    const { service } = makeService();
    const initial = await service.register({ fullName: 'Nguyễn An', email: 'an@example.test', password }, metadata, 'cor-register');

    const rotated = await service.refresh(initial.refreshToken, metadata, 'cor-refresh');
    const rolled = await service.refresh(initial.refreshToken, metadata, 'cor-benign-replay');
    expect(rolled.refreshToken).not.toBe(initial.refreshToken);
    expect(rolled.refreshToken).not.toBe(rotated.refreshToken);
    expect(await service.authenticateAccessToken(rotated.accessToken)).toMatchObject({ sub: initial.user.sub });
    expect(await service.authenticateAccessToken(rolled.accessToken)).toMatchObject({ sub: initial.user.sub });
  });

  it('keeps a family alive when a consumed token has a fresh descendant in the grace window', async () => {
    const { service } = makeService();
    const initial = await service.register({ fullName: 'Nguyễn An', email: 'an@example.test', password }, metadata, 'cor-register');

    const rotated = await service.refresh(initial.refreshToken, metadata, 'cor-refresh');
    const rotatedAgain = await service.refresh(rotated.refreshToken, metadata, 'cor-refresh-again');
    const replayed = await service.refresh(initial.refreshToken, metadata, 'cor-replay');

    expect(replayed.refreshToken).not.toBe(rotatedAgain.refreshToken);
    expect(await service.authenticateAccessToken(rotatedAgain.accessToken)).toMatchObject({ sub: initial.user.sub });
  });

  it('audits refresh rotation with bounded trigger correlation metadata only', async () => {
    const { service, core } = makeService();
    const initial = await service.register({ fullName: 'Nguyễn An', email: 'an@example.test', password }, metadata, 'cor-register');

    await service.refresh(initial.refreshToken, metadata, 'cor-refresh', 'web-restore-Healthcare-01');

    const audits = (core.repository as unknown as { audits: Array<Record<string, unknown>> }).audits;
    expect(audits.at(-1)).toMatchObject({
      action: 'REFRESH_TOKEN_ROTATED',
      correlationId: 'cor-refresh',
      metadata: { trigger_correlation_id: 'web-restore-Healthcare-01' },
    });
    expect(JSON.stringify(audits.at(-1))).not.toContain(initial.refreshToken);
  });

  it('scopes session revocation to its authenticated actor', async () => {
    const { service } = makeService();
    const first = await service.register({ fullName: 'Nguyễn An', email: 'an@example.test', password }, metadata, 'cor-first');
    const second = await service.register({ fullName: 'Trần Bình', email: 'binh@example.test', password }, metadata, 'cor-second');
    await expect(service.revokeSession(first.user, second.session.familyId, 'cor-revoke')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SESSION_NOT_FOUND' }) });
    expect((await service.listSessions(second.user, second.refreshToken))[0]).toMatchObject({ current: true });
  });

  it('invalidates old credentials and sessions after a password change', async () => {
    const { service } = makeService();
    const initial = await service.register({ fullName: 'Nguyễn An', email: 'an@example.test', password }, metadata, 'cor-register');
    const nextPassword = 'another reliable passphrase 456$%^';
    await expect(
      service.changePassword(initial.user, { currentPassword: 'wrong-current-password 123!@#', newPassword: nextPassword }, 'cor-wrong'),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'CURRENT_PASSWORD_INVALID', detail: 'Mật khẩu hiện tại không đúng.' }) });
    await service.changePassword(initial.user, { currentPassword: password, newPassword: nextPassword }, 'cor-change');

    expect(await service.authenticateAccessToken(initial.accessToken)).toBeUndefined();
    await expect(service.login({ email: 'an@example.test', password }, metadata, 'cor-old')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INVALID_CREDENTIALS' }) });
    await expect(service.login({ email: 'an@example.test', password: nextPassword }, metadata, 'cor-new')).resolves.toMatchObject({ user: expect.objectContaining({ email: 'an@example.test' }) });
  });

  it('uses an expiring one-time hash-only reset token in the local test path', async () => {
    const { service, core } = makeService();
    await service.register({ fullName: 'Nguyễn An', email: 'an@example.test', password }, metadata, 'cor-register');
    const reset = await service.requestPasswordReset('an@example.test', 'cor-forgot');
    const nextPassword = 'reset local passphrase 789&*(';
    expect(reset.devResetToken).toBeDefined();
    await service.resetPassword(reset.devResetToken!, nextPassword, 'cor-reset');
    await expect(service.resetPassword(reset.devResetToken!, nextPassword, 'cor-replay')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'RESET_TOKEN_INVALID' }) });
    await expect(service.login({ email: 'an@example.test', password: nextPassword }, metadata, 'cor-login')).resolves.toMatchObject({ user: expect.any(Object) });
    expect(JSON.stringify((core.repository as unknown as { audits: unknown[] }).audits)).not.toContain(reset.devResetToken!);
  });

  it('generates a valid Google OAuth consent URL with configured parameters', () => {
    const { service } = makeService();
    const url = service.getGoogleAuthUrl();
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('client_id=test-google-client-id.apps.googleusercontent.com');
    expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback%2Fgoogle');
    expect(url).toContain('scope=openid+email+profile');
  });

  it('authenticates with Google code by creating new user and issuing valid access/refresh tokens', async () => {
    const { service } = makeService();
    const mockProfile = {
      sub: 'google-user-123',
      email: 'google.user@example.test',
      email_verified: true,
      name: 'Google User',
      picture: 'https://lh3.googleusercontent.com/a/avatar.jpg',
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('oauth2.googleapis.com/token')) {
        return {
          ok: true,
          json: async () => ({ access_token: 'mock-google-access-token', id_token: 'mock-google-id-token' }),
        } as unknown as Response;
      }
      if (urlStr.includes('googleapis.com/oauth2/v3/userinfo')) {
        return {
          ok: true,
          json: async () => mockProfile,
        } as unknown as Response;
      }
      return { ok: false, text: async () => 'Not Found' } as unknown as Response;
    });

    try {
      const issued = await service.loginWithGoogle({ code: 'valid-google-code' }, metadata, 'cor-google-login');
      expect(issued.user).toMatchObject({
        email: 'google.user@example.test',
        full_name: 'Google User',
        role: 'customer',
        authentication_kind: 'real',
      });
      expect(issued.accessToken).toBeDefined();
      expect(issued.refreshToken).toBeDefined();

      const authenticated = await service.authenticateAccessToken(issued.accessToken);
      expect(authenticated).toMatchObject({
        email: 'google.user@example.test',
        sub: issued.user.sub,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
