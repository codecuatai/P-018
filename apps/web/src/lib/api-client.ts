"use client";

import type { AssistantResponse, AuthSessionSummary, AuthUser } from "@/types";

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

let accessToken: string | null = null;
let unauthorizedHandler: (() => void) | undefined;
let refreshInFlight: Promise<string | null> | undefined;

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
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && init.body !== null) headers.set("Content-Type", "application/json");
  headers.set("X-Correlation-Id", createRequestId("cor"));
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
  if (options.includeAuth !== false && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, signal: controller.signal, credentials: "include" });
    const body = await parseJson(response);
    if (!response.ok) {
      const problem = problemFromResponse(body, response.status);
      if (response.status === 401 && shouldRefresh(path, problem, options)) {
        const refreshed = await refreshAccessToken();
        if (refreshed) return request<T>(path, init, { ...options, retried: true });
      }
      if (response.status === 401) {
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
      throw new ApiError({ code: "REQUEST_TIMEOUT", detail: "X-One phản hồi hơi chậm. Bạn thử lại nhé.", status: 408, retryable: true });
    }
    throw new ApiError({ code: "SERVICE_UNAVAILABLE", detail: "X-One đang gặp sự cố kết nối. Bạn thử lại sau một chút nhé.", status: 0, retryable: true });
  } finally {
    globalThis.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortListener);
  }
}

export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) refreshInFlight = rawRefresh().finally(() => { refreshInFlight = undefined; });
  return refreshInFlight;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const result = await request<AuthResult>("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, { includeAuth: false, retryAuth: false });
  setAccessToken(result.access_token);
  return result.user;
}

export async function register(fullName: string, email: string, password: string): Promise<AuthUser> {
  const result = await request<AuthResult>("/api/v1/auth/register", { method: "POST", body: JSON.stringify({ full_name: fullName, email, password }) }, { includeAuth: false, retryAuth: false });
  setAccessToken(result.access_token);
  return result.user;
}

export function getCurrentUser(): Promise<AuthUser> {
  return request<AuthUser>("/api/v1/auth/me", { method: "GET" });
}

export async function logout(): Promise<void> {
  try {
    await request<{ logged_out: boolean }>("/api/v1/auth/logout", { method: "POST" }, { includeAuth: false, retryAuth: false });
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
  return request("/api/v1/auth/change-password", { method: "POST", body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) }, { retryAuth: false });
}

export function getSessions(): Promise<{ items: AuthSessionSummary[] }> {
  return request("/api/v1/auth/sessions", { method: "GET" });
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

export function sendAssistantMessage(message: string, conversationId?: string): Promise<AssistantResponse> {
  return request<AssistantResponse>("/api/v1/assistant/chat", {
    method: "POST",
    body: JSON.stringify({ message, ...(conversationId ? { conversation_id: conversationId } : {}) }),
  });
}

export function runAssistantAction(conversationId: string, actionId: string, idempotencyKey: string): Promise<AssistantResponse> {
  return request<AssistantResponse>("/api/v1/assistant/actions", {
    method: "POST",
    body: JSON.stringify({ conversation_id: conversationId, action_id: actionId }),
  }, { idempotencyKey });
}

export function errorText(error: unknown): string {
  if (error instanceof ApiError) return friendlyErrorMessage(error.code, error.detail);
  return "Không thể hoàn tất yêu cầu. Bạn thử lại nhé.";
}

function shouldRefresh(path: string, problem: ApiProblem, options: RequestOptions): boolean {
  if (options.retried || options.retryAuth === false || path.startsWith("/api/v1/auth/")) return false;
  return problem.code === "AUTHENTICATION_FAILED" || problem.code === "AUTHENTICATION_REQUIRED";
}

async function rawRefresh(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { Accept: "application/json", "X-Correlation-Id": createRequestId("cor") },
      credentials: "include",
    });
    const body = await parseJson(response);
    if (!response.ok || !isRecord(body) || !isRecord(body.data) || typeof body.data.access_token !== "string") {
      clearAuthSession();
      return null;
    }
    setAccessToken(body.data.access_token);
    return body.data.access_token;
  } catch {
    clearAuthSession();
    return null;
  }
}

function friendlyErrorMessage(code: string, detail: string): string {
  const source = `${code} ${detail}`.toUpperCase();
  if (source.includes("INVALID_CREDENTIALS")) return "Email hoặc mật khẩu không đúng.";
  if (source.includes("ACCOUNT_ALREADY_EXISTS")) return "Email này đã được dùng để tạo tài khoản.";
  if (source.includes("PASSWORD_POLICY")) return "Dùng mật khẩu hoặc cụm mật khẩu từ 15 ký tự trở lên.";
  if (source.includes("RESET_TOKEN")) return "Liên kết đặt lại mật khẩu không còn hợp lệ. Bạn hãy yêu cầu liên kết mới.";
  if (source.includes("PAST_START")) return "Khung giờ này đã qua. Bạn hãy chọn một thời gian muộn hơn nhé.";
  if (source.includes("HOLD HAS EXPIRED") || source.includes("HOLD_EXPIRED")) return "Khung giờ tạm giữ đã hết hạn. Mình có thể tìm một lịch khác cho bạn.";
  if (source.includes("IDEMPOTENCY") || source.includes("NO LONGER AVAILABLE") || source.includes("ACTION_NOT_AVAILABLE") || source.includes("SELECTION_EXPIRED")) {
    return "Lựa chọn này đã được làm mới. Bạn hãy gửi lại yêu cầu để mình cập nhật thông tin mới nhé.";
  }
  if (source.includes("SLOT_UNAVAILABLE") || source.includes("CAPACITY_UNAVAILABLE")) return "Lựa chọn này vừa hết chỗ. Mình sẽ tìm phương án khác cho bạn.";
  return "Mình chưa thể hoàn tất bước này. Bạn hãy gửi lại yêu cầu để mình làm mới thông tin nhé.";
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
