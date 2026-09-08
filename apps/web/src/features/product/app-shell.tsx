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
  Loader2,
  LogOut,
  Menu,
  MessageSquareText,
  Plus,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Store,
  UserRound,
  Utensils,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { XOneMark } from "@/components/XOneMark";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { getUnreadNotificationCount, listConversations, listNotifications } from "@/lib/api-client";
import { ACTIVE_CONVERSATION_EVENT, CONVERSATIONS_CHANGED_EVENT, emitNewConversation, emitNotificationsChanged, NEW_CONVERSATION_EVENT, NOTIFICATIONS_CHANGED_EVENT } from "@/lib/conversation-events";
import { conversationTitle } from "@/lib/presentation";
import type { ConversationRecord } from "@/types";
import { useAuth } from "@/providers/auth-provider";

const navigation = [
  { href: "/app", label: "Trợ lý AI", description: "Chat với X-One AI", icon: Bot },
  { href: "/app/services", label: "Dịch vụ", description: "Đồ ăn, chuyến xe, nhà hàng, lịch khám", icon: Store },
  { href: "/app/history", label: "Lịch sử", description: "Chuyến xe, đơn hàng và lịch khám đã dùng", icon: History },
  { href: "/app/favorites", label: "Đã lưu", description: "Địa điểm và dịch vụ hay dùng", icon: BookmarkCheck },
];

