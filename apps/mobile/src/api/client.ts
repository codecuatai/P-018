import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../storage/secure';
import { createRequestId } from '../utils/id';

export function getAutoDetectedGatewayUrl(): string {
  // Try extracting IP from Expo Metro bundler host
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as unknown as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } })
      ?.manifest2?.extra?.expoGo?.debuggerHost;

  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return `http://${ip}:3000`;
    }
  }

  // Fallback for Android Emulator vs iOS Simulator
  return Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

let apiBaseUrl = getAutoDetectedGatewayUrl();
const SESSION_TOKEN_KEY = 'xone.access_token';

interface StoredAuthSession {
  token: string;
  apiBaseUrl: string;
}

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
    this.name = 'ApiError';
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

let cachedToken: string | null = null;
let unauthorizedHandler: (() => void) | undefined;

export function setApiBaseUrl(url: string): void {
  const normalized = new URL(url.trim());
  if (!['http:', 'https:'].includes(normalized.protocol) || normalized.username || normalized.password) {
    throw new Error('Địa chỉ Gateway phải dùng HTTP/HTTPS và không chứa thông tin đăng nhập.');
  }
  normalized.pathname = normalized.pathname.replace(/\/$/, '');
  normalized.search = '';
  normalized.hash = '';
  apiBaseUrl = normalized.toString().replace(/\/$/, '');
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

export function configureApiClient(options: { onUnauthorized?: () => void }): void {
  unauthorizedHandler = options.onUnauthorized;
}

export async function loadStoredToken(): Promise<string | null> {
  const raw = await getSecureItem(SESSION_TOKEN_KEY);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Partial<StoredAuthSession>;
    if (typeof stored.token !== 'string' || !stored.token || typeof stored.apiBaseUrl !== 'string') {
      throw new Error('Invalid stored session');
    }
    setApiBaseUrl(stored.apiBaseUrl);
    cachedToken = stored.token;
    return cachedToken;
  } catch {
    cachedToken = null;
    await deleteSecureItem(SESSION_TOKEN_KEY);
    return null;
  }
}

export function getAccessToken(): string | null {
  return cachedToken;
}

export async function setAccessToken(token: string): Promise<void> {
  cachedToken = token;
  const stored: StoredAuthSession = { token, apiBaseUrl };
  await setSecureItem(SESSION_TOKEN_KEY, JSON.stringify(stored));
}

export async function clearAuthSession(): Promise<void> {
  cachedToken = null;
  await deleteSecureItem(SESSION_TOKEN_KEY);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
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
  const code = stringValue(root.code) || stringValue(nested.code) || `HTTP_${status}`;
  const detail =
    stringValue(root.detail) ||
    stringValue(nested.detail) ||
    'X-One không thể hoàn tất yêu cầu.';
  const requestId =
    stringValue(root.request_id) ||
    stringValue(isRecord(root.meta) ? root.meta.request_id : undefined) ||
    undefined;
  return {
    code,
    detail,
    status,
    retryable:
      root.retryable === true ||
      nested.retryable === true ||
      status >= 500,
    ...(requestId ? { requestId } : {}),
  };
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  const headers = new Headers(init.headers);

  headers.set('Accept', 'application/json');
  if (init.body !== undefined && init.body !== null) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-Correlation-Id', createRequestId('cor-mob'));
  if (options.idempotencyKey) {
    headers.set('Idempotency-Key', options.idempotencyKey);
  }
  if (options.includeAuth !== false && cachedToken) {
    headers.set('Authorization', `Bearer ${cachedToken}`);
  }

  try {
    const targetUrl = `${apiBaseUrl}${path}`;
    const response = await fetch(targetUrl, {
      ...init,
      headers,
      signal: controller.signal,
      credentials: 'omit',
    });

    const body = await parseJson(response);

    if (!response.ok) {
      const problem = problemFromResponse(body, response.status);
      if (response.status === 401) {
        await clearAuthSession();
        unauthorizedHandler?.();
      }
      throw new ApiError(problem);
    }

    if (response.status === 204) return undefined as T;

    if (!isRecord(body) || !('data' in body)) {
      throw new ApiError({
        code: 'INVALID_RESPONSE',
        detail: 'X-One nhận được dữ liệu không hợp lệ.',
        status: response.status,
        retryable: false,
      });
    }

    return body.data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError({
        code: 'REQUEST_TIMEOUT',
        detail: `Hết thời gian chờ kết nối (${apiBaseUrl}). Bạn thử kiểm tra lại backend Gateway đang chạy nhé.`,
        status: 408,
        retryable: true,
      });
    }
    throw new ApiError({
      code: 'SERVICE_UNAVAILABLE',
      detail: `Không thể kết nối đến Gateway tại ${apiBaseUrl}. Đảm bảo máy tính và điện thoại chung Wi-Fi và Gateway đang chạy ở cổng 3000.`,
      status: 0,
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function friendlyErrorMessage(code: string, detail: string): string {
  const source = `${code} ${detail}`.toUpperCase();
  if (source.includes('PAST_START')) {
    return 'Khung giờ này đã qua. Bạn hãy chọn một thời gian muộn hơn nhé.';
  }
  if (source.includes('HOLD HAS EXPIRED') || source.includes('HOLD_EXPIRED')) {
    return 'Khung giờ tạm giữ đã hết hạn. Mình có thể tìm một lịch khác cho bạn.';
  }
  if (
    source.includes('IDEMPOTENCY') ||
    source.includes('NO LONGER AVAILABLE') ||
    source.includes('ACTION_NOT_AVAILABLE') ||
    source.includes('SELECTION_EXPIRED')
  ) {
    return 'Lựa chọn này đã được làm mới. Bạn hãy gửi lại yêu cầu để mình cập nhật thông tin mới nhé.';
  }
  if (
    source.includes('SLOT_UNAVAILABLE') ||
    source.includes('CAPACITY_UNAVAILABLE')
  ) {
    return 'Lựa chọn này vừa hết chỗ. Mình sẽ tìm phương án khác cho bạn.';
  }
  return detail || 'Mình chưa thể hoàn tất bước này. Bạn hãy thử lại nhé.';
}

export function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    return friendlyErrorMessage(error.code, error.detail);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Không thể hoàn tất yêu cầu. Bạn thử lại nhé.';
}
