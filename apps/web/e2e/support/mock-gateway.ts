import type { BrowserContext, Route } from "@playwright/test";

type JsonRecord = Record<string, unknown>;
type MockGatewayOptions = {
  autoLogin?: boolean;
  email?: string;
  role?: "user" | "customer" | "manager" | "provider" | "admin";
  onboardingComplete?: boolean;
  noDriver?: boolean;
  foreignIds?: string[];
  synchronizeRefresh?: boolean;
};

type MockUser = {
  sub: string;
  email: string;
  full_name: string;
  phone: string;
  avatar_url?: string;
  onboarding_completed_at?: string;
  role: "user" | "customer" | "manager" | "provider" | "admin";
  status: "active";
  authentication_kind: "real";
  language: "vi";
  timezone: "Asia/Ho_Chi_Minh";
  provider_type?: string;
};

const isoNow = (): string => new Date().toISOString();

export class MockGateway {
  readonly user: MockUser;
  readonly deniedRequests: string[] = [];
  readonly calls: Array<{ method: string; path: string; actor: string }> = [];
  latestConversationId: string | null = null;

  private readonly options: MockGatewayOptions;
  private readonly users = new Map<string, MockUser>();
  private readonly tokens = new Map<string, string>();
  private readonly refreshTokens = new Map<string, { userSub: string; consumed: boolean; replacement?: string }>();
  private readonly addresses = new Map<string, JsonRecord[]>();
  private readonly conversations = new Map<string, JsonRecord>();
  private readonly carts = new Map<string, JsonRecord>();
  private readonly bookings = new Map<string, JsonRecord>();
  private readonly quotes = new Map<string, JsonRecord>();
  private readonly resources = new Map<string, JsonRecord>();
  private readonly providerProfiles = new Map<string, JsonRecord>();
  private readonly providerItems = new Map<string, JsonRecord[]>();
  private readonly notifications = new Map<string, JsonRecord[]>();
  private readonly notificationPreferences = new Map<string, JsonRecord>();
  private readonly favorites = new Map<string, JsonRecord[]>();
  private readonly patients = new Map<string, JsonRecord[]>();
  private readonly sessions = new Map<string, JsonRecord[]>();
  private refreshUserSub: string | null;
  private sequence = 0;
  private waitingRefreshes = 0;
  private releaseRefreshes: (() => void) | undefined;
  private readonly refreshPairReady: Promise<void> | undefined;

  constructor(options: MockGatewayOptions = {}) {
    this.options = options;
    this.user = this.makeUser(options.email ?? "e2e.user@example.test", options.onboardingComplete ?? true);
    this.users.set(this.user.sub, this.user);
    this.refreshUserSub = options.autoLogin ? this.user.sub : null;
    this.addresses.set(this.user.sub, []);
    this.seedNotifications();
    this.seedFavorites();
    this.seedPatients();
    if (options.autoLogin) {
      this.seedRefreshToken(this.user.sub);
      if (options.synchronizeRefresh) {
        this.refreshPairReady = new Promise<void>((resolve) => { this.releaseRefreshes = resolve; });
      }
    }
  }

  async install(context: BrowserContext): Promise<void> {
    await context.route("**/api/v1/**", async (route) => this.handle(route));
  }

  seedAddress(): JsonRecord {
    const address = this.makeAddress("address-a", "Nhà", "12 Nguyễn Huệ, Quận 1", true);
    this.addresses.set(this.user.sub, [address]);
    return address;
  }

  seedConversation(): JsonRecord {
    const conversation = this.makeConversation("conversation-a", "Việc cần xử lý");
    (conversation.messages as JsonRecord[]).push({ role: "assistant", content: "Mình đã sẵn sàng.", createdAt: isoNow() });
    this.conversations.set(this.conversationKey(this.user.sub, String(conversation.conversationId)), conversation);
    return conversation;
  }

  seedNotifications(unreadCount = 2): JsonRecord[] {
    const notifs: JsonRecord[] = [
      {
        id: "notif-1",
        actor_id: this.user.sub,
        event_key: "booking.driver_arrived",
        type: "RIDE_UPDATE",
        title: "Tài xế đã đến điểm đón",
        body: "Tài xế Nguyễn Văn A đang chờ bạn tại 12 Nguyễn Huệ.",
        resource_type: "ride_booking",
        resource_id: "ride-booking-1",
        status: unreadCount >= 1 ? "UNREAD" : "READ",
        created_at: isoNow(),
      },
      {
        id: "notif-2",
        actor_id: this.user.sub,
        event_key: "promo.gold_voucher",
        type: "PROMOTION",
        title: "Nhận voucher giảm 20K",
        body: "Ưu đãi độc quyền dành cho thành viên Hạng Vàng.",
        resource_type: "promotion",
        resource_id: "promo-1",
        status: unreadCount >= 2 ? "UNREAD" : "READ",
        created_at: isoNow(),
      },
      {
        id: "notif-3",
        actor_id: this.user.sub,
        event_key: "system.security_alert",
        type: "SECURITY",
        title: "Đăng nhập từ thiết bị mới",
        body: "Tài khoản vừa đăng nhập từ trình duyệt Chrome.",
        resource_type: "system",
        resource_id: "sys-1",
        status: "READ",
        created_at: isoNow(),
        read_at: isoNow(),
      },
    ];
    this.notifications.set(this.user.sub, notifs);
    return notifs;
  }

  seedFavorites(): JsonRecord[] {
    const favs: JsonRecord[] = [
      { id: "fav-1", actor_id: this.user.sub, domain: "food", resource_id: "food-restaurant-1", created_at: isoNow() },
      { id: "fav-2", actor_id: this.user.sub, domain: "restaurant", resource_id: "restaurant-1", created_at: isoNow() },
    ];
    this.favorites.set(this.user.sub, favs);
    return favs;
  }

  seedPatients(): JsonRecord[] {
    const pts: JsonRecord[] = [
      { id: 7, name: "Người bệnh E2E", phone: "0900000000", relationship: "self", is_default: true },
    ];
    this.patients.set(this.user.sub, pts);
    return pts;
  }

