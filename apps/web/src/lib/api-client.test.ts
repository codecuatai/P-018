import { ApiError, addFoodCartItem, browseService, configureApiClient, errorText, getAccessToken, getActiveHistory, getFoodMenu, login, request, refreshAccessToken, setAccessToken, updateProfile } from "@/lib/api-client";

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

    await expect(staleRefresh).resolves.toBe("login-access-token");
    expect(getAccessToken()).toBe("login-access-token");
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
});
