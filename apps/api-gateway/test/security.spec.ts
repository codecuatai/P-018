import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureGatewayHttpSecurity } from '../src/common/http-security';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { getGatewaySecurityConfig } from '../src/config/environment';

describe('Gateway security baseline', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureGatewayHttpSecurity(app, getGatewaySecurityConfig(process.env));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => app.close());

  it('uses explicit CORS origins with credentialed refresh-cookie support', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .set('Origin', 'http://localhost:5173')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('adds baseline security headers', async () => {
    const response = await request(app.getHttpServer()).get('/health/live').expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('rejects a body above the configured limit with a safe error', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/assistant/chat')
      .set('Content-Type', 'application/json')
      .send({ message: 'x'.repeat(300_000) })
      .expect(413);

    expect(response.body).toMatchObject({ code: 'REQUEST_BODY_TOO_LARGE', retryable: false });
    expect(response.body.request_id).toBeDefined();
  });

  it('rate limits the demo login profile', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'wrong@example.invalid', password: 'wrong' })
        .expect(401);
    }

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'wrong@example.invalid', password: 'wrong' })
      .expect(429);

    expect(response.headers['retry-after']).toBeDefined();
    expect(response.body).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
  });
});
