import { FoodClient, HealthcareClient, RestaurantClient, RideClient } from '../src/clients/service.clients';
import { InMemoryProductOpsStore } from '../src/modules/core/product-ops.store';
import { ProductOpsService } from '../src/modules/product-ops/product-ops.service';

function makeService() {
  const store = new InMemoryProductOpsStore();
  const food = { listOrders: jest.fn().mockResolvedValue({ items: [] }), getOrder: jest.fn() } as unknown as FoodClient;
  const ride = { listBookings: jest.fn().mockResolvedValue({ items: [] }), getBooking: jest.fn() } as unknown as RideClient;
  const restaurant = { listReservations: jest.fn().mockResolvedValue({ items: [] }), getRestaurant: jest.fn(), getReservation: jest.fn() } as unknown as RestaurantClient;
  const healthcare = { listAppointments: jest.fn().mockResolvedValue({ items: [] }), getFacility: jest.fn(), getAppointment: jest.fn() } as unknown as HealthcareClient;
  return { service: new ProductOpsService(store as never, food, ride, restaurant, healthcare), store, food, ride, restaurant, healthcare };
}

describe('ProductOpsService', () => {
  it('reads paginated notification projections without synchronizing domains', async () => {
    const { service, store, ride } = makeService();
    await store.upsertNotification({ id: 'notification-1', actorId: 'actor-1', eventKey: 'ride-1', type: 'RIDE_DRIVER_ASSIGNED', title: 'Tài xế đã nhận chuyến', body: 'Đang đến.', status: 'UNREAD', createdAt: '2026-08-30T00:00:00.000Z' });
    await store.upsertNotification({ id: 'notification-2', actorId: 'actor-1', eventKey: 'ride-2', type: 'RIDE_DRIVER_ASSIGNED', title: 'Tài xế khác', body: 'Đang đến.', status: 'UNREAD', createdAt: '2026-08-30T00:01:00.000Z' });

    const first = await service.listNotifications('actor-1', { page: 1, pageSize: 1 });
    const second = await service.listNotifications('actor-1', { page: 2, pageSize: 1 });

    expect(first).toMatchObject({ unread_count: 2, total: 2, page: 1, page_size: 1, has_more: true, partial: false, unavailable: [] });
    expect(second).toMatchObject({ unread_count: 2, total: 2, page: 2, page_size: 1, has_more: false });
    expect(first.items[0]?.id).not.toBe(second.items[0]?.id);
    expect(ride.listBookings).not.toHaveBeenCalled();
  });

  it('validates a favorite against the authoritative healthcare service and deduplicates it', async () => {
    const { service, store, healthcare } = makeService();
    (healthcare.getFacility as jest.Mock).mockResolvedValue({ source_id: 'facility-1', name: 'Clinic' });

    const first = await service.createFavorite('actor-1', 'healthcare', 'facility-1', 'cor-1');
    const second = await service.createFavorite('actor-1', 'healthcare', 'facility-1', 'cor-2');

    expect(second.id).toBe(first.id);
    expect(await store.listFavorites('actor-1')).toHaveLength(1);
    expect(healthcare.getFacility).toHaveBeenCalledTimes(2);
  });

  it('requires a completed authoritative resource before accepting feedback', async () => {
    const { service, ride, restaurant, healthcare } = makeService();
    (ride.getBooking as jest.Mock).mockResolvedValue({ id: 'ride-1', actor_id: 'actor-1', status: 'IN_PROGRESS' });

    await expect(service.createFeedback('actor-1', 'cor-1', { domain: 'ride', resourceType: 'ride_booking', resourceId: 'ride-1', rating: 5 })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'RESOURCE_NOT_COMPLETED' }) });

    (ride.getBooking as jest.Mock).mockResolvedValue({ id: 'ride-1', actor_id: 'actor-1', status: 'COMPLETED' });
    await expect(service.createFeedback('actor-1', 'cor-2', { domain: 'ride', resourceType: 'ride_booking', resourceId: 'ride-1', rating: 5 })).resolves.toMatchObject({ resourceId: 'ride-1', rating: 5 });

    // Restaurant: CONFIRMED or future SEATED should be rejected
    (restaurant.getReservation as jest.Mock).mockResolvedValue({ id: 'res-1', actor_id: 'actor-1', status: 'CONFIRMED', start_at: '2099-01-01T19:00:00Z' });
    await expect(service.createFeedback('actor-1', 'cor-3', { domain: 'restaurant', resourceType: 'restaurant_reservation', resourceId: 'res-1', rating: 5 })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'RESOURCE_NOT_COMPLETED' }) });

    // Healthcare: PAYMENT_CONFIRMED or CONFIRMED in future should be rejected
    (healthcare.getAppointment as jest.Mock).mockResolvedValue({ appointment_id: 101, actor_id: 'actor-1', status: 'PAYMENT_CONFIRMED', start_time: '2099-01-01T09:00:00Z' });
    await expect(service.createFeedback('actor-1', 'cor-4', { domain: 'healthcare', resourceType: 'healthcare_appointment', resourceId: '101', rating: 5 })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'RESOURCE_NOT_COMPLETED' }) });
  });

  it('returns the same support ticket for a retried idempotency key', async () => {
    const { service, store } = makeService();
    const input = { subject: 'Cần hỗ trợ', description: 'Kiểm tra đơn hàng', priority: 'HIGH' as const };

    const first = await service.createSupportTicket('actor-1', 'cor-1', 'support-key-1', input);
    const replay = await service.createSupportTicket('actor-1', 'cor-2', 'support-key-1', input);

    expect(replay.id).toBe(first.id);
    expect((await store.listSupportTickets('actor-1')).items).toHaveLength(1);
    expect((await store.getSupportTicket(first.id))?.events).toHaveLength(1);
  });
});
