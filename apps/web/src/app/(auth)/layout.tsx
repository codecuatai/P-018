import type { ReactNode } from "react";

import { AuthLayout } from "@/components/auth/auth-layout";
import { GuestOnly } from "@/features/auth/route-boundaries";
import { AuthProvider } from "@/providers/auth-provider";

export default function AuthenticationLayout({ children }: { children: ReactNode }) {
  return <AuthProvider><GuestOnly><AuthLayout>{children}</AuthLayout></GuestOnly></AuthProvider>;
}
