import type { AssistantResponse, AuthUser } from "./types";

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

let accessToken: string | null = readSessionToken();
let unauthorizedHandler: (() => void) | undefined;

export function configureApiClient(options: { onUnauthorized?: () => void }): void {
  unauthorizedHandler = options.onUnauthorized;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string): void {
  accessToken = token;
  try { sessionStorage.setItem(SESSION_TOKEN_KEY, token); } catch { /* Current tab remains usable. */ }
}

export function clearAuthSession(): void {
  accessToken = null;
  try { sessionStorage.removeItem(SESSION_TOKEN_KEY); } catch { /* Nothing else is required. */ }
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
    const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, signal: controller.signal, credentials: "omit" });
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

export function login(email: string, password: string): Promise<AuthUser> {
  return request<AuthLoginResult>("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, { includeAuth: false }).then((result) => {
    setAccessToken(result.access_token);
    return result.user;
  });
}

export function getCurrentUser(): Promise<AuthUser> {
  return request<AuthUser>("/api/v1/auth/me", { method: "GET" });
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

function friendlyErrorMessage(code: string, detail: string): string {
  const source = `${code} ${detail}`.toUpperCase();
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

function readSessionToken(): string | null {
  try { return sessionStorage.getItem(SESSION_TOKEN_KEY); } catch { return null; }
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
