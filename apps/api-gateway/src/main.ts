import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { configureGatewayHttpSecurity } from './common/http-security';
import { getGatewaySecurityConfig } from './config/environment';

async function bootstrap(): Promise<void> {
  const securityConfig = getGatewaySecurityConfig(process.env);
  const app = await NestFactory.create(AppModule, { bodyParser: false }) as unknown as NestExpressApplication;
  app.set('trust proxy', 1);
  configureGatewayHttpSecurity(app, securityConfig);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

void bootstrap();
