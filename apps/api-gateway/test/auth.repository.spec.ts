import { ConfigService } from '@nestjs/config';

import { AuthStore, REFRESH_REUSE_GRACE_MS } from '../src/modules/auth/auth.repository';
import type { AuthAccount, AuthSession } from '../src/modules/auth/auth.types';

function makeStore(): AuthStore {
  const config = {
    getOrThrow: <T>(): T => undefined as T,
    get: <T>(): T | undefined => undefined,
  } as unknown as ConfigService;
  return new AuthStore(config);
}

const T0 = Date.parse('2026-08-27T00:00:00.000Z');
const iso = (offsetMs: number): string => new Date(T0 + offsetMs).toISOString();

function account(): AuthAccount {
  return {
    id: 'usr-grace',
    email: 'grace@example.test',
    emailNormalized: 'grace@example.test',
    fullName: 'Grace Window',
    role: 'customer',
    status: 'active',
    passwordHash: '$argon2id$stub',
    passwordChangedAt: iso(-60_000),
    createdAt: iso(-60_000),
    updatedAt: iso(-60_000),
  };
}

function session(overrides: Partial<AuthSession> & Pick<AuthSession, 'id' | 'refreshTokenHash' | 'familyId'>): AuthSession {
  return {
    userId: 'usr-grace',
    expiresAt: iso(30 * 24 * 60 * 60 * 1_000),
    createdAt: iso(0),
    lastUsedAt: iso(0),
    ...overrides,
  };
}

describe('AuthStore refresh reuse grace window', () => {
  it('keeps a 10 second default grace window', () => {
    expect(REFRESH_REUSE_GRACE_MS).toBe(10_000);
  });

  it('rolls the family forward when a consumed token is replayed inside the grace window with a fresh replacement', async () => {
    const store = makeStore();
    await store.createUser(account());
    await store.createSession(session({ id: 'sess-a', refreshTokenHash: 'hash-a', familyId: 'fam-1' }));

    const first = await store.rotateRefreshToken('hash-a', session({ id: 'sess-b', refreshTokenHash: 'hash-b', familyId: 'fam-1', createdAt: iso(0), lastUsedAt: iso(0) }), iso(0));
    expect(first.state).toBe('ROTATED');

    // Replay hash-a 5s later — still inside the 10s window, replacement fresh.
    const replay = await store.rotateRefreshToken('hash-a', session({ id: 'sess-c', refreshTokenHash: 'hash-c', familyId: 'fam-1', createdAt: iso(5_000), lastUsedAt: iso(5_000) }), iso(5_000));
    expect(replay.state).toBe('ROTATED');

    // Family is intact: the access-token check still resolves the account.
    const issuedAtSeconds = Math.floor(T0 / 1_000);
    expect(await store.getActiveUserForSession('usr-grace', 'fam-1', issuedAtSeconds)).toMatchObject({ id: 'usr-grace' });
  });

  it('detects genuine reuse when the replay arrives after the grace window closes', async () => {
    const store = makeStore();
    await store.createUser(account());
    await store.createSession(session({ id: 'sess-a', refreshTokenHash: 'hash-a', familyId: 'fam-2' }));

    await store.rotateRefreshToken('hash-a', session({ id: 'sess-b', refreshTokenHash: 'hash-b', familyId: 'fam-2', createdAt: iso(0), lastUsedAt: iso(0) }), iso(0));

    // Replay 20s later — outside the 10s window: full-family reuse detection.
    const replay = await store.rotateRefreshToken('hash-a', session({ id: 'sess-d', refreshTokenHash: 'hash-d', familyId: 'fam-2', createdAt: iso(20_000), lastUsedAt: iso(20_000) }), iso(20_000));
    expect(replay.state).toBe('REUSE_DETECTED');

    const issuedAtSeconds = Math.floor(T0 / 1_000);
    expect(await store.getActiveUserForSession('usr-grace', 'fam-2', issuedAtSeconds)).toBeUndefined();
  });

  it('follows a consumed-token chain to a fresh descendant during concurrent recovery', async () => {
    const store = makeStore();
    await store.createUser(account());
    await store.createSession(session({ id: 'sess-a', refreshTokenHash: 'hash-a', familyId: 'fam-3' }));

    await store.rotateRefreshToken('hash-a', session({ id: 'sess-b', refreshTokenHash: 'hash-b', familyId: 'fam-3', createdAt: iso(0), lastUsedAt: iso(0) }), iso(0));
    await store.rotateRefreshToken('hash-b', session({ id: 'sess-c', refreshTokenHash: 'hash-c', familyId: 'fam-3', createdAt: iso(1_000), lastUsedAt: iso(1_000) }), iso(1_000));

    // Replay hash-a inside the window. Both direct descendants are consumed,
    // but sess-c is still a usable leaf and must be used for recovery.
    const replay = await store.rotateRefreshToken('hash-a', session({ id: 'sess-e', refreshTokenHash: 'hash-e', familyId: 'fam-3', createdAt: iso(2_000), lastUsedAt: iso(2_000) }), iso(2_000));
    expect(replay.state).toBe('ROTATED');

    const issuedAtSeconds = Math.floor(T0 / 1_000);
    expect(await store.getActiveUserForSession('usr-grace', 'fam-3', issuedAtSeconds)).toMatchObject({ id: 'usr-grace' });
  });
});
