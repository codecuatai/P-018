import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { verifySignedDemoToken } from './auth.token';
import { AuthService } from './auth.service';
import { AuthUser } from './auth.types';

function authenticationFailed(): UnauthorizedException {
  return new UnauthorizedException({ code: 'AUTHENTICATION_FAILED', detail: 'Authentication failed.', retryable: false });
}

export function isDemoAuthEnabled(config: ConfigService): boolean {
  const appEnv = config.get<string>('APP_ENV');
  const enabled = config.get<string>('DEMO_AUTH_ENABLED');
  return (appEnv === 'development' || appEnv === 'test') && enabled?.toLowerCase() === 'true';
}

export function verifyDemoToken(token: string, secret: string): AuthUser {
  const user = verifySignedDemoToken(token, secret);
  if (!user) throw authenticationFailed();
  return user;
}

type RequestWithUser = { headers: Record<string, string | string[] | undefined>; user?: AuthUser };

/** Canonical Gateway guard: real auth in every environment, explicit demo fallback only in dev/test. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService, private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authorization = firstHeader(request.headers.authorization);
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED', detail: 'Authentication is required.', retryable: false });
    const token = authorization.slice(7);
    const realUser = await this.auth.authenticateAccessToken(token);
    if (realUser) {
      request.user = realUser;
      return true;
    }
    if (isDemoAuthEnabled(this.config)) {
      const demoUser = verifySignedDemoToken(token, this.config.getOrThrow<string>('JWT_SECRET'));
      if (demoUser) {
        request.user = { ...demoUser, authentication_kind: 'demo' };
        return true;
      }
    }
    throw authenticationFailed();
  }
}

/** Retained for legacy controllers/tests that intentionally exercise demo-only behavior. */
@Injectable()
export class DemoAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!isDemoAuthEnabled(this.config)) throw new UnauthorizedException({ code: 'DEMO_AUTH_DISABLED', detail: 'Demo authentication is disabled in this environment.', retryable: false });
    const authorization = firstHeader(request.headers.authorization);
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED', detail: 'Authentication is required.', retryable: false });
    request.user = verifyDemoToken(authorization.slice(7), this.config.getOrThrow<string>('JWT_SECRET'));
    return true;
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
