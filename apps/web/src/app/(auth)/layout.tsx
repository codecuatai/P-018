import type { ReactNode } from "react";

import { AuthLayout } from "@/components/auth/auth-layout";
import { GuestOnly } from "@/features/auth/route-boundaries";

export default function AuthenticationLayout({ children }: { children: ReactNode }) {
  return <GuestOnly><AuthLayout>{children}</AuthLayout></GuestOnly>;
}
