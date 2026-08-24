// filepath: apps/web/src/features/product/app-shell.tsx
"use client";

import {
  Bell,
  BookmarkCheck,
  Bot,
  CarFront,
  ChevronLeft,
  ChevronRight,
  History,
  LifeBuoy,
  LogOut,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Settings,
  ShieldCheck,
  Stethoscope,
  Store,
  UserRound,
  Utensils,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { XOneMark } from "@/components/XOneMark";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { getUnreadNotificationCount, listConversations, listNotifications } from "@/lib/api-client";
import { CONVERSATIONS_CHANGED_EVENT, emitNewConversation } from "@/lib/conversation-events";
import { conversationTitle } from "@/lib/presentation";
import type { ConversationRecord } from "@/types";
import { useAuth } from "@/providers/auth-provider";

// Core navigation — only the 3 most frequently used destinations
const navigation = [
  { href: "/app", label: "Trợ lý AI", icon: Bot },
  { href: "/app/history", label: "Lịch sử", icon: History },
  { href: "/app/favorites", label: "Đã lưu", icon: BookmarkCheck },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const assistantWorkspace = pathname === "/app" || pathname?.startsWith("/app/conversations/");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  useEffect(() => {
    try {
      const savedSidebar = localStorage.getItem("xone_sidebar_collapsed");
      if (savedSidebar !== null) setSidebarCollapsed(savedSidebar === "true");
      const savedRail = localStorage.getItem("xone_rail_collapsed");
      if (savedRail !== null) setRailCollapsed(savedRail === "true");
      const savedWidth = localStorage.getItem("xone_sidebar_width");
      if (savedWidth) {
        const parsed = parseInt(savedWidth, 10);
        if (!isNaN(parsed) && parsed >= 180 && parsed <= 450) setSidebarWidth(parsed);
      }
    } catch {
      // Ignore localStorage errors in private browsing
    }

    const handleRailState = (e: Event) => {
      const detail = (e as CustomEvent<{ collapsed: boolean }>).detail;
      if (detail && typeof detail.collapsed === "boolean") setRailCollapsed(detail.collapsed);
    };
    window.addEventListener("xone-rail-state-changed", handleRailState);

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarCollapsed((prev) => {
          const next = !prev;
          try { localStorage.setItem("xone_sidebar_collapsed", String(next)); } catch { }
          return next;
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("xone-rail-state-changed", handleRailState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleSidebarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSidebar(true);
  };

  useEffect(() => {
    if (!isResizingSidebar) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(Math.max(e.clientX, 180), 450);
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      try {
        localStorage.setItem("xone_sidebar_width", String(sidebarWidth));
      } catch { }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingSidebar, sidebarWidth]);

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("xone_sidebar_collapsed", String(next)); } catch { }
      return next;
    });
  }

  function toggleRail() {
    window.dispatchEvent(new CustomEvent("xone-toggle-rail"));
  }

  async function handleLogout() {
    try { await logout(); } finally { router.replace("/"); }
  }

  return (
    <div className={`flex flex-col h-[100dvh] min-h-[100dvh] overflow-hidden bg-slate-50 font-sans text-slate-900 ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}>
      <a className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white focus:text-blue-600 focus:shadow-md focus:rounded-lg" href="#app-content">Bỏ qua điều hướng</a>

      {/* Desktop Global Header */}
      <header className="hidden md:flex items-center justify-between h-14 min-h-[56px] px-5 bg-white/80 backdrop-blur-md border-b border-slate-200/60 z-50 shrink-0 sticky top-0">
        <div className="flex items-center gap-3">
          <Link className="flex items-center gap-2 font-bold text-lg text-slate-900 no-underline transition-opacity duration-200 hover:opacity-80" href="/app">
            <XOneMark size={26} />
            <span>X-One</span>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <NotificationBell />
          <UserMenu userEmail={user?.email ?? ""} onLogout={handleLogout} />
        </div>
      </header>

      <div
        className={`relative flex-1 grid h-[calc(100dvh-56px)] min-h-0 overflow-hidden ${isResizingSidebar ? "select-none cursor-col-resize" : ""}`}
        style={{
          gridTemplateColumns: sidebarCollapsed ? "0px minmax(0, 1fr)" : `${sidebarWidth}px minmax(0, 1fr)`,
        }}
      >
        <aside
          className={`relative h-full max-h-full p-4 bg-white border-r border-slate-200/60 overflow-hidden flex flex-col transition-all duration-300 ease-in-out shrink-0 ${sidebarCollapsed ? "opacity-0 border-r-0 pointer-events-none p-0" : "opacity-100"}`}
          style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
        >
          <Sidebar userEmail={user?.email ?? ""} pathname={pathname} onLogout={handleLogout} onToggleCollapse={toggleSidebar} />
          {!sidebarCollapsed && (
            <div
              className="absolute top-0 -right-[3px] bottom-0 w-[6px] z-[35] cursor-col-resize transition-colors duration-200 hover:bg-blue-500/60"
              onMouseDown={handleSidebarMouseDown}
              onDoubleClick={toggleSidebar}
              title="Kéo để chỉnh kích thước sidebar, nhấp đúp để ẩn"
            />
          )}
        </aside>

        {/* Center Vertical Edge Toggle Button for Left Sidebar */}
        <button
          className={`absolute top-1/2 -translate-y-1/2 z-40 grid w-7 h-7 place-items-center bg-white border border-slate-200/80 rounded-full text-slate-500 cursor-pointer shadow-sm shadow-slate-200/50 transition-all duration-200 hover:bg-blue-600 hover:text-white hover:border-blue-600 hover:shadow-md hover:scale-110 active:scale-95 ${sidebarCollapsed ? "shadow-md" : ""}`}
          type="button"
          aria-label={sidebarCollapsed ? "Mở menu bên trái (Ctrl+B)" : "Thu gọn menu bên trái (Ctrl+B)"}
          title={sidebarCollapsed ? "Mở menu (Ctrl+B)" : "Thu gọn menu (Ctrl+B)"}
          onClick={toggleSidebar}
          style={{
            left: sidebarCollapsed ? "10px" : `${sidebarWidth}px`,
            transform: sidebarCollapsed ? "translateY(-50%)" : "translate(-50%, -50%)"
          }}
        >
          {sidebarCollapsed ? <ChevronRight size={14} strokeWidth={2.5} /> : <ChevronLeft size={14} strokeWidth={2.5} />}
        </button>

        {/* Main Content Column */}
        <div className="flex flex-col min-w-0 h-full overflow-hidden">
          {/* Mobile Header */}
          <header className="md:hidden flex items-center justify-between px-4 h-14 bg-white/90 backdrop-blur-md border-b border-slate-200/60 shrink-0 sticky top-0 z-50">
            <Link className="flex items-center gap-2 font-bold text-lg text-slate-900 no-underline transition-opacity hover:opacity-80" href="/app">
              <XOneMark size={27} />
              <span>X-One</span>
            </Link>
            <div className="flex items-center gap-3">
              <NotificationBell />
              <Sheet>
                <SheetTrigger asChild>
                  <button className="grid place-items-center w-9 h-9 rounded-full text-slate-600 bg-slate-50 border border-slate-200/80 transition-all duration-200 hover:bg-slate-100 active:scale-95 shadow-sm" type="button" aria-label="Mở điều hướng">
                    <Menu size={18} strokeWidth={2.5} />
                  </button>
                </SheetTrigger>
                <SheetContent title="Không gian X-One" className="w-[280px] p-4 bg-white border-l border-slate-200/60">
                  <Sidebar userEmail={user?.email ?? ""} pathname={pathname} onLogout={handleLogout} compact />
                </SheetContent>
              </Sheet>
            </div>
          </header>

          {/* Main Body */}
          <main className={`relative min-w-0 flex-1 overflow-y-auto bg-slate-50/50 ${assistantWorkspace ? "flex flex-col p-0 overflow-hidden" : "p-6 md:p-10 pb-20"}`} id="app-content">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ userEmail, pathname, onLogout, onToggleCollapse, compact = false }: { userEmail: string; pathname: string | null; onLogout: () => Promise<void>; onToggleCollapse?: () => void; compact?: boolean }) {
  return (
    <div className="flex flex-col h-full min-h-0 w-full min-w-[180px] overflow-hidden">
      <Link className="inline-flex items-center justify-center gap-2 w-full h-10 mb-4 bg-blue-600 text-white font-semibold text-sm rounded-full shadow-sm shadow-blue-600/20 transition-all duration-200 hover:bg-blue-700 hover:-translate-y-[1px] active:scale-95 shrink-0" href="/app" onClick={emitNewConversation} title="Bắt đầu đoạn chat mới và xóa bớt ngữ cảnh cũ">
        <Plus size={16} strokeWidth={2.5} />
        <span>Đoạn chat mới</span>
      </Link>

      <nav className="grid gap-1.5 shrink-0" aria-label="Không gian X-One">
        {navigation.map(({ href, label, icon: Icon }) => {
          const current = href === "/app" ? pathname === "/app" || Boolean(pathname?.startsWith("/app/conversations/")) : pathname === href || pathname?.startsWith(`${href}/`);
          const link = <Link className={`flex items-center gap-3 min-h-9 px-3 py-2 rounded-xl text-sm transition-all duration-200 active:scale-[0.98] ${current ? "text-blue-600 bg-blue-50 font-bold shadow-sm shadow-blue-500/5" : "text-slate-500 font-semibold hover:text-slate-900 hover:bg-slate-100/80"}`} href={href} aria-current={current ? "page" : undefined}><Icon size={17} strokeWidth={current ? 2.5 : 2} /><span>{label}</span></Link>;
          return compact ? <SheetClose asChild key={href}>{link}</SheetClose> : <span key={href}>{link}</span>;
        })}
      </nav>

      <RecentConversations pathname={pathname} compact={compact} />

      <div className="relative z-40 flex items-center justify-between gap-2 px-1 pt-4 mt-auto border-t border-slate-200/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="grid w-9 h-9 place-items-center shrink-0 text-blue-700 bg-blue-50 border border-blue-100 rounded-xl text-xs font-extrabold shadow-sm shadow-blue-600/5">{initials(userEmail)}</span>
          <span className="grid gap-0.5 min-w-0">
            <strong className="block overflow-hidden text-slate-900 text-xs text-ellipsis whitespace-nowrap">{userEmail || "user1@gmail.com"}</strong>
            <small className="flex items-center gap-1 text-emerald-600 text-[10px] font-medium"><ShieldCheck size={12} strokeWidth={2.5} /> Phiên bảo mật</small>
          </span>
        </div>
        <SidebarUserMenu onLogout={onLogout} compact={compact} />
      </div>
    </div>
  );
}

function SidebarUserMenu({ onLogout, compact }: { onLogout: () => Promise<void>; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const menuItems = [
    { href: "/app/profile", icon: UserRound, label: "Hồ sơ & cài đặt" },
    { href: "/app/services", icon: Store, label: "Dịch vụ" },
    { href: "/app/support", icon: LifeBuoy, label: "Hỗ trợ" },
  ];

  return <div className="relative shrink-0" ref={ref}>
    <button className="grid w-8 h-8 place-items-center text-slate-400 bg-transparent border border-transparent rounded-lg cursor-pointer transition-all duration-200 hover:text-slate-900 hover:bg-slate-100 hover:border-slate-200 active:scale-95" type="button" aria-label="Cài đặt và tài khoản" onClick={() => setOpen((v) => !v)}>
      <Settings size={16} strokeWidth={2} />
    </button>
    {open && <div className="absolute bottom-[calc(100%+12px)] -right-1 z-[100] min-w-[190px] p-1.5 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-200/50 grid gap-0.5" role="menu">
      {menuItems.map(({ href, icon: Icon, label }) =>
        compact
          ? <SheetClose asChild key={href}><Link className="flex items-center gap-3 w-full p-2 text-slate-700 rounded-lg text-sm font-semibold transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 active:scale-[0.98]" href={href} role="menuitem" onClick={() => setOpen(false)}><Icon size={15} className="text-slate-400 shrink-0" /><span>{label}</span></Link></SheetClose>
          : <Link className="flex items-center gap-3 w-full p-2 text-slate-700 rounded-lg text-sm font-semibold transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 active:scale-[0.98]" href={href} role="menuitem" key={href} onClick={() => setOpen(false)}><Icon size={15} className="text-slate-400 shrink-0" /><span>{label}</span></Link>
      )}
      <div className="h-[1px] bg-slate-100 my-1" />
      <button className="flex items-center gap-3 w-full p-2 text-red-600 rounded-lg text-sm font-semibold transition-all duration-200 hover:bg-red-50 hover:text-red-700 active:scale-[0.98]" type="button" role="menuitem" onClick={() => { setOpen(false); void onLogout(); }}>
        <LogOut size={15} className="text-red-600 shrink-0" /><span>Đăng xuất</span>
      </button>
    </div>}
  </div>;
}

function NotificationBell() {
  const { status } = useAuth();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Array<{ id: string; title: string; body?: string; read: boolean }>>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status !== "authenticated") { setCount(0); return; }
    let active = true;
    const controller = new AbortController();
    void getUnreadNotificationCount(controller.signal).then((result) => { if (active) setCount(result.unread_count); }).catch(() => undefined);
    return () => { active = false; controller.abort(); };
  }, [status]);

  useEffect(() => {
    if (!open || status !== "authenticated") return;
    let active = true;
    void listNotifications().then((result) => {
      if (active) setItems((result.items ?? []).slice(0, 6).map((n) => ({
        id: n.id,
        title: n.title || "Thông báo",
        body: n.body || undefined,
        read: n.status === "READ",
      })));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [open, status]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return <div className="relative" ref={ref}>
    <button className="relative w-9 h-9 rounded-full border border-slate-200/80 bg-white text-slate-600 grid place-items-center cursor-pointer transition-all duration-200 hover:bg-slate-50 hover:border-slate-300 hover:text-blue-600 active:scale-95 shadow-sm" type="button" aria-label={`Thông báo${count > 0 ? `, ${count} chưa đọc` : ""}`} onClick={() => setOpen((v) => !v)}>
      <Bell size={18} strokeWidth={2} />
      {count > 0 && <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full border-[2px] border-white shadow-sm leading-none pointer-events-none" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
    </button>
    {open && <div className="absolute top-[calc(100%+12px)] right-0 z-[200] w-[min(320px,90vw)] bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-200/50 flex flex-col overflow-hidden" role="dialog" aria-label="Thông báo">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 text-sm font-bold text-slate-900">
        <span>Thông báo</span>
        {count > 0 && <span className="text-[10px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full font-semibold">{count} chưa đọc</span>}
        <button className="grid place-items-center w-7 h-7 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors duration-200" type="button" aria-label="Đóng" onClick={() => setOpen(false)}><X size={14} strokeWidth={2.5} /></button>
      </div>
      <div className="max-h-[280px] overflow-y-auto py-1 grid gap-0.5 scrollbar-thin scrollbar-thumb-slate-200 hover:scrollbar-thumb-slate-300">
        {items.length === 0
          ? <p className="px-3 py-8 text-center text-slate-500 text-xs m-0">Không có thông báo mới.</p>
          : items.map((item) => <div key={item.id} className={`flex items-start gap-3 px-4 py-3 text-xs border-b border-slate-50 last:border-0 relative transition-colors duration-200 hover:bg-slate-50/80 ${item.read ? "" : "bg-blue-50/30"}`}>
            {!item.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5 shadow-sm shadow-blue-500/30" aria-hidden="true" />}
            <div className="min-w-0 grid gap-1">
              <strong className="text-slate-900 text-xs leading-snug">{item.title}</strong>
              {item.body && <span className="text-slate-500 text-[11px] leading-relaxed">{item.body}</span>}
            </div>
          </div>)}
      </div>
      <div className="px-4 py-3 border-t border-slate-100 text-center text-xs bg-slate-50/50">
        <Link href="/app/notifications" onClick={() => setOpen(false)} className="text-blue-600 font-semibold hover:underline">Xem tất cả thông báo →</Link>
      </div>
    </div>}
  </div>;
}

function UserMenu({ userEmail, onLogout }: { userEmail: string; onLogout: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const menuItems = [
    { href: "/app/profile", icon: UserRound, label: "Hồ sơ & cài đặt" },
    { href: "/app/services", icon: Store, label: "Dịch vụ" },
    { href: "/app/support", icon: LifeBuoy, label: "Hỗ trợ" },
  ];

  return <div className="relative" ref={ref}>
    <button className="grid place-items-center p-0 bg-transparent border-0 cursor-pointer active:scale-95 transition-transform duration-200" type="button" aria-label="Tài khoản" onClick={() => setOpen((v) => !v)}>
      <span className="grid w-9 h-9 place-items-center bg-blue-600/10 text-blue-700 border border-blue-200/60 font-extrabold text-xs rounded-full shadow-sm shadow-blue-600/5">{initials(userEmail)}</span>
    </button>
    {open && <div className="absolute top-[calc(100%+12px)] right-0 z-[200] min-w-[220px] p-1.5 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-200/50 grid gap-1" role="menu">
      <div className="px-3 py-2 grid gap-1">
        <strong className="block text-slate-900 text-sm overflow-hidden text-ellipsis whitespace-nowrap">{userEmail || "Tài khoản X-One"}</strong>
        <small className="flex items-center gap-1.5 text-emerald-600 text-[10px] font-medium"><ShieldCheck size={12} strokeWidth={2.5} /> Phiên bảo mật</small>
      </div>
      <div className="h-[1px] bg-slate-100 my-0.5" />
      {menuItems.map(({ href, icon: Icon, label }) => (
        <Link className="flex items-center gap-3 w-full p-2.5 text-slate-700 rounded-xl text-sm font-medium transition-all duration-200 hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98]" href={href} role="menuitem" key={href} onClick={() => setOpen(false)}>
          <Icon size={16} className="text-slate-400 shrink-0" />
          <span>{label}</span>
        </Link>
      ))}
      <div className="h-[1px] bg-slate-100 my-0.5" />
      <button className="flex items-center gap-3 w-full p-2.5 text-red-600 rounded-xl text-sm font-medium transition-all duration-200 hover:bg-red-50 hover:text-red-700 active:scale-[0.98]" type="button" role="menuitem" onClick={() => { setOpen(false); void onLogout(); }}>
        <LogOut size={16} className="text-red-600 shrink-0" />
        <span>Đăng xuất</span>
      </button>
    </div>}
  </div>;
}

function RecentConversations({ pathname, compact }: { pathname: string | null; compact: boolean }) {
  const [items, setItems] = useState<ConversationRecord[]>([]);
  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    const load = () => {
      controller?.abort();
      controller = new AbortController();
      void listConversations(false, controller.signal).then((result) => { if (active) setItems(result.items); }).catch(() => undefined);
    };
    const handleChange = () => load();
    load();
    window.addEventListener(CONVERSATIONS_CHANGED_EVENT, handleChange);
    return () => { active = false; controller?.abort(); window.removeEventListener(CONVERSATIONS_CHANGED_EVENT, handleChange); };
  }, []);
  const groups = groupConversations(items.filter((item) => item.status !== "ARCHIVED")).slice(0, 3);
  if (!groups.length) return null;
  return (
    <div className="flex flex-col flex-1 min-h-0 mt-3 pt-3 border-t border-slate-200/60 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-2 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
        <span>Gần đây</span>
        <Link href="/app/history" className="inline-flex items-center text-blue-600 font-semibold tracking-normal normal-case hover:underline">Xem tất cả</Link>
      </div>
      <nav aria-label="Cuộc trò chuyện gần đây" className="grid content-start gap-3 flex-1 min-h-0 pr-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-200 hover:scrollbar-thumb-slate-300 transition-colors">
        {groups.map((group) => (
          <div className="grid gap-1" key={group.label}>
            <small className="px-2 pt-1 pb-0.5 text-xs font-semibold text-slate-400">{group.label}</small>
            {group.items.slice(0, compact ? 4 : 5).map((item) => {
              const current = pathname === `/app/conversations/${encodeURIComponent(item.conversationId)}`;
              const title = conversationTitle(item);
              const Icon = conversationIcon(title);
              return (
                <Link
                  className={`flex items-center gap-2 min-w-0 p-2 rounded-lg text-sm transition-all duration-200 active:scale-[0.98] ${current ? "text-blue-600 bg-blue-50 font-semibold shadow-sm shadow-blue-500/5" : "text-slate-700 hover:text-slate-900 hover:bg-slate-100/80"}`}
                  href={`/app/conversations/${encodeURIComponent(item.conversationId)}`}
                  aria-current={current ? "page" : undefined}
                  key={item.conversationId}
                >
                  <span className={`grid w-5 h-5 place-items-center shrink-0 transition-colors duration-200 ${current ? "text-blue-600" : "text-slate-400 group-hover:text-blue-600"}`} aria-hidden="true"><Icon size={14} strokeWidth={current ? 2.5 : 2} /></span>
                  <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm leading-snug">{title}</span>
                  <time className="text-slate-400 text-[10px] font-medium shrink-0">{formatRecentTime(item.updatedAt ?? item.lastMessageAt ?? item.createdAt)}</time>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}

function conversationIcon(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes("xe") || lower.includes("chuyến") || lower.includes("đi") || lower.includes("đón")) return CarFront;
  if (lower.includes("ăn") || lower.includes("phở") || lower.includes("món") || lower.includes("quán") || lower.includes("bàn") || lower.includes("nhà hàng")) return Utensils;
  if (lower.includes("khám") || lower.includes("bệnh") || lower.includes("bác sĩ") || lower.includes("y tế")) return Stethoscope;
  return MessageSquareText;
}

function groupConversations(items: ConversationRecord[]): Array<{ label: string; items: ConversationRecord[] }> {
  const groups = new Map<string, ConversationRecord[]>();
  for (const item of [...items].sort((left, right) => dateValue(right) - dateValue(left))) {
    const label = dayGroup(item.updatedAt ?? item.lastMessageAt ?? item.createdAt);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return ["Hôm nay", "Hôm qua", "Trước đó"].flatMap((label) => groups.has(label) ? [{ label, items: groups.get(label)! }] : []);
}

function dayGroup(value?: string): string {
  const date = value ? new Date(value) : new Date(0);
  if (Number.isNaN(date.getTime())) return "Trước đó";
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const candidate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const difference = Math.round((day - candidate) / 86_400_000);
  return difference <= 0 ? "Hôm nay" : difference === 1 ? "Hôm qua" : "Trước đó";
}

function dateValue(value: ConversationRecord): number { const parsed = new Date(value.updatedAt ?? value.lastMessageAt ?? value.createdAt ?? 0).getTime(); return Number.isFinite(parsed) ? parsed : 0; }
function formatRecentTime(value?: string): string { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(date); }
function initials(email: string): string { return email.trim().slice(0, 2).toUpperCase() || "XO"; }
