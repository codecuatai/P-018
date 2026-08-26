"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Database,
  ExternalLink,
  Filter,
  Gauge,
  HeartPulse,
  Key,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  MessageSquare,
  Receipt,
  RefreshCw,
  ScrollText,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sliders,
  Sparkles,
  Star,
  Stethoscope,
  Ticket,
  UserCheck,
  Users,
  Utensils,
  UtensilsCrossed,
  Workflow,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { XOneMark } from "@/components/XOneMark";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  errorText,
  getAdminDatasets,
  getAdminPayments,
  getAdminSupportTickets,
  getAdminSummary,
  getAdminSystemHealth,
  getAdminTransactions,
  getAdminUsers,
  getAdminWorkflows,
  updateAdminSupportTicket,
} from "@/lib/api-client";
import { useOptionalAuth } from "@/providers/auth-provider";
import type {
  AdminHealthCheck,
  AdminPayments,
  AdminSummary,
  AdminTransactionRecord,
  AdminUserRecord,
  AdminWorkflowRecord,
  SupportPriority,
  SupportTicket,
  SupportTicketStatus,
} from "@/types";

import { ApiKeysSection } from "./sections/api-keys-section";
import { FeedbackSection } from "./sections/feedback-section";
import { SystemLogsSection } from "./sections/system-logs-section";
import { TokenUsageSection } from "./sections/token-usage-section";
import { UserServicesSection } from "./sections/user-services-section";

type Loadable<T> = { data?: T; loading: boolean; error?: string };

// 6 Consolidated Main Tabs
export type MainTabId =
  | "overview"
  | "users"
  | "transactions"
  | "ai-integrations"
  | "support"
  | "system-logs";

export type SubTabId =
  | "summary"
  | "health"
  | "datasets"
  | "user-list"
  | "user-services"
  | "domain-trans"
  | "payments-list"
  | "workflow-reconciliation"
  | "api-keys"
  | "token-usage"
  | "support-queue"
  | "feedback-ratings"
  | "logs-view";

interface TabDefinition {
  id: MainTabId;
  label: string;
  subtitle: string;
  icon: typeof Gauge;
  subtabs: Array<{ id: SubTabId; label: string; icon: typeof LayoutDashboard; hashName?: string }>;
}

const CONSOLIDATED_TABS: TabDefinition[] = [
  {
    id: "overview",
    label: "Tổng quan & Sức khỏe",
    subtitle: "Chỉ số tổng hợp, sức khỏe microservices và trạng thái dataset",
    icon: Gauge,
    subtabs: [
      { id: "summary", label: "Tổng quan", icon: LayoutDashboard, hashName: "overview" },
      { id: "health", label: "Sức khỏe hệ thống", icon: HeartPulse, hashName: "health" },
      { id: "datasets", label: "Dataset & độ tươi", icon: Database, hashName: "datasets" },
    ],
  },
  {
    id: "users",
    label: "Người dùng & Phân quyền",
    subtitle: "Danh sách người dùng và quản lý quyền truy cập dịch vụ",
    icon: Users,
    subtabs: [
      { id: "user-list", label: "Người dùng", icon: Users, hashName: "users" },
      { id: "user-services", label: "Dịch vụ User", icon: ShieldCheck, hashName: "user-services" },
    ],
  },
  {
    id: "transactions",
    label: "Giao dịch & Vận hành",
    subtitle: "Đơn hàng domain, dòng tiền thanh toán và đối soát workflow",
    icon: Activity,
    subtabs: [
      { id: "domain-trans", label: "Giao dịch domain", icon: ShoppingBag, hashName: "transactions" },
      { id: "payments-list", label: "Thanh toán & hoàn tiền", icon: CreditCard, hashName: "payments" },
      { id: "workflow-reconciliation", label: "Workflow reconciliation", icon: Workflow, hashName: "workflows" },
    ],
  },
  {
    id: "ai-integrations",
    label: "AI Engine & API Keys",
    subtitle: "Quản lý khóa API đối tác, token usage và dự toán chi phí AI",
    icon: Sparkles,
    subtabs: [
      { id: "api-keys", label: "Quản lý API Keys", icon: Key, hashName: "api-keys" },
      { id: "token-usage", label: "Tokens & AI Cost", icon: Sparkles, hashName: "token-usage" },
    ],
  },
  {
    id: "support",
    label: "Hỗ trợ & Đánh giá",
    subtitle: "Xử lý hàng đợi support tickets và theo dõi đánh giá dịch vụ",
    icon: LifeBuoy,
    subtabs: [
      { id: "support-queue", label: "Support queue", icon: LifeBuoy, hashName: "support" },
      { id: "feedback-ratings", label: "Đánh giá & Phản hồi", icon: Star, hashName: "feedback" },
    ],
  },
  {
    id: "system-logs",
    label: "System Logs & Audit",
    subtitle: "Truy vết nhật ký vận hành và audit trail thời gian thực",
    icon: ScrollText,
    subtabs: [
      { id: "logs-view", label: "System Logs", icon: ScrollText, hashName: "system-logs" },
    ],
  },
];

