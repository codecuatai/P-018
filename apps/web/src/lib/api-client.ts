"use client";

import type { ActiveHistoryResult, AdminApiKeyRecord, AdminFeedbackSummary, AdminHealthCheck, AdminLogEntry, AdminPayments, AdminSummary, AdminTokenUsageReport, AdminTransactionRecord, AdminUserRecord, AdminUserServiceSummary, AdminWorkflowRecord, AssistantResponse, AuthSessionSummary, AuthUser, ConversationRecord, DeviceCurrentLocation, FavoriteDomain, FavoriteItem, FeedbackItem, FeedbackResourceType, GeocodeResult, HealthcarePatient, HistoryFilters, HistoryResult, HistoryType, NotificationItem, RideQuote, RideStopover, RideTracking, RouteResult, SavedAddress, ServiceCatalog, SupportPriority, SupportTicket, SupportTicketStatus } from "@/types";

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export interface ApiProblem {
  code: string;
  detail: string;
  status: number;
  retryable: boolean;
  requestId?: string;
}

export class ApiError extends Error implements ApiProblem {
  readonly code: string;
  readonly detail: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly requestId?: string;

  constructor(problem: ApiProblem) {
    super(problem.detail);
    this.name = "ApiError";
    this.code = problem.code;
    this.detail = problem.detail;
    this.status = problem.status;
    this.retryable = problem.retryable;
    this.requestId = problem.requestId;
  }
}

interface RequestOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  includeAuth?: boolean;
  retryAuth?: boolean;
  suppressUnauthorized?: boolean;
  retried?: boolean;
}

interface AuthResult {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

export interface ForgotPasswordResult {
  accepted: boolean;
  delivery_configured: boolean;
}

export type RefreshOutcome = "authenticated" | "invalid" | "transient";

export interface RefreshResult {
  outcome: RefreshOutcome;
  token: string | null;
  problem?: ApiProblem;
}

let accessToken: string | null = null;
let unauthorizedHandler: (() => void) | undefined;
let refreshInFlight: Promise<RefreshResult> | undefined;

export function configureApiClient(options: { onUnauthorized?: () => void }): void {
  unauthorizedHandler = options.onUnauthorized;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAuthSession(): void {
  accessToken = null;
}

export function createRequestId(prefix = "web"): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${uuid ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

export function createIdempotencyKey(prefix: string): string {
  return createRequestId(prefix).replace(/[^a-zA-Z0-9:_-]/g, "-");
}

export async function request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  const abortListener = () => controller.abort();
  options.signal?.addEventListener("abort", abortListener, { once: true });
  if (options.signal?.aborted) controller.abort();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && init.body !== null) headers.set("Content-Type", "application/json; charset=utf-8");
  const correlationId = createRequestId("cor");
  headers.set("X-Correlation-Id", correlationId);
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
  if (options.includeAuth !== false && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, signal: controller.signal, credentials: "include" });
    const body = await parseJson(response);
    if (!response.ok) {
      const problem = problemFromResponse(body, response.status);
      if (response.status === 401 && shouldRefresh(path, problem, options)) {
        const refreshed = await refreshAccessToken(correlationId);
        if (refreshed.outcome === "authenticated" && refreshed.token) return request<T>(path, init, { ...options, retried: true });
        if (refreshed.outcome === "transient") throw temporaryRefreshError(refreshed.problem?.requestId ?? correlationId);
      }
      if (response.status === 401 && !options.suppressUnauthorized && isSessionAuthError(problem)) {
        // If a refresh is currently in flight (triggered by another concurrent request),
        // wait for it before giving up and clearing the session.
        if (refreshInFlight) {
          const refreshed = await refreshInFlight;
          if (refreshed.outcome === "authenticated" && refreshed.token) return request<T>(path, init, { ...options, retried: true });
          if (refreshed.outcome === "transient") throw temporaryRefreshError(refreshed.problem?.requestId ?? correlationId);
        }
        clearAuthSession();
        unauthorizedHandler?.();
      }
      throw new ApiError(problem);
    }
    if (response.status === 204) return undefined as T;
    if (!isRecord(body) || !("data" in body)) {
      throw new ApiError({ code: "INVALID_RESPONSE", detail: "X-One nhận được dữ liệu không hợp lệ.", status: response.status, retryable: false });
    }
    return body.data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      // A caller-supplied signal means the user cancelled on purpose: rethrow the
      // raw AbortError so the UI can mark the turn as stopped. The internal
      // timeout keeps mapping to a retryable REQUEST_TIMEOUT.
      if (options.signal?.aborted) throw error;
      throw new ApiError({ code: "REQUEST_TIMEOUT", detail: "X-One phản hồi hơi chậm. Bạn thử lại nhé.", status: 408, retryable: true });
    }
    throw new ApiError({ code: "SERVICE_UNAVAILABLE", detail: "X-One đang gặp sự cố kết nối. Bạn thử lại sau một chút nhé.", status: 0, retryable: true });
  } finally {
    globalThis.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortListener);
  }
}

export async function refreshAccessToken(triggerCorrelationId?: string): Promise<RefreshResult> {
  if (!refreshInFlight) {
    refreshInFlight = rawRefresh(triggerCorrelationId).finally(() => {
      refreshInFlight = undefined;
    });
  }
  return refreshInFlight;
}

