// API Service — connects apps/web to the NestJS API Gateway (localhost:3000)
// All browser calls go through the gateway only. Never call domain services directly.

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'x1_token';

export type UserRole = 'admin' | 'operator' | 'customer' | 'provider';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
}

export interface ApiResponse<T> {
  data: T;
  meta?: { request_id?: string };
}

export interface ChatResponse {
  response: string;
}

// ─── Token helpers ────────────────────────────────────────────────────────────
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = `Request failed: ${res.status}`;
    try {
      const body = await res.json() as { error?: { detail?: string }; message?: string; detail?: string };
      detail = body?.detail ?? body?.error?.detail ?? body?.message ?? detail;
    } catch { /* ignore parse errors */ }
    throw new Error(detail);
  }

  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function login(email: string, password: string): Promise<AuthUser> {
  const res = await request<ApiResponse<{ token: string; user: AuthUser }>>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  saveToken(res.data.token);
  return res.data.user;
}

async function register(fullName: string, email: string, password: string, role: 'customer' | 'provider'): Promise<AuthUser> {
  const res = await request<ApiResponse<{ token: string; user: AuthUser }>>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ fullName, email, password, role }),
  });
  saveToken(res.data.token);
  return res.data.user;
}

async function me(): Promise<AuthUser | null> {
  if (!getToken()) return null;
  try {
    const res = await request<ApiResponse<AuthUser>>('/api/v1/auth/me');
    return res.data;
  } catch {
    clearToken();
    return null;
  }
}

function logout(): void {
  clearToken();
}

// ─── Profile ──────────────────────────────────────────────────────────────────
async function getProfile(): Promise<Record<string, unknown> | null> {
  try {
    const res = await request<ApiResponse<Record<string, unknown> | null>>('/api/v1/profile');
    return res.data;
  } catch {
    return null;
  }
}

async function updateProfile(profile: Record<string, unknown>): Promise<boolean> {
  try {
    await request<ApiResponse<{ success: boolean }>>('/api/v1/profile', {
      method: 'POST',
      body: JSON.stringify(profile),
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
async function sendChatMessage(message: string): Promise<ChatResponse> {
  const res = await request<ApiResponse<ChatResponse>>('/api/v1/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
  return res.data;
}

// ─── Bookings ─────────────────────────────────────────────────────────────────
async function getBookings(): Promise<any[]> {
  const res = await request<ApiResponse<any[]>>('/api/v1/bookings');
  return res.data;
}

async function createBooking(bookingData: any): Promise<any> {
  const res = await request<ApiResponse<any>>('/api/v1/bookings', {
    method: 'POST',
    body: JSON.stringify(bookingData),
  });
  return res.data;
}

async function cancelBooking(bookingId: string): Promise<boolean> {
  try {
    await request<ApiResponse<{ success: boolean }>>(`/api/v1/bookings/${bookingId}/cancel`, {
      method: 'POST',
    });
    return true;
  } catch {
    return false;
  }
}

async function rateBooking(bookingId: string, rating: number): Promise<boolean> {
  try {
    await request<ApiResponse<{ success: boolean }>>(`/api/v1/bookings/${bookingId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────
export const ApiService = {
  login,
  register,
  me,
  logout,
  getProfile,
  updateProfile,
  sendChatMessage,
  getBookings,
  createBooking,
  cancelBooking,
  rateBooking,
};

export { API_BASE as API_BASE_URL };
