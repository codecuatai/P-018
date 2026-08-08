import type { AuthUser } from "./types";

export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

const SESSION_TOKEN_KEY = "xone.access_token";

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
  actorId?: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  includeAuth?: boolean;
}

interface AuthLoginResult {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

export interface RideQuote {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  vehicle_type: string;
  distance_km: number;
  duration_minutes: number;
  amount: number;
  currency: string;
  quote_version: string;
  expires_at: string;
}

export interface RideBooking {
  id: string;
  quote_id: string;
  amount: number;
  currency: string;
  status: string;
  driver?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface RideWorkflow {
  workflow_id: string;
  response: string;
  intent?: string;
  stage: string;
  missing_fields?: string[];
  quote?: RideQuote | null;
  booking?: RideBooking | null;
  confirmation?: Record<string, unknown> | null;
}

export interface FoodResponse extends Record<string, unknown> {
  response_type?: string;
  response?: string;
  message?: string;
  state_updates?: Record<string, unknown>;
  pending_confirmation?: Record<string, unknown> | null;
}

export interface RestaurantResponse extends Record<string, unknown> {
  response?: string;
  workflow_id?: string;
  intent?: string;
  slots?: Record<string, unknown>;
  tool_request?: Record<string, unknown> | null;
  tool_result?: unknown;
  status?: string;
  pending_confirmation?: Record<string, unknown> | null;
}

export interface HealthcareResponse extends Record<string, unknown> {
  response?: string;
  workflow_id?: string;
  intent?: string;
  slots?: Record<string, unknown>;
  tool_request?: Record<string, unknown> | null;
  tool_result?: unknown;
  candidates?: unknown[];
  doctors?: unknown[];
  departments?: unknown[];
  appointment?: Record<string, unknown> | null;
  payment?: Record<string, unknown> | null;
  payment_required?: boolean;
  status?: string;
  pending_confirmation?: Record<string, unknown> | null;
}

type UnauthorizedHandler = () => void;

let accessToken: string | null = readSessionToken();
let unauthorizedHandler: UnauthorizedHandler | undefined;

export function configureApiClient(options: { onUnauthorized?: UnauthorizedHandler }): void {
  unauthorizedHandler = options.onUnauthorized;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string): void {
  accessToken = token;
  try {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    // A restricted browser storage mode should not prevent the current session.
  }
}

export function clearAuthSession(): void {
  accessToken = null;
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // Ignore storage cleanup failures; the in-memory token is already cleared.
  }
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
  const timeoutMs = options.timeoutMs ?? 30_000;
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const abortListener = () => controller.abort();
  options.signal?.addEventListener("abort", abortListener, { once: true });

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && init.body !== null) headers.set("Content-Type", "application/json");
  headers.set("X-Correlation-Id", createRequestId("cor"));
  if (options.actorId) headers.set("X-Actor-Id", options.actorId);
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
  if (options.includeAuth !== false && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
      credentials: "omit",
    });
    const body = await parseJson(response);

    if (!response.ok) {
      const problem = problemFromResponse(body, response.status);
      if (response.status === 401) {
        clearAuthSession();
        unauthorizedHandler?.();
      }
      throw new ApiError(problem);
    }

    if (response.status === 204) return undefined as T;
    if (!isRecord(body) || !("data" in body)) {
      throw new ApiError({
        code: "INVALID_RESPONSE",
        detail: "Gateway returned an invalid response envelope.",
        status: response.status,
        retryable: false,
      });
    }
    return body.data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError({
        code: "REQUEST_TIMEOUT",
        detail: "Gateway không phản hồi kịp thời. Bạn có thể thử lại.",
        status: 408,
        retryable: true,
      });
    }
    throw new ApiError({
      code: "GATEWAY_UNAVAILABLE",
      detail: "Không thể kết nối tới Gateway. Kiểm tra backend rồi thử lại.",
      status: 0,
      retryable: true,
    });
  } finally {
    globalThis.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortListener);
  }
}

export function login(email: string, password: string): Promise<AuthUser> {
  return request<AuthLoginResult>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }, { includeAuth: false }).then((result) => {
    setAccessToken(result.access_token);
    return result.user;
  });
}

export function getCurrentUser(): Promise<AuthUser> {
  return request<AuthUser>("/api/v1/auth/me", { method: "GET" });
}

export function checkGatewayHealth(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/health/ready", { method: "GET" }, { includeAuth: false, timeoutMs: 5_000 });
}

