import { readFileSync } from 'fs';
import { resolve } from 'path';

import { ServiceActionsController } from '../src/modules/services/service-actions.controller';

describe('ServiceActionsController write boundary', () => {
  const request = { user: { sub: 'actor-1', roles: [] }, correlationId: 'cor-1' };

  it('rejects Food write keys that the domain contract cannot accept', async () => {
    const food = { createCart: jest.fn() };
    const controller = new ServiceActionsController(food as never, {} as never, {} as never);

    await expect(controller.createCart({ restaurant_id: 'restaurant-1' }, 'short', request as never))
      .rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_INVALID' } });
    expect(food.createCart).not.toHaveBeenCalled();
  });

  it('normalizes and propagates an accepted Food write key', async () => {
    const food = { createCart: jest.fn().mockResolvedValue({ id: 'cart-1' }) };
    const controller = new ServiceActionsController(food as never, {} as never, {} as never);

    await controller.createCart({ restaurant_id: 'restaurant-1' }, '  cart-key-0001  ', request as never);

    expect(food.createCart).toHaveBeenCalledWith('actor-1', 'cor-1', 'cart-key-0001', 'restaurant-1');
  });

  it('keeps Restaurant reservation updates idempotent and rejects an empty patch', async () => {
    const restaurant = { updateReservation: jest.fn().mockResolvedValue({ id: 'reservation-1', status: 'MODIFIED' }) };
    const controller = new ServiceActionsController({} as never, restaurant as never, {} as never);

    await expect(controller.updateRestaurant('reservation-1', {}, 'short', request as never))
      .rejects.toMatchObject({ response: { code: 'RESTAURANT_UPDATE_EMPTY' } });
    expect(restaurant.updateReservation).not.toHaveBeenCalled();

    await controller.updateRestaurant('reservation-1', { start_at: '2099-01-01T12:00:00Z' }, '  reservation-key-0001  ', request as never);

    expect(restaurant.updateReservation).toHaveBeenCalledWith(
      'actor-1',
      'cor-1',
      'reservation-key-0001',
      'reservation-1',
      { start_at: '2099-01-01T12:00:00Z' },
    );
  });

  it('keeps all public Food cart mutations and key bounds in the Gateway contract', () => {
    const contract = readFileSync(
      resolve(__dirname, '../../..', 'packages/contracts/openapi/gateway-v1.yaml'),
      'utf8',
    );

    for (const route of [
      '/api/v1/service-actions/food/cart/{cartId}/items:',
      '/api/v1/service-actions/food/cart/{cartId}/items/{itemId}:',
      '/api/v1/service-actions/food/cart/{cartId}/voucher:',
    ]) expect(contract).toContain(route);
    expect(contract).toContain('/api/v1/service-actions/restaurant/reservations/{reservationId}:');
    expect(contract).toMatch(/RequiredIdempotencyKey:[\s\S]*?minLength: 8, maxLength: 128/);
  });
});
