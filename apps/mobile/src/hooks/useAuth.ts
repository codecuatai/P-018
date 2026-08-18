import { useState, useEffect, useCallback } from 'react';
import {
  login as apiLogin,
  getCurrentUser,
  clearAuthSession,
} from '../api/auth';
import { configureApiClient, loadStoredToken } from '../api/client';
import type { AuthUser } from '../types';

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const handleLogout = useCallback(async () => {
    await clearAuthSession();
    setCurrentUser(null);
  }, []);

  useEffect(() => {
    configureApiClient({
      onUnauthorized: () => {
        void handleLogout();
      },
    });

    async function restoreSession() {
      try {
        const token = await loadStoredToken();
        if (!token) {
          // Bỏ qua đăng nhập, tự động vào app
          setCurrentUser({ sub: 'sandbox-123', email: 'demo@x-one.local', role: 'user' });
          setAuthLoading(false);
          return;
        }
        const user = await getCurrentUser();
        setCurrentUser(user);
      } catch {
        await clearAuthSession();
        // Fallback tự động vào app nếu lỗi kết nối backend
        setCurrentUser({ sub: 'sandbox-123', email: 'demo@x-one.local', role: 'user' });
      } finally {
        setAuthLoading(false);
      }
    }

    void restoreSession();
  }, [handleLogout]);

  const login = async (email: string, pass: string) => {
    setAuthLoading(true);
    try {
      const user = await apiLogin(email, pass);
      setCurrentUser(user);
      return user;
    } finally {
      setAuthLoading(false);
    }
  };

  return {
    currentUser,
    authLoading,
    login,
    logout: handleLogout,
  };
}