  initialRefreshToken(): string | undefined {
    return [...this.refreshTokens.keys()].at(-1);
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method().toUpperCase();
    const actor = this.actorFor(request.headers().authorization);
    this.calls.push({ method, path, actor: actor?.sub ?? "anonymous" });

    if (path === "/api/v1/auth/refresh" && method === "POST") {
      if (this.refreshPairReady) await this.waitForRefreshPair();
      const presented = this.cookieValue(request.headers().cookie, "xone_refresh");
      const current = presented ? this.refreshTokens.get(presented) : undefined;
      if (!current) return this.fail(route, 401, "REFRESH_TOKEN_INVALID", "No active session");
      const replayPath: Array<{ token: string; session: { userSub: string; consumed: boolean; replacement?: string } }> = [];
      let currentToken = presented!;
      let session = current;
      for (let index = 0; index < 64; index += 1) {
        replayPath.push({ token: currentToken, session });
        if (!session.consumed) break;
        const replacementToken = session.replacement;
        const replacement = replacementToken ? this.refreshTokens.get(replacementToken) : undefined;
        if (!replacement) return this.fail(route, 401, "REFRESH_TOKEN_REUSED", "Refresh token reused");
        currentToken = replacementToken!;
        session = replacement;
      }
      if (session.consumed) return this.fail(route, 401, "REFRESH_TOKEN_REUSED", "Refresh token reused");
      const user = this.users.get(session.userSub);
      if (!user) return this.fail(route, 401, "REFRESH_TOKEN_INVALID", "No active session");
      const nextRefreshToken = this.seedRefreshToken(session.userSub);
      for (const entry of replayPath) { entry.session.consumed = true; entry.session.replacement = nextRefreshToken; }
      return this.authSuccess(route, user, nextRefreshToken);
    }
    if (path === "/api/v1/auth/register" && method === "POST") {
      const body = await this.body(request);
      const email = String(body.email ?? "new.user@example.test");
      const role = body.role === "provider" ? "provider" : "user";
      const user = this.makeUser(email, false, String(body.full_name ?? "Người dùng E2E"), role);
      if (typeof body.provider_type === "string") {
        user.provider_type = body.provider_type;
      }
      this.users.set(user.sub, user);
      this.addresses.set(user.sub, []);
      this.refreshUserSub = user.sub;
      if (role === "provider") {
        this.providerProfiles.set(user.sub, {
          provider_id: user.sub,
          provider_type: body.provider_type || "restaurant_merchant",
          business_name: body.business_name || user.full_name,
          phone: body.phone || "0900000000",
          address: body.address || "",
          is_open: true,
          status: "active",
          tenant_id: `partner-${user.sub.slice(0, 8)}`,
        });
        this.providerItems.set(user.sub, []);
      }
      return this.authSuccess(route, user);
    }
    if (path === "/api/v1/auth/login" && method === "POST") {
      const body = await this.body(request);
      const email = String(body.email ?? this.user.email);
      const user = [...this.users.values()].find((candidate) => candidate.email === email) ?? this.user;
      this.refreshUserSub = user.sub;
      return this.authSuccess(route, user);
    }
    if (path === "/api/v1/auth/logout" && method === "POST") {
      this.refreshUserSub = null;
      return this.ok(route, { logged_out: true });
    }

    if (!actor) return this.fail(route, 401, "AUTHENTICATION_REQUIRED", "Authentication required");

    if (path === "/api/v1/auth/me" && method === "GET") return this.ok(route, actor);
    if (path.startsWith("/api/v1/admin")) {
      if (actor.role !== "admin" && actor.role !== "manager") {
        return this.fail(route, 403, "FORBIDDEN", "Forbidden");
      }
      if (path === "/api/v1/admin/summary" || path === "/api/v1/admin/stats") {
        return this.ok(route, {
          counts: {
            total_users: 4,
            payments: 12,
            refunds: 1,
            open_support_tickets: 0,
            failed_workflows: 0,
            partial_success_workflows: 0,
          },
          active_users: 128,
          total_revenue: 12500000,
          pending_support_tickets: 2,
          critical_alerts: 0,
          service_health: "HEALTHY",
          reservations_today: 14,
          domains: [
            { domain: "food", status: "healthy", data: { counts: { orders: 5 } } },
            { domain: "ride", status: "healthy", data: { counts: { trips: 10 } } },
            { domain: "restaurant", status: "healthy", data: { counts: { reservations: 2 } } },
            { domain: "healthcare", status: "healthy", data: { counts: { appointments: 1 } } },
          ],
          health: {
            items: [
              { service: "gateway-core", status: "healthy", latency_ms: 5, checked_at: isoNow() },
              { service: "food-service", status: "healthy", latency_ms: 12, checked_at: isoNow() },
              { service: "ride-service", status: "healthy", latency_ms: 15, checked_at: isoNow() },
              { service: "restaurant-service", status: "healthy", latency_ms: 8, checked_at: isoNow() },
              { service: "healthcare-service", status: "healthy", latency_ms: 10, checked_at: isoNow() },
            ],
          },
        });
      }
      if (path === "/api/v1/admin/users") {
        return this.ok(route, {
          total: 4,
          page: 1,
          page_size: 20,
          items: [
            { id: "u-1", email: "admin@xone.local", full_name: "Admin User", role: "admin", status: "active", created_at: isoNow() },
            { id: "u-2", email: "manager@xone.local", full_name: "Manager User", role: "manager", status: "active", created_at: isoNow() },
            { id: "u-3", email: "provider@xone.local", full_name: "Tài Khoản Đã Ngắt Kết Nối", role: "provider", status: "suspended", created_at: isoNow() },
            { id: "u-13", email: "provider1@xone.local", full_name: "Provider Master User", role: "provider", status: "active", created_at: isoNow() },
            { id: "u-4", email: "user@xone.local", full_name: "Standard User", role: "user", status: "active", created_at: isoNow() },
          ],
        });
      }
      if (path.match(/^\/api\/v1\/admin\/users\/[^/]+\/role$/)) {
        if (actor.role !== "admin") return this.fail(route, 403, "FORBIDDEN", "Only admin can change role");
        return this.ok(route, { updated: true });
      }
      if (path === "/api/v1/admin/operations/recovery/compensate" && method === "POST") {
        return this.ok(route, {
          success: true,
          voucher_code: "COMP-MOCK88",
          amount: 50000,
          message: "Đã phát hành mã ưu đãi COMP-MOCK88 trị giá 50.000 VND đền bù sự cố workflow.",
        });
      }
      if (path === "/api/v1/admin/system-health") {
        return this.ok(route, { items: [{ service: "gateway-core", status: "healthy", latency_ms: 5, checked_at: isoNow() }] });
      }
      return this.ok(route, { items: [], total: 0 });
    }
    if (path === "/api/v1/users/me" && method === "GET") return this.ok(route, actor);
    if (path === "/api/v1/users/me" && method === "PATCH") {
      const body = await this.body(request);
      if (typeof body.full_name === "string") actor.full_name = body.full_name;
      if (typeof body.phone === "string") actor.phone = body.phone;
      if (typeof body.language === "string") actor.language = body.language as "vi";
      if (typeof body.timezone === "string") actor.timezone = body.timezone as "Asia/Ho_Chi_Minh";
      if (body.onboarding_completed === true) actor.onboarding_completed_at = isoNow();
      return this.ok(route, actor);
    }
    if (path === "/api/v1/users/avatar" && method === "POST") {
      actor.avatar_url = "https://xone.local/avatars/avatar-e2e.png";
      return this.ok(route, { avatar_url: actor.avatar_url });
    }
    if (path === "/api/v1/auth/change-password" && method === "POST") {
      const body = await this.body(request);
      if (!body.current_password || !body.new_password) {
        return this.fail(route, 400, "INVALID_PASSWORD", "Vui lòng nhập đầy đủ mật khẩu");
      }
      return this.ok(route, { password_changed: true, reauthentication_required: false });
    }
    if (path === "/api/v1/auth/sessions" && method === "GET") {
      const list = this.sessions.get(actor.sub) ?? [
        {
          id: "sess-1",
          user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
          ip_address: "127.0.0.1",
          created_at: isoNow(),
          last_active_at: isoNow(),
          is_current: true,
        },
      ];
      return this.ok(route, { items: list });
    }
    const sessionMatch = path.match(/^\/api\/v1\/auth\/sessions\/([^/]+)$/);
    if (sessionMatch && method === "DELETE") {
      return this.ok(route, { revoked: true });
    }
    if (path === "/api/v1/auth/logout-all" && method === "POST") {
      return this.ok(route, { logged_out: true });
    }
    if (path === "/api/v1/auth/2fa/setup" && method === "GET") {
      return this.ok(route, {
        qr_code_url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><rect width='180' height='180' fill='%23eee'/><text x='30' y='95' font-size='14'>QR CODE FIXTURE</text></svg>",
        secret: "JBSWY3DPEHPK3PXP",
        backup_codes: ["123456", "234567", "345678", "456789"],
      });
    }
    if (path === "/api/v1/auth/2fa/verify" && method === "POST") {
      return this.ok(route, {
        enabled: true,
        backup_codes: ["123456", "234567", "345678", "456789"],
      });
    }
    if (path === "/api/v1/auth/2fa/disable" && method === "POST") {
      return this.ok(route, { disabled: true });
    }

    if (path === "/api/v1/addresses" && method === "GET") return this.ok(route, { items: this.addresses.get(actor.sub) ?? [] });
    if (path === "/api/v1/addresses" && method === "POST") {
      const body = await this.body(request);
      const address = this.makeAddress(this.nextId("address"), String(body.label ?? "Nhà"), String(body.address_text ?? "Địa chỉ E2E"), body.is_default === true, body);
      const current = this.addresses.get(actor.sub) ?? [];
      this.addresses.set(actor.sub, [address, ...current.map((item) => address.is_default ? { ...item, is_default: false } : item)]);
      return this.ok(route, address);
    }
    const defaultAddressMatch = path.match(/^\/api\/v1\/addresses\/([^/]+)\/default$/);
    if (defaultAddressMatch && method === "POST") {
      const id = decodeURIComponent(defaultAddressMatch[1]);
      const list = this.addresses.get(actor.sub) ?? [];
      const item = list.find((candidate) => String(candidate.id) === id);
      if (!item || this.options.foreignIds?.includes(id)) return this.denied(route, path);
      this.addresses.set(actor.sub, list.map((candidate) => ({ ...candidate, is_default: candidate.id === id })));
      return this.ok(route, { ...item, is_default: true, updated_at: isoNow() });
    }
    const addressMatch = path.match(/^\/api\/v1\/addresses\/([^/]+)$/);
    if (addressMatch && ["GET", "PATCH", "DELETE"].includes(method)) {
      const id = decodeURIComponent(addressMatch[1]);
      const list = this.addresses.get(actor.sub) ?? [];
      const item = list.find((candidate) => String(candidate.id) === id);
      if (!item || this.options.foreignIds?.includes(id)) return this.denied(route, path);
      if (method === "DELETE") {
        this.addresses.set(actor.sub, list.filter((candidate) => String(candidate.id) !== id));
        return this.ok(route, { deleted: true });
      }
      if (method === "PATCH") Object.assign(item, await this.body(request), { updated_at: isoNow() });
      return this.ok(route, item);
    }

    if (path === "/api/v1/location/geocode" && method === "POST") {
      const body = await this.body(request);
      const query = String(body.address_text ?? "Địa chỉ E2E");
      return this.ok(route, { provider: "deterministic-fixture", status: "RESOLVED", query, candidates: [{ address_text: query, latitude: 10.7769, longitude: 106.7009, confidence: 0.99 }] });
    }
    if (path === "/api/v1/location/autocomplete" && method === "POST") {
      const body = await this.body(request);
      const query = String(body.address_text ?? "Địa chỉ E2E");
      return this.ok(route, { provider: "deterministic-fixture", query, suggestions: [{ address_text: query, latitude: 10.7769, longitude: 106.7009, confidence: 0.99 }] });
    }
    if (path === "/api/v1/location/reverse-geocode" && method === "POST") {
      const body = await this.body(request);
      const latitude = Number(body.latitude ?? 10.7769);
      const longitude = Number(body.longitude ?? 106.7009);
      return this.ok(route, { provider: "deterministic-fixture", status: "RESOLVED", query: `${latitude},${longitude}`, candidates: [{ address_text: "Vị trí hiện tại, Thành phố Hồ Chí Minh", latitude, longitude, confidence: 0.99 }] });
    }
    if (path === "/api/v1/location/route" && method === "POST") {
      return this.ok(route, { provider: "deterministic-fixture", status: "ESTIMATED", distance_km: 2.4, duration_minutes: 12, route_distance_meters: 2400, route_duration_seconds: 720, route_polyline: JSON.stringify([{ latitude: 10.7769, longitude: 106.7009 }, { latitude: 10.779, longitude: 106.704 }]), origin: { latitude: 10.7769, longitude: 106.7009 }, destination: { latitude: 10.779, longitude: 106.704 }, route_snapshot_hash: "route-fixture-v1" });
    }

    if (path === "/api/v1/conversations" && method === "GET") return this.ok(route, { items: [...this.conversations.values()].filter((item) => String(item.actorId) === actor.sub) });
    if (path === "/api/v1/conversations" && method === "POST") {
      const body = await this.body(request);
      const conversation = this.makeConversation(this.nextId("conversation"), String(body.title ?? "Cuộc trò chuyện mới"), actor.sub, String(body.service_context ?? ""));
      this.conversations.set(this.conversationKey(actor.sub, String(conversation.conversationId)), conversation);
      return this.ok(route, conversation);
    }
    const conversationMatch = path.match(/^\/api\/v1\/conversations\/([^/]+)$/);
    if (conversationMatch && ["GET", "PATCH", "DELETE"].includes(method)) {
      const id = decodeURIComponent(conversationMatch[1]);
      const key = this.conversationKey(actor.sub, id);
      const conversation = this.conversations.get(key);
      if (!conversation || this.options.foreignIds?.includes(id)) return this.denied(route, path);
      if (method === "DELETE") {
        this.conversations.delete(key);
        return this.ok(route, { deleted: true });
      }
      if (method === "PATCH") Object.assign(conversation, await this.body(request));
      return this.ok(route, conversation);
    }
    if (path === "/api/v1/assistant/chat" && method === "POST") return this.chat(route, actor);
    if (path === "/api/v1/assistant/actions" && method === "POST") return this.ok(route, { conversation_id: "conversation-a", message: "Bước đã được ghi nhận.", items: [], actions: [], completed: [], workflow_status: "COMPLETED" });

    if (path === "/api/v1/services/food" && method === "GET") return this.ok(route, { items: [{ id: "food-restaurant-1", name: "Bếp X-One", address: "12 Nguyễn Huệ", latitude: 10.7769, longitude: 106.7009, is_open: true }], source: "food-fixture", partial: false });
    if (path === "/api/v1/service-actions/food/restaurants/food-restaurant-1" && method === "GET") return this.ok(route, { id: "food-restaurant-1", name: "Bếp X-One", address: "12 Nguyễn Huệ", latitude: 10.7769, longitude: 106.7009 });
    if (path === "/api/v1/service-actions/food/restaurants/food-restaurant-1/menu" && method === "GET") return this.ok(route, { items: [{ id: "food-item-1", name: "Phở bò X-One", description: "Món fixture", price: 75000, available: true }] });
    if (path === "/api/v1/service-actions/food/cart" && method === "POST") {
      const cart = { id: "food-cart-1", restaurant_id: "food-restaurant-1", items: [], total: 0 };
      this.carts.set(this.cartKey(actor.sub), cart);
      return this.ok(route, cart);
    }
    if (path.match(/^\/api\/v1\/service-actions\/food\/cart\/[^/]+\/items$/) && method === "POST") {
      const cart = this.carts.get(this.cartKey(actor.sub)) ?? { id: "food-cart-1", items: [], total: 0 };
      const body = await this.body(request);
      const item = { id: "food-cart-item-1", menu_item_id: String(body.menu_item_id ?? "food-item-1"), name: "Phở bò X-One", unit_price: 75000, quantity: Number(body.quantity ?? 1) };
      cart.items = [item]; cart.total = item.unit_price * item.quantity;
      this.carts.set(this.cartKey(actor.sub), cart);
      return this.ok(route, cart);
    }
    if (path.match(/^\/api\/v1\/service-actions\/food\/cart\/[^/]+\/items\/[^/]+$/) && ["PATCH", "DELETE"].includes(method)) {
      const cart = this.carts.get(this.cartKey(actor.sub)) ?? { id: "food-cart-1", items: [], total: 0 };
      if (method === "DELETE") cart.items = [];
      else { const body = await this.body(request); const first = (cart.items as JsonRecord[])[0]; if (first) first.quantity = Number(body.quantity ?? first.quantity); }
      cart.total = (cart.items as JsonRecord[]).reduce((sum, item) => sum + Number(item.unit_price ?? 0) * Number(item.quantity ?? 0), 0);
      return this.ok(route, cart);
    }
    if (path.match(/^\/api\/v1\/service-actions\/food\/cart\/[^/]+\/voucher$/) && method === "POST") { const cart = this.carts.get(this.cartKey(actor.sub)) ?? { id: "food-cart-1", items: [], total: 75000 }; cart.voucher = { code: "E2E10" }; return this.ok(route, cart); }
    if (path.match(/^\/api\/v1\/service-actions\/food\/cart\/[^/]+\/voucher$/) && method === "DELETE") { const cart = this.carts.get(this.cartKey(actor.sub)) ?? { id: "food-cart-1", items: [], total: 75000 }; delete cart.voucher; return this.ok(route, cart); }
    if (path === "/api/v1/confirmations/food-order" && method === "POST") return this.ok(route, { id: "food-confirm-1", preview: { subtotal: 75000, delivery_fee: 15000, total: { amount: 90000, currency: "VND" }, address: { address_text: "12 Nguyễn Huệ" } } });

    if (path === "/api/v1/services/ride" && method === "GET") return this.ok(route, { items: [], source: "ride-fixture", partial: false });
    if (path === "/api/v1/services/ride/quote" && method === "POST") {
      const body = await this.body(request);
      const quote = { id: "ride-quote-1", status: "QUOTE_CREATED", pickup_address: String(body.pickup_address), dropoff_address: String(body.dropoff_address), vehicle_type: String(body.vehicle_type ?? "CAR_4"), distance_km: 2.4, duration_minutes: 12, amount: 98000, currency: "VND", tariff_version: "db-tariff-e2e", quote_version: "quote-e2e-v1", expires_at: new Date(Date.now() + 600_000).toISOString(), pickup_latitude: 10.7769, pickup_longitude: 106.7009, dropoff_latitude: 10.779, dropoff_longitude: 106.704, route_provider: "deterministic-fixture", route_distance_meters: 2400, route_duration_seconds: 720, route_polyline: JSON.stringify([{ latitude: 10.7769, longitude: 106.7009 }, { latitude: 10.779, longitude: 106.704 }]) };
      this.quotes.set(this.quoteKey(actor.sub), quote);
      return this.ok(route, quote);
    }
    if (path === "/api/v1/service-actions/ride/prepare" && method === "POST") {
      const booking = { id: "ride-booking-1", status: "AWAITING_CONFIRMATION", quote_id: "ride-quote-1", resource_version: 2 };
      this.bookings.set(this.bookingKey(actor.sub), { ...booking, trackingCalls: 0 });
      return this.ok(route, booking);
    }
    const rideConfirm = path.match(/^\/api\/v1\/service-actions\/ride\/([^/]+)\/confirm$/);
    if (rideConfirm && method === "POST") {
      const booking = this.bookings.get(this.bookingKey(actor.sub));
      if (!booking) return this.denied(route, path);
      booking.status = this.options.noDriver ? "NO_DRIVER" : "SEARCHING_DRIVER";
      return this.ok(route, booking);
    }
    const tracking = path.match(/^\/api\/v1\/rides\/([^/]+)\/tracking$/);
    if (tracking && method === "GET") return this.tracking(route, actor);

    if (path === "/api/v1/services/restaurant" && method === "GET") return this.ok(route, { items: [{ id: "restaurant-1", name: "Nhà hàng X-One", address: "20 Lê Lợi", latitude: 10.777, longitude: 106.701 }], source: "restaurant-fixture", partial: false });
    if (path === "/api/v1/service-actions/restaurant/restaurant-1" && method === "GET") return this.ok(route, { id: "restaurant-1", name: "Nhà hàng X-One", address: "20 Lê Lợi", latitude: 10.777, longitude: 106.701 });
    if (path === "/api/v1/service-actions/restaurant/availability" && method === "POST") return this.ok(route, { available: true, message: "Có bàn fixture." });
    if (path === "/api/v1/service-actions/restaurant/hold" && method === "POST") return this.ok(route, { id: "hold-1", hold_code: "HOLD-E2E", expires_at: new Date(Date.now() + 600_000).toISOString() });
    if (path === "/api/v1/confirmations/restaurant-reservation" && method === "POST") return this.ok(route, { id: "restaurant-confirm-1", title: "Xác nhận đặt bàn", detail: "Nhà hàng X-One · 2 người" });

    if (path === "/api/v1/services/healthcare" && method === "GET") return this.ok(route, { items: [{ id: "neurology", name: "Nội thần kinh" }], source: "healthcare-fixture", partial: false });
    if (path === "/api/v1/healthcare/patients" && method === "GET") {
      return this.ok(route, { items: this.patients.get(actor.sub) ?? [] });
    }
    if (path === "/api/v1/healthcare/patients" && method === "POST") {
      const body = await this.body(request);
      const patient = {
        id: ++this.sequence,
        name: String(body.name ?? "Người bệnh mới"),
        phone: String(body.phone ?? "0900000000"),
        relationship: String(body.relationship ?? "dependent"),
        is_default: false,
      };
      const current = this.patients.get(actor.sub) ?? [];
      current.push(patient);
      this.patients.set(actor.sub, current);
      return this.ok(route, patient);
    }
    const patientDefaultMatch = path.match(/^\/api\/v1\/healthcare\/patients\/([^/]+)\/default$/);
    if (patientDefaultMatch && method === "POST") {
      const id = Number(patientDefaultMatch[1]);
      const current = this.patients.get(actor.sub) ?? [];
      const target = current.find((p) => p.id === id);
      if (target) {
        current.forEach((p) => { p.is_default = (p.id === id); });
      }
      return this.ok(route, target ?? { id, is_default: true });
    }
    const patientMatch = path.match(/^\/api\/v1\/healthcare\/patients\/([^/]+)$/);
    if (patientMatch && ["PATCH", "DELETE"].includes(method)) {
      const id = Number(patientMatch[1]);
      const current = this.patients.get(actor.sub) ?? [];
      if (method === "DELETE") {
        this.patients.set(actor.sub, current.filter((p) => p.id !== id));
        return this.ok(route, { deleted: true, id, replacement_default_id: null });
      }
      if (method === "PATCH") {
        const body = await this.body(request);
        const target = current.find((p) => p.id === id);
        if (target) Object.assign(target, body);
        return this.ok(route, target ?? { id, ...body });
      }
    }
    if (path.startsWith("/api/v1/service-actions/healthcare/doctors") && method === "GET") return this.ok(route, [{ id: 9, name: "Bác sĩ E2E", description: "Chuyên khoa fixture", price: 300000, facility: { name: "Cơ sở X-One", address: "30 Trần Hưng Đạo" }, available_slots: [{ id: 91, start_time: new Date(Date.now() + 86_400_000).toISOString() }] }]);
    if (path === "/api/v1/service-actions/healthcare/hold" && method === "POST") return this.ok(route, { appointment_id: 91, doctor_name: "Bác sĩ E2E", start_time: new Date(Date.now() + 86_400_000).toISOString(), price: 300000, status: "HELD" });
    if (path.match(/^\/api\/v1\/service-actions\/healthcare\/\d+\/payment$/) && method === "POST") return this.ok(route, { acknowledged: true, status: "SUCCEEDED" });
    if (path === "/api/v1/confirmations/healthcare-appointment" && method === "POST") return this.ok(route, { id: "healthcare-confirm-1", title: "Xác nhận lịch khám", detail: "Bác sĩ E2E · Cơ sở X-One" });

    if (path === "/api/v1/history" && method === "GET") return this.ok(route, this.historyFor(actor.sub));
    const historyDetail = path.match(/^\/api\/v1\/history\/([^/]+)\/([^/]+)$/);
    if (historyDetail && method === "GET") {
      const id = decodeURIComponent(historyDetail[2]);
      const resource = this.resources.get(`${actor.sub}:${id}`);
      if (!resource || this.options.foreignIds?.includes(id)) return this.denied(route, path);
      return this.ok(route, resource);
    }

    if (path.includes("/confirmations/") && path.endsWith("/execute") && method === "POST") return this.executeConfirmation(route, actor, path);
    if (path.includes("/confirmations/") && path.endsWith("/execute-cancellation") && method === "POST") return this.ok(route, { order: { id: "food-order-1", status: "CANCELLED" }, payment: { status: "REFUNDED" } });
    if (path.includes("/service-actions/restaurant/") && path.endsWith("/cancel") && method === "POST") return this.ok(route, { id: "reservation-1", status: "CANCELLED" });
    if (path.includes("/service-actions/healthcare/") && path.endsWith("/cancel") && method === "POST") return this.ok(route, { appointment_id: 91, status: "CANCELLED" });

    if (path === "/api/v1/notifications/unread-count" && method === "GET") {
      const notifs = this.notifications.get(actor.sub) ?? [];
      const unread = notifs.filter((n) => n.status === "UNREAD").length;
      return this.ok(route, { unread_count: unread, partial: false, unavailable: [] });
    }
    if (path === "/api/v1/notifications/read-all" && method === "POST") {
      const notifs = this.notifications.get(actor.sub) ?? [];
      for (const n of notifs) {
        n.status = "READ";
        n.read_at = isoNow();
      }
      return this.ok(route, { updated: notifs.length });
    }
    const notifReadMatch = path.match(/^\/api\/v1\/notifications\/([^/]+)\/read$/);
    if (notifReadMatch && method === "POST") {
      const id = decodeURIComponent(notifReadMatch[1]);
      const notifs = this.notifications.get(actor.sub) ?? [];
      const item = notifs.find((n) => n.id === id);
      if (item) {
        item.status = "READ";
        item.read_at = isoNow();
      }
      return this.ok(route, item ?? { id, status: "READ" });
    }
    if (path === "/api/v1/notifications" && method === "GET") {
      const url = new URL(request.url());
      const statusFilter = url.searchParams.get("status");
      let notifs = this.notifications.get(actor.sub) ?? [];
      if (statusFilter === "UNREAD") notifs = notifs.filter((n) => n.status === "UNREAD");
      else if (statusFilter === "READ") notifs = notifs.filter((n) => n.status === "READ");
      const unread = (this.notifications.get(actor.sub) ?? []).filter((n) => n.status === "UNREAD").length;
      return this.ok(route, {
        items: notifs,
        unread_count: unread,
        total: notifs.length,
        page: 1,
        page_size: 20,
        has_more: false,
        partial: false,
        unavailable: [],
      });
    }
    if (path === "/api/v1/notifications/preferences") {
      const current = this.notificationPreferences.get(actor.sub) ?? {
        booking_updates: true,
        promotions: true,
        system: true,
        email_enabled: false,
      };
      if (method === "GET") return this.ok(route, current);
      if (method === "PATCH") {
        const body = await this.body(request);
        const updated = { ...current, ...body };
        this.notificationPreferences.set(actor.sub, updated);
        return this.ok(route, updated);
      }
    }

    if (path === "/api/v1/favorites" && method === "GET") {
      return this.ok(route, { items: this.favorites.get(actor.sub) ?? [] });
    }
    if (path === "/api/v1/favorites" && method === "POST") {
      const body = await this.body(request);
      const item = {
        id: this.nextId("fav"),
        actor_id: actor.sub,
        domain: body.domain ?? "food",
        resource_id: body.resource_id ?? "food-restaurant-1",
        created_at: isoNow(),
      };
      const current = this.favorites.get(actor.sub) ?? [];
      current.push(item);
      this.favorites.set(actor.sub, current);
      return this.ok(route, item);
    }
    const favMatch = path.match(/^\/api\/v1\/favorites\/([^/]+)$/);
    if (favMatch && method === "DELETE") {
      const id = decodeURIComponent(favMatch[1]);
      const current = this.favorites.get(actor.sub) ?? [];
      this.favorites.set(actor.sub, current.filter((f) => f.id !== id));
      return this.ok(route, { deleted: true });
    }

    if (path === "/api/v1/rewards/summary" && method === "GET") {
      return this.ok(route, {
        points: 2450,
        tier: "gold",
        tier_label: "Hạng Vàng",
        next_tier_label: "Hạng Kim Cương",
        next_tier_spend_remaining: 1500000,
        points_expiring_soon: 120,
        expiry_date: new Date(Date.now() + 30 * 86400000).toISOString(),
      });
    }
    if (path.startsWith("/api/v1/rewards/vouchers") && method === "GET") {
      return this.ok(route, {
        items: [
          {
            id: "vouch-1",
            code: "GOLD10",
            title: "Giảm 10% đơn ẩm thực",
            discount_type: "percent",
            discount_value: 10,
            min_order_amount: 100000,
            expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
            status: "active",
            service: "food",
          },
          {
            id: "vouch-2",
            code: "RIDE20K",
            title: "Giảm 20.000 đ chuyến xe",
            discount_type: "fixed",
            discount_value: 20000,
            min_order_amount: 50000,
            expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
            status: "active",
            service: "ride",
          },
        ],
      });
    }
    if (path.startsWith("/api/v1/rewards/ledger") && method === "GET") {
      return this.ok(route, {
        items: [
          {
            id: "ledg-1",
            points: 150,
            type: "EARN",
            description: "Hoàn tất chuyến xe #ride-booking-1",
            created_at: isoNow(),
          },
          {
            id: "ledg-2",
            points: -50,
            type: "REDEEM",
            description: "Đổi voucher RIDE20K",
            created_at: isoNow(),
          },
        ],
        total: 2,
        has_more: false,
      });
    }
    if (path === "/api/v1/rewards/referral" && method === "GET") {
      return this.ok(route, {
        referral_code: "XONE2026",
        referral_url: "https://xone.local/join?ref=XONE2026",
        total_referrals: 3,
        total_points_earned: 300,
        referrals: [
          { name: "Nguyễn Văn Tuấn", joined_at: isoNow(), status: "rewarded" },
        ],
      });
    }

    if (path === "/api/v1/provider/services/profile") {
      if (actor.role !== "provider") return this.fail(route, 403, "FORBIDDEN", "Forbidden");
      if (method === "GET") {
        const isDisconnected = actor.email === "provider@xone.local";
        const isMaster = actor.email === "provider1@xone.local";
        const profile = this.providerProfiles.get(actor.sub) ?? {
          provider_id: actor.sub,
          provider_type: isDisconnected ? "disconnected" : isMaster ? "all" : (actor.provider_type || "restaurant_merchant"),
          business_name: isDisconnected ? "Tài Khoản Đã Ngắt Kết Nối" : actor.full_name || (isMaster ? "Đối Tác Dịch Vụ X-One (Chính)" : "Đối tác X-One"),
          phone: actor.phone || "0900000000",
          address: "123 Đường Sáng Tạo, Quận 1",
          is_open: !isDisconnected,
          status: isDisconnected ? "suspended" : "active",
          tenant_id: isDisconnected ? "partner-disconnected" : isMaster ? "partner-xone-01" : `partner-${actor.sub.slice(0, 8)}`,
          connected_services: isDisconnected
            ? { food: false, ride: false, restaurant: false, healthcare: false, delivery: false }
            : { food: true, ride: true, restaurant: true, healthcare: true, delivery: true },
        };
        return this.ok(route, profile);
      }
      if (method === "PUT") {
        const body = await this.body(request);
        const existing = this.providerProfiles.get(actor.sub) ?? {};
        const updated = { ...existing, ...body, provider_id: actor.sub };
        this.providerProfiles.set(actor.sub, updated);
        return this.ok(route, updated);
      }
    }

    if (path === "/api/v1/provider/services/items") {
      if (actor.role !== "provider") return this.fail(route, 403, "FORBIDDEN", "Forbidden");
      if (method === "GET") {
        const isMaster = actor.email === "provider1@xone.local";
        const defaultItems = isMaster
          ? [
              {
                id: "item-init-1",
                provider_id: actor.sub,
                domain: "food",
                name: "Cơm tấm đặc biệt X-One",
                description: "Sườn bì chả ốp la",
                price: 65000,
                currency: "VND",
                category: "Cơm",
                is_available: true,
                isAvailable: true,
                created_at: isoNow(),
              },
            ]
          : [];
        const items = this.providerItems.get(actor.sub) ?? defaultItems;
        if (!this.providerItems.has(actor.sub)) {
          this.providerItems.set(actor.sub, items);
        }
        return this.ok(route, { items });
      }
      if (method === "POST") {
        const body = await this.body(request);
        const current = this.providerItems.get(actor.sub) ?? [];
        const newItem = {
          id: this.nextId("prov-item"),
          provider_id: actor.sub,
          domain: body.domain ?? "food",
          name: body.name ?? "Dịch vụ mới",
          description: body.description ?? "",
          price: Number(body.price ?? 50000),
          currency: "VND",
          category: body.category ?? "Chung",
          is_available: true,
          created_at: isoNow(),
        };
        current.push(newItem);
        this.providerItems.set(actor.sub, current);
        return this.ok(route, newItem);
      }
    }

    const itemStatusMatch = path.match(/^\/api\/v1\/provider\/services\/items\/([^/]+)\/status$/);
    if (itemStatusMatch && method === "PATCH") {
      if (actor.role !== "provider") return this.fail(route, 403, "FORBIDDEN", "Forbidden");
      const id = decodeURIComponent(itemStatusMatch[1]);
      const current = this.providerItems.get(actor.sub) ?? [];
      const item = current.find((i) => i.id === id);
      if (item) {
        const body = await this.body(request);
        const newAvail = body.is_available ?? !item.is_available;
        item.is_available = newAvail;
        (item as JsonRecord).isAvailable = newAvail;
      }
      return this.ok(route, item ?? { updated: true });
    }

    const itemDeleteMatch = path.match(/^\/api\/v1\/provider\/services\/items\/([^/]+)$/);
    if (itemDeleteMatch && method === "DELETE") {
      if (actor.role !== "provider") return this.fail(route, 403, "FORBIDDEN", "Forbidden");
      const id = decodeURIComponent(itemDeleteMatch[1]);
      const current = this.providerItems.get(actor.sub) ?? [];
      this.providerItems.set(actor.sub, current.filter((i) => i.id !== id));
      return this.ok(route, { deleted: true });
    }

    if (path === "/api/v1/provider/services/operations/rides" && method === "GET") {
      if (actor.role !== "provider") return this.fail(route, 403, "FORBIDDEN", "Forbidden");
      return this.ok(route, {
        items: [
          {
            id: "ride-op-1",
            passenger_name: "Nguyễn Văn A",
            pickup_address: "123 Lê Lợi, Quận 1",
            dropoff_address: "456 Nguyễn Huệ, Quận 1",
            fare_amount: 55000,
            currency: "VND",
            status: "DRIVER_TO_PICKUP",
            passengers: 1,
            created_at: isoNow(),
          },
        ],
      });
    }

    if (path === "/api/v1/provider/services/operations/orders" && method === "GET") {
      if (actor.role !== "provider") return this.fail(route, 403, "FORBIDDEN", "Forbidden");
      return this.ok(route, {
        items: [
          {
            id: "order-op-1",
            customer_name: "Trần Thị B",
            items: [{ name: "Cơm tấm sườn bì chả", quantity: 2, price: 65000 }],
            total_amount: 130000,
            status: "RECEIVED",
            created_at: isoNow(),
          },
        ],
      });
    }

    if (path === "/api/v1/provider/services/operations/appointments" && method === "GET") {
      if (actor.role !== "provider") return this.fail(route, 403, "FORBIDDEN", "Forbidden");
      return this.ok(route, {
        items: [
          {
            id: "appt-op-1",
            patient_name: "Lê Văn C",
            specialty: "Khám Nội tổng quát",
            type: "offline",
            status: "CONFIRMED",
            start_time: isoNow(),
          },
        ],
      });
    }

    if (path.startsWith("/api/v1/provider/services/operations/rides/") && method === "PATCH") {
      if (actor.role !== "provider") return this.fail(route, 403, "FORBIDDEN", "Forbidden");
      return this.ok(route, { updated: true });
    }

    if (path.startsWith("/api/v1/provider/services/operations/orders/") && method === "PATCH") {
      if (actor.role !== "provider") return this.fail(route, 403, "FORBIDDEN", "Forbidden");
      return this.ok(route, { updated: true });
    }

    if (path.startsWith("/api/v1/provider/services/operations/appointments/") && method === "PATCH") {
      if (actor.role !== "provider") return this.fail(route, 403, "FORBIDDEN", "Forbidden");
      return this.ok(route, { updated: true });
    }

    if (path === "/api/v1/provider/services/operations/seed-sample" && method === "POST") {
      if (actor.role !== "provider") return this.fail(route, 403, "FORBIDDEN", "Forbidden");
      return this.ok(route, { success: true, booking_id: "ride-op-sample-100" });
    }

    if (path === "/api/v1/provider/services/webhook/test" && method === "POST") {
      if (actor.role !== "provider") return this.fail(route, 403, "FORBIDDEN", "Forbidden");
      return this.ok(route, {
        success: true,
        status_code: 200,
        status_text: "OK",
        latency_ms: 38,
        signature_sent: "sha256=mock_signature_test_abc123",
        response_body: JSON.stringify({ acknowledged: true, test_received: true }),
        target_url: "https://api.partner.test/v1/webhook",
        event_sent: "food.order.created",
      });
    }

    if (path === "/api/v1/provider/services/earnings/summary" && method === "GET") {
      if (actor.role !== "provider") return this.fail(route, 403, "FORBIDDEN", "Forbidden");
      return this.ok(route, {
        gross_revenue: 1250000,
        completed_orders: 8,
        completed_rides: 5,
        total_completed_transactions: 13,
        platform_fee: 125000,
        platform_fee_rate: "10%",
        net_payout: 1125000,
        currency: "VND",
        payout_status: "AVAILABLE_FOR_SETTLEMENT",
        last_calculated_at: isoNow(),
      });
    }

    if (path === "/api/v1/admin/feature-flags" && method === "GET") {
      return this.ok(route, {
        items: [
          { flag_key: "ride_service_enabled", enabled: true, description: "Dịch vụ Chuyến xe", updated_at: isoNow() },
          { flag_key: "food_service_enabled", enabled: true, description: "Dịch vụ Ẩm thực", updated_at: isoNow() },
          { flag_key: "restaurant_service_enabled", enabled: true, description: "Dịch vụ Đặt bàn", updated_at: isoNow() },
          { flag_key: "healthcare_service_enabled", enabled: true, description: "Dịch vụ Khám bệnh", updated_at: isoNow() },
        ],
      });
    }

    if (path.startsWith("/api/v1/admin/feature-flags/") && method === "PATCH") {
      return this.ok(route, { updated: true });
    }

    if (path.startsWith("/api/v1/admin/audit-logs") && method === "GET") {
      return this.ok(route, {
        items: [
          {
            id: "aud-mock-1",
            actor_id: actor.sub,
            actor_role: actor.role,
            action: "SYSTEM_BOOT",
            resource_type: "system",
            details: { status: "ready" },
            created_at: isoNow(),
          },
        ],
        total: 1,
      });
    }

    if (path === "/api/v1/admin/operations/recovery/compensate" && method === "POST") {
      return this.ok(route, {
        success: true,
        voucher_code: "COMP-MOCK88",
        amount: 50000,
        message: "Đã phát hành mã ưu đãi COMP-MOCK88 trị giá 50.000 VND đền bù sự cố workflow.",
      });
    }

    return this.fail(route, 404, "NOT_FOUND", `${method} ${path} is not part of the fixture`);
  }

