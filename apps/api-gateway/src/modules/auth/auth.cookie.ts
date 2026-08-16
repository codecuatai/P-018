import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { parseConfiguredOrigins } from '../../config/environment';
import { GatewayAuthConfiguration } from './auth.service';

export function refreshTokenFromRequest(request: Request, cookieName: string): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === cookieName) return value.join('=') || undefined;
  }
  return undefined;
}

export function setRefreshCookie(response: Response, token: string, auth: GatewayAuthConfiguration, appEnv: string): void {
  response.cookie(auth.refreshCookieName, token, {
    httpOnly: true,
    secure: appEnv === 'production',
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: auth.refreshTokenTtlSeconds * 1_000,
  });
}

export function clearRefreshCookie(response: Response, auth: GatewayAuthConfiguration, appEnv: string): void {
  response.clearCookie(auth.refreshCookieName, {
    httpOnly: true,
    secure: appEnv === 'production',
    sameSite: 'lax',
    path: '/api/v1/auth',
  });
}

export function assertTrustedAuthOrigin(request: Request, config: ConfigService): void {
  const allowedOrigins = parseConfiguredOrigins(config.getOrThrow<string>('GATEWAY_CORS_ORIGINS'));
  const origin = request.header('origin');
  if (origin) {
    if (allowedOrigins.includes(origin)) return;
    throw new ForbiddenException({ code: 'AUTH_ORIGIN_FORBIDDEN', detail: 'Request origin is not allowed.', retryable: false });
  }
  const referer = request.header('referer');
  if (referer) {
    try {
      if (allowedOrigins.includes(new URL(referer).origin)) return;
    } catch {
      // The same safe public error applies to malformed Referer values.
    }
  }
  throw new ForbiddenException({ code: 'AUTH_ORIGIN_REQUIRED', detail: 'A trusted request origin is required.', retryable: false });
}
