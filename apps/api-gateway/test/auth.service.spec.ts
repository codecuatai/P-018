import { ConfigService } from '@nestjs/config';

import { CoreStore } from '../src/modules/core/core.module';
import { AuthStore } from '../src/modules/auth/auth.repository';
import { AuthService } from '../src/modules/auth/auth.service';
import { PasswordResetDelivery } from '../src/modules/auth/password-reset.delivery';

const values: Record<string, unknown> = {
  AUTH_ACCESS_TOKEN_TTL_SECONDS: 900,
  AUTH_REFRESH_TOKEN_TTL_SECONDS: 2_592_000,
  AUTH_RESET_TOKEN_TTL_SECONDS: 1_800,
  AUTH_ISSUER: 'x-one',
  AUTH_AUDIENCE: 'x-one-web',
  AUTH_REFRESH_COOKIE_NAME: 'xone_refresh',
  AUTH_DEV_RESET_TOKEN_CAPTURE: true,
  JWT_SECRET: 'test-jwt-secret-12345',
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
const password = 'a reliable local passphrase';

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

  it('rotates refresh tokens and revokes the full family on replay', async () => {
    const { service } = makeService();
    const initial = await service.register({ fullName: 'Nguyễn An', email: 'an@example.test', password }, metadata, 'cor-register');
    expect(await service.authenticateAccessToken(initial.accessToken)).toMatchObject({ sub: initial.user.sub });

    const rotated = await service.refresh(initial.refreshToken, metadata, 'cor-refresh');
    expect(rotated.refreshToken).not.toBe(initial.refreshToken);
    await expect(service.refresh(initial.refreshToken, metadata, 'cor-replay')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'REFRESH_TOKEN_REUSED' }) });
    expect(await service.authenticateAccessToken(rotated.accessToken)).toBeUndefined();
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
    const nextPassword = 'another reliable passphrase';
    await service.changePassword(initial.user, { currentPassword: password, newPassword: nextPassword }, 'cor-change');

    expect(await service.authenticateAccessToken(initial.accessToken)).toBeUndefined();
    await expect(service.login({ email: 'an@example.test', password }, metadata, 'cor-old')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INVALID_CREDENTIALS' }) });
    await expect(service.login({ email: 'an@example.test', password: nextPassword }, metadata, 'cor-new')).resolves.toMatchObject({ user: expect.objectContaining({ email: 'an@example.test' }) });
  });

  it('uses an expiring one-time hash-only reset token in the local test path', async () => {
    const { service, core } = makeService();
    await service.register({ fullName: 'Nguyễn An', email: 'an@example.test', password }, metadata, 'cor-register');
    const reset = await service.requestPasswordReset('an@example.test', 'cor-forgot');
    const nextPassword = 'reset local passphrase';
    expect(reset.devResetToken).toBeDefined();
    await service.resetPassword(reset.devResetToken!, nextPassword, 'cor-reset');
    await expect(service.resetPassword(reset.devResetToken!, nextPassword, 'cor-replay')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'RESET_TOKEN_INVALID' }) });
    await expect(service.login({ email: 'an@example.test', password: nextPassword }, metadata, 'cor-login')).resolves.toMatchObject({ user: expect.any(Object) });
    expect(JSON.stringify((core.repository as unknown as { audits: unknown[] }).audits)).not.toContain(reset.devResetToken!);
  });
});
