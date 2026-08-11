import type { ReactNode } from "react";

import { RequireAuth } from "@/features/auth/route-boundaries";
import { AppShell } from "@/features/product/app-shell";
import { AuthProvider } from "@/providers/auth-provider";

export default function ProductLayout({ children }: { children: ReactNode }) {
  return <AuthProvider><RequireAuth><AppShell>{children}</AppShell></RequireAuth></AuthProvider>;
}
