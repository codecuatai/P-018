import { ConfigService } from '@nestjs/config';

import { RestaurantClient } from '../src/clients/service.clients';

function config(values: Record<string, string | number>): ConfigService {
  return {
    get: jest.fn((name: string, fallback?: unknown) => values[name] ?? fallback),
    getOrThrow: jest.fn((name: string) => {
      const value = values[name];
      if (value === undefined) throw new Error(`Missing config: ${name}`);
      return value;
    }),
  } as unknown as ConfigService;
}

describe('RestaurantClient generic search', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('maps the Service Hub keyword to the restaurant q parameter', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { items: [], total: 0 } }),
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const client = new RestaurantClient(config({
      RESTAURANT_SERVICE_URL: 'http://restaurant-service',
      INTERNAL_SERVICE_TOKEN: 'test-token',
      UPSTREAM_TIMEOUT_MS: 1000,
    }));

    await client.listRestaurants('user-1', 'cor-1', 'Tokachiya Ramen', 12, 0);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://restaurant-service/v1/restaurants?q=Tokachiya+Ramen&limit=12&offset=0',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
