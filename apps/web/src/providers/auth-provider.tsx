"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { clearAuthSession, configureApiClient, getAccessToken, getCurrentUser, login as apiLogin, logout as apiLogout, refreshAccessToken, register as apiRegister, updateProfile as apiUpdateProfile } from "@/lib/api-client";
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

function requiresAuthentication(pathname: string | null): boolean {
  return pathname === "/admin" || pathname === "/app" || pathname?.startsWith("/app/") === true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const authGeneration = useRef(0);

  const clear = useCallback(() => {
    authGeneration.current += 1;
    clearAuthSession();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  useEffect(() => {
    configureApiClient({ onUnauthorized: clear });
    let mounted = true;
    const generation = ++authGeneration.current;

    // The landing/auth recovery surface is public. Waiting for a refresh
    // cookie there creates needless refresh traffic and can race a login
    // submitted from the landing dialog. Protected routes restore explicitly.
    if (!requiresAuthentication(pathname)) {
      if (!getAccessToken()) setStatus("unauthenticated");
      return () => { mounted = false; };
    }

    // A successful login/register in this same browser session is already
    // authoritative in memory; do not rotate a second session on navigation.
    if (getAccessToken()) return () => { mounted = false; };

    void (async () => {
      const token = await refreshAccessToken();
      if (!mounted || authGeneration.current !== generation) return;
      if (!token) {
        setStatus("unauthenticated");
        return;
      }
      try {
        const restored = await getCurrentUser();
        if (mounted && authGeneration.current === generation) {
          setUser(restored);
          setStatus("authenticated");
        }
      } catch {
        if (mounted && authGeneration.current === generation) clear();
      }
    })();
    return () => { mounted = false; };
  }, [clear, pathname]);

  const login = useCallback(async (email: string, password: string) => {
    authGeneration.current += 1;
    const authenticated = await apiLogin(email, password);
    setUser(authenticated);
    setStatus("authenticated");
    return authenticated;
  }, []);

  const register = useCallback(async (fullName: string, email: string, password: string) => {
    authGeneration.current += 1;
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