export function AdminDashboard() {
  const auth = useOptionalAuth();
  const user = auth?.user;
  const logout = auth?.logout ?? (async () => {});

  // Tab State
  const [activeMainTab, setActiveMainTab] = useState<MainTabId>("overview");
  const [activeSubTab, setActiveSubTab] = useState<Record<MainTabId, SubTabId>>({
    overview: "summary",
    users: "user-list",
    transactions: "domain-trans",
    "ai-integrations": "api-keys",
    support: "support-queue",
    "system-logs": "logs-view",
  });

  // Sidebar Layout State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");

  // Data States
  const [summary, setSummary] = useState<Loadable<AdminSummary>>({ loading: true });
  const [users, setUsers] = useState<Loadable<{ items: AdminUserRecord[]; total: number; page: number; page_size: number }>>({ loading: true });
  const [transactions, setTransactions] = useState<Loadable<{ items: AdminTransactionRecord[]; page: number; page_size: number; partial: boolean; unavailable: string[] }>>({ loading: true });
  const [payments, setPayments] = useState<Loadable<AdminPayments>>({ loading: true });
  const [workflows, setWorkflows] = useState<Loadable<{ items: AdminWorkflowRecord[]; total: number; page: number; page_size: number }>>({ loading: true });
  const [datasets, setDatasets] = useState<Loadable<{ items: AdminSummary["datasets"] }>>({ loading: true });
  const [health, setHealth] = useState<Loadable<{ items: AdminHealthCheck[] }>>({ loading: true });
  const [support, setSupport] = useState<Loadable<{ items: SupportTicket[]; total: number }>>({ loading: true });
  const [refreshing, setRefreshing] = useState(false);
  const [autoPollHealth, setAutoPollHealth] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);

  // Sync with window hash on load & hashchange
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (!hash) return;

      for (const tab of CONSOLIDATED_TABS) {
        if (tab.id === hash) {
          setActiveMainTab(tab.id);
          return;
        }
        for (const sub of tab.subtabs) {
          if (sub.hashName === hash || sub.id === hash) {
            setActiveMainTab(tab.id);
            setActiveSubTab((prev) => ({ ...prev, [tab.id]: sub.id }));
            return;
          }
        }
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const switchMainTab = (mainTabId: MainTabId, targetSubTabId?: SubTabId) => {
    setActiveMainTab(mainTabId);
    if (targetSubTabId) {
      setActiveSubTab((prev) => ({ ...prev, [mainTabId]: targetSubTabId }));
    }
    const tabDef = CONSOLIDATED_TABS.find((t) => t.id === mainTabId);
    const sub = targetSubTabId || activeSubTab[mainTabId] || tabDef?.subtabs[0]?.id;
    const subDef = tabDef?.subtabs.find((s) => s.id === sub);
    try {
      window.history.replaceState(null, "", `#${subDef?.hashName || mainTabId}`);
    } catch {
      // ignore
    }
  };

  const switchSubTab = (subTabId: SubTabId) => {
    setActiveSubTab((prev) => ({ ...prev, [activeMainTab]: subTabId }));
    const tabDef = CONSOLIDATED_TABS.find((t) => t.id === activeMainTab);
    const subDef = tabDef?.subtabs.find((s) => s.id === subTabId);
    try {
      window.history.replaceState(null, "", `#${subDef?.hashName || subTabId}`);
    } catch {
      // ignore
    }
  };

  // Saved Sidebar Width & Collapsed State
  useEffect(() => {
    try {
      const savedCollapsed = localStorage.getItem("xone_admin_sidebar_collapsed");
      if (savedCollapsed !== null) setSidebarCollapsed(savedCollapsed === "true");
      const savedWidth = localStorage.getItem("xone_admin_sidebar_width");
      if (savedWidth) {
        const parsed = parseInt(savedWidth, 10);
        if (!Number.isNaN(parsed) && parsed >= 180 && parsed <= 450) setSidebarWidth(parsed);
      }
    } catch {
      // ignore
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setSidebarCollapsed((prev) => {
          const next = !prev;
          try {
            localStorage.setItem("xone_admin_sidebar_collapsed", String(next));
          } catch {
            /* best effort */
          }
          return next;
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Resizing handler
  useEffect(() => {
    if (!isResizingSidebar) return;
    const handleMouseMove = (event: MouseEvent) => setSidebarWidth(Math.min(Math.max(event.clientX, 180), 450));
    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      try {
        localStorage.setItem("xone_admin_sidebar_width", String(sidebarWidth));
      } catch {
        /* best effort */
      }
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
      try {
        localStorage.setItem("xone_admin_sidebar_collapsed", String(next));
      } catch {
        /* best effort */
      }
      return next;
    });
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    }
  }

  const load = useCallback(async () => {
    setRefreshing(true);
    const requests = await Promise.allSettled([
      getAdminSummary(),
      getAdminUsers(),
      getAdminTransactions(),
      getAdminPayments(),
      getAdminWorkflows(),
      getAdminDatasets(),
      getAdminSystemHealth(),
      getAdminSupportTickets(),
    ]);
    const [summaryRes, usersRes, transRes, payRes, workRes, dataRes, healthRes, suppRes] = requests;
    setSummary(loadable(summaryRes));
    setUsers(loadable(usersRes));
    setTransactions(loadable(transRes));
    setPayments(loadable(payRes));
    setWorkflows(loadable(workRes));
    setDatasets(loadable(dataRes));
    setHealth(loadable(healthRes));
    setSupport(loadable(suppRes));
    setLastCheckedAt(Date.now());
    setRefreshing(false);
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const res = await getAdminSystemHealth();
      setHealth({ loading: false, data: res });
      setLastCheckedAt(Date.now());
    } catch (err) {
      setHealth({ loading: false, error: errorText(err) });
    }
  }, []);

  const refreshTransactions = useCallback(async () => {
    setTransactions((prev) => ({ ...prev, loading: true, error: undefined }));
    try {
      const res = await getAdminTransactions();
      setTransactions({ loading: false, data: res });
    } catch (err) {
      setTransactions({ loading: false, error: errorText(err) });
    }
  }, []);

  const refreshWorkflows = useCallback(async () => {
    setWorkflows((prev) => ({ ...prev, loading: true, error: undefined }));
    try {
      const res = await getAdminWorkflows();
      setWorkflows({ loading: false, data: res });
    } catch (err) {
      setWorkflows({ loading: false, error: errorText(err) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Health auto-polling
  useEffect(() => {
    if (!autoPollHealth) return;
    let timer: NodeJS.Timeout | null = null;
    const startPolling = () => {
      if (!timer) {
        timer = setInterval(() => {
          if (document.visibilityState === "visible") {
            void refreshHealth();
          }
        }, 15000);
      }
    };
    const stopPolling = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshHealth();
        startPolling();
      } else {
        stopPolling();
      }
    };
    startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [autoPollHealth, refreshHealth]);

  async function updateTicket(id: string, patch: { status?: SupportTicketStatus; priority?: SupportPriority }) {
    try {
      const updated = await updateAdminSupportTicket(id, patch);
      setSupport((current) => ({
        ...current,
        data: current.data ? { ...current.data, items: current.data.items.map((t) => (t.id === id ? updated : t)) } : current.data,
      }));
    } catch (error) {
      setSupport((current) => ({ ...current, error: errorText(error) }));
    }
  }

  const currentTabDef = CONSOLIDATED_TABS.find((t) => t.id === activeMainTab) || CONSOLIDATED_TABS[0];
  const CurrentIcon = currentTabDef.icon;
  const currentSubTabId = activeSubTab[activeMainTab] || currentTabDef.subtabs[0].id;

  return (
    <div className={`app-shell admin-shell${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#admin-content">
        Bỏ qua điều hướng
      </a>

      {/* Global Header */}
      <header className="app-global-header admin-global-header">
        <div className="app-global-header-left">
          <Link className="brand-link header-brand" href="/admin">
            <XOneMark size={26} />
            <span>X-One</span>
          </Link>
          <span className="admin-badge-header">
            <ShieldAlert size={13} />
            <span>Admin Console</span>
          </span>
        </div>

        <div className="app-global-header-right">
          <div className="admin-header-status-indicator" title="Cổng kết nối Gateway Core">
            <span className="admin-status-dot status-healthy" />
            <span className="admin-header-status-text">gateway-core</span>
          </div>

          <Link href="/app" className="admin-switch-btn" title="Chuyển sang Giao diện Trợ lý người dùng">
            <Bot size={15} />
            <span>Không gian User</span>
          </Link>

          <AdminUserMenu userEmail={user?.email ?? ""} onLogout={handleLogout} />
        </div>
      </header>

      {/* Admin Body with Grid */}
      <div
        className={`app-body${isResizingSidebar ? " is-resizing-active" : ""}`}
        style={{ gridTemplateColumns: sidebarCollapsed ? "0px minmax(0, 1fr)" : `${sidebarWidth}px minmax(0, 1fr)` }}
      >
        {/* Sidebar */}
        <aside className="app-sidebar admin-sidebar" style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}>
          <AdminSidebarContent
            activeMainTab={activeMainTab}
            onSelectTab={switchMainTab}
            searchQuery={sidebarSearch}
            onSearchChange={setSidebarSearch}
            userEmail={user?.email ?? ""}
            onLogout={handleLogout}
          />
          {!sidebarCollapsed && (
            <div
              className="sidebar-resizer"
              onMouseDown={(event) => {
                event.preventDefault();
                setIsResizingSidebar(true);
              }}
              onDoubleClick={toggleSidebar}
              title="Kéo để chỉnh kích thước sidebar, nhấp đúp để ẩn"
            />
          )}
        </aside>

        {/* Sidebar Toggle Edge Button */}
        <button
          className={`sidebar-edge-toggle${sidebarCollapsed ? " is-collapsed" : ""}`}
          type="button"
          aria-label={sidebarCollapsed ? "Mở menu bên trái (Ctrl+B)" : "Thu gọn menu bên trái (Ctrl+B)"}
          title={sidebarCollapsed ? "Mở menu (Ctrl+B)" : "Thu gọn menu (Ctrl+B)"}
          onClick={toggleSidebar}
          style={{ left: sidebarCollapsed ? "10px" : `${sidebarWidth}px` }}
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {/* Mobile Header & Drawer */}
        <header className="app-mobile-header">
          <Link className="brand-link" href="/admin">
            <XOneMark size={27} />
            <span>Admin</span>
          </Link>
          <div className="app-mobile-actions">
            <Sheet>
              <SheetTrigger asChild>
                <button className="icon-button" type="button" aria-label="Mở menu quản trị">
                  <Menu size={20} />
                </button>
              </SheetTrigger>
              <SheetContent title="Quản trị X-One">
                <AdminSidebarContent
                  activeMainTab={activeMainTab}
                  onSelectTab={switchMainTab}
                  searchQuery={sidebarSearch}
                  onSearchChange={setSidebarSearch}
                  userEmail={user?.email ?? ""}
                  onLogout={handleLogout}
                />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="app-content admin-main-content" id="admin-content">
          <div className="admin-page">
            {/* Top Operational Header (Compact for Laptops) */}
            <div className="admin-banner-card">
              <div className="admin-banner-left">
                <div className="admin-banner-icon">
                  <CurrentIcon size={20} />
                </div>
                <div>
                  <h1 className="admin-banner-title">Trung tâm vận hành X-One</h1>
                  <p className="admin-banner-subtitle">{currentTabDef.subtitle}</p>
                </div>
              </div>

              <div className="admin-banner-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => void load()}
                  disabled={refreshing}
                  aria-label="Làm mới dashboard"
                  style={{ height: "34px", padding: "0 12px", fontSize: "12px" }}
                >
                  <RefreshCw size={14} className={refreshing ? "spin" : undefined} />
                  <span>{refreshing ? "Đang tải…" : "Làm mới"}</span>
                </button>
              </div>
            </div>

            {/* Subtabs Bar in Main View (Modern Segmented Control) */}
            {currentTabDef.subtabs.length > 1 && (
              <div className="admin-subtab-bar" role="tablist" aria-label={`Các mục trong ${currentTabDef.label}`}>
                {currentTabDef.subtabs.map((sub) => {
                  const SubIcon = sub.icon;
                  const isActive = currentSubTabId === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`admin-subtab-pill ${isActive ? "is-active" : ""}`}
                      onClick={() => switchSubTab(sub.id)}
                    >
                      <SubIcon size={14} />
                      <span>{sub.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Render Active Tab Content */}
            <div className="admin-tab-viewport">
              {/* TAB 1: OVERVIEW & HEALTH */}
              {activeMainTab === "overview" && (
                <>
                  {currentSubTabId === "summary" && (
                    <OverviewSummarySubtab
                      summary={summary}
                      onRetry={() => void load()}
                      onNavigateTab={(main, sub) => switchMainTab(main, sub)}
                      autoPollHealth={autoPollHealth}
                      setAutoPollHealth={setAutoPollHealth}
                      onRefreshHealth={() => void refreshHealth()}
                    />
                  )}
                  {currentSubTabId === "health" && (
                    <HealthSubtab
                      health={health}
                      lastCheckedAt={lastCheckedAt}
                      autoPollHealth={autoPollHealth}
                      setAutoPollHealth={setAutoPollHealth}
                      onRefreshHealth={() => void refreshHealth()}
                      onRetry={() => void load()}
                    />
                  )}
                  {currentSubTabId === "datasets" && (
                    <DatasetsSubtab datasets={datasets} onRetry={() => void load()} />
                  )}
                </>
              )}

              {/* TAB 2: USERS & SERVICES */}
              {activeMainTab === "users" && (
                <>
                  {currentSubTabId === "user-list" && (
                    <UsersSubtab
                      users={users}
                      onRetry={() => void load()}
                      onManageServices={() => switchSubTab("user-services")}
                    />
                  )}
                  {currentSubTabId === "user-services" && (
                    <UserServicesSubtab users={users} onRetry={() => void load()} />
                  )}
                </>
              )}

              {/* TAB 3: TRANSACTIONS & OPERATIONS */}
              {activeMainTab === "transactions" && (
                <>
                  {currentSubTabId === "domain-trans" && (
                    <TransactionsSubtab transactions={transactions} onRetry={refreshTransactions} />
                  )}
                  {currentSubTabId === "payments-list" && (
                    <PaymentsSubtab payments={payments} onRetry={() => void load()} />
                  )}
                  {currentSubTabId === "workflow-reconciliation" && (
                    <WorkflowsSubtab workflows={workflows} onRetry={refreshWorkflows} />
                  )}
                </>
              )}

              {/* TAB 4: AI & INTEGRATIONS */}
              {activeMainTab === "ai-integrations" && (
                <>
                  {currentSubTabId === "api-keys" && <ApiKeysSection />}
                  {currentSubTabId === "token-usage" && <TokenUsageSection />}
                </>
              )}

              {/* TAB 5: SUPPORT & FEEDBACK */}
              {activeMainTab === "support" && (
                <>
                  {currentSubTabId === "support-queue" && (
                    <SupportSubtab support={support} onUpdateTicket={updateTicket} onRetry={() => void load()} />
                  )}
                  {currentSubTabId === "feedback-ratings" && <FeedbackSection />}
                </>
              )}

              {/* TAB 6: SYSTEM LOGS */}
              {activeMainTab === "system-logs" && <SystemLogsSection />}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clean Minimal Sidebar Component (No Subtab Links)
// ---------------------------------------------------------------------------

function AdminSidebarContent({
  activeMainTab,
  onSelectTab,
  searchQuery,
  onSearchChange,
  userEmail,
  onLogout,
}: {
  activeMainTab: MainTabId;
  onSelectTab: (main: MainTabId) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  userEmail: string;
  onLogout: () => Promise<void>;
}) {
  const filteredTabs = useMemo(() => {
    if (!searchQuery.trim()) return CONSOLIDATED_TABS;
    const q = searchQuery.toLowerCase();
    return CONSOLIDATED_TABS.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.subtitle.toLowerCase().includes(q) ||
        t.subtabs.some((s) => s.label.toLowerCase().includes(q)),
    );
  }, [searchQuery]);

  return (
    <div className="sidebar-content admin-sidebar-inner">
      {/* Quick Search */}
      <div className="admin-sidebar-search">
        <Search size={14} className="admin-search-icon" />
        <input
          type="text"
          placeholder="Tìm chức năng quản trị..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Tìm kiếm tab quản trị"
        />
        {searchQuery && (
          <button
            type="button"
            className="admin-search-clear"
            onClick={() => onSearchChange("")}
            aria-label="Xóa tìm kiếm"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Navigation List (Clean Primary Tabs Only) */}
      <nav className="admin-sidebar-nav" aria-label="Menu quản trị hệ thống">
        {filteredTabs.map((tab) => {
          const Icon = tab.icon;
          const isMainActive = activeMainTab === tab.id;

          return (
            <div className="admin-nav-group" key={tab.id}>
              <button
                type="button"
                className={`admin-nav-btn ${isMainActive ? "is-active" : ""}`}
                onClick={() => onSelectTab(tab.id)}
                aria-current={isMainActive ? "page" : undefined}
              >
                <span className="admin-nav-btn-icon">
                  <Icon size={16} />
                </span>
                <span className="admin-nav-btn-label">
                  {tab.label}
                </span>
                {isMainActive && <span className="admin-nav-active-pill" />}
              </button>
            </div>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />

      {/* Sidebar Footer */}
      <div className="sidebar-footer admin-sidebar-footer">
        <div className="sidebar-identity">
          <span className="identity-initials">{initials(userEmail)}</span>
          <div className="sidebar-identity-copy">
            <strong>{userEmail || "Quản trị viên"}</strong>
            <small>
              <ShieldCheck size={12} /> Quyền Admin
            </small>
          </div>
        </div>
        <button
          className="sidebar-logout"
          type="button"
          onClick={() => void onLogout()}
          title="Đăng xuất khỏi hệ thống"
          aria-label="Đăng xuất"
        >
          <LogOut size={15} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// User Menu Component
// ---------------------------------------------------------------------------

function AdminUserMenu({ userEmail, onLogout }: { userEmail: string; onLogout: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(open, () => setOpen(false));

  return (
    <div className="user-menu-wrap" ref={ref}>
      <button
        className="user-avatar-btn"
        type="button"
        aria-label="Tài khoản Quản trị"
        onClick={() => setOpen((val) => !val)}
      >
        <span className="user-avatar-circle">{initials(userEmail)}</span>
      </button>

      {open && (
        <div className="user-dropdown" role="menu">
          <div className="user-dropdown-header">
            <strong>{userEmail || "Quản trị viên"}</strong>
            <small>
              <ShieldCheck size={12} /> Phiên Admin bảo mật
            </small>
          </div>
          <div className="dropdown-divider" />
          <Link
            className="dropdown-item"
            href="/app"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <Bot size={15} className="dropdown-item-icon" />
            <span>Không gian User</span>
          </Link>
          <div className="dropdown-divider" />
          <button
            className="dropdown-item dropdown-item-danger"
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void onLogout();
            }}
          >
            <LogOut size={15} className="dropdown-item-danger-icon" />
            <span>Đăng xuất</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subtab Panels: Overview & Health (Polished for Laptops)
// ---------------------------------------------------------------------------

function OverviewSummarySubtab({
  summary,
  onRetry,
  onNavigateTab,
  autoPollHealth,
  setAutoPollHealth,
  onRefreshHealth,
}: {
  summary: Loadable<AdminSummary>;
  onRetry: () => void;
  onNavigateTab: (main: MainTabId, sub?: SubTabId) => void;
  autoPollHealth: boolean;
  setAutoPollHealth: (val: boolean) => void;
  onRefreshHealth: () => void;
}) {
  return (
    <section className="admin-section" id="overview" aria-labelledby="overview-title">
      <SectionHeading icon={<Gauge size={17} />} title="Tổng quan" id="overview-title" />
      {summary.error ? (
        <ErrorPanel message={summary.error} onRetry={onRetry} />
      ) : summary.loading ? (
        <LoadingPanel />
      ) : summary.data ? (
        <>
          {/* Responsive KPI Grid */}
          <div className="admin-metric-grid">
            <MetricCard
              label="Tài khoản"
              value={summary.data.counts.total_users}
              icon={<Users size={16} />}
              onClick={() => onNavigateTab("users", "user-list")}
            />
            <MetricCard
              label="Thanh toán"
              value={summary.data.counts.payments}
              icon={<CreditCard size={16} />}
              onClick={() => onNavigateTab("transactions", "payments-list")}
            />
            <MetricCard
              label="Hoàn tiền"
              value={summary.data.counts.refunds}
              icon={<RefreshCw size={16} />}
              onClick={() => onNavigateTab("transactions", "payments-list")}
            />
            <MetricCard
              label="Support đang mở"
              value={summary.data.counts.open_support_tickets}
              icon={<LifeBuoy size={16} />}
              onClick={() => onNavigateTab("support", "support-queue")}
            />
            <MetricCard
              label="Workflow lỗi"
              value={summary.data.counts.failed_workflows}
              icon={<AlertTriangle size={16} />}
              tone="warning"
              onClick={() => onNavigateTab("transactions", "workflow-reconciliation")}
            />
            <MetricCard
              label="Workflow partial"
              value={summary.data.counts.partial_success_workflows}
              icon={<Workflow size={16} />}
              tone="warning"
              onClick={() => onNavigateTab("transactions", "workflow-reconciliation")}
            />
          </div>

          <div className="admin-two-column">
            {/* Domain Summary Card */}
            <div className="admin-card">
              <CardTitle title="Domain summary" note="Dữ liệu từ 4 microservices nghiệp vụ" />
              <div className="admin-domain-list">
                {summary.data.domains.map((domain) => (
                  <DomainRow
                    key={domain.domain}
                    label={domain.domain}
                    status={domain.status}
                    detail={domain.data ? compactCounts(domain.data.counts) : domain.error}
                  />
                ))}
              </div>
            </div>

            {/* Live Health Probes Card */}
            <div className="admin-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--color-border)", paddingBottom: "10px", marginBottom: "8px" }}>
                <CardTitle title="Tín hiệu hệ thống" note="Probe thời gian thực" noBorder />
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.72rem", cursor: "pointer", color: "var(--color-muted)" }}>
                    <input
                      type="checkbox"
                      checked={autoPollHealth}
                      onChange={(e) => setAutoPollHealth(e.target.checked)}
                    />
                    Auto-refresh (15s)
                  </label>
                  <button className="button button-secondary" type="button" onClick={onRefreshHealth} style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem", height: "26px" }}>
                    <RefreshCw size={12} /> Probe ngay
                  </button>
                </div>
              </div>
              <HealthList items={summary.data.health.items} compact />
            </div>
          </div>
        </>
      ) : (
        <EmptyPanel label="Chưa có dữ liệu tổng quan." />
      )}
    </section>
  );
}

function HealthSubtab({
  health,
  lastCheckedAt,
  autoPollHealth,
  setAutoPollHealth,
  onRefreshHealth,
  onRetry,
}: {
  health: Loadable<{ items: AdminHealthCheck[] }>;
  lastCheckedAt: number | null;
  autoPollHealth: boolean;
  setAutoPollHealth: (val: boolean) => void;
  onRefreshHealth: () => void;
  onRetry: () => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const items = health.data?.items ?? [];
  const healthyCount = items.filter((i) => i.status === "healthy").length;
  const isAllHealthy = items.length > 0 && healthyCount === items.length;

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchSearch = !search || item.service.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || item.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [items, search, statusFilter]);

  return (
    <section className="admin-section" id="health" aria-labelledby="health-title">
      {/* WOW Status Hero Banner */}
      <div className="admin-health-hero">
        <div className="admin-health-hero-left">
          <div className="admin-health-hero-badge">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2 id="health-title" className="admin-health-hero-title">
              {isAllHealthy ? "Tất cả microservices đang vận hành ổn định" : "Cảnh báo sức khỏe hệ thống"}
            </h2>
            <p className="admin-health-hero-subtitle">
              {healthyCount} / {items.length} dịch vụ trực tuyến · Cập nhật <RelativeTimeDisplay timestamp={lastCheckedAt} />
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.76rem", cursor: "pointer", color: "#166534", fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={autoPollHealth}
              onChange={(e) => setAutoPollHealth(e.target.checked)}
            />
            Auto-refresh (15s)
          </label>
          <button className="button button-secondary" type="button" onClick={onRefreshHealth} style={{ height: "32px", padding: "0 10px", fontSize: "0.74rem" }}>
            <RefreshCw size={13} /> Probe ngay
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="admin-filter-bar">
        <div className="admin-filter-left">
          <div className="admin-search-input-wrap">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Tìm kiếm service..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Tìm kiếm microservice"
            />
            {search && (
              <button type="button" className="clear-btn" onClick={() => setSearch("")} aria-label="Xóa tìm kiếm">
                <X size={11} />
              </button>
            )}
          </div>

          <select
            className="admin-select-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Lọc theo trạng thái"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="healthy">Tốt (Healthy)</option>
            <option value="degraded">Suy giảm (Degraded)</option>
            <option value="unavailable">Lỗi (Unavailable)</option>
          </select>
        </div>
        <div className="admin-filter-right">
          <span>{filteredItems.length} microservices</span>
        </div>
      </div>

      <PanelState state={health} empty="Không nhận được dữ liệu health." retry={onRetry}>
        {() => (
          filteredItems.length === 0 ? (
            <div className="admin-empty-search">
              <Search size={22} />
              <strong>Không tìm thấy dịch vụ phù hợp</strong>
              <p>Thử điều chỉnh từ khóa tìm kiếm hoặc bỏ chọn bộ lọc trạng thái.</p>
            </div>
          ) : (
            <HealthList items={filteredItems} />
          )
        )}
      </PanelState>
    </section>
  );
}

function DatasetsSubtab({ datasets, onRetry }: { datasets: Loadable<{ items: AdminSummary["datasets"] }>; onRetry: () => void }) {
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    const items = datasets.data?.items ?? [];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.domain.toLowerCase().includes(q) ||
        (item.data && datasetDetail(item.data).toLowerCase().includes(q)),
    );
  }, [datasets.data?.items, search]);

  return (
    <section className="admin-section" id="datasets" aria-labelledby="datasets-title">
      <SectionHeading icon={<Database size={17} />} title="Dataset & độ tươi" id="datasets-title" />

      <div className="admin-filter-bar">
        <div className="admin-filter-left">
          <div className="admin-search-input-wrap">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Tìm kiếm dataset domain..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Tìm kiếm dataset"
            />
            {search && (
              <button type="button" className="clear-btn" onClick={() => setSearch("")} aria-label="Xóa tìm kiếm">
                <X size={11} />
              </button>
            )}
          </div>
        </div>
        <div className="admin-filter-right">
          <span>{filteredItems.length} catalog domains</span>
        </div>
      </div>

      <PanelState state={datasets} empty="Chưa có trạng thái dataset." retry={onRetry}>
        {() => (
          <div className="admin-domain-list">
            {filteredItems.map((item) => (
              <DomainRow
                key={item.domain}
                label={item.domain}
                status={item.status}
                detail={item.data ? datasetDetail(item.data) : item.error}
              />
            ))}
          </div>
        )}
      </PanelState>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Subtab Panels: Users & Services
// ---------------------------------------------------------------------------

function UsersSubtab({
  users,
  onRetry,
  onManageServices,
}: {
  users: Loadable<{ items: AdminUserRecord[]; total: number; page: number; page_size: number }>;
  onRetry: () => void;
  onManageServices: () => void;
}) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredItems = useMemo(() => {
    const items = users.data?.items ?? [];
    return items.filter((u) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        u.email.toLowerCase().includes(q) ||
        u.full_name.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q);
      const matchRole = roleFilter === "all" || u.role.toLowerCase() === roleFilter.toLowerCase();
      const matchStatus = statusFilter === "all" || u.status.toLowerCase() === statusFilter.toLowerCase();
      return matchSearch && matchRole && matchStatus;
    });
  }, [users.data?.items, search, roleFilter, statusFilter]);

  return (
    <section className="admin-section" id="users" aria-labelledby="users-title">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
        <SectionHeading icon={<Users size={17} />} title="Người dùng" id="users-title" />
        <button
          className="button button-secondary"
          type="button"
          onClick={onManageServices}
          style={{ fontSize: "11px", height: "32px", padding: "0 12px" }}
        >
          <ShieldCheck size={14} />
          <span>Quản lý phân quyền dịch vụ →</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="admin-filter-bar">
        <div className="admin-filter-left">
          <div className="admin-search-input-wrap">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Tìm theo email hoặc họ tên..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Tìm kiếm người dùng"
            />
            {search && (
              <button type="button" className="clear-btn" onClick={() => setSearch("")} aria-label="Xóa tìm kiếm">
                <X size={11} />
              </button>
            )}
          </div>

          <select
            className="admin-select-filter"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            aria-label="Lọc theo vai trò"
          >
            <option value="all">Tất cả vai trò</option>
            <option value="admin">Admin</option>
            <option value="customer">Customer</option>
            <option value="driver">Driver</option>
            <option value="restaurant_staff">Restaurant Staff</option>
            <option value="healthcare_staff">Healthcare Staff</option>
          </select>

          <select
            className="admin-select-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Lọc theo trạng thái"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động (Active)</option>
            <option value="suspended">Đã khóa (Suspended)</option>
          </select>
        </div>
        <div className="admin-filter-right">
          <span>Hiển thị {filteredItems.length} / {users.data?.total ?? 0} tài khoản</span>
        </div>
      </div>

      <PanelState state={users} empty="Chưa có tài khoản." retry={onRetry}>
        {() => (
          filteredItems.length === 0 ? (
            <div className="admin-empty-search">
              <Search size={22} />
              <strong>Không tìm thấy người dùng nào</strong>
              <p>Hãy thử tìm bằng từ khóa khác hoặc điều chỉnh bộ lọc.</p>
            </div>
          ) : (
            <div className="admin-table-card">
              <div className="admin-table-caption-bar">
                <strong>Danh sách tài khoản ({filteredItems.length})</strong>
                <span>Dữ liệu xác thực từ Gateway Core</span>
              </div>
              <div className="admin-table-wrap" style={{ border: "none", borderRadius: 0 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th scope="col">Tài khoản</th>
                      <th scope="col">Vai trò</th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col">Ngày tạo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="admin-user-cell">
                            <span className="admin-user-avatar">{initials(u.full_name || u.email)}</span>
                            <div>
                              <strong style={{ display: "block", color: "#0F172A", fontSize: "12px" }}>
                                {u.full_name || "Chưa đặt tên"}
                              </strong>
                              <span style={{ color: "#64748B", fontSize: "11px" }}>{u.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`admin-role-badge role-${u.role}`}>{u.role}</span>
                        </td>
                        <td>
                          <span className={`admin-badge status-${u.status === "active" ? "healthy" : "unavailable"}`}>
                            {u.status === "active" ? "Hoạt động" : u.status}
                          </span>
                        </td>
                        <td style={{ color: "#64748B" }}>{formatDate(u.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </PanelState>
    </section>
  );
}

function UserServicesSubtab({ users, onRetry }: { users: Loadable<{ items: AdminUserRecord[]; total: number }>; onRetry: () => void }) {
  return (
    <section className="admin-section" id="user-services" aria-labelledby="user-services-title">
      <SectionHeading icon={<ShieldCheck size={17} />} title="Quản lý Dịch vụ Người dùng" id="user-services-title" />
      <PanelState state={users} empty="Chưa có người dùng nào." retry={onRetry}>
        {(data) => <UserServicesSection users={data.items} />}
      </PanelState>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Subtab Panels: Transactions & Operations
// ---------------------------------------------------------------------------

function TransactionsSubtab({
  transactions,
  onRetry,
}: {
  transactions: Loadable<{ items: AdminTransactionRecord[]; page: number; page_size: number; partial: boolean; unavailable: string[] }>;
  onRetry: () => void;
}) {
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");

  const filteredItems = useMemo(() => {
    const items = transactions.data?.items ?? [];
    return items.filter((item) => {
      const id = transactionId(item.transaction).toLowerCase();
      const q = search.toLowerCase();
      const matchSearch = !search || id.includes(q) || valueText(item.transaction.status).toLowerCase().includes(q);
      const matchDomain = domainFilter === "all" || item.domain.toLowerCase() === domainFilter.toLowerCase();
      return matchSearch && matchDomain;
    });
  }, [transactions.data?.items, search, domainFilter]);

  return (
    <section className="admin-section" id="transactions" aria-labelledby="transactions-title">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
        <SectionHeading icon={<Activity size={17} />} title="Giao dịch domain" id="transactions-title" />
        <button
          className="button button-secondary"
          type="button"
          onClick={onRetry}
          disabled={transactions.loading}
          style={{ height: "32px", padding: "0 10px", fontSize: "0.74rem" }}
        >
          <RefreshCw size={13} className={transactions.loading ? "spin" : ""} /> Làm mới dữ liệu
        </button>
      </div>

      {/* Filter Bar */}
      <div className="admin-filter-bar">
        <div className="admin-filter-left">
          <div className="admin-search-input-wrap">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Tìm theo mã giao dịch hoặc trạng thái..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Tìm kiếm giao dịch"
            />
            {search && (
              <button type="button" className="clear-btn" onClick={() => setSearch("")} aria-label="Xóa tìm kiếm">
                <X size={11} />
              </button>
            )}
          </div>

          <select
            className="admin-select-filter"
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            aria-label="Lọc theo domain"
          >
            <option value="all">Tất cả domain</option>
            <option value="food">Ẩm thực (Food)</option>
            <option value="ride">Di chuyển (Ride)</option>
            <option value="restaurant">Đặt bàn (Restaurant)</option>
            <option value="healthcare">Y tế (Healthcare)</option>
          </select>
        </div>
        <div className="admin-filter-right">
          <span>{filteredItems.length} giao dịch</span>
        </div>
      </div>

      <PanelState state={transactions} empty="Chưa có giao dịch domain." retry={onRetry}>
        {(data) => (
          <>
            {data.partial && (
              <InlineNotice>
                Chưa thể đọc: {data.unavailable.join(", ")}. Các dòng còn lại là dữ liệu đã đọc được.
              </InlineNotice>
            )}
            {filteredItems.length === 0 ? (
              <div className="admin-empty-panel">
                <div className="admin-empty-panel-icon" style={{ background: "#FFF7ED", color: "#EA580C" }}>
                  <ShoppingBag size={24} />
                </div>
                <h4>Chưa có giao dịch domain nào</h4>
                <p>
                  {search || domainFilter !== "all"
                    ? "Không tìm thấy giao dịch nào phù hợp với bộ lọc hiện tại."
                    : "Hệ thống chưa ghi nhận đơn đặt xe, gọi món, đặt bàn hoặc lịch khám nào. Toàn bộ 4 dịch vụ đang sẵn sàng tiếp nhận đơn mới."}
                </p>
                <button className="button button-secondary" type="button" onClick={onRetry}>
                  <RefreshCw size={13} /> Kiểm tra lại
                </button>
              </div>
            ) : (
              <DataTable
                caption={`${filteredItems.length} giao dịch hiển thị`}
                headers={["Domain", "Mã giao dịch", "Trạng thái", "Thời điểm"]}
                rows={filteredItems.map((item) => [
                  item.domain,
                  transactionId(item.transaction),
                  valueText(item.transaction.status),
                  formatDate(valueText(item.transaction.created_at ?? item.transaction.createdAt)),
                ])}
              />
            )}
          </>
        )}
      </PanelState>
    </section>
  );
}

function PaymentsSubtab({ payments, onRetry }: { payments: Loadable<AdminPayments>; onRetry: () => void }) {
  const [search, setSearch] = useState("");

  const filteredPayments = useMemo(() => {
    const items = payments.data?.payments.items ?? [];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        valueText(item.id).toLowerCase().includes(q) ||
        valueText(item.status).toLowerCase().includes(q),
    );
  }, [payments.data?.payments.items, search]);

  const filteredRefunds = useMemo(() => {
    const items = payments.data?.refunds.items ?? [];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        valueText(item.id).toLowerCase().includes(q) ||
        valueText(item.paymentId ?? item.payment_id).toLowerCase().includes(q) ||
        valueText(item.status).toLowerCase().includes(q),
    );
  }, [payments.data?.refunds.items, search]);

  return (
    <section className="admin-section" id="payments" aria-labelledby="payments-title">
      <SectionHeading icon={<CreditCard size={17} />} title="Thanh toán & hoàn tiền" id="payments-title" />

      {/* Filter Bar */}
      <div className="admin-filter-bar">
        <div className="admin-filter-left">
          <div className="admin-search-input-wrap">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Tìm theo mã thanh toán hoặc hoàn tiền..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Tìm kiếm thanh toán"
            />
            {search && (
              <button type="button" className="clear-btn" onClick={() => setSearch("")} aria-label="Xóa tìm kiếm">
                <X size={11} />
              </button>
            )}
          </div>
        </div>
        <div className="admin-filter-right">
          <span>{filteredPayments.length} thanh toán · {filteredRefunds.length} hoàn tiền</span>
        </div>
      </div>

      <PanelState state={payments} empty="Chưa có dữ liệu thanh toán." retry={onRetry}>
        {() => (
          <div className="admin-two-column">
            <DataTable
              caption={`Giao dịch Thanh toán · ${filteredPayments.length}`}
              headers={["Mã GD", "Số tiền", "Trạng thái", "Tạo lúc"]}
              rows={filteredPayments.map((item) => [
                valueText(item.id),
                money(item.amount, item.currency),
                valueText(item.status),
                formatDate(valueText(item.createdAt ?? item.created_at)),
              ])}
            />
            <DataTable
              caption={`Lệnh Hoàn tiền · ${filteredRefunds.length}`}
              headers={["Mã Hoàn", "Payment ID", "Số tiền", "Trạng thái"]}
              rows={filteredRefunds.map((item) => [
                valueText(item.id),
                valueText(item.paymentId ?? item.payment_id),
                money(item.amount, item.currency),
                valueText(item.status),
              ])}
            />
          </div>
        )}
      </PanelState>
    </section>
  );
}

function WorkflowsSubtab({ workflows, onRetry }: { workflows: Loadable<{ items: AdminWorkflowRecord[]; total: number }>; onRetry: () => void }) {
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    const items = workflows.data?.items ?? [];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.orderId.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q) ||
        (item.lastErrorCode && item.lastErrorCode.toLowerCase().includes(q)),
    );
  }, [workflows.data?.items, search]);

  return (
    <section className="admin-section" id="workflows" aria-labelledby="workflows-title">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
        <SectionHeading icon={<Workflow size={17} />} title="Workflow reconciliation" id="workflows-title" />
        <button
          className="button button-secondary"
          type="button"
          onClick={onRetry}
          disabled={workflows.loading}
          style={{ height: "32px", padding: "0 10px", fontSize: "0.74rem" }}
        >
          <RefreshCw size={13} className={workflows.loading ? "spin" : ""} /> Làm mới trạng thái
        </button>
      </div>

      {/* Filter Bar */}
      <div className="admin-filter-bar">
        <div className="admin-filter-left">
          <div className="admin-search-input-wrap">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Tìm theo Order ID hoặc mã lỗi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Tìm kiếm workflow"
            />
            {search && (
              <button type="button" className="clear-btn" onClick={() => setSearch("")} aria-label="Xóa tìm kiếm">
                <X size={11} />
              </button>
            )}
          </div>
        </div>
        <div className="admin-filter-right">
          <span>{filteredItems.length} workflows đối soát</span>
        </div>
      </div>

      <PanelState state={workflows} empty="Chưa có workflow cần reconciliation." retry={onRetry}>
        {() => (
          filteredItems.length === 0 ? (
            <div className="admin-empty-panel">
              <div className="admin-empty-panel-icon" style={{ background: "#ECFDF5", color: "#059669" }}>
                <CheckCircle2 size={24} />
              </div>
              <h4>Toàn bộ workflow vận hành hoàn hảo</h4>
              <p>
                {search
                  ? "Không tìm thấy workflow nào khớp với từ khóa tìm kiếm."
                  : "Không có quy trình nào bị treo, lỗi hoặc cần can thiệp đối soát (Reconciliation). Mọi saga và phân luồng dịch vụ đang chạy trơn tru."}
              </p>
              <button className="button button-secondary" type="button" onClick={onRetry}>
                <RefreshCw size={13} /> Kiểm tra lại
              </button>
            </div>
          ) : (
            <DataTable
              caption={`${filteredItems.length} workflow trong danh sách đối soát`}
              headers={["Order ID", "Trạng thái", "Lần thử", "Lỗi gần nhất", "Thời điểm cập nhật"]}
              rows={filteredItems.map((item) => [
                item.orderId,
                item.status,
                String(item.attemptCount),
                item.lastErrorCode ?? "—",
                formatDate(item.completedAt ?? item.claimedAt),
              ])}
            />
          )
        )}
      </PanelState>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Subtab Panels: Support & Feedback
// ---------------------------------------------------------------------------

function SupportSubtab({
  support,
  onUpdateTicket,
  onRetry,
}: {
  support: Loadable<{ items: SupportTicket[]; total: number }>;
  onUpdateTicket: (id: string, patch: { status?: SupportTicketStatus; priority?: SupportPriority }) => Promise<void>;
  onRetry: () => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const filteredItems = useMemo(() => {
    const items = support.data?.items ?? [];
    return items.filter((ticket) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        ticket.id.toLowerCase().includes(q) ||
        ticket.subject.toLowerCase().includes(q) ||
        ticket.description.toLowerCase().includes(q) ||
        ticket.actor_id.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || ticket.status === statusFilter;
      const matchPriority = priorityFilter === "all" || ticket.priority === priorityFilter;
      return matchSearch && matchStatus && matchPriority;
    });
  }, [support.data?.items, search, statusFilter, priorityFilter]);

  return (
    <section className="admin-section" id="support" aria-labelledby="support-title">
      <SectionHeading icon={<LifeBuoy size={17} />} title="Support queue" id="support-title" />

      {/* Filter Bar */}
      <div className="admin-filter-bar">
        <div className="admin-filter-left">
          <div className="admin-search-input-wrap">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Tìm ticket theo tiêu đề, ID hoặc người gửi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Tìm kiếm ticket"
            />
            {search && (
              <button type="button" className="clear-btn" onClick={() => setSearch("")} aria-label="Xóa tìm kiếm">
                <X size={11} />
              </button>
            )}
          </div>

          <select
            className="admin-select-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Lọc theo trạng thái"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="OPEN">Mở (Open)</option>
            <option value="IN_PROGRESS">Đang xử lý</option>
            <option value="RESOLVED">Đã giải quyết</option>
            <option value="CLOSED">Đã đóng</option>
          </select>

          <select
            className="admin-select-filter"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            aria-label="Lọc theo mức độ ưu tiên"
          >
            <option value="all">Tất cả mức ưu tiên</option>
            <option value="LOW">Thấp (Low)</option>
            <option value="NORMAL">Thường (Normal)</option>
            <option value="HIGH">Cao (High)</option>
            <option value="URGENT">Khẩn cấp (Urgent)</option>
          </select>
        </div>
        <div className="admin-filter-right">
          <span>{filteredItems.length} tickets</span>
        </div>
      </div>

      <PanelState state={support} empty="Chưa có support ticket." retry={onRetry}>
        {() => (
          filteredItems.length === 0 ? (
            <div className="admin-empty-search">
              <Search size={22} />
              <strong>Không tìm thấy ticket phù hợp</strong>
              <p>Thử tìm kiếm với từ khóa khác hoặc điều chỉnh bộ lọc.</p>
            </div>
          ) : (
            <div className="admin-support-list">
              {filteredItems.map((ticket) => (
                <SupportRow key={ticket.id} ticket={ticket} onUpdate={onUpdateTicket} />
              ))}
            </div>
          )
        )}
      </PanelState>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Reusable UI Components
// ---------------------------------------------------------------------------

function SectionHeading({ icon, title, id }: { icon: React.ReactNode; title: string; id: string }) {
  return (
    <div className="admin-section-heading">
      <span className="admin-section-icon">{icon}</span>
      <div>
        <span className="eyebrow">X-ONE OPS</span>
        <h2 id={id}>{title}</h2>
      </div>
    </div>
  );
}

function CardTitle({ title, note, noBorder = false }: { title: string; note: string; noBorder?: boolean }) {
  return (
    <div className="admin-card-title" style={noBorder ? { borderBottom: "none", paddingBottom: 0 } : undefined}>
      <h3>{title}</h3>
      <span>{note}</span>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tone = "default",
  onClick,
}: {
  label: string;
  value: unknown;
  icon: React.ReactNode;
  tone?: "default" | "warning";
  onClick?: () => void;
}) {
  return (
    <article
      className={`admin-metric admin-metric-${tone} ${onClick ? "is-clickable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={onClick ? `Xem chi tiết ${label}` : undefined}
    >
      <div className="admin-metric-top">
        <span className="admin-metric-label">{label}</span>
        <span className="admin-metric-icon-box">{icon}</span>
      </div>
      <strong>{valueNumber(value)}</strong>
      {onClick && <span className="admin-metric-hint">Xem chi tiết →</span>}
    </article>
  );
}

function DomainRow({ label, status, detail }: { label: string; status: string; detail?: string }) {
  return (
    <div className="admin-domain-row">
      <span className={`admin-status-dot status-${status}`} aria-hidden="true" />
      <strong>{label}</strong>
      <span className="admin-domain-detail">{detail ?? "Chưa có dữ liệu"}</span>
      <span className={`admin-badge status-${status}`}>
        {status === "healthy" ? "Sẵn sàng" : status === "degraded" ? "Suy giảm" : "Mất kết nối"}
      </span>
    </div>
  );
}

function HealthList({ items, compact = false }: { items: AdminHealthCheck[]; compact?: boolean }) {
  const [expandedService, setExpandedService] = useState<string | null>(null);

  return (
    <div className={`admin-health-list${compact ? " is-compact" : ""}`}>
      {!compact && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "20px minmax(140px, 1.2fr) 90px 100px minmax(130px, 1fr) auto",
            gap: "12px",
            alignItems: "center",
            padding: "8px 14px",
            background: "#F7FAFC",
            borderBottom: "1px solid #E7EDF1",
            fontSize: "0.64rem",
            fontWeight: 700,
            color: "var(--color-muted-soft)",
            textTransform: "uppercase",
          }}
        >
          <span />
          <span>Microservice</span>
          <span>Độ trễ</span>
          <span>Trạng thái</span>
          <span>Thời điểm kiểm tra</span>
          <span style={{ textAlign: "right", minWidth: "60px" }}>Chi tiết</span>
        </div>
      )}
      {items.map((item) => (
        <div key={item.service} className="admin-health-card-item">
          <div className="admin-health-row">
            <span className={`admin-status-dot status-${item.status}`} aria-hidden="true" />
            <strong>{item.service}</strong>
            <span
              className={`admin-latency-badge ${
                item.latency_ms < 20
                  ? "admin-latency-fast"
                  : item.latency_ms < 80
                  ? "admin-latency-medium"
                  : "admin-latency-slow"
              }`}
            >
              {item.status === "healthy" ? `${item.latency_ms} ms` : item.error ?? "Lỗi"}
            </span>
            <span className={`admin-badge status-${item.status}`}>
              {item.status === "healthy" ? "Tốt" : item.status === "degraded" ? "Suy giảm" : "Lỗi"}
            </span>
            <time dateTime={item.checked_at}>{formatDate(item.checked_at)}</time>
            {!compact ? (
              <div style={{ textAlign: "right", minWidth: "60px" }}>
                {item.detail && Object.keys(item.detail).length > 0 ? (
                  <button
                    className="button button-secondary"
                    style={{ padding: "0.15rem 0.5rem", fontSize: "0.7rem", height: "26px" }}
                    type="button"
                    onClick={() => setExpandedService(expandedService === item.service ? null : item.service)}
                  >
                    {expandedService === item.service ? "Ẩn" : "Chi tiết"}
                  </button>
                ) : (
                  <span style={{ fontSize: "0.68rem", color: "var(--color-muted-soft)" }}>—</span>
                )}
              </div>
            ) : null}
          </div>
          {!compact && expandedService === item.service && item.detail && (
            <HealthDetailViewer detail={item.detail} />
          )}
        </div>
      ))}
    </div>
  );
}

function HealthDetailViewer({ detail }: { detail: Record<string, unknown> }) {
  return (
    <div className="admin-health-detail-card">
      <div className="admin-health-detail-grid">
        {Object.entries(detail).map(([key, val]) => {
          const isHealthy = val === "healthy" || val === "connected" || val === true;
          const isDegraded = val === "degraded" || val === "unhealthy";
          const statusClass = isHealthy ? "status-healthy" : isDegraded ? "status-degraded" : "status-unavailable";
          const displayVal = typeof val === "object" ? JSON.stringify(val) : String(val);
          return (
            <div key={key} className="admin-health-detail-item">
              <span className="admin-health-detail-key">{key.replace(/_/g, " ")}:</span>
              <span className={`admin-subcomponent-pill ${statusClass}`}>{displayVal}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DataTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: string[][] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={`${caption}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${index}-${cellIndex}`}>{cell || "—"}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length}>Không có dữ liệu trong danh sách này.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SupportRow({
  ticket,
  onUpdate,
}: {
  ticket: SupportTicket;
  onUpdate: (id: string, patch: { status?: SupportTicketStatus; priority?: SupportPriority }) => Promise<void>;
}) {
  return (
    <article className="admin-support-row">
      <div>
        <span className="eyebrow">{ticket.id}</span>
        <h3>{ticket.subject}</h3>
        <p>{ticket.description}</p>
        <small>
          {ticket.actor_id} · {formatDate(ticket.updated_at)}
        </small>
      </div>
      <div className="admin-support-controls">
        <label>
          Trạng thái
          <select
            value={ticket.status}
            onChange={(event) => void onUpdate(ticket.id, { status: event.target.value as SupportTicketStatus })}
          >
            <option value="OPEN">Mở</option>
            <option value="IN_PROGRESS">Đang xử lý</option>
            <option value="RESOLVED">Đã xử lý</option>
            <option value="CLOSED">Đóng</option>
          </select>
        </label>
        <label>
          Ưu tiên
          <select
            value={ticket.priority}
            onChange={(event) => void onUpdate(ticket.id, { priority: event.target.value as SupportPriority })}
          >
            <option value="LOW">Thấp</option>
            <option value="NORMAL">Thường</option>
            <option value="HIGH">Cao</option>
            <option value="URGENT">Khẩn</option>
          </select>
        </label>
      </div>
    </article>
  );
}

function RelativeTimeDisplay({ timestamp }: { timestamp: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!timestamp) return <span>Chưa cập nhật</span>;
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 5) return <strong>Vừa xong</strong>;
  if (diffSec < 60) return <strong>{diffSec} giây trước</strong>;
  const diffMin = Math.floor(diffSec / 60);
  return <strong>{diffMin} phút trước</strong>;
}

function PanelState<T>({
  state,
  empty,
  retry,
  children,
}: {
  state: Loadable<T>;
  empty: string;
  retry: () => void;
  children: (data: T) => React.ReactNode;
}) {
  if (state.loading) return <LoadingPanel />;
  if (state.error) return <ErrorPanel message={state.error} onRetry={retry} />;
  if (!state.data) return <EmptyPanel label={empty} />;
  return <>{children(state.data)}</>;
}

function LoadingPanel() {
  return (
    <div className="admin-card admin-loading" role="status">
      <span className="loading-mark" />
      Đang tải dữ liệu vận hành…
    </div>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return <div className="admin-card admin-empty">{label}</div>;
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="admin-card admin-error"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 18px",
        background: "#FEF2F2",
        border: "1px solid #FECACA",
        borderRadius: "8px",
        color: "#991B1B",
        margin: "12px 0",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <AlertTriangle size={18} color="#DC2626" />
        <span style={{ fontSize: "0.76rem", fontWeight: 500 }}>{message}</span>
      </div>
      <button
        className="button button-secondary"
        type="button"
        onClick={onRetry}
        style={{
          background: "#FFFFFF",
          borderColor: "#FCA5A5",
          color: "#B91C1C",
          height: "30px",
          padding: "0 12px",
          fontSize: "0.72rem",
          whiteSpace: "nowrap",
        }}
      >
        <RefreshCw size={12} style={{ marginRight: "4px" }} /> Thử lại
      </button>
    </div>
  );
}

function InlineNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="admin-inline-notice">
      <AlertTriangle size={15} />
      {children}
    </p>
  );
}

function useOutsideClick<T extends HTMLElement>(active: boolean, onOutsideClick: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active) return;
    const handleClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onOutsideClick();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [active, onOutsideClick]);
  return ref;
}

function loadable<T>(result: PromiseSettledResult<T>): Loadable<T> {
  return result.status === "fulfilled" ? { data: result.value, loading: false } : { loading: false, error: errorText(result.reason) };
}

function valueNumber(value: unknown): string {
  return typeof value === "number" ? new Intl.NumberFormat("vi-VN").format(value) : valueText(value, "—");
}

function valueText(value: unknown, fallback = "—"): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function transactionId(value: Record<string, unknown>): string {
  return valueText(value.id ?? value.order_id ?? value.orderId);
}

function money(amount: unknown, currency: unknown): string {
  return typeof amount === "number" ? `${new Intl.NumberFormat("vi-VN").format(amount)} ${valueText(currency, "VND")}` : "—";
}

function formatDate(value: unknown): string {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.valueOf()) ? "—" : parsed.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function compactCounts(value: unknown): string {
  if (!value || typeof value !== "object") return "Đã kết nối";
  return Object.entries(value as Record<string, unknown>)
    .map(([key, entry]) => `${key}: ${valueNumber(entry)}`)
    .join(" · ");
}

function datasetDetail(value: Record<string, unknown>): string {
  return (
    [
      valueText(value.dataset_name ?? value.dataset),
      valueText(value.version),
      value.row_count !== undefined ? `${valueNumber(value.row_count)} dòng` : undefined,
      valueText(value.freshness_status, ""),
    ]
      .filter(Boolean)
      .join(" · ") || "Đã kết nối"
  );
}

function initials(email: string): string {
  return email.trim().slice(0, 2).toUpperCase() || "XO";
}
