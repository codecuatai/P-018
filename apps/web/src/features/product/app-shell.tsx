"use client";

import { Bell, Heart, History, LifeBuoy, LogOut, Menu, MessageSquareText, ShieldCheck, Store, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { XOneMark } from "@/components/XOneMark";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/providers/auth-provider";
import { getUnreadNotificationCount } from "@/lib/api-client";

const navigation = [
  { href: "/app", label: "Trợ lý", icon: MessageSquareText },
  { href: "/app/history", label: "Lịch sử", icon: History },
  { href: "/app/notifications", label: "Thông báo", icon: Bell },
  { href: "/app/favorites", label: "Đã lưu", icon: Heart },
  { href: "/app/support", label: "Hỗ trợ", icon: LifeBuoy },
  { href: "/app/services", label: "Dịch vụ", icon: Store },
  { href: "/app/profile", label: "Hồ sơ & cài đặt", icon: UserRound },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    try { await logout(); } finally { router.replace("/"); }
  }

  return <div className="app-shell"><a className="skip-link" href="#app-content">Bỏ qua điều hướng</a>
    <aside className="app-sidebar"><Sidebar userEmail={user?.email ?? ""} pathname={pathname} onLogout={handleLogout} /></aside>
    <header className="app-mobile-header"><Link className="brand-link" href="/app"><XOneMark size={27} /><span>X-One</span></Link><Sheet><SheetTrigger asChild><button className="icon-button" type="button" aria-label="Mở điều hướng"><Menu size={20} /></button></SheetTrigger><SheetContent title="Không gian X-One"><Sidebar userEmail={user?.email ?? ""} pathname={pathname} onLogout={handleLogout} compact /></SheetContent></Sheet></header>
    <main className="app-content" id="app-content">{children}</main>
  </div>;
}

function Sidebar({ userEmail, pathname, onLogout, compact = false }: { userEmail: string; pathname: string | null; onLogout: () => Promise<void>; compact?: boolean }) {
  const contents = <div className="sidebar-content"><Link className="brand-link sidebar-brand" href="/app"><XOneMark size={30} /><span>X-One</span></Link><Link className="button button-primary sidebar-new" href="/app">Trợ lý mới</Link><nav className="app-nav" aria-label="Không gian X-One">{navigation.map(({ href, label, icon: Icon }) => { const current = href === "/app" ? pathname === "/app" : pathname === href || pathname?.startsWith(`${href}/`); const link = <Link className={`app-nav-link ${current ? "is-active" : ""}`} href={href} aria-current={current ? "page" : undefined}><Icon size={18} /><span>{label}</span>{href === "/app/notifications" ? <NotificationCount /> : null}</Link>; return compact ? <SheetClose asChild key={href}>{link}</SheetClose> : <span key={href}>{link}</span>; })}</nav><div className="sidebar-spacer" /><div className="sidebar-identity"><span className="identity-initials">{initials(userEmail)}</span><span><strong>{userEmail || "Tài khoản X-One"}</strong><small><ShieldCheck size={13} /> Phiên bảo mật</small></span></div><button className="sidebar-logout" type="button" onClick={() => void onLogout()}><LogOut size={17} /> Đăng xuất</button></div>;
  return contents;
}

function NotificationCount() {
  const { status } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (status !== "authenticated") { setCount(0); return; }
    let active = true;
    const controller = new AbortController();
    void getUnreadNotificationCount(controller.signal).then((result) => { if (active) setCount(result.unread_count); }).catch(() => undefined);
    return () => { active = false; controller.abort(); };
  }, [status]);
  return count > 0 ? <span className="notification-count" aria-label={`${count} thông báo chưa đọc`}>{count > 99 ? "99+" : count}</span> : null;
}

function initials(email: string): string {
  return email.trim().slice(0, 2).toUpperCase() || "XO";
}