  private async chat(route: Route, actor: MockUser): Promise<void> {
    const body = await this.body(route.request());
    const id = String(body.conversation_id ?? this.nextId("conversation"));
    this.latestConversationId = id;
    const key = this.conversationKey(actor.sub, id);
    const conversation = this.conversations.get(key) ?? this.makeConversation(id, "Cuộc trò chuyện E2E", actor.sub);
    const message = String(body.message ?? "");
    (conversation.messages as JsonRecord[]).push({ role: "user", content: message, createdAt: isoNow() });
    const collapsible = message.includes("collapsible-e2e");
    const progressFixture = message.includes("progress-e2e");
    if (progressFixture) {
      // Slow deterministic response so the progress indicator stays observable in E2E.
      await new Promise((resolve) => setTimeout(resolve, 3500));
    }
    const response = progressFixture
      ? {
          conversation_id: id,
          message: "Mình đã đặt bàn thành công, nhưng chưa thể đặt chuyến xe.",
          items: [
            { kind: "task_error", title: "Không thể đặt chuyến xe", note: "Chưa tìm được tài xế phù hợp.", error_code: "RIDE_NO_DRIVER", retryable: true, action_id: "action-ride-retry" },
          ],
          actions: [{ id: "action-ride-retry", kind: "ride_service", label: "Thử lại đặt chuyến xe" }],
          completed: [{ kind: "reservation", title: "Đặt bàn tại Quán E2E", restaurant: { name: "Quán E2E" }, status: "CONFIRMED" }],
          workflow_status: "PARTIAL_SUCCESS",
        }
      : collapsible
      ? {
          conversation_id: id,
          message: "Mình đã chuẩn bị các thẻ dịch vụ để kiểm tra tính năng thu gọn.",
          items: [
            {
              kind: "restaurant_options",
              title: "Nhà hàng phù hợp",
              options: [
                { name: "Quán E2E 1", address: "12 Hoàn Kiếm, Hà Nội", cuisine: "Việt Nam" },
                { name: "Quán E2E 2", address: "25 Tràng Tiền, Hà Nội", cuisine: "Việt Nam" },
                { name: "Quán E2E 3", address: "8 Lý Thường Kiệt, Hà Nội", cuisine: "Việt Nam" },
              ],
            },
            {
              kind: "ride_quote",
              title: "Ước tính chuyến đi",
              pickup: "VinUni",
              dropoff: "Hồ Gươm",
              vehicle: "Xe 4 chỗ",
              amount: 98000,
              currency: "VND",
              status: "QUOTE_CREATED",
            },
          ],
          actions: [],
          completed: [],
          workflow_status: "RUNNING",
        }
      : { conversation_id: id, message: "Mình đã ghi nhận yêu cầu trong chế độ deterministic E2E.", items: [], actions: [], completed: [{ kind: "progress", title: "Đã lưu yêu cầu" }], workflow_status: "COMPLETED" };
    (conversation.messages as JsonRecord[]).push({ role: "assistant", content: response.message, createdAt: isoNow(), data: response });
    conversation.updatedAt = isoNow();
    this.conversations.set(key, conversation);
    return this.ok(route, response);
  }

