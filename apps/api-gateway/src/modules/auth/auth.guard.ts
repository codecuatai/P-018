import { CanActivate, ExecutionContext, Injectable, Module, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

import { AuthUser } from './auth.types';

function sign(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

export function verifyDemoToken(token: string, secret: string): AuthUser {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) throw new UnauthorizedException('Invalid token.');
  const expected = sign(`${header}.${payload}`, secret);
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw new UnauthorizedException('Invalid token.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AuthUser & { exp: number };
  if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) throw new UnauthorizedException('Token expired.');
  return { sub: decoded.sub, email: decoded.email, role: decoded.role };
}

@Injectable()
export class DemoAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: AuthUser }>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Bearer authentication required.');
    request.user = verifyDemoToken(authorization.slice(7), this.config.getOrThrow<string>('JWT_SECRET'));
    return true;
  }
}
