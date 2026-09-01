import { ApiError, addFoodCartItem, browseService, changePassword, configureApiClient, errorText, getAccessToken, getActiveHistory, getFoodMenu, isAbortError, login, request, refreshAccessToken, setAccessToken, streamVoice, updateProfile } from "@/lib/api-client";

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

  it("does not let a late failed refresh erase a successful login", async () => {
    let releaseRefresh!: () => void;
    let refreshStarted!: () => void;
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    const refreshStartedGate = new Promise<void>((resolve) => { refreshStarted = resolve; });
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/refresh")) {
        refreshStarted();
        await refreshGate;
        return jsonResponse(429, { code: "RATE_LIMITED", detail: "retry later" });
      }
      return jsonResponse(201, { data: { access_token: "login-access-token", token_type: "bearer", expires_in: 900, user: { sub: "usr-1", email: "an@example.test", role: "customer", authentication_kind: "real" } } });
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });

    const staleRefresh = refreshAccessToken();
    await refreshStartedGate;
    await login("an@example.test", "a reliable local passphrase");
    releaseRefresh();

    await expect(staleRefresh).resolves.toMatchObject({ outcome: "authenticated", token: "login-access-token" });
    expect(getAccessToken()).toBe("login-access-token");
  });

  it("attaches safe trigger correlation id to refresh request without credentials in url/body", async () => {
    setAccessToken("stale-token");
    let refreshTriggerId: string | null = null;
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      if (url.endsWith("/api/v1/auth/refresh")) {
        refreshTriggerId = headers.get("X-Trigger-Correlation-Id");
        expect(headers.get("X-Correlation-Id")).toMatch(/^cor-refresh/);
        return jsonResponse(200, { data: { access_token: "fresh-token" } });
      }
      if (headers.get("Authorization") === "Bearer stale-token") {
        return jsonResponse(401, { code: "AUTHENTICATION_FAILED", detail: "expired" });
      }
      return jsonResponse(200, { data: { success: true } });
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });

    await request<{ success: boolean }>("/api/v1/services/healthcare");
    expect(refreshTriggerId).toMatch(/^cor-/);
    expect(getAccessToken()).toBe("fresh-token");
  });

  it("does not call unauthorizedHandler when multiple concurrent requests resolve via in-flight refresh", async () => {
    setAccessToken("expired-token");
    const onUnauthorized = jest.fn();
    configureApiClient({ onUnauthorized });

    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      if (url.endsWith("/api/v1/auth/refresh")) {
        return jsonResponse(200, { data: { access_token: "renewed-token" } });
      }
      if (headers.get("Authorization") === "Bearer expired-token") {
        return jsonResponse(401, { code: "AUTHENTICATION_REQUIRED", detail: "expired" });
      }
      return jsonResponse(200, { data: { route: url } });
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });

    const results = await Promise.all([
      request<{ route: string }>("/api/v1/services/healthcare"),
      request<{ route: string }>("/api/v1/healthcare/patients"),
      request<{ route: string }>("/api/v1/notifications/unread-count"),
    ]);

    expect(results).toHaveLength(3);
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("renewed-token");
  });

  it("lets a retried request join a refresh that starts while its retry is in flight", async () => {
    setAccessToken("expired-token");
    const onUnauthorized = jest.fn();
    configureApiClient({ onUnauthorized });
    let releaseSecondRefresh!: () => void;
    let secondRefreshStarted!: () => void;
    let releaseRetriedRequest!: () => void;
    let retriedRequestStarted!: () => void;
    const secondRefreshGate = new Promise<void>((resolve) => { releaseSecondRefresh = resolve; });
    const secondRefreshStartedGate = new Promise<void>((resolve) => { secondRefreshStarted = resolve; });
    const retriedRequestGate = new Promise<void>((resolve) => { releaseRetriedRequest = resolve; });
    const retriedRequestStartedGate = new Promise<void>((resolve) => { retriedRequestStarted = resolve; });

    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const authorization = new Headers(init?.headers).get("Authorization");
      if (url.endsWith("/api/v1/auth/refresh")) {
        if (fetchMock.mock.calls.filter((call) => String(call[0]).endsWith("/api/v1/auth/refresh")).length === 1) {
          return jsonResponse(200, { data: { access_token: "first-renewed-token" } });
        }
        secondRefreshStarted();
        await secondRefreshGate;
        return jsonResponse(200, { data: { access_token: "second-renewed-token" } });
      }
      if (authorization === "Bearer expired-token") return jsonResponse(401, { code: "AUTHENTICATION_FAILED", detail: "expired" });
      if (url.endsWith("/api/v1/services/healthcare") && authorization === "Bearer first-renewed-token") {
        retriedRequestStarted();
        await retriedRequestGate;
        return jsonResponse(401, { code: "AUTHENTICATION_FAILED", detail: "expired again" });
      }
      if (url.endsWith("/api/v1/notifications/unread-count") && authorization === "Bearer first-renewed-token") {
        return jsonResponse(401, { code: "AUTHENTICATION_FAILED", detail: "expired concurrently" });
      }
      expect(authorization).toBe("Bearer second-renewed-token");
      return jsonResponse(200, { data: { ok: true } });
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });

    const retriedRequest = request<{ ok: boolean }>("/api/v1/services/healthcare");
    await retriedRequestStartedGate;
    const concurrentRequest = request<{ ok: boolean }>("/api/v1/notifications/unread-count");
    await secondRefreshStartedGate;
    releaseRetriedRequest();
    await Promise.resolve();
    releaseSecondRefresh();

    await expect(Promise.all([retriedRequest, concurrentRequest])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("second-renewed-token");
  });

  it("does not wipe in-memory session on transient network error during refresh", async () => {
    setAccessToken("active-token");
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/v1/auth/refresh")) {
        throw new TypeError("Failed to fetch");
      }
      return jsonResponse(200, { data: { ok: true } });
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });

    const refreshed = await refreshAccessToken();
    expect(refreshed).toMatchObject({ outcome: "transient", token: "active-token" });
    expect(getAccessToken()).toBe("active-token");
  });

  it("preserves the session and returns a transient outcome when a protected request cannot refresh temporarily", async () => {
    setAccessToken("expired-session-token");
    const mockUnauthorized = jest.fn();
    configureApiClient({ onUnauthorized: mockUnauthorized });
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/v1/auth/refresh")) return jsonResponse(503, { code: "UPSTREAM_UNAVAILABLE", detail: "temporarily unavailable" });
      return jsonResponse(401, { code: "AUTHENTICATION_FAILED", detail: "expired token" });
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });

    await expect(request("/api/v1/services/healthcare")).rejects.toMatchObject({ code: "AUTH_REFRESH_TEMPORARY", retryable: true });
    expect(mockUnauthorized).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("expired-session-token");
  });

  it("reads active work from the dedicated active-history endpoint", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/api/v1/history/active");
      expect(String(input)).not.toContain("/api/v1/history?");
      return jsonResponse(200, { data: { items: [] } });
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });

    await expect(getActiveHistory()).resolves.toEqual({ items: [] });
  });

  it("translates stale, unavailable, location, and driver errors for consumers", () => {
    const makeError = (code: string): ApiError => new ApiError({ code, detail: code, status: 409, retryable: false });
    expect(errorText(makeError("STALE_ACTION"))).toBe("Lựa chọn này vừa được cập nhật. Hãy chọn lại từ danh sách mới.");
    expect(errorText(makeError("SLOT_UNAVAILABLE"))).toBe("Khung giờ này vừa hết chỗ. Mình đã cập nhật các giờ còn trống.");
    expect(errorText(makeError("LOCATION_UNRESOLVED"))).toBe("Hiện chưa tải được thông tin vị trí. Bạn thử lại giúp mình nhé.");
    expect(errorText(makeError("NO_DRIVER"))).toBe("Hiện chưa tìm được tài xế phù hợp. Bạn có thể thử lại.");
    expect(errorText(makeError("IDEMPOTENCY_KEY_REQUIRED"))).toBe("Thao tác giỏ hàng chưa được gửi đầy đủ. Bạn hãy thử lại.");
  });

  it("does not report a profile update as successful when the saved phone is missing from the response", async () => {
    const fetchMock = jest.fn(async () => jsonResponse(200, { data: { full_name: "An", email: "an@example.test", role: "customer" } }));
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });

    await expect(updateProfile({ full_name: "An", phone: "0911111111" })).rejects.toMatchObject({ code: "PROFILE_PHONE_NOT_PERSISTED" });
  });

  it("sends the idempotency key required by Food cart mutations", async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Idempotency-Key")).toMatch(/^food-cart-item-/);
      return jsonResponse(200, { data: { id: "cart-1", items: [] } });
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });

    await expect(addFoodCartItem("cart-1", { menu_item_id: "food_menu_item_1", quantity: 1 })).resolves.toEqual({ id: "cart-1", items: [] });
  });

  it("preserves the Healthcare department page size in the browse request", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/api/v1/services/healthcare?q=neurology&limit=100&offset=0");
      return jsonResponse(200, { data: { items: [], source: "healthcare-service", partial: false } });
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });

    await expect(browseService("healthcare", "neurology", { limit: 100, offset: 0 })).resolves.toEqual({ items: [], source: "healthcare-service", partial: false });
  });

  it("preserves active session and does not invoke unauthorizedHandler when changePassword receives CURRENT_PASSWORD_INVALID", async () => {
    setAccessToken("valid-session-token");
    const mockUnauthorized = jest.fn();
    configureApiClient({ onUnauthorized: mockUnauthorized });

    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/change-password")) {
        return jsonResponse(401, {
          code: "CURRENT_PASSWORD_INVALID",
          detail: "Mật khẩu hiện tại không đúng.",
        });
      }
      return jsonResponse(200, { data: {} });
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });

    let capturedError: unknown;
    try {
      await changePassword("wrong-current-password", "NewValidPass123!@#");
    } catch (err) {
      capturedError = err;
    }

    expect(capturedError).toBeInstanceOf(ApiError);
    expect((capturedError as ApiError).code).toBe("CURRENT_PASSWORD_INVALID");
    expect(errorText(capturedError)).toBe("Mật khẩu hiện tại không đúng.");
    expect(mockUnauthorized).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("valid-session-token");
  });

  it("clears session and invokes unauthorizedHandler when token authentication fails and refresh is rejected", async () => {
    setAccessToken("stale-session-token");
    const mockUnauthorized = jest.fn();
    configureApiClient({ onUnauthorized: mockUnauthorized });

    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/refresh")) {
        return jsonResponse(401, { code: "REFRESH_TOKEN_INVALID", detail: "refresh expired" });
      }
      return jsonResponse(401, { code: "AUTHENTICATION_FAILED", detail: "expired token" });
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });

    await expect(request("/api/v1/services/food")).rejects.toBeInstanceOf(ApiError);
    expect(mockUnauthorized).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it("paginates the restaurant menu through the Gateway service-actions route", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/api/v1/service-actions/food/restaurants/res_pho_hanoi/menu?limit=6&offset=30");
      return jsonResponse(200, { data: { restaurant: { id: "res_pho_hanoi" }, items: [], total: 136, limit: 6, offset: 30 } });
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });

    await expect(getFoodMenu("res_pho_hanoi", { limit: 6, offset: 30 })).resolves.toEqual({
      restaurant: { id: "res_pho_hanoi" },
      items: [],
      total: 136,
      limit: 6,
      offset: 30,
    });
  });

  it("delivers TTS bytes incrementally without calling arrayBuffer", async () => {
    setAccessToken("access-token");
    const sourceChunks = [new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5])];
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain("/api/v1/voice/text-to-speech");
      expect(new Headers(init?.headers).get("Accept")).toBe("audio/mpeg");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer access-token");
      expect(JSON.parse(String(init?.body))).toEqual({ text: "Xin chào" });
      let index = 0;
      return {
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: async () => index < sourceChunks.length
              ? { done: false, value: sourceChunks[index++] }
              : { done: true, value: undefined },
            cancel: async () => undefined,
            releaseLock: () => undefined,
          }),
        },
        arrayBuffer: jest.fn(() => {
          throw new Error("buffering is not allowed");
        }),
      } as unknown as Response;
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });

    const received: number[][] = [];
    const firstChunkFlags: boolean[] = [];
    await streamVoice("  Xin chào  ", (chunk, isFirstChunk) => {
      received.push(Array.from(chunk));
      firstChunkFlags.push(isFirstChunk);
    });

    expect(received).toEqual([[1, 2], [3], [4, 5]]);
    expect(firstChunkFlags).toEqual([true, false, false]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not buffer an empty or whitespace-only TTS request", async () => {
    const fetchMock = jest.fn();
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });

    await expect(streamVoice("   ", jest.fn())).rejects.toMatchObject({ code: "TEXT_REQUIRED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rethrows a raw AbortError when the caller aborts, unlike the internal timeout", async () => {
    const controller = new AbortController();
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal;
      await new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });

    const pending = request("/api/v1/assistant/chat", { method: "POST" }, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(isAbortError(new DOMException("Aborted", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("plain failure"))).toBe(false);
  });

  it("maps the internal timeout to a retryable REQUEST_TIMEOUT ApiError", async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal;
      await new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock, writable: true });

    await expect(request("/api/v1/assistant/chat", { method: "POST" }, { timeoutMs: 5 })).rejects.toMatchObject({ code: "REQUEST_TIMEOUT", retryable: true });
  });
});
