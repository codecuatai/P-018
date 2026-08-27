import { ConfirmationService } from '../src/modules/confirmation/confirmation.service';

describe('Restaurant confirmation presentation', () => {
  it('returns restaurant details and booking constraints for the confirmation UI', async () => {
    const store = {
      createConfirmation: jest.fn().mockResolvedValue(undefined),
      audit: jest.fn().mockResolvedValue(undefined),
    };
    const restaurant = {
      getRestaurant: jest.fn().mockResolvedValue({ id: 'rest-yutang', name: 'Yu Tang', location: 'Hoàn Kiếm, Hà Nội' }),
    };
    const config = { get: jest.fn().mockReturnValue(600) };
    const service = new ConfirmationService(
      store as never,
      {} as never,
      {} as never,
      config as never,
      restaurant as never,
      {} as never,
    );

    const result = await service.prepareDomainConfirmation(
      { sub: 'actor-1', email: 'actor@example.invalid', role: 'customer' },
      {
        tool_name: 'restaurant.create_reservation',
        risk_level: 'FINANCIAL_OR_FINAL',
        arguments: {
          restaurant_id: 'rest-yutang',
          hold_id: 'hold-1',
          party_size: 2,
          start_at: '2099-01-01T14:00:00.000Z',
          duration_minutes: 120,
          special_requests: 'Bàn gần cửa sổ',
        },
        workflow_id: 'workflow-1',
        tool_call_id: 'tool-1',
        schema_version: '2',
        idempotency_key: 'reservation-1',
      },
      undefined,
      'correlation-1',
    );

    expect(restaurant.getRestaurant).toHaveBeenCalledWith('rest-yutang', 'actor-1', 'correlation-1');
    expect(result).toEqual(expect.objectContaining({
      title: 'Xác nhận đặt bàn tại Yu Tang',
      detail: expect.stringContaining('21:00'),
      preview: expect.objectContaining({
        restaurant_name: 'Yu Tang',
        party_size: 2,
        duration_minutes: 120,
        special_requests: 'Bàn gần cửa sổ',
        hold_id: 'hold-1',
        resource_version: 'hold-1',
      }),
    }));
  });
});
