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

  it('matches a known local place when the query includes contextual address details', async () => {
    const geoapify = { enabled: false, geocode: jest.fn(), autocomplete: jest.fn() };
    const locations = new LocationService(
      config({ APP_ENV: 'development', LOCAL_DETERMINISTIC_LOCATION_FALLBACK: true }),
      geoapify as never,
    );

    const result = await locations.geocode('Trường Đại học VinUni, Hà Nội');

    expect(result).toMatchObject({ provider: 'deterministic-local-demo', status: 'RESOLVED' });
    expect(result.candidates[0]).toMatchObject({ latitude: 20.9914, longitude: 105.945975 });
  });

  it('resolves the local Nghia Do park fixture for a Ride stopover', async () => {
    const geoapify = { enabled: false, geocode: jest.fn(), autocomplete: jest.fn() };
    const locations = new LocationService(
      config({ APP_ENV: 'development', LOCAL_DETERMINISTIC_LOCATION_FALLBACK: true }),
      geoapify as never,
    );

    const result = await locations.geocode('Công viên Nghĩa Đô');

    expect(result).toMatchObject({ provider: 'deterministic-local-demo', status: 'RESOLVED' });
    expect(result.candidates[0]).toMatchObject({ latitude: 21.0456, longitude: 105.7939 });
  });

  it('normalizes an OSRM-compatible GeoJSON route into auditable geometry', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 'Ok',
      routes: [{
        distance: 2834.4,
        duration: 241.2,
        geometry: {
          type: 'LineString',
          coordinates: [[105.8048, 21.0285], [105.7991, 21.0362], [105.7939, 21.0456]],
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const locations = new LocationService(
      config({ ROUTING_PROVIDER_URL: 'https://router.example.test', UPSTREAM_TIMEOUT_MS: 1000 }),
      { enabled: false, geocode: jest.fn(), autocomplete: jest.fn() } as never,
    );

    const result = await locations.route(
      { latitude: 21.0285, longitude: 105.8048 },
      { latitude: 21.0456, longitude: 105.7939 },
    );

    expect(result).toMatchObject({
      provider: 'configured-routing-provider',
      status: 'RESOLVED',
      route_distance_meters: 2834,
      route_duration_seconds: 241,
      route_geometry: [
        { latitude: 21.0285, longitude: 105.8048 },
        { latitude: 21.0362, longitude: 105.7991 },
        { latitude: 21.0456, longitude: 105.7939 },
      ],
    });
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.searchParams.get('geometries')).toBe('geojson');
  });

  it('reverse geocodes a coordinate through Geoapify', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      results: [{ lat: 21.0285, lon: 105.8048, formatted: 'Hồ Hoàn Kiếm, Hà Nội', rank: 1 }],
    }), { status: 200 }));
    const provider = new GeoapifyProvider(config({
      GEOAPIFY_REAL_MODE: true,
      GEOAPIFY_SERVER_API_KEY: 'test-key',
      GEOAPIFY_API_BASE_URL: 'https://api.geoapify.com/v1',
      GEOAPIFY_LANGUAGE: 'vi',
      GEOAPIFY_COUNTRY_FILTER: 'vn',
    }));

    const result = await provider.reverse({ latitude: 21.0285, longitude: 105.8048 });

    expect(result[0]).toMatchObject({ address_text: 'Hồ Hoàn Kiếm, Hà Nội', latitude: 21.0285, longitude: 105.8048 });
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.pathname).toBe('/v1/geocode/reverse');
    expect(requestUrl.searchParams.get('lat')).toBe('21.028500');
    expect(requestUrl.searchParams.get('lon')).toBe('105.804800');
  });

  it('uses the normal geocoder for autocomplete when Geoapify is disabled', async () => {
    const geoapify = { enabled: false, geocode: jest.fn(), autocomplete: jest.fn() };
    const locations = new LocationService(
      config({ APP_ENV: 'development', LOCAL_DETERMINISTIC_LOCATION_FALLBACK: true }),
      geoapify as never,
    );

    const result = await locations.autocomplete('Hồ Hoàn Kiếm');

    expect(result.provider).toBe('deterministic-local-demo');
    expect(result.suggestions).toHaveLength(1);
    expect(geoapify.autocomplete).not.toHaveBeenCalled();
  });

  it('uses semantic autocomplete when a full-text result misses an uppercase location code', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        results: [{ lat: 21.0, lon: 105.8, formatted: 'Truong Dai hoc Cong nghe Dong A, Hanoi', rank: 1 }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        features: [{
          properties: { lat: 21.0382738, lon: 105.7824572, formatted: 'Dai hoc Cong nghe, 144, Hanoi', rank: 1 },
          geometry: { coordinates: [105.7824572, 21.0382738] },
        }],
      }), { status: 200 }));
    const provider = new GeoapifyProvider(config({
      GEOAPIFY_REAL_MODE: true,
      GEOAPIFY_SERVER_API_KEY: 'test-key',
      GEOAPIFY_API_BASE_URL: 'https://api.geoapify.com/v1',
      GEOAPIFY_LANGUAGE: 'vi',
      GEOAPIFY_COUNTRY_FILTER: 'vn',
      UPSTREAM_TIMEOUT_MS: 1000,
    }));

    const result = await provider.geocode('Trường Đại học Công nghệ UET');

    expect(result).toHaveLength(1);
    expect(result[0]?.provider).toBe('geoapify');
    expect(result[0]?.latitude).toBe(21.0382738);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(String(fetchMock.mock.calls[0][0]));
    const secondUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(firstUrl.searchParams.get('text')).toBe('Trường Đại học Công nghệ UET');
    expect(secondUrl.pathname).toBe('/v1/geocode/autocomplete');
    expect(secondUrl.searchParams.get('text')).toBe('Đại học Công nghệ');
  });
});