  private async executeConfirmation(route: Route, actor: MockUser, path: string): Promise<void> {
    if (path.includes("food-confirm-1")) {
      const order = { id: "food-order-1", status: "CONFIRMED", amount: 90000, currency: "VND" };
      this.resources.set(`${actor.sub}:food-order-1`, { id: order.id, status: order.status, amount: order.amount, currency: order.currency, payment: { status: "SUCCEEDED", method: "card", receipt_id: "receipt-food-1", receipt: { receipt_id: "receipt-food-1" } } });
      return this.ok(route, { order, payment: { status: "SUCCEEDED", receipt_id: "receipt-food-1" } });
    }
    if (path.includes("restaurant-confirm-1")) {
      const reservation = { id: "reservation-1", reservation_code: "RES-E2E", status: "CONFIRMED" };
      this.resources.set(`${actor.sub}:reservation-1`, { id: reservation.id, reservation_code: reservation.reservation_code, status: reservation.status });
      return this.ok(route, { tool_result: { data: reservation } });
    }
    if (path.includes("healthcare-confirm-1")) {
      const appointment = { appointment_id: 91, doctor_name: "Bác sĩ E2E", status: "CONFIRMED", start_time: isoNow(), price: 300000 };
      this.resources.set(`${actor.sub}:91`, appointment);
      return this.ok(route, { tool_result: { data: appointment } });
    }
    return this.ok(route, { message: "Đã xác nhận.", tool_result: { data: { status: "CONFIRMED" } } });
  }

