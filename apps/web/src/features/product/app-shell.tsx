"use client";

import {
  BookmarkCheck,
  Bot,
  CarFront,
  History,
  LogOut,
  Menu,
  MessageSquareText,
  ShieldCheck,
  Stethoscope,
  Utensils,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { XOneMark } from "@/components/XOneMark";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { listConversations } from "@/lib/api-client";
import { ACTIVE_CONVERSATION_EVENT, CONVERSATIONS_CHANGED_EVENT, emitNewConversation, NEW_CONVERSATION_EVENT } from "@/lib/conversation-events";
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
  const [activeConversationId, setActiveConversationId] = useState<string>();
  const assistantWorkspace = pathname === "/app" || pathname?.startsWith("/app/conversations/");
  const assistantHref = activeConversationId ? `/app/conversations/${encodeURIComponent(activeConversationId)}` : "/app";

  // AppShell remains mounted while users move between product pages. Seed the
  // resume target from the URL so a direct conversation load is available even
  // if the dashboard's browser event fires before this listener is attached.
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

  async function handleLogout() {
    try { await logout(); } finally { router.replace("/"); }
  }

  return <div className="app-shell"><a className="skip-link" href="#app-content">Bỏ qua điều hướng</a>
    <aside className="app-sidebar"><Sidebar userEmail={user?.email ?? ""} pathname={pathname} assistantHref={assistantHref} assistantWorkspace={assistantWorkspace} onLogout={handleLogout} /></aside>
    <header className="app-mobile-header"><Link className="brand-link" href={assistantHref} onClick={assistantWorkspace ? (event) => event.preventDefault() : undefined}><XOneMark size={27} /><span>X-One</span></Link><Sheet><SheetTrigger asChild><button className="icon-button" type="button" aria-label="Mở điều hướng"><Menu size={20} /></button></SheetTrigger><SheetContent title="Không gian X-One"><Sidebar userEmail={user?.email ?? ""} pathname={pathname} assistantHref={assistantHref} assistantWorkspace={assistantWorkspace} onLogout={handleLogout} compact /></SheetContent></Sheet></header>
    <main className={`app-content${assistantWorkspace ? " app-content-assistant" : ""}`} id="app-content">{children}</main>
  </div>;
}

function Sidebar({ userEmail, pathname, assistantHref, assistantWorkspace, onLogout, compact = false }: { userEmail: string; pathname: string | null; assistantHref: string; assistantWorkspace: boolean; onLogout: () => Promise<void>; compact?: boolean }) {
  const contents = <div className="sidebar-content"><Link className="brand-link sidebar-brand" href={assistantHref} onClick={assistantWorkspace ? (event) => event.preventDefault() : undefined}><XOneMark size={30} /><span>X-One</span></Link><Link className="button button-primary sidebar-new" href="/app" onClick={emitNewConversation}>Trợ lý mới</Link><nav className="app-nav" aria-label="Không gian X-One">{navigation.map(({ href, label, icon: Icon }) => { const isAssistant = href === "/app"; const targetHref = isAssistant ? assistantHref : href; const current = isAssistant ? pathname === "/app" || Boolean(pathname?.startsWith("/app/conversations/")) : pathname === href || pathname?.startsWith(`${href}/`); const link = <Link className={`app-nav-link ${current ? "is-active" : ""}`} href={targetHref} aria-current={current ? "page" : undefined} onClick={isAssistant && assistantWorkspace ? (event) => event.preventDefault() : undefined}><Icon size={18} /><span>{label}</span></Link>; return compact ? <SheetClose asChild key={href}>{link}</SheetClose> : <span key={href}>{link}</span>; })}</nav><RecentConversations pathname={pathname} compact={compact} /><div className="sidebar-spacer" /><div className="sidebar-identity"><span className="identity-initials">{initials(userEmail)}</span><span><strong>{userEmail || "Tài khoản X-One"}</strong><small><ShieldCheck size={13} /> Phiên bảo mật</small></span></div><button className="sidebar-logout" type="button" onClick={() => void onLogout()}><LogOut size={17} /> Đăng xuất</button></div>;
  return contents;
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
