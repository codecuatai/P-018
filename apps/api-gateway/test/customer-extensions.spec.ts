process.env.GATEWAY_AUTH_LOGIN_RATE_LIMIT = '500';
process.env.GATEWAY_FUTURE_AUTH_RATE_LIMIT = '500';

import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createHmac } from 'crypto';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { configureGatewayHttpSecurity } from '../src/common/http-security';
import { getGatewaySecurityConfig } from '../src/config/environment';

describe('Customer Portal Extensions E2E API Verification', () => {
  let app: NestExpressApplication;
  let authToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureGatewayHttpSecurity(app, getGatewaySecurityConfig(process.env));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    // Register real customer user to get valid JWT
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        full_name: 'Khách Hàng Test',
        email: `customer_${Date.now()}@xone.local`,
        password: 'ValidPassword123!@#',
        role: 'customer',
      })
      .expect(201);

    authToken = reg.body.data.access_token;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('Rewards & Loyalty Endpoints', () => {
    it('GET /api/v1/rewards/summary returns loyalty tier and points', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/rewards/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.points).toBeGreaterThanOrEqual(0);
      expect(res.body.data.tier).toBeDefined();
      expect(res.body.data.tier_label).toBeDefined();
    });

    it('GET /api/v1/rewards/vouchers returns active/expired vouchers', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/rewards/vouchers?status=active')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data.items).toBeDefined();
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('GET /api/v1/rewards/ledger returns transaction points history', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/rewards/ledger')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data.items).toBeDefined();
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('GET /api/v1/rewards/referral returns referral code and share info', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/rewards/referral')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data.referral_code).toBeDefined();
      expect(res.body.data.referral_url).toBeDefined();
    });
  });

  describe('Notification Preferences Endpoints', () => {
    it('GET /api/v1/notifications/preferences returns default preferences', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({
        booking_updates: expect.any(Boolean),
        promotions: expect.any(Boolean),
        system: expect.any(Boolean),
        email_enabled: expect.any(Boolean),
      });
    });

    it('PATCH /api/v1/notifications/preferences updates and persists preferences', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          booking_updates: false,
          promotions: false,
          email_enabled: true,
        })
        .expect(200);

      expect(res.body.data.booking_updates).toBe(false);
      expect(res.body.data.promotions).toBe(false);
      expect(res.body.data.email_enabled).toBe(true);
    });
  });

  describe('Two-Factor Authentication (2FA) Endpoints', () => {
    it('GET /api/v1/auth/2fa/setup returns QR code and secret', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/2fa/setup')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data.secret).toBeDefined();
      expect(res.body.data.qr_code_url).toContain('otpauth://totp/');
      expect(res.body.data.backup_codes).toHaveLength(8);
    });

    it('POST /api/v1/auth/2fa/verify validates OTP code format', async () => {
      const setup = await request(app.getHttpServer())
        .get('/api/v1/auth/2fa/setup')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const code = totp(setup.body.data.secret);
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code })
        .expect(200);

      expect(res.body.data.enabled).toBe(true);
    });

    it('POST /api/v1/auth/2fa/disable rejects incorrect password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/disable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: 'WrongPassword123!' })
        .expect(401);
    });

    it('POST /api/v1/auth/2fa/disable succeeds with correct password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/disable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: 'ValidPassword123!@#' })
        .expect(200);

      expect(res.body.data.disabled).toBe(true);
    });
  });

  describe('Feedback / Review Endpoints', () => {
    it('PATCH /api/v1/feedback/:id returns 404 for non-existent feedback', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/feedback/non_existent_feedback_id')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ rating: 4, comment: 'Đã cập nhật đánh giá' })
        .expect(404);
    });
  });

  describe('Avatar Upload Endpoint', () => {
    it('POST /api/v1/users/avatar accepts multipart image and updates profile', async () => {
      const samplePng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/users/avatar')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('avatar', samplePng, 'avatar.png')
        .expect(201);

      expect(res.body.data.avatar_url).toBeDefined();
      expect(res.body.data.avatar_url).toContain('data:image/png;base64');
    });
  });
});

function totp(secret: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const character of secret) {
    buffer = (buffer << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(value % 1_000_000).padStart(6, '0');
}