export async function login(email: string, password: string, shouldCommit?: () => boolean): Promise<AuthUser> {
  const result = await request<AuthResult>("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, { includeAuth: false, retryAuth: false });
  if (!shouldCommit || shouldCommit()) setAccessToken(result.access_token);
  return result.user;
}

export async function getGoogleAuthUrl(): Promise<string> {
  const result = await request<{ url: string }>("/api/v1/auth/google/url", { method: "GET" }, { includeAuth: false, retryAuth: false });
  return result.url;
}

export async function loginWithGoogle(code: string, redirectUri?: string, shouldCommit?: () => boolean): Promise<AuthUser> {
  const result = await request<AuthResult>("/api/v1/auth/google", { method: "POST", body: JSON.stringify({ code, redirect_uri: redirectUri }) }, { includeAuth: false, retryAuth: false });
  if (!shouldCommit || shouldCommit()) setAccessToken(result.access_token);
  return result.user;
}

export interface RegisterOptions {
  role?: "customer" | "provider";
  providerType?: "ride_driver" | "restaurant_merchant" | "healthcare_doctor";
  businessName?: string;
  phone?: string;
  address?: string;
}

export async function register(
  fullName: string,
  email: string,
  password: string,
  options?: RegisterOptions,
  shouldCommit?: () => boolean,
): Promise<AuthUser> {
  const result = await request<AuthResult>(
    "/api/v1/auth/register",
    {
      method: "POST",
      body: JSON.stringify({
        full_name: fullName,
        email,
        password,
        role: options?.role,
        provider_type: options?.providerType,
        business_name: options?.businessName,
        phone: options?.phone,
        address: options?.address,
      }),
    },
    { includeAuth: false, retryAuth: false },
  );
  if (!shouldCommit || shouldCommit()) setAccessToken(result.access_token);
  return result.user;
}

export function getCurrentUser(): Promise<AuthUser> {
  return request<AuthUser>("/api/v1/auth/me", { method: "GET" });
}

export function getProfile(): Promise<AuthUser> {
  return request<AuthUser>("/api/v1/users/me", { method: "GET" });
}

export async function updateProfile(patch: Partial<Pick<AuthUser, "full_name" | "phone" | "avatar_url" | "language" | "timezone">> & { onboarding_completed?: boolean }): Promise<AuthUser> {
  const updated = await request<AuthUser>("/api/v1/users/me", { method: "PATCH", body: JSON.stringify(patch) });
  if (patch.phone && updated.phone !== patch.phone) {
    throw new ApiError({
      code: "PROFILE_PHONE_NOT_PERSISTED",
      detail: "Hồ sơ không trả về số điện thoại vừa lưu.",
      status: 502,
      retryable: true,
    });
  }
  return updated;
}

export function listSavedAddresses(): Promise<{ items: SavedAddress[] }> {
  return request("/api/v1/addresses", { method: "GET" });
}

export function createSavedAddress(value: Omit<SavedAddress, "id" | "created_at" | "updated_at" | "is_default"> & { is_default?: boolean }): Promise<SavedAddress> {
  return request("/api/v1/addresses", { method: "POST", body: JSON.stringify(value) }, { idempotencyKey: createIdempotencyKey("address") });
}

export function updateSavedAddress(id: string, value: Partial<SavedAddress>): Promise<SavedAddress> {
  return request(`/api/v1/addresses/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(value) });
}

export function setSavedAddressDefault(id: string): Promise<SavedAddress> {
  return request(`/api/v1/addresses/${encodeURIComponent(id)}/default`, { method: "POST" });
}

export function deleteSavedAddress(id: string): Promise<{ deleted: boolean }> {
  return request(`/api/v1/addresses/${encodeURIComponent(id)}`, { method: "DELETE" }, { retryAuth: false });
}

export function listHealthcarePatients(): Promise<{ items: HealthcarePatient[] }> {
  return request("/api/v1/healthcare/patients", { method: "GET" });
}

export function createHealthcarePatient(value: { name: string; phone: string; relationship: HealthcarePatient["relationship"]; blood_type?: string; medical_history?: string }): Promise<HealthcarePatient> {
  return request("/api/v1/healthcare/patients", { method: "POST", body: JSON.stringify(value) }, { idempotencyKey: createIdempotencyKey("patient") });
}

export function setDefaultHealthcarePatient(id: number): Promise<HealthcarePatient> {
  return request(`/api/v1/healthcare/patients/${encodeURIComponent(String(id))}/default`, { method: "POST" }, { idempotencyKey: createIdempotencyKey("patient-default") });
}

export function updateHealthcarePatient(id: number, value: Partial<Pick<HealthcarePatient, "name" | "phone" | "relationship">>): Promise<HealthcarePatient> {
  return request(`/api/v1/healthcare/patients/${encodeURIComponent(String(id))}`, { method: "PATCH", body: JSON.stringify(value) }, { idempotencyKey: createIdempotencyKey("patient-update") });
}

export function unlinkHealthcarePatient(id: number): Promise<{ deleted: boolean; id: number; replacement_default_id: number | null }> {
  return request(`/api/v1/healthcare/patients/${encodeURIComponent(String(id))}`, { method: "DELETE" }, { idempotencyKey: createIdempotencyKey("patient-unlink") });
}

export function resolveAddress(addressText: string): Promise<GeocodeResult> {
  return request("/api/v1/location/geocode", { method: "POST", body: JSON.stringify({ address_text: addressText }) });
}

export function autocompleteAddress(addressText: string): Promise<{ provider: string; query: string; suggestions: GeocodeResult["candidates"] }> {
  return request("/api/v1/location/autocomplete", { method: "POST", body: JSON.stringify({ address_text: addressText }) });
}

export function reverseGeocodeAddress(latitude: number, longitude: number): Promise<GeocodeResult> {
  return request("/api/v1/location/reverse-geocode", { method: "POST", body: JSON.stringify({ latitude, longitude }) });
}

export function routeLocation(origin: RouteResult["origin"], destination: RouteResult["destination"]): Promise<RouteResult> {
  return request("/api/v1/location/route", { method: "POST", body: JSON.stringify({ origin, destination }) });
}

export function listServiceCatalog(): Promise<ServiceCatalog> {
  return request("/api/v1/services/catalog", { method: "GET" });
}

export function getRideTracking(bookingId: string, signal?: AbortSignal): Promise<RideTracking> {
  return request(`/api/v1/rides/${encodeURIComponent(bookingId)}/tracking`, { method: "GET", signal });
}

export function getFoodTracking(orderId: string, signal?: AbortSignal): Promise<import("@/types").FoodTracking> {
  return request(`/api/v1/food/orders/${encodeURIComponent(orderId)}/tracking`, { method: "GET", signal });
}

export function browseService(
  service: "food" | "ride" | "restaurant" | "healthcare",
  keyword?: string,
  pagination?: { page?: number; limit?: number; offset?: number }
): Promise<{ items: Record<string, unknown>[]; total?: number; page?: number; limit?: number; total_pages?: number; source: string; partial: boolean }> {
  const params = new URLSearchParams();
  if (keyword?.trim()) params.set("q", keyword.trim());
  if (pagination?.page !== undefined) params.set("page", String(pagination.page));
  if (pagination?.limit !== undefined) params.set("limit", String(pagination.limit));
  if (pagination?.offset !== undefined) params.set("offset", String(pagination.offset));
  const query = params.toString() ? `?${params.toString()}` : "";
  return request(`/api/v1/services/${service}${query}`, { method: "GET" });
}

export function getFoodRestaurant(id: string): Promise<Record<string, unknown>> {
  return request(`/api/v1/service-actions/food/restaurants/${encodeURIComponent(id)}`, { method: "GET" });
}

export interface FoodMenuPage {
  restaurant: Record<string, unknown>;
  items: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}

export function getFoodMenu(id: string, pagination?: { limit?: number; offset?: number }): Promise<FoodMenuPage> {
  const params = new URLSearchParams();
  if (pagination?.limit !== undefined) params.set("limit", String(pagination.limit));
  if (pagination?.offset !== undefined) params.set("offset", String(pagination.offset));
  const query = params.toString() ? `?${params.toString()}` : "";
  return request(`/api/v1/service-actions/food/restaurants/${encodeURIComponent(id)}/menu${query}`, { method: "GET" });
}

export function createFoodCart(restaurantId: string): Promise<Record<string, unknown>> {
  return request("/api/v1/service-actions/food/cart", { method: "POST", body: JSON.stringify({ restaurant_id: restaurantId }) }, { idempotencyKey: createIdempotencyKey("food-cart") });
}

export function getFoodCart(cartId: string): Promise<Record<string, unknown>> {
  return request(`/api/v1/service-actions/food/cart/${encodeURIComponent(cartId)}`, { method: "GET" });
}

export function addFoodCartItem(cartId: string, value: { menu_item_id: string; quantity: number; selected_options?: Array<{ group_id: string; option_id: string }>; note?: string }): Promise<Record<string, unknown>> {
  return request(`/api/v1/service-actions/food/cart/${encodeURIComponent(cartId)}/items`, { method: "POST", body: JSON.stringify(value) }, { idempotencyKey: createIdempotencyKey("food-cart-item") });
}

export function updateFoodCartItem(cartId: string, itemId: string, value: { quantity: number; selected_options?: Array<{ group_id: string; option_id: string }> | null; note?: string }): Promise<Record<string, unknown>> {
  return request(`/api/v1/service-actions/food/cart/${encodeURIComponent(cartId)}/items/${encodeURIComponent(itemId)}`, { method: "PATCH", body: JSON.stringify(value) }, { idempotencyKey: createIdempotencyKey("food-cart-item-update") });
}

export function removeFoodCartItem(cartId: string, itemId: string): Promise<Record<string, unknown>> {
  return request(`/api/v1/service-actions/food/cart/${encodeURIComponent(cartId)}/items/${encodeURIComponent(itemId)}`, { method: "DELETE" }, { idempotencyKey: createIdempotencyKey("food-cart-item-remove") });
}

export function applyFoodVoucher(cartId: string, code: string): Promise<Record<string, unknown>> {
  return request(`/api/v1/service-actions/food/cart/${encodeURIComponent(cartId)}/voucher`, { method: "POST", body: JSON.stringify({ code }) }, { idempotencyKey: createIdempotencyKey("food-cart-voucher") });
}

export function removeFoodVoucher(cartId: string): Promise<Record<string, unknown>> {
  return request(`/api/v1/service-actions/food/cart/${encodeURIComponent(cartId)}/voucher`, { method: "DELETE" }, { idempotencyKey: createIdempotencyKey("food-cart-voucher-remove") });
}

export function prepareFoodOrder(value: { cart_id: string; address_id: string }): Promise<Record<string, unknown>> {
  return request("/api/v1/confirmations/food-order", { method: "POST", body: JSON.stringify(value) });
}

export function executeConfirmation(confirmationId: string, value: Record<string, unknown>): Promise<Record<string, unknown>> {
  return request(`/api/v1/confirmations/${encodeURIComponent(confirmationId)}/execute`, { method: "POST", body: JSON.stringify(value) }, { idempotencyKey: createIdempotencyKey("confirmation") });
}

export function prepareFoodCancellation(orderId: string): Promise<Record<string, unknown>> {
  return request("/api/v1/confirmations/food-order-cancellation", { method: "POST", body: JSON.stringify({ order_id: orderId }) });
}

export function executeCancellation(confirmationId: string): Promise<Record<string, unknown>> {
  return request(`/api/v1/confirmations/${encodeURIComponent(confirmationId)}/execute-cancellation`, { method: "POST", body: JSON.stringify({}) }, { idempotencyKey: createIdempotencyKey("food-cancel") });
}

export function getRestaurantDetail(id: string): Promise<Record<string, unknown>> {
  return request(`/api/v1/service-actions/restaurant/${encodeURIComponent(id)}`, { method: "GET" });
}

export function checkRestaurantAvailability(value: { restaurant_id: string; party_size: number; start_at: string; duration_minutes?: number }): Promise<Record<string, unknown>> {
  return request("/api/v1/service-actions/restaurant/availability", { method: "POST", body: JSON.stringify(value) });
}

export function createRestaurantHold(value: { restaurant_id: string; party_size: number; start_at: string; duration_minutes?: number }): Promise<Record<string, unknown>> {
  return request("/api/v1/service-actions/restaurant/hold", { method: "POST", body: JSON.stringify(value) }, { idempotencyKey: createIdempotencyKey("restaurant-hold") });
}

export function prepareRestaurantReservation(value: { restaurant_id: string; hold_id: string; party_size: number; start_at: string; duration_minutes?: number; special_requests?: string }): Promise<Record<string, unknown>> {
  return request("/api/v1/confirmations/restaurant-reservation", { method: "POST", body: JSON.stringify(value) });
}

export function cancelRestaurantReservation(id: string): Promise<Record<string, unknown>> {
  return request(`/api/v1/service-actions/restaurant/${encodeURIComponent(id)}/cancel`, { method: "POST" }, { idempotencyKey: createIdempotencyKey("restaurant-cancel") });
}

export function listHealthcareDoctors(department: string): Promise<Record<string, unknown>[]> {
  return request(`/api/v1/service-actions/healthcare/doctors?department=${encodeURIComponent(department)}`, { method: "GET" });
}

export function holdHealthcareSlot(value: { slot_id: number; patient_id?: number; symptoms: string }): Promise<Record<string, unknown>> {
  return request("/api/v1/service-actions/healthcare/hold", { method: "POST", body: JSON.stringify(value) }, { idempotencyKey: createIdempotencyKey("healthcare-hold") });
}

export function acknowledgeHealthcarePayment(appointmentId: number): Promise<Record<string, unknown>> {
  return request(`/api/v1/service-actions/healthcare/${encodeURIComponent(String(appointmentId))}/payment`, { method: "POST" }, { idempotencyKey: createIdempotencyKey("healthcare-payment") });
}

export function prepareHealthcareAppointment(appointmentId: number): Promise<Record<string, unknown>> {
  return request("/api/v1/confirmations/healthcare-appointment", { method: "POST", body: JSON.stringify({ appointment_id: appointmentId }) });
}

export function cancelHealthcareAppointment(appointmentId: number): Promise<Record<string, unknown>> {
  return request(`/api/v1/service-actions/healthcare/${encodeURIComponent(String(appointmentId))}/cancel`, { method: "POST" }, { idempotencyKey: createIdempotencyKey("healthcare-cancel") });
}

export function createRideQuote(value: { pickup_address: string; dropoff_address: string; vehicle_type: "BIKE" | "CAR_4" | "CAR_7"; pickup_latitude?: number; pickup_longitude?: number; dropoff_latitude?: number; dropoff_longitude?: number; stopovers?: RideStopover[] }): Promise<RideQuote> {
  return request("/api/v1/services/ride/quote", { method: "POST", body: JSON.stringify(value) }, { idempotencyKey: createIdempotencyKey("ride-quote") });
}

export function prepareRideBooking(quoteId: string): Promise<Record<string, unknown>> {
  return request("/api/v1/service-actions/ride/prepare", { method: "POST", body: JSON.stringify({ quote_id: quoteId }) }, { idempotencyKey: createIdempotencyKey("ride-prepare") });
}

export function confirmRideBooking(bookingId: string): Promise<Record<string, unknown>> {
  return request(`/api/v1/service-actions/ride/${encodeURIComponent(bookingId)}/confirm`, { method: "POST" }, { idempotencyKey: createIdempotencyKey("ride-confirm") });
}

export function cancelRideBooking(bookingId: string): Promise<Record<string, unknown>> {
  return request(`/api/v1/service-actions/ride/${encodeURIComponent(bookingId)}/cancel`, { method: "POST" }, { idempotencyKey: createIdempotencyKey("ride-cancel") });
}

export function listHistory(filters: HistoryFilters = {}): Promise<HistoryResult> {
  const params = new URLSearchParams();
  if (filters.service) params.set("service", filters.service);
  if (filters.status?.trim()) params.set("status", filters.status.trim());
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.page_size) params.set("page_size", String(filters.page_size));
  const query = params.toString();
  return request(`/api/v1/history${query ? `?${query}` : ""}`, { method: "GET" });
}

export function getActiveHistory(signal?: AbortSignal): Promise<ActiveHistoryResult> {
  return request("/api/v1/history/active", { method: "GET", signal });
}

export function getHistoryDetail(type: HistoryType, id: string): Promise<Record<string, unknown>> {
  return request(`/api/v1/history/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, { method: "GET" });
}

export function listNotifications(status?: "UNREAD" | "READ", page = 1, pageSize = 20): Promise<{ items: NotificationItem[]; unread_count: number; total: number; page: number; page_size: number; has_more: boolean; partial: boolean; unavailable: string[] }> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (status) params.set("status", status);
  const query = `?${params.toString()}`;
  return request(`/api/v1/notifications${query}`, { method: "GET" });
}

