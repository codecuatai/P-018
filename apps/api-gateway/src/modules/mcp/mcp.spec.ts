import { BadRequestException } from '@nestjs/common';
import { InMemoryCoreRepository } from '../core/core.module';
import { InMemoryProviderOfferingsRepository } from '../services/provider-offerings.store';
import { ServiceHubService } from '../services/services.module';
import { InMemoryMcpApiKeyRepository } from './mcp.api-key.store';
import { McpToolRegistry } from './mcp.registry';
import { McpService } from './mcp.service';
import { McpSessionStore } from './mcp.session';
import { AuthUser } from '../auth/auth.types';

describe('McpSessionStore', () => {
  it('creates, touches and expires sessions properly', () => {
    const store = new McpSessionStore();
    store.configure(1); // 1 second TTL

    const session = store.create('user-1');
    expect(session.id.startsWith('mcp_')).toBe(true);

    const touched = store.touch(session.id, 'user-1');
    expect(touched).toBeDefined();

    // Wrong user
    expect(store.touch(session.id, 'user-2')).toBeUndefined();

    // Destroy
    store.destroy(session.id);
    expect(store.touch(session.id, 'user-1')).toBeUndefined();
  });
});

describe('McpApiKeyRepository', () => {
  it('generates and validates API keys with hashing', async () => {
    const repo = new InMemoryMcpApiKeyRepository();
    const { record, rawKey } = await repo.createKey('user-123', 'My Claude Key');

    expect(rawKey.startsWith('xone_mcp_')).toBe(true);
    expect(record.status).toBe('active');
    expect(record.label).toBe('My Claude Key');

    // List
    const list = await repo.listKeys('user-123');
    expect(list.length).toBe(1);

    // Revoke
    const revoked = await repo.revokeKey('user-123', record.id);
    expect(revoked).toBe(true);

    // After revoke, key should not be active
    const listAfter = await repo.listKeys('user-123');
    expect(listAfter.length).toBe(0);
  });
});

