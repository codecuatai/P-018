import { RideBooking, RideQuote } from '../src/clients/service.clients';
import { RideActionsController } from '../src/modules/services/ride-actions.controller';

describe('Ride action gateway cancellation', () => {
  const booking = {
    id: 'booking-cancel-1',
    quote_id: 'quote-cancel-1',
    quote_version: 'quote:v1',
    passenger_count: 4,
    capacity_policy_version: 'ride-capacity-v1',
    amount: 52_000,
    currency: 'VND',
    status: 'DRIVER_ASSIGNED',
    resource_version: 7,
    payment_reference: null,
    driver: null,
    created_at: '2099-01-01T10:00:00.000Z',
    updated_at: '2099-01-01T10:00:00.000Z',
  } as RideBooking;
  const quote = {
    id: 'quote-cancel-1',
    status: 'CONSUMED',
    pickup_address: 'VinUni',
    dropoff_address: 'Hồ Gươm',
    vehicle_type: 'CAR_4',
    passenger_count: 4,
    capacity_policy_version: 'ride-capacity-v1',
    distance_km: 16,
    duration_minutes: 18,
    amount: 52_000,
    currency: 'VND',
    tariff_version: 'tariff:v1',
    quote_version: 'quote:v1',
    expires_at: '2099-01-01T11:00:00.000Z',
  } as RideQuote;

  it('creates actor/resource-bound confirmation evidence and forwards idempotency', async () => {
    const ride = {
      getBooking: jest.fn().mockResolvedValue(booking),
      getQuote: jest.fn().mockResolvedValue(quote),
      cancelBooking: jest.fn().mockResolvedValue({ ...booking, status: 'CANCELLED', resource_version: 8 }),
    };
    const controller = new RideActionsController(ride as never);

    const result = await controller.cancel('booking-cancel-1', 'cancel-key-1', {
      correlationId: 'cor-cancel-1',
      user: { sub: 'actor-cancel-1' },
    } as never);

    expect(ride.getBooking).toHaveBeenCalledWith('actor-cancel-1', expect.objectContaining({ correlationId: 'cor-cancel-1' }), 'booking-cancel-1');
    expect(ride.getQuote).toHaveBeenCalledWith('actor-cancel-1', expect.objectContaining({ correlationId: 'cor-cancel-1' }), 'quote-cancel-1');
    const call = ride.cancelBooking.mock.calls[0];
    expect(call.slice(0, 4)).toEqual([
      'actor-cancel-1',
      'cancel-key-1',
      expect.objectContaining({ correlationId: 'cor-cancel-1' }),
      'booking-cancel-1',
    ]);
    const body = JSON.parse(call[4]);
    expect(body.confirmation).toMatchObject({
      actor_id: 'actor-cancel-1',
      action: 'ride.booking.cancel',
      quote_version: 'quote:v1',
      amount: 52_000,
      currency: 'VND',
    });
    expect(body.confirmation.payload_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result).toEqual({ data: expect.objectContaining({ status: 'CANCELLED' }), meta: { request_id: 'cor-cancel-1' } });
  });

  it('rejects cancellation without an idempotency key before reading the booking', async () => {
    const ride = { getBooking: jest.fn(), getQuote: jest.fn(), cancelBooking: jest.fn() };
    const controller = new RideActionsController(ride as never);

    await expect(controller.cancel('booking-cancel-1', undefined, { user: { sub: 'actor-cancel-1' } } as never)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REQUIRED' }),
    });
    expect(ride.getBooking).not.toHaveBeenCalled();
  });

  describe('Ride status updates', () => {
    it('rejects status updates from standard user role', async () => {
      const ride = { updateBookingStatus: jest.fn() };
      const controller = new RideActionsController(ride as never);

      await expect(controller.updateStatus('booking-1', { status: 'COMPLETED' }, 'key-1', {
        user: { sub: 'user-1', role: 'user' },
      } as never)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PROVIDER_ROLE_REQUIRED' }),
      });
      expect(ride.updateBookingStatus).not.toHaveBeenCalled();
    });

    it('allows status updates from provider role', async () => {
      const ride = { updateBookingStatus: jest.fn().mockResolvedValue({ id: 'booking-1', status: 'COMPLETED' }) };
      const controller = new RideActionsController(ride as never);

      const res = await controller.updateStatus('booking-1', { status: 'COMPLETED' }, 'key-1', {
        user: { sub: 'driver-1', role: 'provider' },
        correlationId: 'cor-1',
      } as never);
      expect((res as any).data.status).toBe('COMPLETED');
    });
  });
});

