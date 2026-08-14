import { ConfigService } from '@nestjs/config';

import { GeoapifyProvider } from '../src/modules/personal/geoapify.provider';
import { LocationService } from '../src/modules/personal/personal.module';

function config(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

describe('Geoapify provider boundary', () => {
  afterEach(() => jest.restoreAllMocks());

  it('normalizes GeoJSON MultiLineString coordinates exactly once', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      features: [{
        properties: { distance: 15369, time: 893 },
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [[105.945975, 20.9914], [105.9001, 21.0102]],
            [[105.9001, 21.0102], [105.854434, 21.02977]],
          ],
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const provider = new GeoapifyProvider(config({
      GEOAPIFY_REAL_MODE: true,
      GEOAPIFY_SERVER_API_KEY: 'test-key',
      GEOAPIFY_API_BASE_URL: 'https://api.geoapify.com/v1',
      GEOAPIFY_LANGUAGE: 'vi',
      GEOAPIFY_COUNTRY_FILTER: 'vn',
      UPSTREAM_TIMEOUT_MS: 1000,
    }));

    const result = await provider.route(
      { latitude: 20.9914, longitude: 105.945975 },
      { latitude: 21.02977, longitude: 105.854434 },
    );

    expect(result.provider).toBe('geoapify');
    expect(result.route_distance_meters).toBe(15369);
    expect(result.route_duration_seconds).toBe(893);
    expect(result.route_geometry).toEqual([
      { latitude: 20.9914, longitude: 105.945975 },
      { latitude: 21.0102, longitude: 105.9001 },
      { latitude: 21.02977, longitude: 105.854434 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.searchParams.get('waypoints')).toBe('20.9914,105.945975|21.02977,105.854434');
    expect(requestUrl.searchParams.get('apiKey')).toBe('test-key');
  });

  it('does not use the deterministic location fallback in real mode', async () => {
    const geoapify = {
      enabled: true,
      geocode: jest.fn().mockResolvedValue([]),
    };
    const locations = new LocationService(
      config({ APP_ENV: 'development', LOCAL_DETERMINISTIC_LOCATION_FALLBACK: true }),
      geoapify as never,
    );

    const result = await locations.geocode('an address with no result');

    expect(result.provider).toBe('geoapify');
    expect(result.status).toBe('NEEDS_CONFIRMATION');
    expect(result.candidates).toEqual([]);
    expect(geoapify.geocode).toHaveBeenCalledWith('an address with no result');
  });
});
