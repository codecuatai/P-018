import type { ReactNode } from "react";

import { OnboardingGate, RequireAuth } from "@/features/auth/route-boundaries";
import { AppShell } from "@/features/product/app-shell";

export default function ProductLayout({ children }: { children: ReactNode }) {
  return <RequireAuth><OnboardingGate><AppShell>{children}</AppShell></OnboardingGate></RequireAuth>;
}
