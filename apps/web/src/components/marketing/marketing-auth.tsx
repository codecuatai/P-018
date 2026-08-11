"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { AuthDialog } from "@/components/marketing/auth-dialog";

export type AuthDialogMode = "login" | "register";

interface MarketingAuthContextValue {
  openAuth: (mode: AuthDialogMode) => void;
}

const MarketingAuthContext = createContext<MarketingAuthContextValue | undefined>(undefined);

export function MarketingAuthProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AuthDialogMode>("login");
  const [open, setOpen] = useState(false);
  const openAuth = useCallback((nextMode: AuthDialogMode) => {
    setMode(nextMode);
    setOpen(true);
  }, []);
  const value = useMemo(() => ({ openAuth }), [openAuth]);

  return (
    <MarketingAuthContext.Provider value={value}>
      {children}
      <AuthDialog open={open} mode={mode} onOpenChange={setOpen} onModeChange={setMode} />
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
