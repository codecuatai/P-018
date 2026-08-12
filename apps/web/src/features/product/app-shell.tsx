"use client";

import { HeartPulse, History, LogOut, MapPinned, Menu, MessageSquareText, Settings, ShieldCheck, Store, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { XOneMark } from "@/components/XOneMark";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/providers/auth-provider";

const navigation = [
  { href: "/app", label: "Trợ lý", icon: MessageSquareText },
  { href: "/app/history", label: "Lịch sử", icon: History },
  { href: "/app/services", label: "Dịch vụ", icon: Store },
  { href: "/app/profile", label: "Hồ sơ", icon: UserRound },
  { href: "/app/addresses", label: "Địa chỉ", icon: MapPinned },
  { href: "/app/patients", label: "Hồ sơ y tế", icon: HeartPulse },
  { href: "/app/settings", label: "Cài đặt", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    try { await logout(); } finally { router.replace("/login"); }
  }

  return <div className="app-shell"><a className="skip-link" href="#app-content">Bỏ qua điều hướng</a>
    <aside className="app-sidebar"><Sidebar userEmail={user?.email ?? ""} onLogout={handleLogout} /></aside>
    <header className="app-mobile-header"><Link className="brand-link" href="/app"><XOneMark size={27} /><span>X-One</span></Link><Sheet><SheetTrigger asChild><button className="icon-button" type="button" aria-label="Mở điều hướng"><Menu size={20} /></button></SheetTrigger><SheetContent title="Không gian X-One"><Sidebar userEmail={user?.email ?? ""} onLogout={handleLogout} compact /></SheetContent></Sheet></header>
    <main className="app-content" id="app-content">{children}</main>
  </div>;
}

function Sidebar({ userEmail, onLogout, compact = false }: { userEmail: string; onLogout: () => Promise<void>; compact?: boolean }) {
  const contents = <div className="sidebar-content"><Link className="brand-link sidebar-brand" href="/app"><XOneMark size={30} /><span>X-One</span></Link><Link className="button button-primary sidebar-new" href="/app">Trợ lý mới</Link><nav className="app-nav" aria-label="Không gian X-One">{navigation.map(({ href, label, icon: Icon }) => compact ? <SheetClose asChild key={href}><Link className="app-nav-link" href={href}><Icon size={18} /><span>{label}</span></Link></SheetClose> : <Link className="app-nav-link" href={href} key={href}><Icon size={18} /><span>{label}</span></Link>)}</nav><div className="sidebar-spacer" /><div className="sidebar-identity"><span className="identity-initials">{initials(userEmail)}</span><span><strong>{userEmail || "Tài khoản X-One"}</strong><small><ShieldCheck size={13} /> Phiên bảo mật</small></span></div><button className="sidebar-logout" type="button" onClick={() => void onLogout()}><LogOut size={17} /> Đăng xuất</button></div>;
  return contents;
}

function initials(email: string): string {
  return email.trim().slice(0, 2).toUpperCase() || "XO";
}
