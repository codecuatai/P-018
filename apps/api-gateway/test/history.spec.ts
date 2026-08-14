import { HistoryService } from '../src/modules/history/history.module';

describe('active history', () => {
  it('returns only non-terminal resources with renderable summaries', async () => {
    const food = { listOrders: jest.fn().mockResolvedValue({ items: [
      { id: 'food-active', status: 'DELIVERING', restaurant_name: 'Quán Phở', items: [{ name: 'Phở bò' }], total: { amount: 65000, currency: 'VND' }, updated_at: '2099-01-02T10:00:00Z' },
      { id: 'food-done', status: 'DELIVERED', updated_at: '2099-01-01T10:00:00Z' },
    ] }) };
    const ride = { listBookings: jest.fn().mockResolvedValue({ items: [
      { id: 'ride-active', status: 'DRIVER_ASSIGNED', pickup_address: 'VinUni', dropoff_address: 'Hồ Gươm', vehicle_type: 'CAR_4', fare: 52000, updated_at: '2099-01-03T10:00:00Z' },
      { id: 'ride-done', status: 'COMPLETED', updated_at: '2099-01-01T09:00:00Z' },
    ] }) };
    const restaurant = { listReservations: jest.fn().mockResolvedValue({ items: [
      { id: 'reservation-active', status: 'CONFIRMED', restaurant_name: 'Maison Hanoi', booking_time: '2099-01-04T19:00:00+07:00', party_size: 2 },
      { id: 'reservation-done', status: 'CANCELLED', restaurant_name: 'Old Place' },
    ] }) };
    const healthcare = { listAppointments: jest.fn().mockResolvedValue({ items: [
      { appointment_id: 51, status: 'CONFIRMED', facility: { name: 'Bạch Mai' }, doctor_name: 'Bác sĩ A', department: 'Thần kinh', start_time: '2099-01-05T09:00:00+07:00' },
      { appointment_id: 52, status: 'COMPLETED', facility: { name: 'Old Clinic' } },
    ] }) };
    const service = new HistoryService(food as never, ride as never, restaurant as never, healthcare as never, {} as never);

    const result = await service.active('actor-1', 'cor-history');

    expect(result.partial).toBe(false);
    expect(result.items.map((item) => item.id)).toEqual(['51', 'reservation-active', 'ride-active', 'food-active']);
    expect(result.items.find((item) => item.id === 'ride-active')).toMatchObject({ title: 'Chuyến xe VinUni → Hồ Gươm', detail: expect.stringContaining('52,000 VND') });
    expect(result.items.find((item) => item.id === 'food-active')).toMatchObject({ title: 'Đơn tại Quán Phở', detail: expect.stringContaining('Phở bò') });
    expect(result.items.find((item) => item.id === 'reservation-active')).toMatchObject({ detail: expect.stringContaining('2 người') });
    expect(result.items.find((item) => item.id === '51')).toMatchObject({ title: 'Lịch khám tại Bạch Mai', detail: expect.stringContaining('Bác sĩ A') });
  });

  it('reports partial availability without failing the active rail', async () => {
    const food = { listOrders: jest.fn().mockRejectedValue(new Error('food unavailable')) };
    const ride = { listBookings: jest.fn().mockResolvedValue({ items: [] }) };
    const restaurant = { listReservations: jest.fn().mockResolvedValue({ items: [] }) };
    const healthcare = { listAppointments: jest.fn().mockResolvedValue({ items: [] }) };
    const service = new HistoryService(food as never, ride as never, restaurant as never, healthcare as never, {} as never);

    await expect(service.active('actor-1', 'cor-history')).resolves.toMatchObject({ partial: true, unavailable: ['food_order'], items: [] });
  });
});
