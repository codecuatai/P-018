import { randomUUID } from 'crypto';
import { JwtPayload, sign, verify } from 'jsonwebtoken';

import { AccessTokenClaims, AuthUser } from './auth.types';

export function issueAccessToken(
  user: AuthUser,
  sessionId: string,
  secret: string,
  issuer: string,
  audience: string,
  ttlSeconds: number,
): string {
  return sign({
    sid: sessionId,
    role: user.role === 'admin' ? 'admin' : 'customer',
    jti: randomUUID(),
    typ: 'access',
  } satisfies Pick<AccessTokenClaims, 'sid' | 'role' | 'jti' | 'typ'>, secret, {
    algorithm: 'HS256',
    audience,
    expiresIn: ttlSeconds,
    issuer,
    subject: user.sub,
    header: { alg: 'HS256', typ: 'JWT' },
  });
}

export function verifyAccessToken(token: string, secret: string, issuer: string, audience: string): AccessTokenClaims | undefined {
  try {
    const result = verify(token, secret, { algorithms: ['HS256'], audience, issuer, complete: true });
    if (typeof result === 'string' || result.header.alg !== 'HS256' || result.header.typ !== 'JWT') return undefined;
    const value = result.payload;
    if (typeof value === 'string') return undefined;
    if (
      value.typ !== 'access'
      || typeof value.sub !== 'string'
      || typeof value.sid !== 'string'
      || (value.role !== 'customer' && value.role !== 'admin')
      || typeof value.iat !== 'number'
      || typeof value.exp !== 'number'
      || typeof value.jti !== 'string'
    ) return undefined;
    if (value.iat > Math.floor(Date.now() / 1_000) + 60) return undefined;
    return value as AccessTokenClaims;
  } catch {
    return undefined;
  }
}

export function issueDemoToken(user: AuthUser, secret: string, ttlSeconds = 3600): string {
  return sign({
    email: user.email,
    role: user.role,
    typ: 'demo',
    jti: randomUUID(),
  }, secret, {
    algorithm: 'HS256',
    expiresIn: ttlSeconds,
    subject: user.sub,
    header: { alg: 'HS256', typ: 'JWT' },
  });
}

export function verifySignedDemoToken(token: string, secret: string): AuthUser | undefined {
  try {
    const result = verify(token, secret, { algorithms: ['HS256'], complete: true });
    if (typeof result === 'string' || result.header.alg !== 'HS256' || result.header.typ !== 'JWT') return undefined;
    const value = result.payload as JwtPayload;
    if (
      value.typ !== 'demo'
      || typeof value.sub !== 'string'
      || typeof value.email !== 'string'
      || typeof value.role !== 'string'
    ) return undefined;
    return { sub: value.sub, email: value.email, role: value.role };
  } catch {
    return undefined;
  }
}
