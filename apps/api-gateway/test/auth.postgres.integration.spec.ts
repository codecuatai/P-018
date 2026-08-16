import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

import { CoreStore } from '../src/modules/core/core.module';
import { AuthStore } from '../src/modules/auth/auth.repository';
import { AuthService } from '../src/modules/auth/auth.service';
import { PasswordResetDelivery } from '../src/modules/auth/password-reset.delivery';

const databaseUrl = process.env.CORE_TEST_DATABASE_URL;
const integration = databaseUrl ? it : it.skip;
const password = 'a reliable local passphrase';

jest.setTimeout(30_000);

function configForIntegration(): ConfigService {
  const values: Record<string, unknown> = {
    DATABASE_URL: databaseUrl,
    JWT_SECRET: 'test-jwt-secret-12345',
    AUTH_ACCESS_TOKEN_TTL_SECONDS: 900,
    AUTH_REFRESH_TOKEN_TTL_SECONDS: 2_592_000,
    AUTH_RESET_TOKEN_TTL_SECONDS: 1_800,
    AUTH_ISSUER: 'x-one',
    AUTH_AUDIENCE: 'x-one-web',
    AUTH_REFRESH_COOKIE_NAME: 'xone_refresh',
    AUTH_DEV_RESET_TOKEN_CAPTURE: true,
  };
  return {
    getOrThrow: <T>(key: string): T => values[key] as T,
    get: <T>(key: string): T | undefined => values[key] as T | undefined,
  } as unknown as ConfigService;
}

describe('Auth PostgreSQL persistence', () => {
  let store: AuthStore;
  let core: CoreStore;
  let service: AuthService;
  let pool: Pool;
  const originalIntegrationUrl = process.env.AUTH_TEST_DATABASE_URL;

  beforeAll(async () => {
    if (!databaseUrl) return;
    const migrationPool = new Pool({ connectionString: databaseUrl });
    for (const name of [
      '001_core_vertical_slice.sql', '002_core_persistence_slice.sql', '003_core_atomicity.sql',
      '004_core_recovery.sql', '005_core_payment_provider_saga.sql', '006_core_payment_recovery_claims.sql',
      '007_core_assistant_action_executions.sql', '008_core_assistant_action_recovery.sql', '009_core_auth.sql',
    ]) {
      await migrationPool.query(await readFile(resolve(__dirname, '..', 'migrations', name), 'utf8'));
    }
    await migrationPool.end();

    process.env.AUTH_TEST_DATABASE_URL = databaseUrl;
    const config = configForIntegration();
    store = new AuthStore(config);
    core = new CoreStore(config);
    service = new AuthService(config, store, core, new PasswordResetDelivery());
    pool = new Pool({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    await pool?.end();
    await store?.onModuleDestroy();
    await core?.onModuleDestroy();
    if (originalIntegrationUrl === undefined) delete process.env.AUTH_TEST_DATABASE_URL;
    else process.env.AUTH_TEST_DATABASE_URL = originalIntegrationUrl;
  });

  integration('atomically persists user, Argon2id credential, and only a refresh-token hash', async () => {
    const suffix = Date.now();
    const issued = await service.register(
      { fullName: 'Nguyễn An', email: `an-${suffix}@example.test`, password },
      { userAgent: 'postgres-integration', ip: '127.0.0.1' },
      `cor-auth-pg-${suffix}`,
    );
    const persisted = await pool.query(
      `SELECT u.email_normalized, c.password_hash, s.refresh_token_hash, s.token_family_id
       FROM users u
       JOIN user_credentials c ON c.user_id = u.id
       JOIN user_sessions s ON s.user_id = u.id
       WHERE u.id = $1`,
      [issued.user.sub],
    );

    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0]).toMatchObject({ email_normalized: `an-${suffix}@example.test`, token_family_id: issued.session.familyId });
    expect(persisted.rows[0].password_hash).toMatch(/^\$argon2id\$/);
    expect(persisted.rows[0].password_hash).not.toBe(password);
    expect(persisted.rows[0].refresh_token_hash).not.toBe(issued.refreshToken);
    expect(persisted.rows[0].refresh_token_hash).toMatch(/^[a-f0-9]{64}$/);

    const rotated = await service.refresh(issued.refreshToken, { userAgent: 'postgres-integration', ip: '127.0.0.1' }, `cor-auth-pg-refresh-${suffix}`);
    await expect(service.refresh(issued.refreshToken, { userAgent: 'postgres-integration', ip: '127.0.0.1' }, `cor-auth-pg-replay-${suffix}`))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'REFRESH_TOKEN_REUSED' }) });
    expect(await service.authenticateAccessToken(rotated.accessToken)).toBeUndefined();

    const sessions = await pool.query('SELECT revoked_at, revoked_reason FROM user_sessions WHERE user_id = $1', [issued.user.sub]);
    expect(sessions.rows).toHaveLength(2);
    expect(sessions.rows.every((row) => row.revoked_at && row.revoked_reason === 'refresh_token_reuse')).toBe(true);
  });

  integration('stores a one-time reset hash and invalidates its existing sessions in PostgreSQL', async () => {
    const suffix = Date.now();
    const issued = await service.register(
      { fullName: 'Trần Bình', email: `binh-${suffix}@example.test`, password },
      { userAgent: 'postgres-integration', ip: '127.0.0.1' },
      `cor-reset-pg-${suffix}`,
    );
    const reset = await service.requestPasswordReset(issued.user.email, `cor-reset-request-pg-${suffix}`);
    expect(reset.devResetToken).toBeDefined();

    const tokenRow = await pool.query('SELECT token_hash, used_at FROM password_reset_tokens WHERE user_id = $1', [issued.user.sub]);
    expect(tokenRow.rows).toHaveLength(1);
    expect(tokenRow.rows[0].token_hash).not.toBe(reset.devResetToken);
    expect(tokenRow.rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);

    await service.resetPassword(reset.devResetToken!, 'new reliable local passphrase', `cor-reset-complete-pg-${suffix}`);
    const completed = await pool.query(
      `SELECT reset.used_at, session.revoked_at, session.revoked_reason
       FROM password_reset_tokens reset
       JOIN user_sessions session ON session.user_id = reset.user_id
       WHERE reset.user_id = $1`,
      [issued.user.sub],
    );
    expect(completed.rows).toHaveLength(1);
    expect(completed.rows[0]).toMatchObject({ revoked_reason: 'password_reset' });
    expect(completed.rows[0].used_at).toBeTruthy();
    expect(completed.rows[0].revoked_at).toBeTruthy();
  });
});
