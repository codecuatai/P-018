import { WorkflowService } from '../src/modules/workflow/workflow.module';

describe('Food delivery tracking map enrichment', () => {
  const pickup = { latitude: 21.034, longitude: 105.79 };
  const delivery = { latitude: 20.998, longitude: 105.812 };

  function createService(route: jest.Mock) {
    const food = {
      get: jest.fn().mockResolvedValue({
        order_id: 'ord_food_tracking',
        status: 'PREPARING',
        restaurant: { name: 'Quán A', address: 'Cầu Giấy, Hà Nội' },
        pickup_stops: [{ name: 'Quán A', address: 'Cầu Giấy, Hà Nội' }],
        address: { address_text: 'Thanh Xuân, Hà Nội' },
      }),
    };
    const locations = {
      geocode: jest.fn().mockImplementation(async (address: string) => ({
        candidates: [{
          address_text: address,
          ...(address.startsWith('Cầu Giấy') ? pickup : delivery),
          confidence: 1,
        }],
      })),
      route,
    };
    const service = new WorkflowService(food as never, {} as never, {} as never, {} as never, {} as never, locations as never);
    return { service, food, locations };
  }

  it('enriches every Food pickup and delivery point before requesting a route', async () => {
    const route = jest.fn().mockResolvedValue({
      provider: 'geoapify',
      status: 'RESOLVED',
      route_geometry: [pickup, delivery],
      route_distance_meters: 5_100,
      route_duration_seconds: 780,
      route_snapshot_hash: 'route-snapshot',
    });
    const { service, locations } = createService(route);

    const tracking = await service.getTracking('ord_food_tracking', 'usr_1', 'cor_1');

    expect(locations.geocode).toHaveBeenCalledWith('Cầu Giấy, Hà Nội');
    expect(locations.geocode).toHaveBeenCalledWith('Thanh Xuân, Hà Nội');
    expect(route).toHaveBeenCalledWith(pickup, delivery);
    expect(tracking).toEqual(expect.objectContaining({
      pickup_stops: [expect.objectContaining(pickup)],
      address: expect.objectContaining(delivery),
      delivery_route: expect.objectContaining({ origin: pickup, destination: delivery, geometry: [pickup, delivery] }),
    }));
  });

  it('keeps verified pins available when the optional routing provider is unavailable', async () => {
    const route = jest.fn().mockRejectedValue(new Error('provider unavailable'));
    const { service } = createService(route);

    const tracking = await service.getTracking('ord_food_tracking', 'usr_1', 'cor_1');

    expect(tracking).toEqual(expect.objectContaining({
      pickup_stops: [expect.objectContaining(pickup)],
      address: expect.objectContaining(delivery),
      delivery_route: { origin: pickup, destination: delivery, geometry: [pickup, delivery] },
    }));
  });
});
