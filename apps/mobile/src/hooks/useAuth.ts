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
          // Không có token — yêu cầu đăng nhập thật
          setCurrentUser(null);
          setAuthLoading(false);
          return;
        }
        const user = await getCurrentUser();
        setCurrentUser(user);
      } catch {
        await clearAuthSession();
        // Token hết hạn hoặc backend không khả dụng — yêu cầu đăng nhập lại
        setCurrentUser(null);
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
