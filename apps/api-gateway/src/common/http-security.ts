import { NestExpressApplication } from '@nestjs/platform-express';
import { ErrorRequestHandler } from 'express';

import { CorrelationIdMiddleware } from './correlation-id.middleware';
import { GatewayRateLimitMiddleware } from './rate-limit.middleware';
import { SecurityHeadersMiddleware } from './security-headers.middleware';
import { GatewaySecurityConfig } from '../config/environment';

export function configureGatewayHttpSecurity(app: NestExpressApplication, config: GatewaySecurityConfig): void {
  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Content-Type', 'Authorization', 'X-Correlation-Id', 'X-Actor-Id', 'Idempotency-Key'],
    exposedHeaders: ['X-Correlation-Id', 'Retry-After', 'X-RateLimit-Limit'],
    credentials: false,
    optionsSuccessStatus: 204,
  });
  const securityHeaders = new SecurityHeadersMiddleware(config.appEnv);
  const rateLimiter = new GatewayRateLimitMiddleware(config.rateLimitProfiles);
  app.use(securityHeaders.use.bind(securityHeaders));
  app.use(new CorrelationIdMiddleware().use);
  app.use(rateLimiter.use.bind(rateLimiter));
  app.useBodyParser('json', { limit: `${config.bodyLimitBytes}b` });
  app.useBodyParser('urlencoded', { extended: false, limit: `${config.bodyLimitBytes}b` });
  app.use(payloadErrorHandler);
}

const payloadErrorHandler: ErrorRequestHandler = (error, request, response, next) => {
  const status = typeof error?.status === 'number' ? error.status : undefined;
  if (status !== 400 && status !== 413) {
    next(error);
    return;
  }
  const isTooLarge = status === 413 || error?.type === 'entity.too.large';
  response.status(isTooLarge ? 413 : 400).json({
    type: `https://x-one.local/problems/${isTooLarge ? 'request_body_too_large' : 'invalid_json'}`,
    title: isTooLarge ? 'Request Entity Too Large' : 'Bad Request',
    status: isTooLarge ? 413 : 400,
    code: isTooLarge ? 'REQUEST_BODY_TOO_LARGE' : 'INVALID_JSON',
    detail: isTooLarge ? 'Request body exceeds the configured limit.' : 'Request body is not valid JSON.',
    retryable: false,
    request_id: (request as { correlationId?: string }).correlationId ?? 'cor_unknown',
  });
};