export function getUnreadNotificationCount(signal?: AbortSignal): Promise<{ unread_count: number; partial: boolean; unavailable: string[] }> {
  return request("/api/v1/notifications/unread-count", { method: "GET" }, { signal });
}

export function markNotificationRead(id: string): Promise<NotificationItem> {
  return request(`/api/v1/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
}

export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return request("/api/v1/notifications/read-all", { method: "POST" });
}

export function listFavorites(): Promise<{ items: FavoriteItem[] }> {
  return request("/api/v1/favorites", { method: "GET" });
}

export function createFavorite(domain: FavoriteDomain, resourceId: string): Promise<FavoriteItem> {
  return request("/api/v1/favorites", { method: "POST", body: JSON.stringify({ domain, resource_id: resourceId }) }, { idempotencyKey: createIdempotencyKey("favorite") });
}

export function deleteFavorite(id: string): Promise<{ deleted: boolean }> {
  return request(`/api/v1/favorites/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function listMyFeedback(): Promise<{ items: FeedbackItem[] }> {
  return request("/api/v1/feedback/mine", { method: "GET" });
}

export function submitFeedback(value: { domain: "food" | "ride" | "restaurant" | "healthcare"; resource_type: FeedbackResourceType; resource_id: string; rating: number; comment?: string }): Promise<FeedbackItem> {
  return request("/api/v1/feedback", { method: "POST", body: JSON.stringify(value) }, { idempotencyKey: createIdempotencyKey("feedback") });
}

export function listSupportTickets(options: { status?: SupportTicketStatus; page?: number; page_size?: number } = {}): Promise<{ items: SupportTicket[]; total: number }> {
  const query = new URLSearchParams();
  if (options.status) query.set("status", options.status);
  if (options.page) query.set("page", String(options.page));
  if (options.page_size) query.set("page_size", String(options.page_size));
  const encoded = query.toString();
  return request(`/api/v1/support/tickets${encoded ? `?${encoded}` : ""}`, { method: "GET" });
}

export function createSupportTicket(value: { subject: string; description: string; resource_type?: FeedbackResourceType; resource_id?: string; priority?: SupportPriority }): Promise<SupportTicket> {
  return request("/api/v1/support/tickets", { method: "POST", body: JSON.stringify(value) }, { idempotencyKey: createIdempotencyKey("support-ticket") });
}

export function getSupportTicket(id: string): Promise<SupportTicket> {
  return request(`/api/v1/support/tickets/${encodeURIComponent(id)}`, { method: "GET" });
}

export function addSupportMessage(id: string, message: string): Promise<SupportTicket> {
  return request(`/api/v1/support/tickets/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify({ message }) }, { idempotencyKey: createIdempotencyKey("support-message") });
}

export function prepareFoodReorder(orderId: string): Promise<Record<string, unknown>> {
  return request(`/api/v1/reorders/food/${encodeURIComponent(orderId)}`, { method: "POST", body: JSON.stringify({}) }, { idempotencyKey: createIdempotencyKey("food-reorder") });
}

export function prepareRideRebook(bookingId: string): Promise<Record<string, unknown>> {
  return request(`/api/v1/reorders/ride/${encodeURIComponent(bookingId)}`, { method: "POST", body: JSON.stringify({}) }, { idempotencyKey: createIdempotencyKey("ride-rebook") });
}

export function prepareRestaurantRebook(reservationId: string, value?: { start_at?: string; party_size?: number }): Promise<Record<string, unknown>> {
  return request(`/api/v1/reorders/restaurant/${encodeURIComponent(reservationId)}`, { method: "POST", body: JSON.stringify(value ?? {}) }, { idempotencyKey: createIdempotencyKey("restaurant-rebook") });
}

export function prepareHealthcareRebook(appointmentId: string): Promise<Record<string, unknown>> {
  return request(`/api/v1/reorders/healthcare/${encodeURIComponent(appointmentId)}`, { method: "POST", body: JSON.stringify({}) }, { idempotencyKey: createIdempotencyKey("healthcare-rebook") });
}

export function getAdminSummary(): Promise<AdminSummary> {
  return request("/api/v1/admin/summary", { method: "GET" });
}

export function getAdminUsers(page = 1, pageSize = 20): Promise<{ items: AdminUserRecord[]; total: number; page: number; page_size: number }> {
  return request(`/api/v1/admin/users?page=${page}&page_size=${pageSize}`, { method: "GET" });
}

export function updateAdminUserStatus(userId: string, status: "active" | "suspended"): Promise<AdminUserRecord> {
  return request(`/api/v1/admin/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updateAdminUserRole(userId: string, role: string): Promise<AdminUserRecord> {
  return request(`/api/v1/admin/users/${encodeURIComponent(userId)}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function updateRideStatus(bookingId: string, status: string): Promise<{ data: unknown; meta: { request_id?: string } }> {
  return request(`/api/v1/service-actions/ride/${encodeURIComponent(bookingId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  }, {
    idempotencyKey: createIdempotencyKey(`ride-status-${bookingId}`),
  });
}

export function getAdminTransactions(page = 1, pageSize = 20): Promise<{ items: AdminTransactionRecord[]; total?: number; page: number; page_size: number; partial: boolean; unavailable: string[] }> {
  return request(`/api/v1/admin/transactions?page=${page}&page_size=${pageSize}`, { method: "GET" });
}

export function getAdminPayments(page = 1, pageSize = 20): Promise<AdminPayments> {
  return request(`/api/v1/admin/payments?page=${page}&page_size=${pageSize}`, { method: "GET" });
}

export function getAdminWorkflows(page = 1, pageSize = 20): Promise<{ items: AdminWorkflowRecord[]; total: number; page: number; page_size: number }> {
  return request(`/api/v1/admin/workflows?page=${page}&page_size=${pageSize}`, { method: "GET" });
}

export function getAdminDatasets(): Promise<{ items: AdminSummary["datasets"] }> {
  return request("/api/v1/admin/datasets", { method: "GET" });
}

export function getAdminSystemHealth(): Promise<{ items: AdminHealthCheck[] }> {
  return request("/api/v1/admin/system-health", { method: "GET" });
}

export function getAdminSupportTickets(options: { status?: SupportTicketStatus; page?: number; page_size?: number } = {}): Promise<{ items: SupportTicket[]; total: number }> {
  const query = new URLSearchParams();
  if (options.status) query.set("status", options.status);
  query.set("page", String(options.page ?? 1));
  query.set("page_size", String(options.page_size ?? 20));
  return request(`/api/v1/admin/support-tickets?${query.toString()}`, { method: "GET" });
}

export function updateAdminSupportTicket(id: string, patch: { status?: SupportTicketStatus; priority?: SupportPriority }): Promise<SupportTicket> {
  return request(`/api/v1/admin/support-tickets/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }, { idempotencyKey: createIdempotencyKey("admin-support-update") });
}

export function addAdminSupportMessage(id: string, message: string): Promise<SupportTicket> {
  return request(`/api/v1/admin/support-tickets/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify({ message }) }, { idempotencyKey: createIdempotencyKey("admin-support-message") });
}

export function getAdminUserServices(userId: string): Promise<AdminUserServiceSummary> {
  return request(`/api/v1/admin/users/${encodeURIComponent(userId)}/services`, { method: "GET" });
}

export function getAdminUserFeedback(userId: string, page = 1, pageSize = 20): Promise<AdminFeedbackSummary> {
  return request(`/api/v1/admin/users/${encodeURIComponent(userId)}/feedback?page=${page}&page_size=${pageSize}`, { method: "GET" });
}

export function getAdminAllFeedback(filters: { domain?: string; rating_min?: number; rating_max?: number; from_time?: string; to_time?: string; page?: number; page_size?: number } = {}): Promise<AdminFeedbackSummary> {
  const query = new URLSearchParams();
  if (filters.domain) query.set("domain", filters.domain);
  if (filters.rating_min !== undefined) query.set("rating_min", String(filters.rating_min));
  if (filters.rating_max !== undefined) query.set("rating_max", String(filters.rating_max));
  if (filters.from_time) query.set("from_time", filters.from_time);
  if (filters.to_time) query.set("to_time", filters.to_time);
  query.set("page", String(filters.page ?? 1));
  query.set("page_size", String(filters.page_size ?? 20));
  return request(`/api/v1/admin/feedback?${query.toString()}`, { method: "GET" });
}

export function getAdminApiKeys(): Promise<{ items: AdminApiKeyRecord[] }> {
  return request("/api/v1/admin/api-keys", { method: "GET" });
}

export function postAdminApiKey(body: { provider: string; label: string; key: string; expires_at?: string }): Promise<AdminApiKeyRecord> {
  return request("/api/v1/admin/api-keys", { method: "POST", body: JSON.stringify(body) });
}

export function rotateAdminApiKey(id: string, body: { key: string; expires_at?: string }): Promise<AdminApiKeyRecord> {
  return request(`/api/v1/admin/api-keys/${encodeURIComponent(id)}/rotate`, { method: "PATCH", body: JSON.stringify(body) }, { idempotencyKey: createIdempotencyKey("admin-api-key-rotate") });
}

export function revokeAdminApiKey(id: string): Promise<AdminApiKeyRecord> {
  return request(`/api/v1/admin/api-keys/${encodeURIComponent(id)}/revoke`, { method: "PATCH" }, { idempotencyKey: createIdempotencyKey("admin-api-key-revoke") });
}

export function testAdminApiKey(id: string): Promise<{ success: boolean; message: string; latency_ms?: number }> {
  return request(`/api/v1/admin/api-keys/${encodeURIComponent(id)}/test`, { method: "POST" });
}

export function getAdminLogs(filters: { correlation_id?: string; actor_id?: string; action?: string; from_time?: string; to_time?: string; page?: number; page_size?: number } = {}): Promise<{ items: AdminLogEntry[]; total: number; page: number; page_size: number }> {
  const query = new URLSearchParams();
  if (filters.correlation_id) query.set("correlation_id", filters.correlation_id);
  if (filters.actor_id) query.set("actor_id", filters.actor_id);
  if (filters.action) query.set("action", filters.action);
  if (filters.from_time) query.set("from_time", filters.from_time);
  if (filters.to_time) query.set("to_time", filters.to_time);
  query.set("page", String(filters.page ?? 1));
  query.set("page_size", String(filters.page_size ?? 20));
  return request(`/api/v1/admin/logs?${query.toString()}`, { method: "GET" });
}

export function getAdminTokenUsage(filters: { from_time?: string; to_time?: string; feature?: string; model?: string } = {}): Promise<AdminTokenUsageReport> {
  const query = new URLSearchParams();
  if (filters.from_time) query.set("from_time", filters.from_time);
  if (filters.to_time) query.set("to_time", filters.to_time);
  if (filters.feature) query.set("feature", filters.feature);
  if (filters.model) query.set("model", filters.model);
  const qs = query.toString();
  return request(`/api/v1/admin/token-usage${qs ? `?${qs}` : ""}`, { method: "GET" });
}

export function listConversations(includeArchived = false, signal?: AbortSignal, page = 1, pageSize = 10): Promise<{ items: ConversationRecord[]; total: number; page: number; page_size: number; has_more: boolean }> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (includeArchived) params.set("include_archived", "true");
  return request(`/api/v1/conversations?${params.toString()}`, { method: "GET" }, { signal });
}

export function getConversation(id: string): Promise<ConversationRecord> {
  return request(`/api/v1/conversations/${encodeURIComponent(id)}`, { method: "GET" });
}

export function createConversation(title = "Cuộc trò chuyện mới", serviceContext?: string): Promise<ConversationRecord> {
  return request("/api/v1/conversations", { method: "POST", body: JSON.stringify({ title, ...(serviceContext ? { service_context: serviceContext } : {}) }) }, { idempotencyKey: createIdempotencyKey("conversation") });
}

export function updateConversation(id: string, patch: { title?: string; status?: "ACTIVE" | "ARCHIVED" }): Promise<ConversationRecord> {
  return request(`/api/v1/conversations/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deleteConversation(id: string): Promise<{ deleted: boolean }> {
  return request(`/api/v1/conversations/${encodeURIComponent(id)}`, { method: "DELETE" }, { retryAuth: false });
}

export async function logout(): Promise<void> {
  try {
    await request<{ logged_out: boolean }>("/api/v1/auth/logout", { method: "POST" }, { includeAuth: false, retryAuth: false, suppressUnauthorized: true });
  } finally {
    clearAuthSession();
  }
}

export async function logoutAll(): Promise<void> {
  try {
    await request<{ logged_out: boolean }>("/api/v1/auth/logout-all", { method: "POST" }, { retryAuth: false });
  } finally {
    clearAuthSession();
  }
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ password_changed: boolean; reauthentication_required: boolean }> {
  return request("/api/v1/auth/change-password", { method: "POST", body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) }, { retryAuth: true });
}

export function getSessions(): Promise<{ items: AuthSessionSummary[] }> {
  return request("/api/v1/auth/sessions", { method: "GET" });
}

export interface TwoFactorSetupResult {
  qr_code_url: string;
  secret: string;
  backup_codes: string[];
}

export interface TwoFactorVerifyResult {
  enabled: boolean;
  backup_codes: string[];
}

export function setup2FA(): Promise<TwoFactorSetupResult> {
  return request("/api/v1/auth/2fa/setup", { method: "GET" });
}

export function verify2FA(code: string): Promise<TwoFactorVerifyResult> {
  return request("/api/v1/auth/2fa/verify", { method: "POST", body: JSON.stringify({ code }) });
}

export function disable2FA(password: string): Promise<{ disabled: boolean }> {
  return request("/api/v1/auth/2fa/disable", { method: "POST", body: JSON.stringify({ password }) });
}

export async function uploadAvatar(file: File): Promise<{ avatar_url: string }> {
  const form = new FormData();
  form.append("avatar", file);
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 30_000);
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("X-Correlation-Id", createRequestId("avatar"));
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/users/avatar`, { method: "POST", headers, body: form, signal: controller.signal, credentials: "include" });
    const body = await parseJson(response);
    if (!response.ok) throw new ApiError(problemFromResponse(body, response.status));
    if (!isRecord(body) || !("data" in body)) throw new ApiError({ code: "INVALID_RESPONSE", detail: "Không thể tải lên ảnh đại diện.", status: response.status, retryable: false });
    return body.data as { avatar_url: string };
  } finally { globalThis.clearTimeout(timeout); }
}

export function revokeSession(sessionId: string): Promise<{ revoked: boolean }> {
  return request(`/api/v1/auth/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }, { retryAuth: false });
}

export function forgotPassword(email: string): Promise<ForgotPasswordResult> {
  return request("/api/v1/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }, { includeAuth: false, retryAuth: false });
}

export function resetPassword(token: string, newPassword: string): Promise<{ password_reset: boolean }> {
  return request("/api/v1/auth/reset-password", { method: "POST", body: JSON.stringify({ token, new_password: newPassword }) }, { includeAuth: false, retryAuth: false });
}

export function sendAssistantMessage(message: string, conversationId?: string, currentLocation?: DeviceCurrentLocation, signal?: AbortSignal): Promise<AssistantResponse> {
  return request<AssistantResponse>("/api/v1/assistant/chat", {
    method: "POST",
    body: JSON.stringify({ message, ...(conversationId ? { conversation_id: conversationId } : {}), ...(currentLocation ? { current_location: currentLocation } : {}) }),
  // Assistant planning can include a model planner, domain reads, and a
  // second composition call. Keep the client deadline above the Gateway's
  // 62-second upstream budget so a valid multi-service turn is not reported
  // as a false timeout at 30 seconds.
  }, { signal, timeoutMs: 90_000 });
}

export function runAssistantAction(conversationId: string, actionId: string, idempotencyKey: string, input?: { quantity?: number; currentLocation?: DeviceCurrentLocation }, signal?: AbortSignal): Promise<AssistantResponse> {
  return request<AssistantResponse>("/api/v1/assistant/actions", {
    method: "POST",
    body: JSON.stringify({ conversation_id: conversationId, action_id: actionId, ...(input?.quantity ? { quantity: input.quantity } : {}), ...(input?.currentLocation ? { current_location: input.currentLocation } : {}) }),
  }, { idempotencyKey, signal });
}

export async function transcribeVoice(
  audioBlob: Blob,
  signal?: AbortSignal,
  retried = false
): Promise<{ text: string; provider: string }> {
  const form = new FormData();
  form.append('file', audioBlob, 'recording.webm');
  
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 30_000);
  const abortListener = () => controller.abort();
  signal?.addEventListener('abort', abortListener, { once: true });
  
  const headers = new Headers();
  headers.set('X-Correlation-Id', createRequestId('cor'));
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/voice/transcribe`, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
      credentials: 'include',
    });
    
    const body = await parseJson(response);
    
    if (!response.ok) {
      const problem = problemFromResponse(body, response.status);
      if (response.status === 401 && !retried) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          return transcribeVoice(audioBlob, signal, true);
        }
      }
      if (response.status === 401) {
        clearAuthSession();
        unauthorizedHandler?.();
      }
      throw new ApiError(problem);
    }
    
    if (!isRecord(body) || !('data' in body)) {
      throw new ApiError({ code: "INVALID_RESPONSE", detail: "X-One nhận được dữ liệu không hợp lệ.", status: response.status, retryable: false });
    }
    
    return body.data as { text: string; provider: string };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError({
        code: 'REQUEST_TIMEOUT',
        detail: 'Nhận dạng giọng nói hơi chậm. Bạn thử lại nhé.',
        status: 408, retryable: true,
      });
    }
    throw new ApiError({
      code: 'SERVICE_UNAVAILABLE',
      detail: 'Dịch vụ giọng nói đang gặp sự cố. Bạn thử lại sau.',
      status: 0, retryable: true,
    });
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener('abort', abortListener);
  }
}

