import { LocationService } from '../src/modules/personal/personal.module';
import { RideClient } from '../src/clients/service.clients';
import { RideTrackingController } from '../src/modules/services/services.module';

describe('RideTrackingController', () => {
  it('preserves the Ride-owned driver coordinates while adding the approach route', async () => {
    const driverLocation = { latitude: 21.0201, longitude: 105.8122 };
    const pickup = { latitude: 21.0285, longitude: 105.8542 };
    const driverRoute = {
      provider: 'geoapify',
      status: 'RESOLVED',
      origin: driverLocation,
      destination: pickup,
      route_distance_meters: 4_800,
      route_duration_seconds: 840,
      route_snapshot_hash: 'snapshot-driver-approach',
      route_geometry: [driverLocation, { latitude: 21.023, longitude: 105.83 }, pickup],
    };
    const ride = {
      getTracking: jest.fn().mockResolvedValue({
        booking_id: 'booking-1',
        status: 'DRIVER_TO_PICKUP',
        progress: 0.125,
        driver_location: driverLocation,
        current_location: driverLocation,
        route: { origin: pickup },
      }),
    };
    const locations = { route: jest.fn().mockResolvedValue(driverRoute) };
    const controller = new RideTrackingController(ride as unknown as RideClient, locations as unknown as LocationService);

    const response = await controller.tracking('booking-1', {
      correlationId: 'cor_ride_tracking',
      user: { sub: 'actor-1' },
    } as never) as { data: Record<string, unknown> };

    expect(response.data.driver_location).toEqual(driverLocation);
    expect(response.data.current_location).toEqual(driverLocation);
    expect(response.data.driver_route).toEqual({
      provider: 'geoapify',
      origin: driverLocation,
      destination: pickup,
      distance_meters: 4_800,
      duration_seconds: 840,
      geometry: driverRoute.route_geometry,
      snapshot_hash: 'snapshot-driver-approach',
    });
  });
});
