import { CanActivate, ExecutionContext, Injectable, Module, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

import { AuthUser } from './auth.types';

function sign(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

function authenticationFailed(): UnauthorizedException {
  return new UnauthorizedException({ code: 'AUTHENTICATION_FAILED', detail: 'Authentication failed.' });
}

export function isDemoAuthEnabled(config: ConfigService): boolean {
  const appEnv = config.get<string>('APP_ENV');
  const enabled = config.get<string>('DEMO_AUTH_ENABLED');
  return (appEnv === 'development' || appEnv === 'test') && enabled?.toLowerCase() === 'true';
}

export function verifyDemoToken(token: string, secret: string): AuthUser {
  const parts = token.split('.');
  if (parts.length !== 3) throw authenticationFailed();
  const [header, payload, signature] = parts;
  const expected = sign(`${header}.${payload}`, secret);
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw authenticationFailed();
  let decoded: Partial<AuthUser> & { exp?: unknown };
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<AuthUser> & { exp?: unknown };
  } catch {
    throw authenticationFailed();
  }
  if (
    typeof decoded.sub !== 'string'
    || typeof decoded.email !== 'string'
    || typeof decoded.role !== 'string'
    || typeof decoded.exp !== 'number'
    || !Number.isFinite(decoded.exp)
    || decoded.exp < Math.floor(Date.now() / 1000)
  ) throw authenticationFailed();
  return { sub: decoded.sub, email: decoded.email, role: decoded.role };
}

@Injectable()
export class DemoAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: AuthUser }>();
    if (!isDemoAuthEnabled(this.config)) throw new UnauthorizedException({ code: 'DEMO_AUTH_DISABLED', detail: 'Demo authentication is disabled in this environment.' });
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED', detail: 'Authentication is required.' });
    request.user = verifyDemoToken(authorization.slice(7), this.config.getOrThrow<string>('JWT_SECRET'));
    return true;
  }
}
