import Link from "next/link";
import type { ReactNode } from "react";

import { XOneMark } from "@/components/XOneMark";

export function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="auth-layout-shell"><a className="skip-link" href="#main-content">Bỏ qua điều hướng</a><header className="auth-topbar"><Link className="brand-link" href="/"><XOneMark size={28} /><span>X-One</span></Link><Link className="text-link" href="/">Về trang chủ</Link></header><main id="main-content" className="auth-main">{children}</main></div>;
}
