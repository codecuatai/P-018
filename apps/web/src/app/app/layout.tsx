import type { ReactNode } from "react";

import { OnboardingGate, RequireAuth } from "@/features/auth/route-boundaries";
import { AppShell } from "@/features/product/app-shell";
import { AuthProvider } from "@/providers/auth-provider";

export default function ProductLayout({ children }: { children: ReactNode }) {
  return <AuthProvider><RequireAuth><OnboardingGate><AppShell>{children}</AppShell></OnboardingGate></RequireAuth></AuthProvider>;
}
