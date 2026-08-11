import { decode, sign } from 'jsonwebtoken';

import { issueAccessToken, verifyAccessToken } from '../src/modules/auth/auth.token';
import { AuthUser } from '../src/modules/auth/auth.types';

const secret = 'test-jwt-secret-12345';
const user: AuthUser = { sub: '2df58aae-309c-4af3-9f0a-5b682cd89070', email: 'an@example.test', role: 'customer' };

describe('access-token JWT contract', () => {
  it('issues a maintained-library JWT with the required bound claims', () => {
    const token = issueAccessToken(user, '5a422c84-83e9-48af-9e03-ccbf5e53a82e', secret, 'x-one', 'x-one-web', 900);
    const payload = decode(token) as Record<string, unknown>;

    expect(payload).toMatchObject({
      iss: 'x-one',
      aud: 'x-one-web',
      sub: user.sub,
      sid: '5a422c84-83e9-48af-9e03-ccbf5e53a82e',
      role: 'customer',
      typ: 'access',
    });
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(typeof payload.jti).toBe('string');
    expect(verifyAccessToken(token, secret, 'x-one', 'x-one-web')).toMatchObject({ sub: user.sub, role: 'customer' });
  });

  it('rejects a token with an unapproved signing algorithm', () => {
    const token = sign({ sid: 'session', role: 'customer', typ: 'access' }, secret, {
      algorithm: 'HS512', audience: 'x-one-web', expiresIn: 900, issuer: 'x-one', subject: user.sub,
    });

    expect(verifyAccessToken(token, secret, 'x-one', 'x-one-web')).toBeUndefined();
  });
});