export type VoiceChunkHandler = (chunk: Uint8Array, isFirstChunk: boolean) => void | Promise<void>;

/**
 * Stream TTS bytes to the browser as they arrive.
 *
 * Keeping the reader here (rather than behind `response.arrayBuffer()`) lets
 * the UI feed a MediaSource incrementally while retaining the same auth,
 * timeout, cancellation, and retry behavior as the buffered helper below.
 */
export async function streamVoice(
  text: string,
  onChunk: VoiceChunkHandler,
  signal?: AbortSignal,
  retried = false,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new ApiError({
      code: 'TEXT_REQUIRED',
      detail: 'Nội dung đọc không được để trống.',
      status: 400,
      retryable: false,
    });
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 30_000);
  const abortListener = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abortListener, { once: true });

  const correlationId = createRequestId('cor');
  const headers = new Headers();
  headers.set('Accept', 'audio/mpeg');
  headers.set('Content-Type', 'application/json');
  headers.set('X-Correlation-Id', correlationId);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/voice/text-to-speech`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: trimmed }),
      signal: controller.signal,
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401 && !retried) {
        const refreshed = await refreshAccessToken(correlationId);
        if (refreshed.outcome === 'authenticated' && refreshed.token) {
          return streamVoice(trimmed, onChunk, signal, true);
        }
        if (refreshed.outcome === 'transient') {
          throw temporaryRefreshError(refreshed.problem?.requestId ?? correlationId);
        }
      }
      if (response.status === 401) {
        clearAuthSession();
        unauthorizedHandler?.();
      }
      const body = await parseJson(response);
      const problem = problemFromResponse(body, response.status);
      throw new ApiError(problem);
    }

    if (!response.body) {
      throw new ApiError({
        code: 'TTS_EMPTY_BODY',
        detail: 'Dịch vụ đọc văn bản không trả về dữ liệu âm thanh.',
        status: 502,
        retryable: true,
      });
    }

    const reader = response.body.getReader();
    let isFirstChunk = true;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;
        await onChunk(value, isFirstChunk);
        isFirstChunk = false;
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    } finally {
      reader.releaseLock();
    }

    if (isFirstChunk) {
      throw new ApiError({
        code: 'TTS_EMPTY_BODY',
        detail: 'Dịch vụ đọc văn bản không trả về dữ liệu âm thanh.',
        status: 502,
        retryable: true,
      });
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (isAbortError(error)) {
      // A caller-supplied abort is an intentional stop. Only the internal
      // deadline is surfaced as a retryable timeout for the UI.
      if (signal?.aborted) throw error;
      throw new ApiError({
        code: 'REQUEST_TIMEOUT',
        detail: 'Đọc văn bản hơi chậm. Bạn thử lại nhé.',
        status: 408,
        retryable: true,
      });
    }
    throw new ApiError({
      code: 'SERVICE_UNAVAILABLE',
      detail: 'Dịch vụ đọc văn bản đang gặp sự cố. Bạn thử lại sau.',
      status: 0,
      retryable: true,
    });
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener('abort', abortListener);
  }
}

/**
 * Compatibility helper for callers that still need one complete MP3 buffer.
 * The interactive player uses `streamVoice` directly so normal playback does
 * not wait for the complete response before creating audio.
 */
export async function synthesizeVoice(
  text: string,
  signal?: AbortSignal,
  retried = false,
): Promise<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  await streamVoice(text, (chunk) => {
    chunks.push(chunk);
    totalBytes += chunk.byteLength;
  }, signal, retried);

  const audio = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    audio.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return audio.buffer;
}

export function errorText(error: unknown): string {
  if (error instanceof ApiError) return friendlyErrorMessage(error.code, error.detail);
  return "Không thể hoàn tất yêu cầu. Bạn thử lại nhé.";
}

export function isRetryableError(error: unknown): boolean {
  return error instanceof ApiError && error.retryable;
}

const PUBLIC_AUTH_PATHS = new Set([
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/auth/refresh",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password",
  "/api/v1/auth/google",
]);
export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === "AbortError";
  return (error as { name?: unknown })?.name === "AbortError";
}

function shouldRefresh(path: string, problem: ApiProblem, options: RequestOptions): boolean {
  if (options.retried || options.retryAuth === false || PUBLIC_AUTH_PATHS.has(path)) return false;
  return problem.code === "AUTHENTICATION_FAILED" || problem.code === "AUTHENTICATION_REQUIRED" || problem.code === "UNAUTHORIZED";
}

function isSessionAuthError(problem: ApiProblem): boolean {
  if (problem.code === "CURRENT_PASSWORD_INVALID" || problem.code === "INVALID_CREDENTIALS") {
    return false;
  }
  return (
    problem.code === "AUTHENTICATION_FAILED" ||
    problem.code === "AUTHENTICATION_REQUIRED" ||
    problem.code === "UNAUTHORIZED" ||
    problem.code === "SESSION_EXPIRED" ||
    problem.code === "TOKEN_EXPIRED"
  );
}

async function rawRefresh(triggerCorrelationId?: string): Promise<RefreshResult> {
  const tokenAtStart = accessToken;
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Correlation-Id": createRequestId("cor-refresh"),
    };
    if (triggerCorrelationId) {
      headers["X-Trigger-Correlation-Id"] = triggerCorrelationId;
    }
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers,
      credentials: "include",
    });
    const body = await parseJson(response);
    const problem = problemFromResponse(body, response.status);
    if (!response.ok || !isRecord(body) || !isRecord(body.data) || typeof body.data.access_token !== "string") {
      // A login/register may have completed while this refresh was in flight.
      // Never clear the newer in-memory session because an older refresh failed.
      if (accessToken === tokenAtStart) {
        // Only clear the session if the server explicitly rejected the refresh token (401 or 403)
        // rather than a temporary network or server issue (5xx or 429).
        if (response.status === 401 || response.status === 403) {
          clearAuthSession();
          return { outcome: "invalid", token: null, problem };
        }
        return { outcome: "transient", token: accessToken, problem };
      }
      return accessToken
        ? { outcome: "authenticated", token: accessToken, problem }
        : { outcome: "transient", token: null, problem };
    }
    if (accessToken !== tokenAtStart) return accessToken
      ? { outcome: "authenticated", token: accessToken }
      : { outcome: "transient", token: null };
    setAccessToken(body.data.access_token);
    return { outcome: "authenticated", token: body.data.access_token };
  } catch {
    // If the request was aborted (e.g. page navigation or teardown) or network dropped,
    // do NOT wipe the in-memory session if it's still what we started with.
    return {
      outcome: "transient",
      token: accessToken,
      problem: { code: "AUTH_REFRESH_TEMPORARY", detail: "Session refresh temporarily unavailable.", status: 503, retryable: true },
    };
  }
}

function temporaryRefreshError(requestId?: string): ApiError {
  return new ApiError({
    code: "AUTH_REFRESH_TEMPORARY",
    detail: "Phiên đăng nhập đang được khôi phục. Bạn thử lại sau một chút nhé.",
    status: 503,
    retryable: true,
    ...(requestId ? { requestId } : {}),
  });
}

function friendlyErrorMessage(code: string, detail: string): string {
  const source = `${code} ${detail}`.toUpperCase();
  if (source.includes("CURRENT_PASSWORD_INVALID") || (source.includes("INVALID_CREDENTIALS") && detail.includes("hiện tại"))) {
    return "Mật khẩu hiện tại không đúng.";
  }
  if (source.includes("INVALID_CREDENTIALS")) return "Email hoặc mật khẩu không đúng.";
  if (source.includes("ACCOUNT_ALREADY_EXISTS")) return "Email này đã được dùng để tạo tài khoản.";
  if (source.includes("PASSWORD_POLICY")) {
    if (detail && detail.startsWith("Mật khẩu")) return detail;
    return "Mật khẩu dài từ 8 đến 128 ký tự, bao gồm chữ, số và ký tự đặc biệt.";
  }
  if (source.includes("RESET_TOKEN")) return "Liên kết đặt lại mật khẩu không còn hợp lệ. Bạn hãy yêu cầu liên kết mới.";
  if (source.includes("PAST_START")) return "Khung giờ này đã qua. Bạn hãy chọn một thời gian muộn hơn nhé.";
  if (source.includes("HOLD HAS EXPIRED") || source.includes("HOLD_EXPIRED")) return "Khung giờ tạm giữ đã hết hạn. Mình có thể tìm một lịch khác cho bạn.";
  if (source.includes("GEOAPIFY") || source.includes("LOCATION_UNRESOLVED") || source.includes("REAL_ROUTE_REQUIRED")) return "Hiện chưa tải được thông tin vị trí. Bạn thử lại giúp mình nhé.";
  if (source.includes("STALE_ACTION") || source.includes("EXPIRED_SELECTION") || source.includes("NO LONGER AVAILABLE") || source.includes("ACTION_NOT_AVAILABLE") || source.includes("SELECTION_EXPIRED")) {
    return "Lựa chọn này vừa được cập nhật. Hãy chọn lại từ danh sách mới.";
  }
  if (source.includes("IDEMPOTENCY_KEY_REQUIRED") || source.includes("IDEMPOTENCY_KEY_INVALID")) {
    return "Thao tác giỏ hàng chưa được gửi đầy đủ. Bạn hãy thử lại.";
  }
  if (source.includes("IDEMPOTENCY_KEY_REUSED")) {
    return "Yêu cầu giỏ hàng đã được dùng cho dữ liệu khác. Bạn hãy thử lại.";
  }
  if (source.includes("PROFILE_PHONE_NOT_PERSISTED")) return "Chưa xác nhận được số điện thoại đã được lưu. Dữ liệu của bạn vẫn được giữ lại, hãy thử lại.";
  if (source.includes("PHONE_INVALID")) return "Số điện thoại không hợp lệ. Hãy kiểm tra lại số Việt Nam của bạn.";
  if (source.includes("SLOT_UNAVAILABLE") || source.includes("CAPACITY_UNAVAILABLE")) return "Khung giờ này vừa hết chỗ. Mình đã cập nhật các giờ còn trống.";
  if (source.includes("NO_DRIVER") || source.includes("NO DRIVER")) return "Hiện chưa tìm được tài xế phù hợp. Bạn có thể thử lại.";
  if (source.includes("UNAUTHORIZED") || source.includes("FORBIDDEN") || source.includes("AUTHENTICATION")) {
    return "Phiên đăng nhập đã hết hạn hoặc bạn không có quyền truy cập. Hãy đăng nhập lại.";
  }
  if (source.includes("UPSTREAM_UNAVAILABLE") || source.includes("ECONNREFUSED") || source.includes("INTERNAL_ERROR") || source.includes("FETCH FAILED")) {
    return "Dịch vụ đang khởi động hoặc tạm thời gián đoạn. Vui lòng bấm 'Thử lại'.";
  }
  if (detail && detail.length > 4 && detail !== "Request failed." && detail !== "An unexpected error occurred.") {
    return detail;
  }
  return "Không thể hoàn tất thao tác. Vui lòng bấm thử lại hoặc làm mới trang.";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; } catch { return {}; }
}

function problemFromResponse(body: unknown, status: number): ApiProblem {
  const root = isRecord(body) ? body : {};
  const nested = isRecord(root.detail) ? root.detail : {};
  const code = stringValue(root.code) || stringValue(nested.code) || `HTTP_${status}`;
  const detail = stringValue(root.detail) || stringValue(nested.detail) || "X-One không thể hoàn tất yêu cầu.";
  const requestId = stringValue(root.request_id) || stringValue(isRecord(root.meta) ? root.meta.request_id : undefined) || undefined;
  return { code, detail, status, retryable: root.retryable === true || nested.retryable === true || status >= 500, ...(requestId ? { requestId } : {}) };
}

export interface ProviderProfile {
  userId: string;
  providerType: string;
  tenantId: string;
  status: string;
  businessName?: string;
  description?: string;
  address?: string;
  phone?: string;
  webhookUrl?: string;
  isOpen: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderServiceItem {
  id: string;
  providerId: string;
  domain: "ride" | "food" | "restaurant" | "healthcare";
  name: string;
  description?: string;
  price: number;
  currency: string;
  category?: string;
  metadata?: Record<string, unknown>;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getProviderProfile(): Promise<ProviderProfile> {
  const res = await request<ProviderProfile>("/api/v1/provider/services/profile", { method: "GET" });
  return res;
}

export async function updateProviderProfile(patch: {
  business_name?: string;
  description?: string;
  address?: string;
  phone?: string;
  webhook_url?: string;
  is_open?: boolean;
  provider_type?: "ride_driver" | "restaurant_merchant" | "healthcare_doctor";
}): Promise<ProviderProfile> {
  const res = await request<ProviderProfile>("/api/v1/provider/services/profile", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
  return res;
}

export async function getProviderItems(domain?: string): Promise<ProviderServiceItem[]> {
  const url = domain ? `/api/v1/provider/services/items?domain=${encodeURIComponent(domain)}` : "/api/v1/provider/services/items";
  const res = await request<{ items: ProviderServiceItem[] }>(url, { method: "GET" });
  return res.items ?? [];
}

export async function createProviderItem(item: {
  domain: "ride" | "food" | "restaurant" | "healthcare";
  name: string;
  price: number;
  description?: string;
  category?: string;
  currency?: string;
  metadata?: Record<string, unknown>;
}): Promise<ProviderServiceItem> {
  const res = await request<ProviderServiceItem>("/api/v1/provider/services/items", {
    method: "POST",
    body: JSON.stringify(item),
  });
  return res;
}

export async function toggleProviderItemStatus(id: string, isAvailable: boolean): Promise<ProviderServiceItem> {
  const res = await request<ProviderServiceItem>(`/api/v1/provider/services/items/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ is_available: isAvailable }),
  });
  return res;
}

