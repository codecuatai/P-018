import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DemoAuthGuard } from '../src/modules/auth/auth.guard';
import { issueDemoToken } from '../src/modules/auth/auth.token';
import { AuthUser } from '../src/modules/auth/auth.types';

const SECRET = 'test-jwt-secret-12345';
const USER: AuthUser = { sub: 'usr_demo_001', email: 'demo@example.invalid', role: 'customer' };

function config(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((name: string) => values[name]),
    getOrThrow: jest.fn((name: string) => values[name] ?? (() => { throw new Error(`${name} is missing`); })()),
  } as unknown as ConfigService;
}

function context(authorization?: string): { execution: ExecutionContext; request: { user?: AuthUser } } {
  const request: { headers: Record<string, string | undefined>; user?: AuthUser } = { headers: { authorization } };
  return {
    request,
    execution: { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext,
  };
}

function expectAuthError(action: () => unknown, code: string): void {
  try {
    action();
    fail('Expected authentication to be rejected.');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toMatchObject({ code });
  }
}

describe('DemoAuthGuard fail-closed policy', () => {
  it('accepts a valid demo token only in development with demo auth enabled', () => {
    const { execution, request } = context(`Bearer ${issueDemoToken(USER, SECRET)}`);
    const guard = new DemoAuthGuard(config({ APP_ENV: 'development', DEMO_AUTH_ENABLED: 'true', JWT_SECRET: SECRET }));

    expect(guard.canActivate(execution)).toBe(true);
    expect(request.user).toEqual(USER);
  });

  it.each([
    ['test with demo auth disabled', { APP_ENV: 'test', DEMO_AUTH_ENABLED: 'false' }],
    ['production with a signed demo token', { APP_ENV: 'production', DEMO_AUTH_ENABLED: 'true' }],
  ])('rejects a valid token for %s', (_label, values) => {
    const { execution } = context(`Bearer ${issueDemoToken(USER, SECRET)}`);
    const guard = new DemoAuthGuard(config({ ...values, JWT_SECRET: SECRET }));

    expectAuthError(() => guard.canActivate(execution), 'DEMO_AUTH_DISABLED');
  });

  it.each([
    ['malformed', 'not-a-token'],
    ['expired', `Bearer ${issueDemoToken(USER, SECRET, -1)}`],
  ])('rejects an %s token without leaking authentication details', (_label, token) => {
    const authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    const { execution } = context(authorization);
    const guard = new DemoAuthGuard(config({ APP_ENV: 'test', DEMO_AUTH_ENABLED: 'true', JWT_SECRET: SECRET }));

    expectAuthError(() => guard.canActivate(execution), 'AUTHENTICATION_FAILED');
  });
});