function getRoleBadge(role?: string): { label: string; className: string; switchHref?: string; switchLabel?: string } {
  switch (role) {
    case "admin":
      return { label: "Admin", className: "role-badge-admin", switchHref: "/admin", switchLabel: "Admin Console" };
    case "manager":
      return { label: "Quản lý", className: "role-badge-manager", switchHref: "/admin", switchLabel: "Trung tâm vận hành" };
    case "provider":
      return { label: "Đối tác", className: "role-badge-provider", switchHref: "/app/provider", switchLabel: "Cổng đối tác" };
    case "user":
    case "customer":
    default:
      return { label: "Khách hàng", className: "role-badge-customer" };
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [activeConversationId, setActiveConversationId] = useState<string>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const assistantWorkspace = pathname === "/app" || pathname?.startsWith("/app/conversations/");
  const assistantHref = activeConversationId ? `/app/conversations/${encodeURIComponent(activeConversationId)}` : "/app";

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 820);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const match = pathname?.match(/^\/app\/conversations\/([^/]+)/);
    if (match) setActiveConversationId(decodeURIComponent(match[1]));
  }, [pathname]);

  useEffect(() => {
    const handleActiveConversation = (event: Event) => {
      const conversationId = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId;
      setActiveConversationId(typeof conversationId === "string" && conversationId ? conversationId : undefined);
    };
    const handleNewConversation = () => setActiveConversationId(undefined);
    window.addEventListener(ACTIVE_CONVERSATION_EVENT, handleActiveConversation);
    window.addEventListener(NEW_CONVERSATION_EVENT, handleNewConversation);
    return () => {
      window.removeEventListener(ACTIVE_CONVERSATION_EVENT, handleActiveConversation);
      window.removeEventListener(NEW_CONVERSATION_EVENT, handleNewConversation);
    };
  }, []);

  useEffect(() => {
    try {
      const savedCollapsed = localStorage.getItem("xone_sidebar_collapsed");
      if (savedCollapsed !== null) setSidebarCollapsed(savedCollapsed === "true");
      const savedWidth = localStorage.getItem("xone_sidebar_width");
      if (savedWidth) {
        const parsed = parseInt(savedWidth, 10);
        if (!Number.isNaN(parsed) && parsed >= 180 && parsed <= 450) setSidebarWidth(parsed);
      }
    } catch {
      // Ignore localStorage errors in private browsing.
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setSidebarCollapsed((previous) => {
          const next = !previous;
          try { localStorage.setItem("xone_sidebar_collapsed", String(next)); } catch { /* best effort */ }
          return next;
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isResizingSidebar) return;
    const handleMouseMove = (event: MouseEvent) => setSidebarWidth(Math.min(Math.max(event.clientX, 180), 450));
    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      try { localStorage.setItem("xone_sidebar_width", String(sidebarWidth)); } catch { /* best effort */ }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingSidebar, sidebarWidth]);

  function toggleSidebar() {
    setSidebarCollapsed((previous) => {
      const next = !previous;
      try { localStorage.setItem("xone_sidebar_collapsed", String(next)); } catch { /* best effort */ }
      return next;
    });
  }

  async function handleLogout() {
    try { await logout(); } finally { router.replace("/"); }
  }

  if (pathname?.startsWith("/app/provider")) {
    return <>{children}</>;
  }

  return (
    <div className={`app-shell${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#app-content">Bỏ qua điều hướng</a>
      <header className="app-global-header">
        <div className="app-global-header-left">
          <Link className="brand-link header-brand" href={assistantHref} onClick={assistantWorkspace ? (event) => event.preventDefault() : undefined}>
            <XOneMark size={26} /><span>X-One</span>
          </Link>
        </div>
        <div className="app-global-header-right">
          {user?.role && ["admin", "manager", "provider"].includes(user.role) ? (
            <Link
              href={getRoleBadge(user.role).switchHref ?? "/app"}
              className={`role-switch-link ${getRoleBadge(user.role).className}`}
              title={`Chuyển sang ${getRoleBadge(user.role).switchLabel}`}
            >
              <ShieldCheck size={13} aria-hidden="true" />
              <span>{getRoleBadge(user.role).switchLabel}</span>
              <ChevronRight size={12} aria-hidden="true" />
            </Link>
          ) : (
            <span className="role-pill role-badge-customer" title="Khách hàng cá nhân">
              <UserRound size={12} aria-hidden="true" />
              <span>Khách hàng</span>
            </span>
          )}
          <NotificationBell />
          <UserMenu userEmail={user?.email ?? ""} userRole={user?.role} onLogout={handleLogout} />
        </div>
      </header>

      <div
        className={`app-body${isResizingSidebar ? " is-resizing-active" : ""}`}
        style={isMobile ? undefined : { gridTemplateColumns: sidebarCollapsed ? "0px minmax(0, 1fr)" : `${sidebarWidth}px minmax(0, 1fr)` }}
      >
        <aside className="app-sidebar" style={isMobile ? undefined : { width: sidebarCollapsed ? 0 : sidebarWidth }}>
          <Sidebar userEmail={user?.email ?? ""} userRole={user?.role} pathname={pathname} assistantHref={assistantHref} assistantWorkspace={assistantWorkspace} onLogout={handleLogout} />
          {!sidebarCollapsed && <div className="sidebar-resizer" onMouseDown={(event) => { event.preventDefault(); setIsResizingSidebar(true); }} onDoubleClick={toggleSidebar} title="Kéo để chỉnh kích thước sidebar, nhấp đúp để ẩn" />}
        </aside>
        <button
          className={`sidebar-edge-toggle${sidebarCollapsed ? " is-collapsed" : ""}`}
          type="button"
          aria-label={sidebarCollapsed ? "Mở menu bên trái (Ctrl+B)" : "Thu gọn menu bên trái (Ctrl+B)"}
          title={sidebarCollapsed ? "Mở menu (Ctrl+B)" : "Thu gọn menu (Ctrl+B)"}
          onClick={toggleSidebar}
          style={isMobile ? undefined : { left: sidebarCollapsed ? "10px" : `${sidebarWidth}px` }}
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
        <header className="app-mobile-header">
          <Link className="brand-link" href={assistantHref} onClick={assistantWorkspace ? (event) => event.preventDefault() : undefined}><XOneMark size={27} /><span>X-One</span></Link>
          <div className="app-mobile-actions">
            <NotificationBell />
            <Sheet><SheetTrigger asChild><button className="icon-button" type="button" aria-label="Mở điều hướng"><Menu size={20} /></button></SheetTrigger><SheetContent title="Không gian X-One"><Sidebar userEmail={user?.email ?? ""} userRole={user?.role} pathname={pathname} assistantHref={assistantHref} assistantWorkspace={assistantWorkspace} onLogout={handleLogout} compact /></SheetContent></Sheet>
          </div>
        </header>
        <main className={`app-content${assistantWorkspace ? " app-content-assistant" : ""}`} id="app-content">{children}</main>
        <nav className="mobile-bottom-nav" aria-label="Điều hướng nhanh">
          {navigation.map(({ href, label, icon: Icon }) => {
            const isAssistant = href === "/app";
            const targetHref = isAssistant ? assistantHref : href;
            const current = isAssistant ? assistantWorkspace : pathname === href || pathname?.startsWith(`${href}/`);
            return <Link key={href} className={`mobile-bottom-nav-link${current ? " is-active" : ""}`} href={targetHref} aria-current={current ? "page" : undefined}><Icon size={19} /><span>{label}</span></Link>;
          })}
        </nav>
      </div>
    </div>
  );
}

function Sidebar({ userEmail, userRole, pathname, assistantHref, assistantWorkspace, onLogout, compact = false }: { userEmail: string; userRole?: string; pathname: string | null; assistantHref: string; assistantWorkspace: boolean; onLogout: () => Promise<void>; compact?: boolean }) {
  return <div className="sidebar-content">
    <p className="sidebar-eyebrow">X-One cho khách hàng</p>
    <Link className="sidebar-new-btn" href="/app" onClick={emitNewConversation} title="Bắt đầu đoạn chat mới với trợ lý X-One"><Plus size={16} /><span>Đoạn chat mới</span></Link>
    <nav className="app-nav" aria-label="Điều hướng chính">{navigation.map(({ href, label, description, icon: Icon }) => {
      const isAssistant = href === "/app";
      const targetHref = isAssistant ? assistantHref : href;
      const current = isAssistant ? assistantWorkspace : pathname === href || pathname?.startsWith(`${href}/`);
      const link = <Link className={`app-nav-link ${current ? "is-active" : ""}`} href={targetHref} title={description} aria-current={current ? "page" : undefined} onClick={isAssistant && assistantWorkspace ? (event) => event.preventDefault() : undefined}><Icon size={17} /><span>{label}</span></Link>;
      return compact ? <SheetClose asChild key={href}>{link}</SheetClose> : <span key={href}>{link}</span>;
    })}</nav>
    <RecentConversations pathname={pathname} compact={compact} />
    <div className="sidebar-spacer" />
    <div className="sidebar-footer"><div className="sidebar-identity"><span className="identity-initials" aria-hidden="true">{initials(userEmail)}</span><span className="sidebar-identity-copy"><strong title={userEmail}>{userEmail || "Tài khoản X-One"}</strong><small><ShieldCheck size={12} aria-hidden="true" /> {getRoleBadge(userRole).label} · Phiên bảo mật</small></span></div><SidebarUserMenu onLogout={onLogout} compact={compact} userRole={userRole} /></div>
  </div>;
}

const accountMenuItems = [
  { href: "/app/profile", icon: UserRound, label: "Hồ sơ & cài đặt" },
  { href: "/app/services", icon: Store, label: "Dịch vụ" },
  { href: "/app/support", icon: LifeBuoy, label: "Hỗ trợ" },
];

function SidebarUserMenu({ onLogout, compact }: { onLogout: () => Promise<void>; compact: boolean; userRole?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(open, () => setOpen(false));
  const items = [...accountMenuItems];

  return <div className="sidebar-user-menu" ref={ref}><button className="sidebar-settings-btn" type="button" aria-label="Cài đặt và tài khoản" onClick={() => setOpen((value) => !value)}><Settings size={16} /></button>{open && <div className="sidebar-user-dropdown" role="menu">{items.map(({ href, icon: Icon, label }) => compact ? <SheetClose asChild key={href}><Link className="dropdown-item" href={href} role="menuitem" onClick={() => setOpen(false)}><Icon size={15} className="dropdown-item-icon" /><span>{label}</span></Link></SheetClose> : <Link className="dropdown-item" href={href} role="menuitem" key={href} onClick={() => setOpen(false)}><Icon size={15} className="dropdown-item-icon" /><span>{label}</span></Link>)}<div className="dropdown-divider" /><button className="dropdown-item dropdown-item-danger" type="button" role="menuitem" onClick={() => { setOpen(false); void onLogout(); }}><LogOut size={15} className="dropdown-item-danger-icon" /><span>Đăng xuất</span></button></div>}</div>;
}

function NotificationBell() {
  const { status } = useAuth();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Array<{ id: string; title: string; body?: string; read: boolean; href?: string }>>([]);
  const ref = useOutsideClick<HTMLDivElement>(open, () => setOpen(false));

  const refreshCount = useCallback(async (signal?: AbortSignal) => {
    if (status !== "authenticated") { setCount(0); return; }
    try {
      const result = await getUnreadNotificationCount(signal);
      setCount(result.unread_count);
    } catch {}
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") { setCount(0); return; }
    const controller = new AbortController();
    void refreshCount(controller.signal);

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshCount();
      }
    }, 12_000);

    const handleFocus = () => void refreshCount();
    const handleNotificationsChanged = () => void refreshCount();

    window.addEventListener("focus", handleFocus);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handleNotificationsChanged);

    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handleNotificationsChanged);
    };
  }, [status, refreshCount]);

  useEffect(() => {
    if (!open || status !== "authenticated") return;
    let active = true;
    setLoading(true);
    void listNotifications(undefined, 1, 8).then((result) => {
      if (!active) return;
      const allItems = result.items ?? [];
      const unreadCount = result.unread_count;
      setItems(allItems.map((item) => ({
        id: item.id,
        title: item.title || "Thông báo",
        body: item.body || undefined,
        read: item.status === "READ",
        href: item.resource_type && item.resource_id && ["food_order", "ride_booking", "restaurant_reservation", "healthcare_appointment"].includes(item.resource_type)
          ? `/app/history/${item.resource_type}/${encodeURIComponent(item.resource_id)}`
          : undefined,
      })));
      setCount(Math.max(0, unreadCount));
    }).catch(() => undefined).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [open, status]);

  return (
    <div className="notification-bell-wrap" ref={ref}>
      <button
        className="notification-bell-btn"
        type="button"
        aria-label={`Thông báo${count > 0 ? `, ${count} chưa đọc` : ""}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={18} />
        {count > 0 && <span className="notification-badge-pill" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
      </button>
      {open && (
        <div className="notification-popover" role="dialog" aria-label="Thông báo">
          <div className="notification-popover-header">
            <span>Thông báo</span>
            {items.some((i) => !i.read) && (
              <span className="notif-unread-count">{items.filter((i) => !i.read).length} chưa đọc</span>
            )}
            <button className="icon-button notif-close-btn" type="button" aria-label="Đóng" onClick={() => setOpen(false)}>
              <X size={14} />
            </button>
          </div>
          <div className="notification-popover-body">
            {loading ? (
              <p className="notif-loading" role="status" aria-live="polite"><Loader2 className="spin" size={16} aria-hidden="true" /> Đang tải thông báo…</p>
            ) : items.length === 0 ? (
              <p className="notif-empty">Không có thông báo mới.</p>
            ) : (
              items.map((item) => {
                const inner = (
                  <>
                    <span className={`notif-dot ${item.read ? "notif-dot-read" : ""}`} aria-hidden="true" />
                    <div className="notif-copy">
                      <strong>{item.title}</strong>
                      {item.body && <span>{item.body}</span>}
                    </div>
                  </>
                );
                return item.href ? (
                  <Link key={item.id} href={item.href} className={`notif-item ${item.read ? "" : "notif-unread"}`} onClick={() => setOpen(false)}>
                    {inner}
                  </Link>
                ) : (
                  <div key={item.id} className={`notif-item ${item.read ? "" : "notif-unread"}`}>
                    {inner}
                  </div>
                );
              })
            )}
          </div>
          <div className="notification-popover-footer">
            <Link href="/app/notifications" onClick={() => setOpen(false)}>
              Xem tất cả thông báo →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu({ userEmail, userRole, onLogout }: { userEmail: string; userRole?: string; onLogout: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(open, () => setOpen(false));
  const items = [...accountMenuItems];
  return <div className="user-menu-wrap" ref={ref}><button className="user-avatar-btn" type="button" aria-label="Tài khoản" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}><span className="user-avatar-circle">{initials(userEmail)}</span></button>{open && <div className="user-dropdown" role="menu"><div className="user-dropdown-header"><strong title={userEmail}>{userEmail || "Tài khoản X-One"}</strong><small><ShieldCheck size={12} aria-hidden="true" /> {getRoleBadge(userRole).label} · Phiên bảo mật</small></div><div className="dropdown-divider" />{items.map(({ href, icon: Icon, label }) => <Link className="dropdown-item" href={href} role="menuitem" key={href} onClick={() => setOpen(false)}><Icon size={15} className="dropdown-item-icon" /><span>{label}</span></Link>)}<div className="dropdown-divider" /><button className="dropdown-item dropdown-item-danger" type="button" role="menuitem" onClick={() => { setOpen(false); void onLogout(); }}><LogOut size={15} className="dropdown-item-danger-icon" /><span>Đăng xuất</span></button></div>}</div>;
}

function useOutsideClick<T extends HTMLElement>(active: boolean, onOutsideClick: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active) return;
    const handleClick = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) onOutsideClick(); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [active, onOutsideClick]);
  return ref;
}

function RecentConversations({ pathname, compact }: { pathname: string | null; compact?: boolean }) {
  const [items, setItems] = useState<ConversationRecord[]>([]);
  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    const load = () => {
      controller?.abort();
      controller = new AbortController();
      void listConversations(false, controller.signal, 1, 10).then((result) => { if (active) setItems(result.items); }).catch(() => undefined);
    };
    load();
    window.addEventListener(CONVERSATIONS_CHANGED_EVENT, load);
    return () => { active = false; controller?.abort(); window.removeEventListener(CONVERSATIONS_CHANGED_EVENT, load); };
  }, []);
  const groups = groupConversations(items.filter((item) => item.status !== "ARCHIVED")).slice(0, 3);
  if (!groups.length) return null;
  return <div className="sidebar-recent"><div className="sidebar-recent-heading"><span>Gần đây</span><Link href="/app/history/conversations">Xem tất cả</Link></div><nav aria-label="Cuộc trò chuyện gần đây">{groups.map((group) => <div className="sidebar-recent-group" key={group.label}><small>{group.label}</small>{group.items.slice(0, compact ? 4 : 5).map((item) => { const current = pathname === `/app/conversations/${encodeURIComponent(item.conversationId)}`; const title = conversationTitle(item); const Icon = conversationIcon(title); return <Link className={`sidebar-conversation-link ${current ? "is-active" : ""}`} href={`/app/conversations/${encodeURIComponent(item.conversationId)}`} aria-current={current ? "page" : undefined} key={item.conversationId}><span className="sidebar-conv-icon" aria-hidden="true"><Icon size={14} /></span><span className="sidebar-conv-title">{title}</span><time>{formatRecentTime(item.updatedAt ?? item.lastMessageAt ?? item.createdAt)}</time></Link>; })}</div>)}</nav></div>;
}

function conversationIcon(title: string) { const lower = title.toLowerCase(); if (lower.includes("xe") || lower.includes("chuyến") || lower.includes("đi") || lower.includes("đón")) return CarFront; if (lower.includes("ăn") || lower.includes("phở") || lower.includes("món") || lower.includes("quán") || lower.includes("bàn") || lower.includes("nhà hàng")) return Utensils; if (lower.includes("khám") || lower.includes("bệnh") || lower.includes("bác sĩ") || lower.includes("y tế")) return Stethoscope; return MessageSquareText; }
function groupConversations(items: ConversationRecord[]): Array<{ label: string; items: ConversationRecord[] }> { const groups = new Map<string, ConversationRecord[]>(); for (const item of [...items].sort((left, right) => dateValue(right) - dateValue(left))) { const label = dayGroup(item.updatedAt ?? item.lastMessageAt ?? item.createdAt); groups.set(label, [...(groups.get(label) ?? []), item]); } return ["Hôm nay", "Hôm qua", "Trước đó"].flatMap((label) => groups.has(label) ? [{ label, items: groups.get(label)! }] : []); }
function dayGroup(value?: string): string { const date = value ? new Date(value) : new Date(0); if (Number.isNaN(date.getTime())) return "Trước đó"; const now = new Date(); const day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); const candidate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(); const difference = Math.round((day - candidate) / 86_400_000); return difference <= 0 ? "Hôm nay" : difference === 1 ? "Hôm qua" : "Trước đó"; }
function dateValue(value: ConversationRecord): number { const parsed = new Date(value.updatedAt ?? value.lastMessageAt ?? value.createdAt ?? 0).getTime(); return Number.isFinite(parsed) ? parsed : 0; }
function formatRecentTime(value?: string): string { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(date); }
function initials(email: string): string { return email.trim().slice(0, 2).toUpperCase() || "XO"; }
