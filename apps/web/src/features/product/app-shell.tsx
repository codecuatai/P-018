"use client";

import {
  Bell,
  BookmarkCheck,
  CarFront,
  History,
  LifeBuoy,
  LogOut,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
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
  { href: "/app", label: "Trợ lý", icon: MessageSquareText },
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

  useEffect(() => {
    try {
      const savedSidebar = localStorage.getItem("xone_sidebar_collapsed");
      if (savedSidebar !== null) setSidebarCollapsed(savedSidebar === "true");
      const savedRail = localStorage.getItem("xone_rail_collapsed");
      if (savedRail !== null) setRailCollapsed(savedRail === "true");
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
          try { localStorage.setItem("xone_sidebar_collapsed", String(next)); } catch {}
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

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("xone_sidebar_collapsed", String(next)); } catch {}
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
    <div className={`app-shell${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#app-content">Bỏ qua điều hướng</a>
      <aside className="app-sidebar">
        <Sidebar userEmail={user?.email ?? ""} pathname={pathname} onLogout={handleLogout} onToggleCollapse={toggleSidebar} />
      </aside>
      <header className="app-mobile-header">
        <Link className="brand-link" href="/app"><XOneMark size={27} /><span>X-One</span></Link>
        <div className="app-mobile-actions">
          <NotificationBell />
          <Sheet>
            <SheetTrigger asChild>
              <button className="icon-button" type="button" aria-label="Mở điều hướng"><Menu size={20} /></button>
            </SheetTrigger>
            <SheetContent title="Không gian X-One">
              <Sidebar userEmail={user?.email ?? ""} pathname={pathname} onLogout={handleLogout} compact />
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <main className={`app-content${assistantWorkspace ? " app-content-assistant" : ""}`} id="app-content">
        {assistantWorkspace && (
          <div className="app-topbar">
            <div className="app-topbar-left">
              <button
                className={`icon-button topbar-toggle-btn${sidebarCollapsed ? " is-active-toggle" : ""}`}
                type="button"
                aria-label={sidebarCollapsed ? "Mở rộng thanh điều hướng bên trái (Ctrl+B)" : "Thu gọn thanh điều hướng bên trái (Ctrl+B)"}
                title={sidebarCollapsed ? "Mở menu bên trái (Ctrl+B)" : "Thu gọn menu bên trái (Ctrl+B)"}
                onClick={toggleSidebar}
              >
                {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              </button>
            </div>
            <div className="app-topbar-right">
              <NotificationBell />
              <button
                className={`icon-button topbar-toggle-btn${railCollapsed ? " is-active-toggle" : ""}`}
                type="button"
                aria-label={railCollapsed ? "Mở rộng tiện ích bên phải" : "Thu gọn tiện ích bên phải"}
                title={railCollapsed ? "Mở tiện ích bên phải" : "Thu gọn tiện ích bên phải"}
                onClick={toggleRail}
              >
                {railCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
              </button>
              <UserMenu userEmail={user?.email ?? ""} onLogout={handleLogout} />
            </div>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

function Sidebar({ userEmail, pathname, onLogout, onToggleCollapse, compact = false }: { userEmail: string; pathname: string | null; onLogout: () => Promise<void>; onToggleCollapse?: () => void; compact?: boolean }) {
  return (
    <div className="sidebar-content">
      <div className="sidebar-header">
        <Link className="brand-link sidebar-brand" href="/app"><XOneMark size={28} /><span>X-One</span></Link>
        <div className="sidebar-header-actions">
          <Link className="button button-primary sidebar-new" href="/app" onClick={emitNewConversation} title="Cuộc trò chuyện mới">+ Mới</Link>
          {!compact && onToggleCollapse && (
            <button
              className="icon-button sidebar-collapse-btn"
              type="button"
              aria-label="Thu gọn thanh điều hướng (Ctrl+B)"
              title="Thu gọn menu (Ctrl+B)"
              onClick={onToggleCollapse}
            >
              <PanelLeftClose size={16} />
            </button>
          )}
        </div>
      </div>
      <nav className="app-nav" aria-label="Không gian X-One">
        {navigation.map(({ href, label, icon: Icon }) => {
          const current = href === "/app" ? pathname === "/app" || Boolean(pathname?.startsWith("/app/conversations/")) : pathname === href || pathname?.startsWith(`${href}/`);
          const link = <Link className={`app-nav-link ${current ? "is-active" : ""}`} href={href} aria-current={current ? "page" : undefined}><Icon size={17} /><span>{label}</span></Link>;
          return compact ? <SheetClose asChild key={href}>{link}</SheetClose> : <span key={href}>{link}</span>;
        })}
      </nav>
      <RecentConversations pathname={pathname} compact={compact} />
      <div className="sidebar-spacer" />
      <div className="sidebar-footer">
        <div className="sidebar-identity">
          <span className="identity-initials">{initials(userEmail)}</span>
          <span className="sidebar-identity-copy">
            <strong>{userEmail || "Tài khoản X-One"}</strong>
            <small><ShieldCheck size={12} /> Phiên bảo mật</small>
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

  return <div className="sidebar-user-menu" ref={ref}>
    <button className="sidebar-settings-btn" type="button" aria-label="Cài đặt và tài khoản" onClick={() => setOpen((v) => !v)}>
      <Settings size={16} />
    </button>
    {open && <div className="sidebar-user-dropdown" role="menu">
      {menuItems.map(({ href, icon: Icon, label }) =>
        compact
          ? <SheetClose asChild key={href}><Link className="dropdown-item" href={href} role="menuitem" onClick={() => setOpen(false)}><Icon size={15} className="dropdown-item-icon" /><span>{label}</span></Link></SheetClose>
          : <Link className="dropdown-item" href={href} role="menuitem" key={href} onClick={() => setOpen(false)}><Icon size={15} className="dropdown-item-icon" /><span>{label}</span></Link>
      )}
      <div className="dropdown-divider" />
      <button className="dropdown-item dropdown-item-danger" type="button" role="menuitem" onClick={() => { setOpen(false); void onLogout(); }}>
        <LogOut size={15} className="dropdown-item-danger-icon" /><span>Đăng xuất</span>
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

  return <div className="notification-bell-wrap" ref={ref}>
    <button className="icon-button notification-bell-btn" type="button" aria-label={`Thông báo${count > 0 ? `, ${count} chưa đọc` : ""}`} onClick={() => setOpen((v) => !v)}>
      <Bell size={18} />
      {count > 0 && <span className="notification-badge" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
    </button>
    {open && <div className="notification-popover" role="dialog" aria-label="Thông báo">
      <div className="notification-popover-header">
        <span>Thông báo</span>
        {count > 0 && <span className="notif-unread-count">{count} chưa đọc</span>}
        <button className="icon-button notif-close-btn" type="button" aria-label="Đóng" onClick={() => setOpen(false)}><X size={14} /></button>
      </div>
      <div className="notification-popover-body">
        {items.length === 0
          ? <p className="notif-empty">Không có thông báo mới.</p>
          : items.map((item) => <div key={item.id} className={`notif-item${item.read ? "" : " notif-unread"}`}>
            {!item.read && <span className="notif-dot" aria-hidden="true" />}
            <div className="notif-copy"><strong>{item.title}</strong>{item.body && <span>{item.body}</span>}</div>
          </div>)}
      </div>
      <div className="notification-popover-footer">
        <Link href="/app/notifications" onClick={() => setOpen(false)}>Xem tất cả thông báo →</Link>
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

  return <div className="user-menu-wrap" ref={ref}>
    <button className="user-avatar-btn" type="button" aria-label="Tài khoản" onClick={() => setOpen((v) => !v)}>
      <span className="identity-initials identity-initials-sm">{initials(userEmail)}</span>
    </button>
    {open && <div className="user-dropdown" role="menu">
      <div className="user-dropdown-header">
        <strong>{userEmail || "Tài khoản X-One"}</strong>
        <small><ShieldCheck size={12} /> Phiên bảo mật</small>
      </div>
      <div className="dropdown-divider" />
      {menuItems.map(({ href, icon: Icon, label }) => (
        <Link className="dropdown-item" href={href} role="menuitem" key={href} onClick={() => setOpen(false)}>
          <Icon size={15} className="dropdown-item-icon" />
          <span>{label}</span>
        </Link>
      ))}
      <div className="dropdown-divider" />
      <button className="dropdown-item dropdown-item-danger" type="button" role="menuitem" onClick={() => { setOpen(false); void onLogout(); }}>
        <LogOut size={15} className="dropdown-item-danger-icon" />
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
    <div className="sidebar-recent">
      <div className="sidebar-recent-heading">
        <span>Gần đây</span>
        <Link href="/app/history">Xem tất cả</Link>
      </div>
      <nav aria-label="Cuộc trò chuyện gần đây">
        {groups.map((group) => (
          <div className="sidebar-recent-group" key={group.label}>
            <small>{group.label}</small>
            {group.items.slice(0, compact ? 4 : 5).map((item) => {
              const current = pathname === `/app/conversations/${encodeURIComponent(item.conversationId)}`;
              const title = conversationTitle(item);
              const Icon = conversationIcon(title);
              return (
                <Link
                  className={`sidebar-conversation-link ${current ? "is-active" : ""}`}
                  href={`/app/conversations/${encodeURIComponent(item.conversationId)}`}
                  aria-current={current ? "page" : undefined}
                  key={item.conversationId}
                >
                  <span className="sidebar-conv-icon" aria-hidden="true"><Icon size={14} /></span>
                  <span className="sidebar-conv-title">{title}</span>
                  <time>{formatRecentTime(item.updatedAt ?? item.lastMessageAt ?? item.createdAt)}</time>
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
