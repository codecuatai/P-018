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
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers({ 'mcp-session-id': 'session-1' }), text: async () => JSON.stringify({ jsonrpc: '2.0', id: 'initialize-1', result: {} }) })
      .mockResolvedValueOnce({ ok: true, status: 202, headers: new Headers(), text: async () => '' })
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify({ jsonrpc: '2.0', id: 'call-1', result: { structuredContent: { status: 200, body: { data: { items: [], total: 0 } } } } }) });
    globalThis.fetch = fetchMock as typeof fetch;
    const client = new RestaurantClient(config({
      XONE_SERVICE_MCP_URL: 'http://service-mcp:8105/mcp',
      INTERNAL_SERVICE_TOKEN: 'test-token',
      UPSTREAM_TIMEOUT_MS: 1000,
    }));

    await client.listRestaurants('user-1', 'cor-1', 'Tokachiya Ramen', 12, 0);

    const toolCall = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    expect(toolCall.method).toBe('tools/call');
    expect(toolCall.params.arguments).toEqual(expect.objectContaining({
      service: 'restaurant',
      method: 'GET',
      path: '/v1/restaurants?q=Tokachiya+Ramen&limit=12&offset=0',
    }));
  });
});