  private async tracking(route: Route, actor: MockUser): Promise<void> {
    const booking = this.bookings.get(this.bookingKey(actor.sub));
    if (!booking) return this.denied(route, route.request().url());
    if (this.options.noDriver) booking.status = "NO_DRIVER";
    else {
      const states = ["SEARCHING_DRIVER", "DRIVER_ASSIGNED", "DRIVER_TO_PICKUP", "DRIVER_ARRIVED", "IN_PROGRESS", "COMPLETED"];
      const index = Math.min(Number(booking.trackingCalls ?? 0), states.length - 1);
      booking.status = states[index];
      booking.trackingCalls = index + 1;
    }
    const progress = booking.status === "COMPLETED" ? 1 : Math.min(0.95, Number(booking.trackingCalls ?? 1) / 6);
    return this.ok(route, { booking_id: String(booking.id), status: booking.status, progress, eta_seconds: booking.status === "COMPLETED" || booking.status === "NO_DRIVER" ? 0 : 180, driver: booking.status === "NO_DRIVER" ? null : { id: "driver-e2e", name: "Tài xế E2E" }, driver_location: { latitude: 10.778, longitude: 106.702 }, current_location: { latitude: 10.778, longitude: 106.702 }, route: { provider: "deterministic-fixture", distance_meters: 2400, duration_seconds: 720, origin: { latitude: 10.7769, longitude: 106.7009 }, destination: { latitude: 10.779, longitude: 106.704 }, polyline: JSON.stringify([{ latitude: 10.7769, longitude: 106.7009 }, { latitude: 10.779, longitude: 106.704 }]) }, route_provider: "deterministic-fixture", updated_at: isoNow() });
  }

