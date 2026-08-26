import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { AdminService } from '../src/modules/admin/admin.service';
import { AgentClient, FoodClient, HealthcareClient, RestaurantClient, RideClient } from '../src/clients/service.clients';
import { AuthService } from '../src/modules/auth/auth.service';
import { CoreStore, InMemoryCoreRepository } from '../src/modules/core/core.module';
import { CoreProductOpsStore, InMemoryProductOpsStore } from '../src/modules/core/product-ops.store';
import { WorkflowService } from '../src/modules/workflow/workflow.module';
import { decryptSecret } from '../src/modules/core/crypto.util';

describe('AdminService', () => {
  let service: AdminService;
  let coreStore: CoreStore;
  let productOps: CoreProductOpsStore;
  let mockAgent: Partial<AgentClient>;
  let mockFood: Partial<FoodClient>;
  let mockRide: Partial<RideClient>;
  let mockRestaurant: Partial<RestaurantClient>;
  let mockHealthcare: Partial<HealthcareClient>;

  const masterSecret = 'test-secret-key-32-chars-at-least!!';

  beforeEach(async () => {
    const configService = new ConfigService();
    coreStore = new CoreStore(configService);
    productOps = new CoreProductOpsStore(configService);

    mockAgent = { ready: jest.fn().mockResolvedValue({ ok: true, status: 200, body: { status: 'healthy' } }) };
    mockFood = {
      ready: jest.fn().mockResolvedValue({ ok: true, status: 200, body: { status: 'healthy' } }),
      opsSummary: jest.fn().mockResolvedValue({ counts: {} }),
      opsDatasetStatus: jest.fn().mockResolvedValue({ status: 'healthy' }),
      opsTransactions: jest.fn().mockResolvedValue({ items: [{ order_id: 'order_1', actor_id: 'user_123', status: 'COMPLETED' }] }),
    };
    mockRide = {
      ready: jest.fn().mockResolvedValue({ ok: true, status: 200, body: { status: 'healthy' } }),
      opsSummary: jest.fn().mockResolvedValue({ counts: {} }),
      opsDatasetStatus: jest.fn().mockResolvedValue({ status: 'healthy' }),
      opsTransactions: jest.fn().mockResolvedValue({ items: [{ ride_id: 'ride_1', passenger_id: 'user_123', status: 'COMPLETED' }] }),
    };
    mockRestaurant = {
      ready: jest.fn().mockResolvedValue({ ok: true, status: 200, body: { status: 'healthy' } }),
      opsSummary: jest.fn().mockResolvedValue({ counts: {} }),
      opsDatasetStatus: jest.fn().mockResolvedValue({ status: 'healthy' }),
      opsTransactions: jest.fn().mockResolvedValue({ items: [{ booking_id: 'book_1', actorId: 'user_123', status: 'CONFIRMED' }] }),
    };
    mockHealthcare = {
      ready: jest.fn().mockResolvedValue({ ok: true, status: 200, body: { status: 'healthy' } }),
      opsSummary: jest.fn().mockResolvedValue({ counts: {} }),
      opsDatasetStatus: jest.fn().mockResolvedValue({ status: 'healthy' }),
      opsTransactions: jest.fn().mockResolvedValue({ items: [{ appointment_id: 'app_1', userId: 'user_123', status: 'BOOKED' }] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: AgentClient, useValue: mockAgent },
        { provide: FoodClient, useValue: mockFood },
        { provide: RideClient, useValue: mockRide },
        { provide: RestaurantClient, useValue: mockRestaurant },
        { provide: HealthcareClient, useValue: mockHealthcare },
        { provide: AuthService, useValue: { listUsers: jest.fn().mockResolvedValue({ items: [], total: 0 }) } },
        { provide: CoreStore, useValue: coreStore },
        { provide: CoreProductOpsStore, useValue: productOps },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def?: unknown) => {
              if (key === 'JWT_SECRET') return masterSecret;
              return def;
            },
            getOrThrow: (key: string) => {
              if (key === 'JWT_SECRET') return masterSecret;
              throw new Error(`Missing config: ${key}`);
            },
          },
        },
        { provide: WorkflowService, useValue: { isWorkerHealthy: () => true } },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  describe('systemHealth', () => {
    it('should report healthy status for all targets when probes return 200', async () => {
      const result = await service.systemHealth('corr_1');
      expect(result.items).toHaveLength(7);
      const gw = result.items.find((i) => i.service === 'api-gateway');
      expect(gw?.status).toBe('healthy');
      expect(gw?.detail?.workflow_worker).toBe('healthy');
      expect(gw?.detail?.confirmation_recovery_worker).toBe('healthy');

      const agent = result.items.find((i) => i.service === 'agent-service');
      expect(agent?.status).toBe('healthy');
    });

    it('should classify HTTP 503 response as degraded with error SERVICE_DEGRADED', async () => {
      mockFood.ready = jest.fn().mockResolvedValue({ ok: false, status: 503, body: { database: 'disconnected' } });
      const result = await service.systemHealth('corr_2');
      const food = result.items.find((i) => i.service === 'food-service');
      expect(food?.status).toBe('degraded');
      expect(food?.error).toBe('SERVICE_DEGRADED');
    });

    it('should classify HTTP 500 or network timeout as unavailable', async () => {
      mockRide.ready = jest.fn().mockResolvedValue({ ok: false, status: 500, body: { error: 'Internal server error' } });
      mockHealthcare.ready = jest.fn().mockRejectedValue(new Error('ETIMEDOUT'));

      const result = await service.systemHealth('corr_3');
      const ride = result.items.find((i) => i.service === 'ride-service');
      expect(ride?.status).toBe('unavailable');
      expect(ride?.error).toBe('HTTP_500');

      const health = result.items.find((i) => i.service === 'healthcare-service');
      expect(health?.status).toBe('unavailable');
      expect(health?.error).toBe('ETIMEDOUT');
    });
  });

  describe('userServiceSummary', () => {
    it('should accurately aggregate user transactions across domains instead of feedback counts', async () => {
      const summary = await service.userServiceSummary('user_123', 'corr_user');
      expect(summary.user_id).toBe('user_123');
      expect(summary.food_count).toBe(1);
      expect(summary.ride_count).toBe(1);
      expect(summary.restaurant_count).toBe(1);
      expect(summary.healthcare_count).toBe(1);
      expect(summary.feedback_count).toBe(0);
    });
  });

  describe('summary response contract', () => {
    it('returns the nested shape consumed by the Admin Web', async () => {
      const result = await service.summary('corr_summary');

      expect(result.counts).toEqual(expect.objectContaining({
        total_users: 0,
        payments: 0,
        refunds: 0,
        open_support_tickets: 0,
        failed_workflows: 0,
        partial_success_workflows: 0,
      }));
      expect(result.health).toEqual({ items: expect.any(Array) });
      expect(result.payments).toEqual({ total: 0 });
      expect(result.refunds).toEqual({ total: 0 });
      expect(result.workflows).toEqual({ total: 0, by_status: {} });
      expect(result.support).toEqual({ open: 0 });
    });
  });

  describe('feedback response contract', () => {
    it('returns the snake_case shape consumed by the Admin Web', async () => {
      const result = await service.allFeedback();
      expect(result.stats).toEqual({ average_rating: 0, by_domain: {} });
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(20);
    });
  });

  describe('API Key Management & Encryption', () => {
    it('should encrypt secret at rest and store last4 mask', async () => {
      const rawSecret = 'AIzaSyD-Secret1234567890';
      const created = await service.createApiKey(
        { provider: 'gemini', label: 'Primary Gemini', key: rawSecret },
        'admin_1',
        'corr_key',
      );
      expect(created.last4).toBe('...7890');
      expect(created.id).toBeDefined();

      const record = await coreStore.getApiKeyRecord(String(created.id));
      expect(record?.keyCiphertext).toBeDefined();
      expect(record?.keyIv).toBeDefined();
      expect(record?.keyAuthTag).toBeDefined();

      // Test decrypt
      const decrypted = decryptSecret(record!.keyCiphertext!, record!.keyIv!, record!.keyAuthTag!, masterSecret);
      expect(decrypted).toBe(rawSecret);
    });

    it('should support idempotent rotate and return cached response on replay', async () => {
      const created = await service.createApiKey(
        { provider: 'gemini', label: 'Rotate Key', key: 'key-initial-1234' },
        'admin_1',
        'corr_key',
      );

      const idempotencyKey = 'idem_rotate_1';
      const firstRotate = await service.rotateApiKey(
        String(created.id),
        { key: 'key-rotated-9999' },
        'admin_1',
        'corr_rot',
        idempotencyKey,
      );
      expect(firstRotate?.last4).toBe('...9999');

      // Replay with identical key and payload
      const replayRotate = await service.rotateApiKey(
        String(created.id),
        { key: 'key-rotated-9999' },
        'admin_1',
        'corr_rot',
        idempotencyKey,
      );
      expect(replayRotate?.last4).toBe('...9999');

      // Replay with same key but different payload should throw ConflictException
      await expect(
        service.rotateApiKey(
          String(created.id),
          { key: 'different-payload-8888' },
          'admin_1',
          'corr_rot',
          idempotencyKey,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should support idempotent revoke and return cached response on replay', async () => {
      const created = await service.createApiKey(
        { provider: 'trello', label: 'Revoke Key', key: 'trello-secret-1111' },
        'admin_1',
        'corr_key',
      );

      const idempotencyKey = 'idem_revoke_1';
      const firstRevoke = await service.revokeApiKey(String(created.id), 'admin_1', 'corr_rev', idempotencyKey);
      expect(firstRevoke?.status).toBe('disabled');

      // Replay
      const replayRevoke = await service.revokeApiKey(String(created.id), 'admin_1', 'corr_rev', idempotencyKey);
      expect(replayRevoke?.status).toBe('disabled');
    });
  });
});
