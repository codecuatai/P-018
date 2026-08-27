"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { clearAuthSession, configureApiClient, getAccessToken, getCurrentUser, login as apiLogin, loginWithGoogle as apiLoginWithGoogle, logout as apiLogout, refreshAccessToken, register as apiRegister, updateProfile as apiUpdateProfile } from "@/lib/api-client";
import type { AuthUser } from "@/types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "signed-out";

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<AuthUser>;
  loginWithGoogle: (code: string, redirectUri?: string) => Promise<AuthUser>;
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

  const clear = useCallback((nextStatus: AuthStatus = "unauthenticated") => {
    authGeneration.current += 1;
    clearAuthSession();
    setUser(null);
    setStatus(nextStatus);
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
    const generation = ++authGeneration.current;
    const authenticated = await apiLogin(email, password, () => authGeneration.current === generation);
    if (authGeneration.current !== generation) return authenticated;
    setUser(authenticated);
    setStatus("authenticated");
    return authenticated;
  }, []);

  const loginWithGoogle = useCallback(async (code: string, redirectUri?: string) => {
    const generation = ++authGeneration.current;
    const authenticated = await apiLoginWithGoogle(code, redirectUri, () => authGeneration.current === generation);
    if (authGeneration.current !== generation) return authenticated;
    setUser(authenticated);
    setStatus("authenticated");
    return authenticated;
  }, []);

  const register = useCallback(async (fullName: string, email: string, password: string) => {
    const generation = ++authGeneration.current;
    const authenticated = await apiRegister(fullName, email, password, () => authGeneration.current === generation);
    if (authGeneration.current !== generation) return authenticated;
    setUser(authenticated);
    setStatus("authenticated");
    return authenticated;
  }, []);

  const logout = useCallback(async () => {
    clear("signed-out");
    try { await apiLogout(); } finally { clear("signed-out"); }
  }, [clear]);

  const updateProfile = useCallback(async (patch: Parameters<typeof apiUpdateProfile>[0]) => {
    const updated = await apiUpdateProfile(patch);
    setUser(updated);
    return updated;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ user, status, login, loginWithGoogle, register, updateProfile, logout }), [login, loginWithGoogle, logout, register, status, updateProfile, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

export function useOptionalAuth(): AuthContextValue | undefined {
  return useContext(AuthContext);
}