export async function deleteProviderItem(id: string): Promise<{ deleted: boolean; id: string }> {
  const res = await request<{ deleted: boolean; id: string }>(`/api/v1/provider/services/items/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return res;
}

export async function getProviderOperationsRides(): Promise<any[]> {
  try {
    const res = await request<{ items: any[]; count: number }>("/api/v1/provider/services/operations/rides", { method: "GET" });
    return res.items ?? [];
  } catch {
    return [];
  }
}

export async function getProviderOperationsOrders(): Promise<any[]> {
  try {
    const res = await request<{ items: any[]; count: number }>("/api/v1/provider/services/operations/orders", { method: "GET" });
    return res.items ?? [];
  } catch {
    return [];
  }
}

export async function getProviderOperationsAppointments(): Promise<any[]> {
  try {
    const res = await request<{ items: any[]; count: number }>("/api/v1/provider/services/operations/appointments", { method: "GET" });
    return res.items ?? [];
  } catch {
    return [];
  }
}

export async function updateProviderOperationRideStatus(bookingId: string, status: string): Promise<any> {
  return request(`/api/v1/provider/services/operations/rides/${encodeURIComponent(bookingId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function updateProviderOperationOrderStatus(orderId: string, status: string): Promise<any> {
  return request(`/api/v1/provider/services/operations/orders/${encodeURIComponent(orderId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function updateProviderOperationAppointmentStatus(appointmentId: string, status: string): Promise<any> {
  return request(`/api/v1/provider/services/operations/appointments/${encodeURIComponent(appointmentId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function seedProviderSampleOperation(domain: string): Promise<any> {
  return request("/api/v1/provider/services/operations/seed-sample", {
    method: "POST",
    body: JSON.stringify({ domain }),
  });
}

export interface WebhookTestResult {
  success: boolean;
  status_code: number;
  status_text?: string;
  latency_ms: number;
  signature_sent?: string;
  response_body?: string;
  error_message?: string;
  target_url: string;
  event_sent: string;
}

export interface ProviderEarningsSummary {
  gross_revenue: number;
  completed_orders: number;
  completed_rides: number;
  total_completed_transactions: number;
  platform_fee: number;
  platform_fee_rate: string;
  net_payout: number;
  currency: string;
  payout_status: string;
  last_calculated_at: string;
}

export async function testProviderWebhook(event?: string, payload?: Record<string, unknown>): Promise<WebhookTestResult> {
  const res = await request<{ data: WebhookTestResult } | WebhookTestResult>("/api/v1/provider/services/webhook/test", {
    method: "POST",
    body: JSON.stringify({ event, payload }),
  });
  return (res as any).data ?? res;
}

export async function getProviderEarningsSummary(): Promise<ProviderEarningsSummary> {
  const res = await request<{ data: ProviderEarningsSummary } | ProviderEarningsSummary>("/api/v1/provider/services/earnings/summary", {
    method: "GET",
  });
  return (res as any).data ?? res;
}

export async function getAdminFeatureFlags(): Promise<Array<{ flag_key: string; enabled: boolean; description: string; updated_at: string }>> {
  try {
    const res = await request<{ items: any[] }>("/api/v1/admin/feature-flags", { method: "GET" });
    return res.items ?? [];
  } catch {
    return [];
  }
}

export async function updateAdminFeatureFlag(key: string, enabled: boolean): Promise<any> {
  return request(`/api/v1/admin/feature-flags/${encodeURIComponent(key)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export async function getAdminAuditLogs(page = 1, pageSize = 20): Promise<{ items: any[]; total: number }> {
  try {
    return await request<{ items: any[]; total: number }>(`/api/v1/admin/audit-logs?page=${page}&page_size=${pageSize}`, { method: "GET" });
  } catch {
    return { items: [], total: 0 };
  }
}

export async function issueAdminCompensation(workflowId: string, amount = 50000, reason = "Bù trừ sự cố điều phối"): Promise<any> {
  return request("/api/v1/admin/operations/recovery/compensate", {
    method: "POST",
    body: JSON.stringify({ workflow_id: workflowId, amount, reason }),
  });
}

export interface ProviderMcpKeyItem {
  id: string;
  key_prefix: string;
  label: string;
  last_used_at?: string;
  created_at: string;
}

export interface CreatedMcpKeyResult {
  id: string;
  key: string;
  key_prefix: string;
  label: string;
  created_at: string;
}

export async function getProviderMcpKeys(): Promise<ProviderMcpKeyItem[]> {
  try {
    const res = await request<{ data: { items: ProviderMcpKeyItem[]; count: number } }>("/api/v1/provider/mcp-keys", {
      method: "GET",
    });
    return res.data?.items ?? [];
  } catch {
    return [];
  }
}

export async function createProviderMcpKey(label?: string): Promise<CreatedMcpKeyResult> {
  const res = await request<{ data: CreatedMcpKeyResult }>("/api/v1/provider/mcp-keys", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
  return res.data;
}

export async function revokeProviderMcpKey(id: string): Promise<boolean> {
  const res = await request<{ data: { revoked: boolean } }>(`/api/v1/provider/mcp-keys/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return res.data?.revoked ?? true;
}




