import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

import { CorrelatedRequest } from './correlation-id.middleware';
import { GatewayRateLimitProfile } from '../config/environment';

type Bucket = {
  startedAt: number;
  count: number;
};

@Injectable()
export class GatewayRateLimitMiddleware implements NestMiddleware {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly profiles: readonly GatewayRateLimitProfile[]) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const profile = this.profiles.find((candidate) => candidate.method === request.method && matchesPath(candidate.path, request.path));
    if (!profile) {
      next();
      return;
    }

    const now = Date.now();
    const key = `${profile.name}:${request.ip || request.socket.remoteAddress || 'unknown'}`;
    const current = this.buckets.get(key);
    const bucket = !current || now - current.startedAt >= profile.windowMs
      ? { startedAt: now, count: 0 }
      : current;
    if (this.buckets.size > 10_000) this.removeExpired(now);

    if (bucket.count >= profile.maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((bucket.startedAt + profile.windowMs - now) / 1_000));
      response.setHeader('Retry-After', String(retryAfter));
      response.setHeader('X-RateLimit-Limit', String(profile.maxRequests));
      response.status(429).json({
        type: 'https://x-one.local/problems/rate_limited',
        title: 'Too Many Requests',
        status: 429,
        code: 'RATE_LIMITED',
        detail: 'Too many requests. Please retry later.',
        retryable: true,
        request_id: (request as CorrelatedRequest).correlationId ?? 'cor_unknown',
      });
      return;
    }

    bucket.count += 1;
    this.buckets.set(key, bucket);
    response.setHeader('X-RateLimit-Limit', String(profile.maxRequests));
    next();
  }

  private removeExpired(now: number): void {
    for (const [key, bucket] of this.buckets.entries()) {
      const profileName = key.slice(0, key.indexOf(':'));
      const profile = this.profiles.find((candidate) => candidate.name === profileName);
      if (profile && now - bucket.startedAt >= profile.windowMs) this.buckets.delete(key);
    }
  }
}

function matchesPath(path: string | RegExp, requestPath: string): boolean {
  if (typeof path === 'string') return path === requestPath;
  path.lastIndex = 0;
  return path.test(requestPath);
}
