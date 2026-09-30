import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { FoodClient } from '../src/clients/service.clients';
import { CorrelationIdMiddleware } from '../src/common/correlation-id.middleware';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';

describe('health endpoints', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.use(new CorrelationIdMiddleware().use);
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => app.close());

  it('reports liveness with a correlation id', async () => {
    const response = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(response.body.data.status).toBe('live');
    expect(response.headers['x-correlation-id']).toBeDefined();
  });

  it('reports readiness', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(response.body.data.status).toBe('ready');
  });

  it('returns the safe error envelope', async () => {
    const response = await request(app.getHttpServer()).get('/missing').expect(404);
    expect(response.body.code).toBe('REQUEST_ERROR');
    expect(response.body.request_id).toBeDefined();
  });

  it('registers FoodClient with the MCP transport boundary', () => {
    expect(app.get(FoodClient).baseUrl).toBe('mcp://food');
  });

  it('supports demo login and protects the current-user endpoint', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'demo@xone.vn', password: 'Xone@123' }).expect(201);
    expect(login.body.data.user.sub).toBe('usr_demo_001');
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${login.body.data.access_token}`).expect(200);
    expect(me.body.data.email).toBe('demo@xone.vn');
  });
});
