"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { AuthDialog } from "@/components/marketing/auth-dialog";

export type AuthDialogMode = "login" | "register";

interface MarketingAuthContextValue {
  openAuth: (mode: AuthDialogMode, nextPath?: string) => void;
}

const MarketingAuthContext = createContext<MarketingAuthContextValue | undefined>(undefined);

export function MarketingAuthProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AuthDialogMode>("login");
  const [open, setOpen] = useState(false);
  const [nextPath, setNextPath] = useState<string | undefined>();
  const openAuth = useCallback((nextMode: AuthDialogMode, next?: string) => {
    setMode(nextMode);
    setNextPath(safeInternalPath(next));
    setOpen(true);
  }, []);
  const value = useMemo(() => ({ openAuth }), [openAuth]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMode = params.get("auth");
    if (requestedMode !== "login" && requestedMode !== "register") return;
    setMode(requestedMode);
    setNextPath(safeInternalPath(params.get("next") ?? undefined));
    setOpen(true);
  }, []);

  return (
    <MarketingAuthContext.Provider value={value}>
      {children}
      <AuthDialog open={open} mode={mode} nextPath={nextPath} onOpenChange={setOpen} onModeChange={setMode} />
    </MarketingAuthContext.Provider>
  );
}

export function useMarketingAuth(): MarketingAuthContextValue {
  const value = useContext(MarketingAuthContext);
  if (!value) throw new Error("useMarketingAuth must be used inside MarketingAuthProvider");
  return value;
}

export function MarketingAuthTrigger({ mode, className, children }: { mode: AuthDialogMode; className?: string; children: ReactNode }) {
  const { openAuth } = useMarketingAuth();
  return <button className={className} type="button" onClick={() => openAuth(mode)}>{children}</button>;
}

export function safeInternalPath(value: string | null | undefined): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return undefined;
  try {
    const parsed = new URL(value, "http://localhost");
    if (parsed.origin !== "http://localhost") return undefined;
    if (parsed.pathname === "/login" || parsed.pathname === "/register") return undefined;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return undefined;
  }
}
