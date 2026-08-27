import type { BrowserContext, Route } from "@playwright/test";

type JsonRecord = Record<string, unknown>;
type MockGatewayOptions = {
  autoLogin?: boolean;
  email?: string;
  onboardingComplete?: boolean;
  noDriver?: boolean;
  foreignIds?: string[];
};

type MockUser = {
  sub: string;
  email: string;
  full_name: string;
  phone: string;
  onboarding_completed_at?: string;
  role: "user";
  status: "active";
  authentication_kind: "real";
  language: "vi";
  timezone: "Asia/Ho_Chi_Minh";
};

const isoNow = (): string => new Date().toISOString();

export class MockGateway {
  readonly user: MockUser;
  readonly deniedRequests: string[] = [];
  readonly calls: Array<{ method: string; path: string; actor: string }> = [];

  private readonly options: MockGatewayOptions;
  private readonly users = new Map<string, MockUser>();
  private readonly tokens = new Map<string, string>();
  private readonly addresses = new Map<string, JsonRecord[]>();
  private readonly conversations = new Map<string, JsonRecord>();
  private readonly carts = new Map<string, JsonRecord>();
  private readonly bookings = new Map<string, JsonRecord>();
  private readonly quotes = new Map<string, JsonRecord>();
  private readonly resources = new Map<string, JsonRecord>();
  private refreshUserSub: string | null;
  private sequence = 0;

  constructor(options: MockGatewayOptions = {}) {
    this.options = options;
    this.user = this.makeUser(options.email ?? "e2e.user@example.test", options.onboardingComplete ?? true);
    this.users.set(this.user.sub, this.user);
    this.refreshUserSub = options.autoLogin ? this.user.sub : null;
    this.addresses.set(this.user.sub, []);
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

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method().toUpperCase();
    const actor = this.actorFor(request.headers().authorization);
    this.calls.push({ method, path, actor: actor?.sub ?? "anonymous" });

    if (path === "/api/v1/auth/refresh" && method === "POST") {
      if (!this.refreshUserSub) return this.fail(route, 401, "AUTHENTICATION_REQUIRED", "No active session");
      const user = this.users.get(this.refreshUserSub);
      return user ? this.authSuccess(route, user) : this.fail(route, 401, "AUTHENTICATION_REQUIRED", "No active session");
    }
    if (path === "/api/v1/auth/register" && method === "POST") {
      const body = await this.body(request);
      const email = String(body.email ?? "new.user@example.test");
      const user = this.makeUser(email, false, String(body.full_name ?? "Người dùng E2E"));
      this.users.set(user.sub, user);
      this.addresses.set(user.sub, []);
      this.refreshUserSub = user.sub;
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
    if (path === "/api/v1/healthcare/patients" && method === "GET") return this.ok(route, { items: [{ id: 7, name: "Người bệnh E2E", phone: "0900000000", relationship: "self", is_default: true }] });
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

    return this.fail(route, 404, "NOT_FOUND", `${method} ${path} is not part of the fixture`);
  }

  private async chat(route: Route, actor: MockUser): Promise<void> {
    const body = await this.body(route.request());
    const id = String(body.conversation_id ?? this.nextId("conversation"));
    const key = this.conversationKey(actor.sub, id);
    const conversation = this.conversations.get(key) ?? this.makeConversation(id, "Cuộc trò chuyện E2E", actor.sub);
    const message = String(body.message ?? "");
    (conversation.messages as JsonRecord[]).push({ role: "user", content: message, createdAt: isoNow() });
    const response = { conversation_id: id, message: "Mình đã ghi nhận yêu cầu trong chế độ deterministic E2E.", items: [], actions: [], completed: [{ kind: "progress", title: "Đã lưu yêu cầu" }], workflow_status: "COMPLETED" };
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

  private makeUser(email: string, onboarding: boolean, fullName = "Người dùng E2E"): MockUser {
    return { sub: `user-${email.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`, email, full_name: fullName, phone: "0900000000", ...(onboarding ? { onboarding_completed_at: isoNow() } : {}), role: "user", status: "active", authentication_kind: "real", language: "vi", timezone: "Asia/Ho_Chi_Minh" };
  }

  private makeAddress(id: string, label: string, text: string, isDefault: boolean, source: JsonRecord = {}): JsonRecord { return { id, label, address_text: text, city: "Hồ Chí Minh", latitude: Number(source.latitude ?? 10.7769), longitude: Number(source.longitude ?? 106.7009), provider: "deterministic-fixture", source: "geocoded", is_default: isDefault, created_at: isoNow(), updated_at: isoNow() }; }
  private makeConversation(id: string, title: string, actorId = this.user.sub, serviceContext = ""): JsonRecord { return { conversationId: id, actorId, title, status: "ACTIVE", createdAt: isoNow(), updatedAt: isoNow(), messages: [], state: {}, ...(serviceContext ? { serviceContext } : {}) }; }
  private nextId(prefix: string): string { this.sequence += 1; return `${prefix}-${this.sequence}`; }
  private actorFor(authorization?: string): MockUser | undefined { const token = authorization?.replace(/^Bearer\s+/i, ""); const sub = token ? this.tokens.get(token) : undefined; return sub ? this.users.get(sub) : undefined; }
  private authSuccess(route: Route, user: MockUser): Promise<void> { const token = `e2e-token-${user.sub}`; this.tokens.set(token, user.sub); return this.ok(route, { access_token: token, token_type: "bearer", expires_in: 3600, user }); }
  private async body(request: { postData(): string | null }): Promise<JsonRecord> { const raw = request.postData(); if (!raw) return {}; try { const parsed: unknown = JSON.parse(raw); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonRecord : {}; } catch { return {}; } }
  private async ok(route: Route, data: unknown): Promise<void> { await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) }); }
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
  return gateway;
}
