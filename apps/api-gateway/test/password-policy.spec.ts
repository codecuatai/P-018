process.env.GATEWAY_AUTH_LOGIN_RATE_LIMIT = '500';
process.env.GATEWAY_FUTURE_AUTH_RATE_LIMIT = '500';

import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { configureGatewayHttpSecurity } from '../src/common/http-security';
import { getGatewaySecurityConfig } from '../src/config/environment';

describe('password policy HTTP contract', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false }) as unknown as NestExpressApplication;
    configureGatewayHttpSecurity(app, getGatewaySecurityConfig(process.env));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Register password boundary and complexity', () => {
    it('rejects passwords shorter than 8 characters (boundary 7)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ full_name: 'Nguyễn An', email: 'test7@example.test', password: 'Pass1!a' })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('8 ký tự');
    });

    it('rejects passwords longer than 128 characters (boundary 129)', async () => {
      const longPassword = 'A1!' + 'a'.repeat(126);
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ full_name: 'Nguyễn An', email: 'test129@example.test', password: longPassword })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('128 ký tự');
    });

    it('rejects passwords missing special characters', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ full_name: 'Nguyễn An', email: 'testnospec@example.test', password: 'Password123' })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('chữ, số và ký tự đặc biệt');
    });

    it('rejects passwords missing numbers', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ full_name: 'Nguyễn An', email: 'testnonum@example.test', password: 'Password!@#' })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('chữ, số và ký tự đặc biệt');
    });

    it('rejects passwords missing letters', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ full_name: 'Nguyễn An', email: 'testnoletter@example.test', password: '12345678!@#' })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('chữ, số và ký tự đặc biệt');
    });

    it('accepts valid password at lower boundary (8 characters)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ full_name: 'Nguyễn An', email: 'testbound8@example.test', password: 'Pass12!@' })
        .expect(201);
    });

    it('accepts valid password at upper boundary (128 characters)', async () => {
      const valid128 = 'A1!' + 'a'.repeat(125);
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ full_name: 'Nguyễn An', email: 'testbound128@example.test', password: valid128 })
        .expect(201);
    });
  });

  describe('Change Password boundary and complexity contract', () => {
    it('rejects invalid new_password at DTO level for authenticated user', async () => {
      const reg = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ full_name: 'Nguyễn Change', email: 'change-pass-test@example.test', password: 'ValidPass123!@#' })
        .expect(201);
      const token = reg.body.data.access_token;

      const resShort = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ current_password: 'ValidPass123!@#', new_password: 'short' })
        .expect(400);
      expect(JSON.stringify(resShort.body)).toContain('8 ký tự');

      const resNoSpec = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ current_password: 'ValidPass123!@#', new_password: 'Password123' })
        .expect(400);
      expect(JSON.stringify(resNoSpec.body)).toContain('chữ, số và ký tự đặc biệt');
    });

    it('rejects wrong current_password with CURRENT_PASSWORD_INVALID and preserves session validity', async () => {
      const reg = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ full_name: 'Nguyễn Change', email: 'change-pass-wrong-cur@example.test', password: 'ValidPass123!@#' })
        .expect(201);
      const token = reg.body.data.access_token;

      const resWrong = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Origin', 'http://localhost:5173')
        .set('Authorization', `Bearer ${token}`)
        .send({ current_password: 'WrongCurrentPassword123!@#', new_password: 'ValidNextPass456$%^' })
        .expect(401);

      expect(resWrong.body).toMatchObject({
        code: 'CURRENT_PASSWORD_INVALID',
        detail: 'Mật khẩu hiện tại không đúng.',
      });

      // The session remains fully valid and active for subsequent operations
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(meRes.body.data.email).toBe('change-pass-wrong-cur@example.test');
    });
  });

  describe('Reset Password boundary and complexity contract', () => {
    it('rejects invalid new_password at DTO level', async () => {
      const resShort = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: 'dummy-token', new_password: 'short' })
        .expect(400);
      expect(JSON.stringify(resShort.body)).toContain('8 ký tự');

      const resNoSpec = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: 'dummy-token', new_password: 'Password123' })
        .expect(400);
      expect(JSON.stringify(resNoSpec.body)).toContain('chữ, số và ký tự đặc biệt');
    });
  });
});
