import { HistoryService, isHistoryResourceActive } from '../src/modules/history/history.module';

describe('history active semantics', () => {
  const now = new Date('2026-08-15T05:00:00.000Z');

  it('keeps future confirmed restaurant reservations active', () => {
    expect(isHistoryResourceActive('restaurant_reservation', { status: 'CONFIRMED', booking_time: '2026-08-15T13:00:00' }, now)).toBe(true);
  });

  it('removes past confirmed, held, and booked restaurant reservations', () => {
    for (const status of ['CONFIRMED', 'HELD', 'BOOKED']) {
      expect(isHistoryResourceActive('restaurant_reservation', { status, start_at: '2026-08-15T11:00:00+07:00' }, now)).toBe(false);
    }
  });

  it('removes cancelled future reservations and malformed scheduled resources', () => {
    expect(isHistoryResourceActive('restaurant_reservation', { status: 'CANCELLED', booking_time: '2099-01-01T19:00:00+07:00' }, now)).toBe(false);
    expect(isHistoryResourceActive('restaurant_reservation', { status: 'CONFIRMED', booking_time: 'not-a-date' }, now)).toBe(false);
  });

  it('applies the same conservative rule to healthcare appointments', () => {
    expect(isHistoryResourceActive('healthcare_appointment', { status: 'CONFIRMED', start_time: '2026-08-15T11:00:00+07:00' }, now)).toBe(false);
    expect(isHistoryResourceActive('healthcare_appointment', { status: 'CONFIRMED', slot: { start_time: '2026-08-15T13:00:00+07:00' } }, now)).toBe(true);
    expect(isHistoryResourceActive('healthcare_appointment', { status: 'PENDING_REFUND', start_time: '2099-08-15T11:00:00+07:00' }, now)).toBe(false);
    expect(isHistoryResourceActive('healthcare_appointment', { status: 'REFUNDED', start_time: '2099-08-15T11:00:00+07:00' }, now)).toBe(false);
  });
});

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

  it('projects nested Healthcare appointment data into display-ready fields', async () => {
    const healthcare = { getAppointment: jest.fn().mockResolvedValue({ appointment_id: 51, status: 'DRAFT', doctor: { name: 'Bác sĩ A', price: 120000 }, department: { name: 'Thần kinh' }, facility: { name: 'Bệnh viện A', address: '1 Test Street', latitude: 21, longitude: 105.8 }, slot: { start_time: '2099-01-05T09:00:00+07:00' } }) };
    const service = new HistoryService({} as never, {} as never, {} as never, healthcare as never, {} as never);

    await expect(service.get('healthcare_appointment', '51', 'actor-1', 'cor-history')).resolves.toMatchObject({
      facility_name: 'Bệnh viện A',
      address: '1 Test Street',
      doctor_name: 'Bác sĩ A',
      department_name: 'Thần kinh',
      start_time: '2099-01-05T09:00:00+07:00',
      price: 120000,
      facility: { name: 'Bệnh viện A', location: { latitude: 21, longitude: 105.8 } },
    });
  });

  it('keeps restaurant snapshots available to the active-service detail', async () => {
    const restaurant = { getReservation: jest.fn().mockResolvedValue({
      id: 'reservation-1', status: 'CONFIRMED', restaurant_name: 'Nhà hàng A', party_size: 2,
      start_at: '2099-01-05T19:00:00+07:00', address: '1 Phố A, Hà Nội',
      restaurant: { name: 'Nhà hàng A', address: '1 Phố A, Hà Nội', cuisine: 'Vietnamese', latitude: 21.03, longitude: 105.84 },
    }) };
    const service = new HistoryService({} as never, {} as never, restaurant as never, {} as never, {} as never);

    await expect(service.get('restaurant_reservation', 'reservation-1', 'actor-1', 'cor-history')).resolves.toMatchObject({
      restaurant_name: 'Nhà hàng A',
      address: '1 Phố A, Hà Nội',
      restaurant: { name: 'Nhà hàng A', address: '1 Phố A, Hà Nội', location: { latitude: 21.03, longitude: 105.84 } },
    });
  });
});