  private historyFor(sub: string): JsonRecord {
    const items = [...this.resources.entries()].filter(([key]) => key.startsWith(`${sub}:`)).map(([key, resource]) => {
      const id = key.split(":")[1];
      const type = id.startsWith("food") ? "food_order" : id.startsWith("reservation") ? "restaurant_reservation" : id === "91" ? "healthcare_appointment" : "ride_booking";
      return { id, type, title: type.replaceAll("_", " "), status: String(resource.status ?? "CONFIRMED"), detail: "Fixture resource", timestamp: isoNow(), source: type, resource };
    });
    return { items, total: items.length, page: 1, page_size: 20, has_more: false, partial: false, unavailable: [] };
  }

  private makeUser(email: string, onboarding: boolean, fullName = "Người dùng E2E", role?: "user" | "customer" | "manager" | "provider" | "admin"): MockUser {
    return { sub: `user-${email.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`, email, full_name: fullName, phone: "0900000000", ...(onboarding ? { onboarding_completed_at: isoNow() } : {}), role: role ?? this.options.role ?? "user", status: "active", authentication_kind: "real", language: "vi", timezone: "Asia/Ho_Chi_Minh" };
  }

  private makeAddress(id: string, label: string, text: string, isDefault: boolean, source: JsonRecord = {}): JsonRecord { return { id, label, address_text: text, city: "Hồ Chí Minh", latitude: Number(source.latitude ?? 10.7769), longitude: Number(source.longitude ?? 106.7009), provider: "deterministic-fixture", source: "geocoded", is_default: isDefault, created_at: isoNow(), updated_at: isoNow() }; }
  private makeConversation(id: string, title: string, actorId = this.user.sub, serviceContext = ""): JsonRecord { return { conversationId: id, actorId, title, status: "ACTIVE", createdAt: isoNow(), updatedAt: isoNow(), messages: [], state: {}, ...(serviceContext ? { serviceContext } : {}) }; }
  private nextId(prefix: string): string { this.sequence += 1; return `${prefix}-${this.sequence}`; }
  private actorFor(authorization?: string): MockUser | undefined { const token = authorization?.replace(/^Bearer\s+/i, ""); const sub = token ? this.tokens.get(token) : undefined; return sub ? this.users.get(sub) : undefined; }
  private authSuccess(route: Route, user: MockUser, refreshToken = this.seedRefreshToken(user.sub)): Promise<void> {
    const token = `e2e-token-${user.sub}`;
    this.tokens.set(token, user.sub);
    return this.ok(route, { access_token: token, token_type: "bearer", expires_in: 3600, user }, refreshToken);
  }
  private seedRefreshToken(userSub: string): string {
    const token = `e2e-refresh-${userSub}-${++this.sequence}`;
    this.refreshTokens.set(token, { userSub, consumed: false });
    this.refreshUserSub = userSub;
    return token;
  }
  private async waitForRefreshPair(): Promise<void> {
    this.waitingRefreshes += 1;
    if (this.waitingRefreshes === 2) this.releaseRefreshes?.();
    while (this.waitingRefreshes < 2) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  private cookieValue(header: string | undefined, name: string): string | undefined {
    return header?.split(";").map((part) => part.trim()).map((part) => part.split("=")).find(([key]) => key === name)?.slice(1).join("=");
  }
  private async body(request: { postData(): string | null }): Promise<JsonRecord> { const raw = request.postData(); if (!raw) return {}; try { const parsed: unknown = JSON.parse(raw); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonRecord : {}; } catch { return {}; } }
  private async ok(route: Route, data: unknown, refreshToken?: string): Promise<void> {
    await route.fulfill({ status: 200, contentType: "application/json", ...(refreshToken ? { headers: { "Set-Cookie": `xone_refresh=${refreshToken}; Path=/api/v1/auth; HttpOnly; SameSite=Lax` } } : {}), body: JSON.stringify({ data }) });
  }
  private async fail(route: Route, status: number, code: string, detail: string): Promise<void> { await route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ code, detail, retryable: status >= 500 }) }); }
  private async denied(route: Route, path: string): Promise<void> { this.deniedRequests.push(path); return this.fail(route, 403, "RESOURCE_FORBIDDEN", "Resource does not belong to this account"); }
  private conversationKey(sub: string, id: string): string { return `${sub}:${id}`; }
  private cartKey(sub: string): string { return `${sub}:cart`; }
  private quoteKey(sub: string): string { return `${sub}:quote`; }
  private bookingKey(sub: string): string { return `${sub}:booking`; }
}

export async function installAuthenticatedFixture(context: BrowserContext, options: MockGatewayOptions = {}): Promise<MockGateway> {
  const gateway = new MockGateway({ autoLogin: true, onboardingComplete: true, ...options });
  await gateway.install(context);
  const refreshToken = gateway.initialRefreshToken();
  if (refreshToken) await context.addCookies([{ name: "xone_refresh", value: refreshToken, domain: "localhost", path: "/api/v1/auth", httpOnly: true, sameSite: "Lax" }]);
  return gateway;
}
