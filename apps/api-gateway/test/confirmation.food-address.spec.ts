import { ConfirmationService } from '../src/modules/confirmation/confirmation.service';

describe('Food device-location confirmation', () => {
  it('uses reverse geocoding for a device coordinate before preparing the Food quote', async () => {
    const store = {
      createConfirmation: jest.fn().mockResolvedValue(undefined),
      audit: jest.fn().mockResolvedValue(undefined),
    };
    const food = {
      post: jest.fn().mockResolvedValue({
        total: { amount: 45_000, currency: 'VND' },
        snapshot_hash: 'snapshot',
        quote_version: 'quote-v1',
        cart_version: 2,
      }),
    };
    const locations = {
      reverseGeocode: jest.fn().mockResolvedValue({
        provider: 'geoapify',
        candidates: [{ address_text: '88 Ngõ 44 Trần Thái Tông, Cầu Giấy, Hà Nội', latitude: 20.9899, longitude: 105.79222 }],
      }),
    };
    const service = new ConfirmationService(
      store as never,
      food as never,
      {} as never,
      { get: jest.fn().mockReturnValue(600) } as never,
      {} as never,
      {} as never,
      locations as never,
    );

    await service.prepare(
      { sub: 'usr_food_location', email: 'test@example.invalid', role: 'customer' },
      {
        cart_id: 'cart_location',
        address_id: 'device_location',
        address_snapshot: {
          user_id: 'usr_food_location',
          address_text: 'Tọa độ 20.98990, 105.79222',
          latitude: 20.9899,
          longitude: 105.79222,
          source: 'device_current_location',
        },
      },
      'cor_food_location',
    );

    expect(locations.reverseGeocode).toHaveBeenCalledWith({ latitude: 20.9899, longitude: 105.79222 });
    expect(food.post).toHaveBeenCalledWith('/api/v1/orders/preview', expect.objectContaining({
      address_snapshot: expect.objectContaining({
        address_text: '88 Ngõ 44 Trần Thái Tông, Cầu Giấy, Hà Nội',
        provider: 'geoapify',
        source: 'device_reverse_geocoded',
      }),
    }), 'cor_food_location', undefined, 'usr_food_location');
  });

  it('keeps the coordinate text when no reverse-geocoding provider returns an address', async () => {
    const store = {
      createConfirmation: jest.fn().mockResolvedValue(undefined),
      audit: jest.fn().mockResolvedValue(undefined),
    };
    const food = {
      post: jest.fn().mockResolvedValue({
        total: { amount: 45_000, currency: 'VND' },
        snapshot_hash: 'snapshot',
        quote_version: 'quote-v1',
        cart_version: 2,
      }),
    };
    const locations = {
      reverseGeocode: jest.fn().mockResolvedValue({ provider: 'manual-reverse-geocoding', candidates: [] }),
    };
    const service = new ConfirmationService(
      store as never,
      food as never,
      {} as never,
      { get: jest.fn().mockReturnValue(600) } as never,
      {} as never,
      {} as never,
      locations as never,
    );

    await service.prepare(
      { sub: 'usr_food_location', email: 'test@example.invalid', role: 'customer' },
      {
        cart_id: 'cart_location',
        address_id: 'device_location',
        address_snapshot: {
          user_id: 'usr_food_location',
          address_text: 'Tọa độ 20.98990, 105.79222',
          latitude: 20.9899,
          longitude: 105.79222,
          source: 'device_current_location',
        },
      },
      'cor_food_location',
    );

    expect(food.post).toHaveBeenCalledWith('/api/v1/orders/preview', expect.objectContaining({
      address_snapshot: expect.objectContaining({
        address_text: 'Tọa độ 20.98990, 105.79222',
        source: 'device_current_location',
      }),
    }), 'cor_food_location', undefined, 'usr_food_location');
  });
});
