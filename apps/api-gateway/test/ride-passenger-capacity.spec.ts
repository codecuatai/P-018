import { ServiceHubService } from '../src/modules/services/services.module';

describe('Ride passenger capacity Gateway propagation', () => {
  it('forwards a validated passenger count with the authoritative route snapshot', async () => {
    const ride = {
      createQuote: jest.fn().mockResolvedValue({
        id: 'quote-passengers',
        passenger_count: 4,
        capacity_policy_version: 'ride-capacity-v1',
      }),
    };
    const locations = {
      route: jest.fn().mockResolvedValue({
        status: 'RESOLVED',
        provider: 'geoapify',
        route_distance_meters: 12_000,
        route_duration_seconds: 1_200,
        route_geometry: [
          { latitude: 21.0, longitude: 105.8 },
          { latitude: 21.1, longitude: 105.9 },
        ],
        route_snapshot_hash: 'route-passengers',
      }),
    };
    const service = new ServiceHubService(
      {} as never,
      ride as never,
      {} as never,
      {} as never,
      locations as never,
    );

    await service.quoteRide('actor-passengers', 'quote-key-passengers', 'cor-passengers', {
      pickup_address: 'VinUni',
      dropoff_address: 'Ho Guom',
      pickup_latitude: 21.0,
      pickup_longitude: 105.8,
      dropoff_latitude: 21.1,
      dropoff_longitude: 105.9,
      vehicle_type: 'CAR_4',
      passenger_count: 4,
    });

    expect(ride.createQuote).toHaveBeenCalledWith(
      'actor-passengers',
      'quote-key-passengers',
      expect.objectContaining({ correlationId: 'cor-passengers' }),
      expect.objectContaining({
        vehicle_type: 'CAR_4',
        passenger_count: 4,
        route_provider: 'geoapify',
        route_snapshot_hash: 'route-passengers',
      }),
    );
  });

  it('composes authoritative route legs when a rebook includes bounded stopovers', async () => {
    const ride = { createQuote: jest.fn().mockResolvedValue({ id: 'quote-stopover' }) };
    const locations = {
      route: jest.fn()
        .mockResolvedValueOnce({
          status: 'RESOLVED',
          provider: 'geoapify',
          route_distance_meters: 4_000,
          route_duration_seconds: 500,
          route_geometry: [{ latitude: 21, longitude: 105.8 }, { latitude: 21.02, longitude: 105.79 }],
          route_snapshot_hash: 'leg-one',
        })
        .mockResolvedValueOnce({
          status: 'RESOLVED',
          provider: 'geoapify',
          route_distance_meters: 5_000,
          route_duration_seconds: 600,
          route_geometry: [{ latitude: 21.02, longitude: 105.79 }, { latitude: 21.1, longitude: 105.9 }],
          route_snapshot_hash: 'leg-two',
        }),
    };
    const service = new ServiceHubService(
      {} as never,
      ride as never,
      {} as never,
      {} as never,
      locations as never,
    );

    await service.quoteRide('actor-stopover', 'quote-key-stopover', 'cor-stopover', {
      pickup_address: 'Điểm đón',
      dropoff_address: 'Điểm đến',
      pickup_latitude: 21,
      pickup_longitude: 105.8,
      dropoff_latitude: 21.1,
      dropoff_longitude: 105.9,
      vehicle_type: 'BIKE',
      stopovers: [{ address: 'Công viên Nghĩa Đô', latitude: 21.02, longitude: 105.79 }],
    });

    expect(locations.route).toHaveBeenCalledTimes(2);
    expect(ride.createQuote).toHaveBeenCalledWith(
      'actor-stopover',
      'quote-key-stopover',
      expect.objectContaining({ correlationId: 'cor-stopover' }),
      expect.objectContaining({
        route_distance_meters: 9_000,
        route_duration_seconds: 1_100,
        route_geometry: [{ latitude: 21, longitude: 105.8 }, { latitude: 21.02, longitude: 105.79 }, { latitude: 21.1, longitude: 105.9 }],
        stopovers: [{ address: 'Công viên Nghĩa Đô', latitude: 21.02, longitude: 105.79 }],
      }),
    );
  });
});