export function sendRideMessage(message: string, actorId: string, workflowId?: string): Promise<RideWorkflow> {
  return request<RideWorkflow>("/api/v1/chat", {
    method: "POST",
    body: JSON.stringify({ message, ...(workflowId ? { workflow_id: workflowId } : {}) }),
  }, { actorId });
}

export function confirmRideService(workflowId: string, actorId: string): Promise<RideWorkflow> {
  return request<RideWorkflow>(`/api/v1/workflows/${encodeURIComponent(workflowId)}/confirm-service`, {
    method: "POST",
  }, { actorId });
}

export function confirmRidePayment(workflowId: string, actorId: string): Promise<RideWorkflow> {
  return request<RideWorkflow>(`/api/v1/workflows/${encodeURIComponent(workflowId)}/confirm-payment`, {
    method: "POST",
  }, { actorId });
}

export function sendFoodMessage(conversationId: string, message: string): Promise<FoodResponse> {
  return request<FoodResponse>(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export function executeFoodConfirmation(confirmationId: string, conversationId: string, idempotencyKey: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/api/v1/confirmations/${encodeURIComponent(confirmationId)}/execute`, {
    method: "POST",
    body: JSON.stringify({ payment_method: "card", conversation_id: conversationId }),
  }, { idempotencyKey });
}

export function getFoodOrder(orderId: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/api/v1/food/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
}

export function sendRestaurantMessage(
  message: string,
  workflowId: string,
  context?: Record<string, unknown>,
): Promise<RestaurantResponse> {
  return request<RestaurantResponse>("/api/v1/restaurant-workflows/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      workflow_id: workflowId,
      client_turn_id: createRequestId("turn"),
      ...(context ? { context } : {}),
    }),
  });
}

export function confirmRestaurant(
  confirmationId: string,
  workflowId: string,
  idempotencyKey: string,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/api/v1/restaurant-workflows/confirm", {
    method: "POST",
    body: JSON.stringify({ confirmation_id: confirmationId, workflow_id: workflowId }),
  }, { idempotencyKey });
}

export function sendHealthcareMessage(
  message: string,
  workflowId: string,
  context?: Record<string, unknown>,
): Promise<HealthcareResponse> {
  const record = context ?? {};
  return request<HealthcareResponse>("/api/v1/healthcare-workflows/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      workflow_id: workflowId,
      client_turn_id: createRequestId("turn"),
      ...(typeof record.patient_id === "number" ? { patient_id: record.patient_id } : {}),
      ...(typeof record.symptoms === "string" ? { symptoms: record.symptoms } : {}),
      ...(Object.keys(record).length ? { context: record } : {}),
    }),
  });
}

export function acknowledgeHealthcarePayment(
  appointmentId: number,
  workflowId: string,
  idempotencyKey: string,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/api/v1/healthcare-workflows/payment", {
    method: "POST",
    body: JSON.stringify({ appointment_id: appointmentId, workflow_id: workflowId }),
  }, { idempotencyKey });
}

export function confirmHealthcare(
  confirmationId: string,
  workflowId: string,
  idempotencyKey: string,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/api/v1/healthcare-workflows/confirm", {
    method: "POST",
    body: JSON.stringify({ confirmation_id: confirmationId, workflow_id: workflowId }),
  }, { idempotencyKey });
}

export function responseText(payload: unknown, fallback = "Gateway đã trả về dữ liệu mới."): string {
  const record = isRecord(payload) ? payload : {};
  for (const key of ["response", "message", "detail"]) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
  }
  return fallback;
}

export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.detail;
  return "Không thể hoàn tất yêu cầu. Bạn có thể thử lại.";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function problemFromResponse(body: unknown, status: number): ApiProblem {
  const root = isRecord(body) ? body : {};
  const nested = isRecord(root.detail) ? root.detail : {};
  const code = stringValue(root.code) || stringValue(nested.code) || statusCode(status);
  const detail = stringValue(root.detail)
    || stringValue(nested.detail)
    || "Gateway không thể hoàn tất yêu cầu.";
  const requestId = stringValue(root.request_id) || stringValue(asRecord(root.meta)?.request_id) || undefined;
  return {
    code,
    detail,
    status,
    retryable: root.retryable === true || nested.retryable === true || status >= 500,
    ...(requestId ? { requestId } : {}),
  };
}

function statusCode(status: number): string {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status >= 500) return "GATEWAY_ERROR";
  return "REQUEST_REJECTED";
}
