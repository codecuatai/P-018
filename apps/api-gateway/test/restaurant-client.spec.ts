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

  it('reinitializes an expired MCP session once before retrying a safe read', async () => {
    const rpcResponse = (payload: object, sessionId?: string, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(sessionId ? { 'mcp-session-id': sessionId } : {}),
      text: async () => `event: message\ndata: ${JSON.stringify(payload)}\n\n`,
    });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(rpcResponse({ jsonrpc: '2.0', id: 'init-1', result: {} }, 'expired-session'))
      .mockResolvedValueOnce(rpcResponse({ jsonrpc: '2.0', result: {} }, undefined, 202))
      .mockResolvedValueOnce(rpcResponse({ jsonrpc: '2.0', id: 'call-1', error: { code: -32001, message: 'Session expired.' } }, 'expired-session'))
      .mockResolvedValueOnce(rpcResponse({ jsonrpc: '2.0', id: 'init-2', result: {} }, 'fresh-session'))
      .mockResolvedValueOnce(rpcResponse({ jsonrpc: '2.0', result: {} }, undefined, 202))
      .mockResolvedValueOnce(rpcResponse({
        jsonrpc: '2.0',
        id: 'call-2',
        result: { structuredContent: { status: 200, body: { data: { items: [], total: 0 } } } },
      }, 'fresh-session'));
    globalThis.fetch = fetchMock as typeof fetch;
    const client = new RestaurantClient(config({
      XONE_SERVICE_MCP_URL: 'http://service-mcp:8105/mcp',
      INTERNAL_SERVICE_TOKEN: 'test-token',
      UPSTREAM_TIMEOUT_MS: 1000,
    }));

    await client.listRestaurants('user-1', 'cor-1', 'sushi', 12, 0);

    expect(fetchMock).toHaveBeenCalledTimes(6);
    const retry = JSON.parse(fetchMock.mock.calls[5][1].body as string);
    expect(retry.params.arguments).toEqual(expect.objectContaining({ service: 'restaurant', method: 'GET' }));
    expect(fetchMock.mock.calls[5][1].headers['mcp-session-id']).toBe('fresh-session');
  });

  it('reinitializes an expired MCP session before replaying an unaccepted write', async () => {
    const rpcResponse = (payload: object, sessionId?: string, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(sessionId ? { 'mcp-session-id': sessionId } : {}),
      text: async () => `event: message\ndata: ${JSON.stringify(payload)}\n\n`,
    });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(rpcResponse({ jsonrpc: '2.0', id: 'init-1', result: {} }, 'expired-session'))
      .mockResolvedValueOnce(rpcResponse({ jsonrpc: '2.0', result: {} }, undefined, 202))
      .mockResolvedValueOnce(rpcResponse({ jsonrpc: '2.0', id: 'call-1' }, undefined, 404))
      .mockResolvedValueOnce(rpcResponse({ jsonrpc: '2.0', id: 'init-2', result: {} }, 'fresh-session'))
      .mockResolvedValueOnce(rpcResponse({ jsonrpc: '2.0', result: {} }, undefined, 202))
      .mockResolvedValueOnce(rpcResponse({
        jsonrpc: '2.0',
        id: 'call-2',
        result: { structuredContent: { status: 201, body: { data: { id: 'hold-1' } } } },
      }, 'fresh-session'));
    globalThis.fetch = fetchMock as typeof fetch;
    const client = new RestaurantClient(config({
      XONE_SERVICE_MCP_URL: 'http://service-mcp:8105/mcp',
      INTERNAL_SERVICE_TOKEN: 'test-token',
      UPSTREAM_TIMEOUT_MS: 1000,
    }));

    await expect(client.createHold('user-1', 'cor-1', 'hold-key-1', { restaurant_id: 'rest-1' }))
      .resolves.toEqual({ id: 'hold-1' });

    expect(fetchMock).toHaveBeenCalledTimes(6);
    const failedCall = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    const retriedCall = JSON.parse(fetchMock.mock.calls[5][1].body as string);
    expect(failedCall.params.arguments.method).toBe('POST');
    expect(failedCall.params.arguments.headers['idempotency-key']).toBe('hold-key-1');
    expect(retriedCall.params.arguments.headers['idempotency-key']).toBe('hold-key-1');
    expect(fetchMock.mock.calls[2][1].headers['mcp-session-id']).toBe('expired-session');
    expect(fetchMock.mock.calls[5][1].headers['mcp-session-id']).toBe('fresh-session');
  });

  it('does not replay a write after an ambiguous transport failure', async () => {
    const rpcResponse = (payload: object, sessionId?: string, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(sessionId ? { 'mcp-session-id': sessionId } : {}),
      text: async () => `event: message\ndata: ${JSON.stringify(payload)}\n\n`,
    });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(rpcResponse({ jsonrpc: '2.0', id: 'init-1', result: {} }, 'session-1'))
      .mockResolvedValueOnce(rpcResponse({ jsonrpc: '2.0', result: {} }, undefined, 202))
      .mockRejectedValueOnce(new Error('connection reset'));
    globalThis.fetch = fetchMock as typeof fetch;
    const client = new RestaurantClient(config({
      XONE_SERVICE_MCP_URL: 'http://service-mcp:8105/mcp',
      INTERNAL_SERVICE_TOKEN: 'test-token',
      UPSTREAM_TIMEOUT_MS: 1000,
    }));

    await expect(client.createHold('user-1', 'cor-1', 'hold-key-1', { restaurant_id: 'rest-1' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'UPSTREAM_UNAVAILABLE' }) });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
