import { request, setAccessToken, clearAuthSession } from './client';
import type { AuthUser } from '../types';

interface AuthLoginResult {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const result = await request<AuthLoginResult>(
    '/api/v1/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    { includeAuth: false }
  );
  await setAccessToken(result.access_token);
  return result.user;
}

export async function getCurrentUser(): Promise<AuthUser> {
  return request<AuthUser>('/api/v1/auth/me', { method: 'GET' });
}

export { clearAuthSession };
