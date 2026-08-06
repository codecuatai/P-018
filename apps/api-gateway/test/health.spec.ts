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

  it('registers FoodClient with the configured internal URL', () => {
    expect(app.get(FoodClient).baseUrl).toBe('http://food-service:8104');
  });
});
