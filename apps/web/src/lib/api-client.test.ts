import { configureApiClient, getAccessToken, request, setAccessToken } from "@/lib/api-client";

let originalFetch: typeof fetch | undefined;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("browser API client", () => {
  beforeEach(() => {
    configureApiClient({});
    setAccessToken(null);
    originalFetch = (globalThis as { fetch?: typeof fetch }).fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalFetch) {
      Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch, writable: true });
    } else {
      delete (globalThis as { fetch?: typeof fetch }).fetch;
    }
  });

  it("keeps the access token in memory and retries protected requests after one shared refresh", async () => {
    setAccessToken("expired-access-token");
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/refresh")) {
        expect(init?.credentials).toBe("include");
        return jsonResponse(201, { data: { access_token: "refreshed-access-token" } });
      }

      const authorization = new Headers(init?.headers).get("Authorization");
      if (authorization === "Bearer expired-access-token") {
        return jsonResponse(401, { code: "AUTHENTICATION_FAILED", detail: "expired" });
      }
      expect(authorization).toBe("Bearer refreshed-access-token");
      return jsonResponse(200, { data: { ok: true } });
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });

    await expect(Promise.all([
      request<{ ok: boolean }>("/api/v1/assistant/chat", { method: "GET" }),
      request<{ ok: boolean }>("/api/v1/assistant/history", { method: "GET" }),
    ])).resolves.toEqual([{ ok: true }, { ok: true }]);

    expect(fetchMock.mock.calls.filter((call) => String(call[0]).endsWith("/api/v1/auth/refresh"))).toHaveLength(1);
    expect(getAccessToken()).toBe("refreshed-access-token");
  });
});
