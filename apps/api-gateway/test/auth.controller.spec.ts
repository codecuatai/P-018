import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { configureGatewayHttpSecurity } from '../src/common/http-security';
import { getGatewaySecurityConfig } from '../src/config/environment';

const origin = 'http://localhost:5173';
const password = 'a reliable local passphrase 123!@#';

describe('real auth HTTP contract', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false }) as unknown as NestExpressApplication;
    configureGatewayHttpSecurity(app, getGatewaySecurityConfig(process.env));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => app.close());

  it('sets an HttpOnly Lax refresh cookie, rotates it, and detects replay', async () => {
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ full_name: 'Nguyễn An', email: 'an@example.test', password })
      .expect(201);
    const initialCookie = registered.headers['set-cookie']?.[0];
    expect(initialCookie).toContain('xone_refresh=');
    expect(initialCookie).toContain('HttpOnly');
    expect(initialCookie).toContain('SameSite=Lax');
    expect(initialCookie).toContain('Path=/api/v1/auth');
    expect(registered.body.data).not.toHaveProperty('refresh_token');

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registered.body.data.access_token}`)
      .expect(200);
    expect(me.body.data).toMatchObject({ email: 'an@example.test', full_name: 'Nguyễn An', authentication_kind: 'real' });

    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', initialCookie!)
      .expect(201);
    const nextCookie = rotated.headers['set-cookie']?.[0];
    expect(nextCookie).toContain('xone_refresh=');

    // Benign replay inside grace window rolls forward safely
    const benignReplay = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', initialCookie!)
      .expect(201);
    const rolledCookie = benignReplay.headers['set-cookie']?.[0];
    expect(rolledCookie).toContain('xone_refresh=');

    // Explicit family revocation makes replaying the initial token genuine reuse.
    const rotatedAgain = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', rolledCookie!)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('Cookie', rotatedAgain.headers['set-cookie']?.[0]!)
      .expect(200);

    const replay = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', initialCookie!)
      .expect(401);
    expect(replay.body).toMatchObject({ code: 'REFRESH_TOKEN_REUSED' });

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${rotatedAgain.body.data.access_token}`)
      .expect(401);
  });

  it('rejects missing or foreign Origin evidence for cookie-authenticated refresh/logout', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(403).expect(({ body }) => expect(body.code).toBe('AUTH_ORIGIN_REQUIRED'));
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Origin', 'https://foreign.example').expect(403).expect(({ body }) => expect(body.code).toBe('AUTH_ORIGIN_FORBIDDEN'));
  });
});
