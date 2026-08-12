import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AgentClient, RideClient } from '../src/clients/service.clients';
import { CorrelationIdMiddleware } from '../src/common/correlation-id.middleware';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { ServiceCallError } from '../src/resilience/service-call-error';

describe('Ride conversation workflow', () => {
  let app: INestApplication;
  const quote = {
    id: 'quote_test_001',
    pickup_address: 'VinUni',
    dropoff_address: 'Ho Guom',
    vehicle_type: 'CAR_4' as const,
    distance_km: 12,
    duration_minutes: 35,
    amount: 125000,
    currency: 'VND',
    tariff_version: 'SIM_2026_08_V1',
    quote_version: 'SIM_2026_08_V1:quote_test_001',
    expires_at: new Date(Date.now() + 600_000).toISOString(),
  };
  const prepared = {
    id: 'ride_test_001',
    quote_id: quote.id,
    quote_version: quote.quote_version,
    amount: quote.amount,
    currency: quote.currency,
    status: 'AWAITING_CONFIRMATION' as const,
    resource_version: 1,
    payment_reference: null,
    driver: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const confirmed = {
    ...prepared,
    status: 'DRIVER_ASSIGNED' as const,
    resource_version: 3,
    payment_reference: 'pay_sandbox_test',
    driver: { id: 'driver_simulated_001', display_name: 'Minh Anh' },
  };
  const agent = {
    interpret: jest.fn().mockImplementation((_message: string, workflowId: string) => ({
      response: 'Đã đủ dữ liệu để báo giá.',
      workflow_id: workflowId,
      intent: 'request_ride_quote',
      missing_fields: [],
      state_patch: {
        active_domain: 'ride',
        slot_updates: [
          { slot: 'pickup_address', value: 'VinUni', source: 'user', confidence: 1 },
          { slot: 'dropoff_address', value: 'Ho Guom', source: 'user', confidence: 1 },
        ],
        clear_fields: [],
        revision: 1,
        pending_action: 'ride.quote.create',
      },
      tool_request: {
        tool_name: 'ride.quote.create',
        risk_level: 'READ',
        arguments: {
          pickup_address: 'VinUni',
          dropoff_address: 'Ho Guom',
          vehicle_type: 'CAR_4',
        },
        workflow_id: workflowId,
      },
    })),
  };
  const ride = {
    createQuote: jest.fn().mockResolvedValue(quote),
    prepareBooking: jest.fn().mockResolvedValue(prepared),
    confirmBooking: jest.fn().mockResolvedValue(confirmed),
    getBooking: jest.fn().mockResolvedValue(confirmed),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AgentClient)
      .useValue(agent)
      .overrideProvider(RideClient)
      .useValue(ride)
      .compile();
    app = module.createNestApplication();
    app.use(new CorrelationIdMiddleware().use);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => app.close());

  it('closes the Agent to Ride flow with two explicit confirmations', async () => {
    const chat = await request(app.getHttpServer())
      .post('/api/v1/chat')
      .set('X-Actor-Id', 'actor_test')
      .send({ message: 'Đặt xe từ VinUni đến Hồ Gươm' })
      .expect(201);
    expect(chat.body.data.stage).toBe('SERVICE_CONFIRMATION');
    expect(chat.body.data.quote.id).toBe(quote.id);
    expect(chat.body.data.confirmation.kind).toBe('SERVICE_DETAILS');

    const workflowId = String(chat.body.data.workflow_id);
    const serviceConfirmation = await request(app.getHttpServer())
      .post('/api/v1/workflows/' + workflowId + '/confirm-service')
      .set('X-Actor-Id', 'actor_test')
      .expect(201);
    expect(serviceConfirmation.body.data.stage).toBe('PAYMENT_CONFIRMATION');
    expect(serviceConfirmation.body.data.booking.status).toBe('AWAITING_CONFIRMATION');

    const paymentConfirmation = await request(app.getHttpServer())
      .post('/api/v1/workflows/' + workflowId + '/confirm-payment')
      .set('X-Actor-Id', 'actor_test')
      .expect(201);
    expect(paymentConfirmation.body.data.stage).toBe('COMPLETED');
    expect(paymentConfirmation.body.data.booking.status).toBe('DRIVER_ASSIGNED');
    expect(paymentConfirmation.body.data.response).toContain('DRIVER_ASSIGNED');

    const firstEvidence = JSON.parse(ride.prepareBooking.mock.calls[0][3]).confirmation;
    const finalEvidence = JSON.parse(ride.confirmBooking.mock.calls[0][4]).confirmation;
    expect(firstEvidence.action).toBe('ride.booking.prepare');
    expect(finalEvidence.action).toBe('ride.booking.confirm');
    expect(firstEvidence.payload_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(finalEvidence.payload_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not expose another actor workflow', async () => {
    const chat = await request(app.getHttpServer())
      .post('/api/v1/chat')
      .set('X-Actor-Id', 'actor_owner')
      .send({ message: 'Đặt xe từ VinUni đến Hồ Gươm' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/workflows/' + String(chat.body.data.workflow_id) + '/confirm-service')
      .set('X-Actor-Id', 'actor_other')
      .expect(404);
  });

  it('reuses the exact pending prepare body after an ambiguous outcome', async () => {
    const ambiguous = new ServiceCallError({
      service: 'ride-service',
      operation: 'ride.booking.prepare',
      contractVersion: 'v1',
      httpStatus: null,
      code: 'DOWNSTREAM_TIMEOUT',
      detail: 'timeout',
      category: 'TRANSIENT',
      retryable: true,
      retryAfterMs: null,
      outcome: 'AMBIGUOUS',
    });
    ride.prepareBooking.mockClear();
    ride.prepareBooking.mockRejectedValueOnce(ambiguous).mockResolvedValueOnce(prepared);

    const chat = await request(app.getHttpServer())
      .post('/api/v1/chat')
      .set('X-Actor-Id', 'actor_retry')
      .send({ message: 'Đặt xe từ VinUni đến Hồ Gươm' })
      .expect(201);
    const workflowId = String(chat.body.data.workflow_id);

    await request(app.getHttpServer())
      .post('/api/v1/workflows/' + workflowId + '/confirm-service')
      .set('X-Actor-Id', 'actor_retry')
      .expect(503)
      .expect(({ body }) => {
        expect(body.code).toBe('OUTCOME_UNKNOWN');
        expect(body.retryable).toBe(true);
      });
    const firstBody = ride.prepareBooking.mock.calls[0][3];

    await request(app.getHttpServer())
      .post('/api/v1/workflows/' + workflowId + '/confirm-service')
      .set('X-Actor-Id', 'actor_retry')
      .expect(201);

    expect(ride.prepareBooking.mock.calls).toHaveLength(2);
    expect(ride.prepareBooking.mock.calls[1][3]).toBe(firstBody);
    expect(JSON.parse(firstBody).confirmation.confirmation_id).toBeDefined();
  });

  it('reconciles an ambiguous payment confirmation from the authoritative booking', async () => {
    const ambiguous = new ServiceCallError({
      service: 'ride-service',
      operation: 'ride.booking.confirm',
      contractVersion: 'v1',
      httpStatus: null,
      code: 'DOWNSTREAM_TIMEOUT',
      detail: 'timeout',
      category: 'TRANSIENT',
      retryable: true,
      retryAfterMs: null,
      outcome: 'AMBIGUOUS',
    });
    ride.prepareBooking.mockReset().mockResolvedValue(prepared);
    ride.confirmBooking.mockReset().mockRejectedValueOnce(ambiguous);
    ride.getBooking.mockReset().mockImplementation(() => {
      const body = JSON.parse(ride.confirmBooking.mock.calls[0][4]);
      return Promise.resolve({ ...confirmed, payment_reference: body.payment_reference });
    });

    const chat = await request(app.getHttpServer())
      .post('/api/v1/chat')
      .set('X-Actor-Id', 'actor_reconcile')
      .send({ message: 'Đặt xe từ VinUni đến Hồ Gươm' })
      .expect(201);
    const workflowId = String(chat.body.data.workflow_id);

    await request(app.getHttpServer())
      .post('/api/v1/workflows/' + workflowId + '/confirm-service')
      .set('X-Actor-Id', 'actor_reconcile')
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/workflows/' + workflowId + '/confirm-payment')
      .set('X-Actor-Id', 'actor_reconcile')
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.stage).toBe('COMPLETED');
        expect(body.data.booking.status).toBe('DRIVER_ASSIGNED');
        expect(body.data.response).toContain('DRIVER_ASSIGNED');
      });

    expect(ride.getBooking).toHaveBeenCalledTimes(1);
  });
});