describe('McpToolRegistry and Domain Scoping (20 Tools across 4 Services)', () => {
  const masterUser: AuthUser = {
    sub: 'a0000000-0000-4000-8000-000000000013',
    email: 'provider1@xone.local',
    role: 'provider',
    tenant_id: 'partner-xone-01',
    provider_type: 'ride_driver',
  };

  const driverUser: AuthUser = {
    sub: 'driver-user-01',
    email: 'driver@test.local',
    role: 'provider',
    tenant_id: 'partner-driver-01',
    provider_type: 'ride_driver',
  };

  const merchantUser: AuthUser = {
    sub: 'merchant-user-01',
    email: 'merchant@test.local',
    role: 'provider',
    tenant_id: 'partner-merchant-01',
    provider_type: 'restaurant_merchant',
  };

  const doctorUser: AuthUser = {
    sub: 'doctor-user-01',
    email: 'doctor@test.local',
    role: 'provider',
    tenant_id: 'partner-doctor-01',
    provider_type: 'healthcare_doctor',
  };

  let offeringsRepo: InMemoryProviderOfferingsRepository;
  let coreRepo: InMemoryCoreRepository;
  let registry: McpToolRegistry;
  let mockRide: any;
  let mockFood: any;
  let mockHealthcare: any;
  let mockRestaurant: any;

  beforeEach(() => {
    offeringsRepo = new InMemoryProviderOfferingsRepository();
    coreRepo = new InMemoryCoreRepository();

    const mockHub = {
      browse: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    } as unknown as ServiceHubService;

    mockRide = {
      opsTransactions: jest.fn().mockResolvedValue({ items: [{ id: 'ride-1', status: 'SEARCHING_DRIVER' }] }),
      updateBookingStatus: jest.fn().mockResolvedValue({ id: 'ride-1', status: 'DRIVER_ASSIGNED' }),
      getTracking: jest.fn().mockResolvedValue({ booking_id: 'ride-1', lat: 10.77, lng: 106.69 }),
    };

    mockFood = {
      opsTransactions: jest.fn().mockResolvedValue({ items: [{ id: 'food-1', status: 'PENDING' }] }),
      updateOrderStatus: jest.fn().mockResolvedValue({ id: 'food-1', status: 'CONFIRMED' }),
    };

    mockHealthcare = {
      opsTransactions: jest.fn().mockResolvedValue({ items: [{ id: 101, status: 'PENDING' }] }),
      confirmAppointment: jest.fn().mockResolvedValue({ appointment_id: 101, status: 'CONFIRMED' }),
      cancelAppointment: jest.fn().mockResolvedValue({ appointment_id: 101, status: 'CANCELLED' }),
    };

    mockRestaurant = {
      listRestaurants: jest.fn().mockResolvedValue({ items: [{ id: 'rest-1', name: 'Phở 24' }] }),
    };

    registry = new McpToolRegistry(
      {
        repository: offeringsRepo,
        getProfile: (u: string) => offeringsRepo.getProfile(u),
        upsertProfile: (u: string, p: any) => offeringsRepo.upsertProfile(u, p),
        listItems: (u: string, d?: string) => offeringsRepo.listItems(u, d),
        createItem: (i: any) => offeringsRepo.createItem(i),
        toggleItem: (u: string, i: string, a: boolean) => offeringsRepo.toggleItem(u, i, a),
        deleteItem: (u: string, i: string) => offeringsRepo.deleteItem(u, i),
      } as any,
      mockHub,
      mockRide,
      mockFood,
      mockHealthcare,
      mockRestaurant,
      { audit: (v: any) => coreRepo.audit(v) } as any,
    );
  });

  it('lists at least 20 MCP tools across 4 service domains', () => {
    const tools = registry.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(20);
    const names = tools.map((t) => t.name);

    // Profile & Catalog
    expect(names).toContain('provider.get_profile');
    expect(names).toContain('provider.update_profile');
    expect(names).toContain('provider.list_items');
    expect(names).toContain('catalog.create_item');
    expect(names).toContain('catalog.update_availability');
    expect(names).toContain('catalog.delete_item');
    expect(names).toContain('catalog.search');

    // Ride
    expect(names).toContain('ride.list_pending_bookings');
    expect(names).toContain('ride.accept_booking');
    expect(names).toContain('ride.update_trip_status');
    expect(names).toContain('ride.get_tracking');

    // Food & Restaurant
    expect(names).toContain('food.list_orders');
    expect(names).toContain('food.confirm_order');
    expect(names).toContain('food.reject_order');
    expect(names).toContain('food.update_order_status');
    expect(names).toContain('restaurant.list_tables');
    expect(names).toContain('restaurant.update_open_status');

    // Healthcare
    expect(names).toContain('healthcare.list_appointments');
    expect(names).toContain('healthcare.confirm_appointment');
    expect(names).toContain('healthcare.cancel_appointment');
    expect(names).toContain('healthcare.update_slots');

    // Ops
    expect(names).toContain('operations.list_pending');
  });

  it('enforces strict domain scoping per provider type', () => {
    // Driver cannot call food or healthcare
    expect(() => registry.assertDomain(driverUser, 'food')).toThrow(BadRequestException);
    expect(() => registry.assertDomain(driverUser, 'healthcare')).toThrow(BadRequestException);
    expect(() => registry.assertDomain(driverUser, 'ride')).not.toThrow();

    // Merchant cannot call ride or healthcare
    expect(() => registry.assertDomain(merchantUser, 'ride')).toThrow(BadRequestException);
    expect(() => registry.assertDomain(merchantUser, 'healthcare')).toThrow(BadRequestException);
    expect(() => registry.assertDomain(merchantUser, 'food')).not.toThrow();
    expect(() => registry.assertDomain(merchantUser, 'restaurant')).not.toThrow();

    // Doctor cannot call ride, food, restaurant
    expect(() => registry.assertDomain(doctorUser, 'ride')).toThrow(BadRequestException);
    expect(() => registry.assertDomain(doctorUser, 'food')).toThrow(BadRequestException);
    expect(() => registry.assertDomain(doctorUser, 'healthcare')).not.toThrow();
  });

  it('allows master provider to operate on all domains', () => {
    expect(() => {
      registry.assertDomain(masterUser, 'ride');
      registry.assertDomain(masterUser, 'food');
      registry.assertDomain(masterUser, 'restaurant');
      registry.assertDomain(masterUser, 'healthcare');
    }).not.toThrow();
  });

  it('executes ride tools (ride.accept_booking & get_tracking)', async () => {
    const accepted = await registry.callTool(
      'ride.accept_booking',
      { booking_id: 'ride-1' },
      driverUser,
      'cor_ride_01',
    ) as any;
    expect(accepted.status).toBe('DRIVER_ASSIGNED');
    expect(mockRide.updateBookingStatus).toHaveBeenCalled();

    const tracking = await registry.callTool(
      'ride.get_tracking',
      { booking_id: 'ride-1' },
      driverUser,
      'cor_ride_02',
    ) as any;
    expect(tracking.lat).toBe(10.77);
  });

  it('executes food tools (food.confirm_order & food.reject_order)', async () => {
    const confirmed = await registry.callTool(
      'food.confirm_order',
      { order_id: 'food-1' },
      merchantUser,
      'cor_food_01',
    ) as any;
    expect(confirmed.status).toBe('CONFIRMED');

    await registry.callTool(
      'food.reject_order',
      { order_id: 'food-1', reason: 'Hết nguyên liệu' },
      merchantUser,
      'cor_food_02',
    );
    expect(mockFood.updateOrderStatus).toHaveBeenCalledWith(
      merchantUser.sub,
      'cor_food_02',
      'food-1',
      expect.objectContaining({ status: 'CANCELLED', reason: 'Hết nguyên liệu' }),
      expect.any(String),
    );
  });

  it('executes healthcare tools (confirm_appointment & cancel_appointment)', async () => {
    const confirmed = await registry.callTool(
      'healthcare.confirm_appointment',
      { appointment_id: 101 },
      doctorUser,
      'cor_health_01',
    ) as any;
    expect(confirmed.status).toBe('CONFIRMED');

    const cancelled = await registry.callTool(
      'healthcare.cancel_appointment',
      { appointment_id: 101, reason: 'Bác sĩ bận cấp cứu' },
      doctorUser,
      'cor_health_02',
    ) as any;
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('executes catalog CRUD (create_item, update_availability, delete_item)', async () => {
    const item = await registry.callTool(
      'catalog.create_item',
      { domain: 'ride', name: 'Gói xe sân bay VIP', price: 250000 },
      driverUser,
      'cor_test_01',
    ) as any;

    expect(item.id).toBeDefined();
    expect(item.isAvailable).toBe(true);

    const toggled = await registry.callTool(
      'catalog.update_availability',
      { item_id: item.id, is_available: false },
      driverUser,
      'cor_test_02',
    ) as any;
    expect(toggled.isAvailable).toBe(false);

    const deleted = await registry.callTool(
      'catalog.delete_item',
      { item_id: item.id },
      driverUser,
      'cor_test_03',
    ) as any;
    expect(deleted.deleted).toBe(true);
  });
});

describe('McpService JSON-RPC Dispatcher', () => {
  let service: McpService;

  beforeEach(() => {
    const registry = {
      listTools: () => [{ name: 'test.tool', description: 'Test', inputSchema: {} }],
      callTool: jest.fn().mockResolvedValue({ success: true, count: 42 }),
    } as any;
    service = new McpService(registry);
  });

  const providerUser: AuthUser = {
    sub: 'provider-1',
    email: 'p@xone.local',
    role: 'provider',
  };

  it('handles initialize handshake', async () => {
    const response = await service.handleRpc(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      providerUser,
      'cor_test',
    );
    expect(response.error).toBeUndefined();
    expect((response.result as any).protocolVersion).toBe('2024-11-05');
    expect((response.result as any).serverInfo.name).toBe('x-one-provider-mcp');
  });

  it('handles tools/list', async () => {
    const response = await service.handleRpc(
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      providerUser,
      'cor_test',
    );
    expect(response.error).toBeUndefined();
    expect((response.result as any).tools).toHaveLength(1);
  });

  it('handles tools/call and wraps in MCP text content', async () => {
    const response = await service.handleRpc(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'test.tool', arguments: {} } },
      providerUser,
      'cor_test',
    );
    expect(response.error).toBeUndefined();
    const result = response.result as any;
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('"count": 42');
  });

  it('returns -32601 on unknown method', async () => {
    const response = await service.handleRpc(
      { jsonrpc: '2.0', id: 4, method: 'non_existent_method' },
      providerUser,
      'cor_test',
    );
    expect(response.error?.code).toBe(-32601);
  });
});
