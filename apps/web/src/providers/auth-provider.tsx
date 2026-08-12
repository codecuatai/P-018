"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { clearAuthSession, configureApiClient, getCurrentUser, login as apiLogin, logout as apiLogout, refreshAccessToken, register as apiRegister, updateProfile as apiUpdateProfile } from "@/lib/api-client";
import type { AuthUser } from "@/types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (fullName: string, email: string, password: string) => Promise<AuthUser>;
  updateProfile: (patch: Parameters<typeof apiUpdateProfile>[0]) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const clear = useCallback(() => {
    clearAuthSession();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  useEffect(() => {
    configureApiClient({ onUnauthorized: clear });
    let mounted = true;
    void (async () => {
      const token = await refreshAccessToken();
      if (!token) {
        if (mounted) setStatus("unauthenticated");
        return;
      }
      try {
        const restored = await getCurrentUser();
        if (mounted) {
          setUser(restored);
          setStatus("authenticated");
        }
      } catch {
        if (mounted) clear();
      }
    })();
    return () => { mounted = false; };
  }, [clear]);

  const login = useCallback(async (email: string, password: string) => {
    const authenticated = await apiLogin(email, password);
    setUser(authenticated);
    setStatus("authenticated");
    return authenticated;
  }, []);

  const register = useCallback(async (fullName: string, email: string, password: string) => {
    const authenticated = await apiRegister(fullName, email, password);
    setUser(authenticated);
    setStatus("authenticated");
    return authenticated;
  }, []);

  const logout = useCallback(async () => {
    try { await apiLogout(); } finally { clear(); }
  }, [clear]);

  const updateProfile = useCallback(async (patch: Parameters<typeof apiUpdateProfile>[0]) => {
    const updated = await apiUpdateProfile(patch);
    setUser(updated);
    return updated;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ user, status, login, register, updateProfile, logout }), [login, logout, register, status, updateProfile, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
