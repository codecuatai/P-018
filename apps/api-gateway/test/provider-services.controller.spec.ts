import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { FoodClient, HealthcareClient, RestaurantClient, RideClient } from '../src/clients/service.clients';
import { AuthGuard } from '../src/modules/auth/auth.guard';
import { AuthService } from '../src/modules/auth/auth.service';
import { ProviderServicesController } from '../src/modules/services/provider-services.controller';
import { InMemoryProviderOfferingsRepository, ProviderOfferingsStore } from '../src/modules/services/provider-offerings.store';

describe('ProviderServicesController (Multi-Tenant Isolation)', () => {
  let controller: ProviderServicesController;

  const providerUserA = {
    sub: 'a0000000-0000-4000-8000-000000000003',
    id: 'a0000000-0000-4000-8000-000000000003',
    email: 'providerA@xone.local',
    full_name: 'Provider Partner A',
    role: 'provider',
  };

  const providerUserB = {
    sub: 'b0000000-0000-4000-8000-000000000099',
    id: 'b0000000-0000-4000-8000-000000000099',
    email: 'providerB@xone.local',
    full_name: 'Provider Partner B',
    role: 'provider',
  };

  const customerUser = {
    sub: 'c0000000-0000-4000-8000-000000000004',
    id: 'c0000000-0000-4000-8000-000000000004',
    email: 'customer@xone.local',
    full_name: 'Standard Customer',
    role: 'user',
  };

  const createReq = (user: any, correlationId = 'corr_test_1') =>
    ({
      user,
      correlationId,
      headers: { 'x-correlation-id': correlationId },
    } as any);

  beforeEach(async () => {
    const mockStore = {
      repository: new InMemoryProviderOfferingsRepository(),
      getProfile(userId: string) {
        return this.repository.getProfile(userId);
      },
      upsertProfile(userId: string, patch: any) {
        return this.repository.upsertProfile(userId, patch);
      },
      listItems(userId: string, domain?: string) {
        return this.repository.listItems(userId, domain);
      },
      createItem(item: any) {
        return this.repository.createItem(item);
      },
      toggleItem(userId: string, itemId: string, isAvailable: boolean) {
        return this.repository.toggleItem(userId, itemId, isAvailable);
      },
      deleteItem(userId: string, itemId: string) {
        return this.repository.deleteItem(userId, itemId);
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProviderServicesController],
      providers: [
        { provide: ProviderOfferingsStore, useValue: mockStore },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-value'), getOrThrow: jest.fn().mockReturnValue('test-value') } },
        { provide: AuthService, useValue: { authenticateAccessToken: jest.fn() } },
        {
          provide: RideClient,
          useValue: {
            opsTransactions: jest.fn().mockResolvedValue({ items: [{ id: 'ride_1', status: 'IN_PROGRESS' }] }),
            updateBookingStatus: jest.fn().mockResolvedValue({ id: 'ride_1', status: 'COMPLETED' }),
            createQuote: jest.fn().mockResolvedValue({ id: 'q_1', quote_version: 'qv_1', amount: 50000, currency: 'VND', passenger_count: 2, capacity_policy_version: 'v1' }),
            prepareBooking: jest.fn().mockResolvedValue({ id: 'bk_1', status: 'DRIVER_ASSIGNED' }),
          },
        },
        {
          provide: FoodClient,
          useValue: {
            opsTransactions: jest.fn().mockResolvedValue({ items: [{ id: 'order_1', status: 'PREPARING' }] }),
            updateOrderStatus: jest.fn().mockResolvedValue({ id: 'order_1', status: 'READY_FOR_PICKUP' }),
          },
        },
        {
          provide: HealthcareClient,
          useValue: {
            opsTransactions: jest.fn().mockResolvedValue({ items: [{ id: 1, status: 'CONFIRMED' }] }),
            confirmAppointment: jest.fn().mockResolvedValue({ id: 1, status: 'CONFIRMED' }),
            cancelAppointment: jest.fn().mockResolvedValue({ id: 1, status: 'CANCELLED' }),
          },
        },
        {
          provide: RestaurantClient,
          useValue: {
            opsTransactions: jest.fn().mockResolvedValue({ items: [] }),
          },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<ProviderServicesController>(ProviderServicesController);
  });

  describe('Role Enforcement', () => {
    it('denies access to non-provider roles with 403 Forbidden', async () => {
      const req = createReq(customerUser);
      await expect(controller.getProfile(req)).rejects.toThrow(ForbiddenException);
      await expect(controller.listItems(undefined, req)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Profile & Webhook Management', () => {
    it('creates and updates provider profile with webhook URL', async () => {
      const req = createReq(providerUserA);

      // Fetch initial profile
      const initial = (await controller.getProfile(req)) as any;
      expect(initial.data.userId).toBe(providerUserA.sub);
      expect(initial.data.businessName).toBe('Provider Partner A');

      // Update profile with custom Webhook URL
      const updated = (await controller.updateProfile(
        {
          business_name: 'Bếp Cơm Niêu Sài Gòn',
          phone: '0912345678',
          address: '123 Nguyen Hue',
          webhook_url: 'https://api.bepcomnieu.com/v1/webhook',
          is_open: true,
        },
        req,
      )) as any;

      expect(updated.data.businessName).toBe('Bếp Cơm Niêu Sài Gòn');
      expect(updated.data.webhookUrl).toBe('https://api.bepcomnieu.com/v1/webhook');
    });
  });

  describe('Multi-Tenant Item Isolation', () => {
    let itemAId: string;
    let itemBId: string;

    beforeEach(async () => {
      // Provider A creates an item
      const resA = (await controller.createItem(
        {
          domain: 'food',
          name: 'Cơm Niêu Cá Kho Tộ',
          price: 85000,
          category: 'Món đặc biệt',
        },
        createReq(providerUserA),
      )) as any;
      itemAId = resA.data.id;

      // Provider B creates an item
      const resB = (await controller.createItem(
        {
          domain: 'food',
          name: 'Bún Chả Hà Nội',
          price: 65000,
          category: 'Món chính',
        },
        createReq(providerUserB),
      )) as any;
      itemBId = resB.data.id;
    });

    it('ensures Provider A can only list Provider A items', async () => {
      const listA = (await controller.listItems(undefined, createReq(providerUserA))) as any;
      expect(listA.data.items).toHaveLength(1);
      expect(listA.data.items[0].name).toBe('Cơm Niêu Cá Kho Tộ');

      const listB = (await controller.listItems(undefined, createReq(providerUserB))) as any;
      expect(listB.data.items).toHaveLength(1);
      expect(listB.data.items[0].name).toBe('Bún Chả Hà Nội');
    });

    it('prevents Provider A from toggling status of Provider B item', async () => {
      await expect(
        controller.toggleItemStatus(itemBId, { is_available: false }, createReq(providerUserA)),
      ).rejects.toThrow(NotFoundException);
    });

    it('prevents Provider A from deleting Provider B item', async () => {
      await expect(
        controller.deleteItem(itemBId, createReq(providerUserA)),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows Provider A to toggle and delete Provider A item', async () => {
      const reqA = createReq(providerUserA);

      const toggled = (await controller.toggleItemStatus(itemAId, { is_available: false }, reqA)) as any;
      expect(toggled.data.isAvailable).toBe(false);

      const deleted = (await controller.deleteItem(itemAId, reqA)) as any;
      expect(deleted.data.deleted).toBe(true);

      const listA = (await controller.listItems(undefined, reqA)) as any;
      expect(listA.data.items).toHaveLength(0);
    });
  });

  describe('Real Operations & Transitions', () => {
    it('retrieves operational rides from ride-service', async () => {
      const res = (await controller.getOperationalRides(createReq(providerUserA))) as any;
      expect(res.data.items).toHaveLength(1);
      expect(res.data.items[0].id).toBe('ride_1');
    });

    it('retrieves operational orders from food-service', async () => {
      const res = (await controller.getOperationalOrders(createReq(providerUserA))) as any;
      expect(res.data.items).toHaveLength(1);
      expect(res.data.items[0].id).toBe('order_1');
    });

    it('retrieves operational appointments from healthcare-service', async () => {
      const res = (await controller.getOperationalAppointments(createReq(providerUserA))) as any;
      expect(res.data.items).toHaveLength(1);
      expect(res.data.items[0].id).toBe(1);
    });

    it('updates operational ride status', async () => {
      const res = (await controller.updateOperationalRideStatus('ride_1', { status: 'COMPLETED' }, undefined, createReq(providerUserA))) as any;
      expect(res.data.status).toBe('COMPLETED');
    });

    it('updates operational food order status', async () => {
      const res = (await controller.updateOperationalOrderStatus('order_1', { status: 'READY_FOR_PICKUP' }, undefined, createReq(providerUserA))) as any;
      expect(res.data.status).toBe('READY_FOR_PICKUP');
    });

    it('updates operational healthcare appointment status', async () => {
      const res = (await controller.updateOperationalAppointmentStatus('1', { status: 'CONFIRMED' }, undefined, createReq(providerUserA))) as any;
      expect(res.data.status).toBe('CONFIRMED');
    });

    it('seeds a sample operational ride booking', async () => {
      const res = (await controller.seedOperationalSample({ domain: 'ride' }, createReq(providerUserA))) as any;
      expect(res.data.id).toBe('bk_1');
      expect(res.data.status).toBe('DRIVER_ASSIGNED');
    });
  });
});
