import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const express = app.getHttpAdapter().getInstance() as { disable(name: string): void };
  express.disable('x-powered-by');
  const corsOrigins = String(process.env.GATEWAY_CORS_ORIGINS)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
    methods: 'GET,HEAD,POST,OPTIONS',
    credentials: true,
  });
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (process.env.APP_ENV === 'production') {
      response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });
  app.use(new CorrelationIdMiddleware().use);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

void bootstrap();
