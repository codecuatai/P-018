import Link from "next/link";
import type { ReactNode } from "react";

import { XOneMark } from "@/components/XOneMark";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-layout-shell">
      <a className="skip-link" href="#main-content">Bỏ qua điều hướng</a>
      <header className="auth-topbar">
        <Link className="brand-link" href="/"><XOneMark size={28} /><span>X-One</span></Link>
        <nav style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link className="text-link" href="/?auth=login">Đăng nhập</Link>
          <Link className="button button-primary" style={{ minHeight: 40, padding: "8px 16px", fontSize: "var(--text-sm)" }} href="/?auth=register">Bắt đầu miễn phí</Link>
        </nav>
      </header>
      <main id="main-content" className="auth-main">{children}</main>
    </div>
  );
}
