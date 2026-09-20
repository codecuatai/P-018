"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock3,
  Copy,
  CreditCard,
  Database,
  ExternalLink,
  Filter,
  Gauge,
  HeartPulse,
  Key,
  LayoutDashboard,
  LifeBuoy,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquare,
  Receipt,
  RefreshCw,
  ScrollText,
  Search,
  Send,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sliders,
  Sparkles,
  Star,
  Stethoscope,
  Store,
  Ticket,
  UserCheck,
  UserRound,
  Users,
  UserX,
  Utensils,
  UtensilsCrossed,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { XOneMark } from "@/components/XOneMark";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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
import {
  createOperationsAssignment,
  getAdminFeatureFlags,
  updateAdminFeatureFlag,
  getAdminAuditLogs,
  getOperationsAssignments,
  getOperationsProviderDocuments,
  issueAdminCompensation,
  reviewOperationsProviderDocument,
  updateOperationsAssignment,
} from "@/lib/api-client";
import { CONSOLIDATED_TABS } from "./admin-tabs";
import type { Loadable, MainTabId, SubTabId, TabDefinition } from "./admin.types";
import { useAdminData } from "./hooks/use-admin-data";
import { useAdminNavigation } from "./hooks/use-admin-navigation";

import styles from "./admin-support.module.css";

export function AdminDashboard() {
  const auth = useOptionalAuth();
  const user = auth?.user;
  const logout = auth?.logout ?? (async () => {});

  const { activeMainTab, activeSubTab, switchMainTab, switchSubTab, tabs } = useAdminNavigation(user?.role);

  // Sidebar Layout State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");

  const {
    summary,
    users,
    transactions,
    payments,
    workflows,
    datasets,
    health,
    support,
    refreshing,
    lastCheckedAt,
    load,
    fetchUsers,
    updateUserStatus,
    updateUserRole,
    addTicketMessage,
    refreshHealth,
    refreshTransactions,
    refreshWorkflows,
    updateTicket,
  } = useAdminData();
  const [autoPollHealth, setAutoPollHealth] = useState(false);

  // Incident Compensation Modal State
  const [compensationModalOpen, setCompensationModalOpen] = useState(false);
  const [compensationInitialData, setCompensationInitialData] = useState<{
    workflowId: string;
    reason: string;
    amount: number;
    ticketId?: string;
  }>({
    workflowId: "",
    reason: "",
    amount: 50000,
  });

  const handleOpenCompensation = (
    workflowId = "wf_manual_recovery",
    reason = "Bồi thường sự cố ca trực",
    amount = 50000,
    ticketId?: string,
  ) => {
    setCompensationInitialData({ workflowId, reason, amount, ticketId });
    setCompensationModalOpen(true);
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

  const currentTabDef = tabs.find((t) => t.id === activeMainTab) || tabs[0];
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
            <span>{user?.role === "manager" ? "Operations Console" : "Admin Console"}</span>
          </span>
        </div>

        <div className="app-global-header-right">
          <div className="admin-header-status-indicator" title="Cổng kết nối Gateway Core">
            <span className="admin-status-dot status-healthy" />
            <span className="admin-header-status-text">gateway-core</span>
          </div>

          <Link
            href="/app"
            className="role-switch-link role-badge-customer"
            title="Xem giao diện người dùng / khách hàng"
          >
            <UserRound size={13} />
            <span>Giao diện Khách hàng</span>
          </Link>

          <AdminUserMenu userEmail={user?.email ?? ""} userRole={user?.role} onLogout={handleLogout} />
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
            userRole={user?.role}
            tabs={tabs}
            onLogout={handleLogout}
            openTicketCount={summary.data?.counts?.open_support_tickets}
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
            <span>{user?.role === "manager" ? "Vận hành" : "Admin"}</span>
          </Link>
          <div className="app-mobile-actions">
            <Sheet>
              <SheetTrigger asChild>
                <button className="icon-button" type="button" aria-label="Mở menu quản trị">
                  <Menu size={20} />
                </button>
              </SheetTrigger>
              <SheetContent title={user?.role === "manager" ? "Trung tâm vận hành" : "Quản trị X-One"}>
                <AdminSidebarContent
                  activeMainTab={activeMainTab}
                  onSelectTab={switchMainTab}
                  searchQuery={sidebarSearch}
                  onSearchChange={setSidebarSearch}
                  userEmail={user?.email ?? ""}
                  userRole={user?.role}
                  tabs={tabs}
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
                  <h1 className="admin-banner-title">
                    {user?.role === "manager" ? "Trung tâm vận hành X-One" : "Trung tâm vận hành X-One"}
                  </h1>
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
                  style={{ height: "34px", padding: "0 12px", fontSize: "var(--text-xs)" }}
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
                      userRole={user?.role}
                      userEmail={user?.email}
                      onOpenCompensation={handleOpenCompensation}
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
                  {currentSubTabId === "feature-flags" && (
                    <FeatureFlagsSubtab />
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
                      onFetchPage={fetchUsers}
                      onUpdateStatus={updateUserStatus}
                      onUpdateRole={updateUserRole}
                      canManageRole={user?.role === "admin"}
                      currentUserId={user?.sub || user?.id}
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
                    <WorkflowsSubtab
                      workflows={workflows}
                      onRetry={refreshWorkflows}
                      onOpenCompensation={handleOpenCompensation}
                    />
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
                    <SupportSubtab
                      support={support}
                      onUpdateTicket={updateTicket}
                      onAddMessage={addTicketMessage}
                      onRetry={() => void load()}
                      onOpenCompensation={handleOpenCompensation}
                      userRole={user?.role}
                    />
                  )}
                  {currentSubTabId === "feedback-ratings" && <FeedbackSection />}
                </>
              )}

              {/* TAB 6: SYSTEM LOGS & AUDIT */}
              {activeMainTab === "system-logs" && (
                <>
                  {currentSubTabId === "logs-view" && <SystemLogsSection />}
                  {currentSubTabId === "audit-trail" && <AuditLogsSubtab />}
                </>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Incident Compensation Modal */}
      {compensationModalOpen && (
        <IncidentCompensationModal
          open={compensationModalOpen}
          onClose={() => setCompensationModalOpen(false)}
          initialWorkflowId={compensationInitialData.workflowId}
          initialReason={compensationInitialData.reason}
          initialAmount={compensationInitialData.amount}
          managerEmail={user?.email}
          onSuccess={() => {
            void load();
            refreshWorkflows();
          }}
        />
      )}
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
  userRole,
  tabs,
  onLogout,
  openTicketCount,
}: {
  activeMainTab: MainTabId;
  onSelectTab: (main: MainTabId) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  userEmail: string;
  userRole?: string;
  tabs?: TabDefinition[];
  onLogout: () => Promise<void>;
  openTicketCount?: number;
}) {
  const availableTabs = tabs || CONSOLIDATED_TABS;
  const filteredTabs = useMemo(() => {
    if (!searchQuery.trim()) return availableTabs;
    const q = searchQuery.toLowerCase();
    return availableTabs.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.subtitle.toLowerCase().includes(q) ||
        t.subtabs.some((s: { label: string }) => s.label.toLowerCase().includes(q)),
    );
  }, [availableTabs, searchQuery]);

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
          const navButton = (
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
              {tab.id === "support" && openTicketCount != null && openTicketCount > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "18px",
                    height: "18px",
                    padding: "0 5px",
                    borderRadius: "999px",
                    background: "#EF4444",
                    color: "#FFFFFF",
                    fontSize: "10px",
                    fontWeight: 800,
                    lineHeight: 1,
                    marginLeft: "auto",
                  }}
                  aria-label={`${openTicketCount} ticket đang mở`}
                >
                  {openTicketCount > 99 ? "99+" : openTicketCount}
                </span>
              )}
              {isMainActive && <span className="admin-nav-active-pill" />}
            </button>
          );

          return (
            <div className="admin-nav-group" key={tab.id}>
              {navButton}
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
            <strong>{userEmail || (userRole === "manager" ? "Quản lý vận hành" : "Quản trị viên")}</strong>
            <small>
              <ShieldCheck size={12} /> {userRole === "manager" ? "Quyền Manager" : "Quyền Admin"}
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

function AdminUserMenu({ userEmail, userRole, onLogout }: { userEmail: string; userRole?: string; onLogout: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(open, () => setOpen(false));
  const isManager = userRole === "manager";

  return (
    <div className="user-menu-wrap" ref={ref}>
      <button
        className="user-avatar-btn"
        type="button"
        aria-label={isManager ? "Tài khoản Quản lý" : "Tài khoản Quản trị"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((val) => !val)}
      >
        <span className="user-avatar-circle">{initials(userEmail)}</span>
      </button>

      {open && (
        <div className="user-dropdown" role="menu">
          <div className="user-dropdown-header">
            <strong title={userEmail}>{userEmail || (isManager ? "Quản lý vận hành" : "Quản trị viên")}</strong>
            <small>
              <ShieldCheck size={12} /> {isManager ? "Quyền Manager · Phiên bảo mật" : "Quyền Admin · Phiên bảo mật"}
            </small>
          </div>
          <div className="dropdown-divider" />
          <Link
            className="dropdown-item"
            href="/app"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <UserRound size={15} />
            <span>Giao diện Khách hàng</span>
          </Link>
          <Link
            className="dropdown-item"
            href="/app/provider"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <Store size={15} />
            <span>Cổng Đối tác</span>
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
  userRole,
  userEmail,
  onOpenCompensation,
}: {
  summary: Loadable<AdminSummary>;
  onRetry: () => void;
  onNavigateTab: (main: MainTabId, sub?: SubTabId) => void;
  autoPollHealth: boolean;
  setAutoPollHealth: (val: boolean) => void;
  onRefreshHealth: () => void;
  userRole?: string;
  userEmail?: string;
  onOpenCompensation?: (workflowId?: string, reason?: string, amount?: number) => void;
}) {
  const [handoverNote, setHandoverNote] = useState("");
  const [handoverSaved, setHandoverSaved] = useState(false);
  const [handoverLoading, setHandoverLoading] = useState(false);

  function handleSaveHandover() {
    if (!handoverNote.trim()) return;
    setHandoverLoading(true);
    // Persist to sessionStorage so it survives tab navigation within the session
    try {
      const ts = new Date().toLocaleString("vi-VN");
      const existing = JSON.parse(sessionStorage.getItem("xone_shift_handover") ?? "[]") as string[];
      existing.push(`[${ts}] ${userEmail ?? "Manager"}: ${handoverNote.trim()}`);
      sessionStorage.setItem("xone_shift_handover", JSON.stringify(existing));
    } catch {
      /* best effort */
    }
    setTimeout(() => {
      setHandoverLoading(false);
      setHandoverSaved(true);
      setHandoverNote("");
      setTimeout(() => setHandoverSaved(false), 3000);
    }, 400);
  }

  // Load stored handover notes from sessionStorage
  const [storedNotes, setStoredNotes] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("xone_shift_handover") ?? "[]") as string[];
      setStoredNotes(saved);
    } catch {
      setStoredNotes([]);
    }
  }, [handoverSaved]);

  return (
    <section className="admin-section" id="overview" aria-labelledby="overview-title">
      <SectionHeading icon={<Gauge size={17} />} title="Tổng quan" id="overview-title" />
      {summary.error ? (
        <ErrorPanel message={summary.error} onRetry={onRetry} />
      ) : summary.loading ? (
        <LoadingPanel />
      ) : summary.data ? (
        <>
          {/* Shift Command Hero for Operations Manager */}
          {userRole === "manager" && (
            <div
              className="admin-shift-hero"
              style={{
                background: "linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #1E293B 100%)",
                borderRadius: "14px",
                padding: "18px 22px",
                color: "#FFFFFF",
                marginBottom: "16px",
                boxShadow: "0 10px 25px -5px rgba(30, 27, 75, 0.25), 0 8px 10px -6px rgba(30, 27, 75, 0.2)",
                border: "1px solid rgba(199, 210, 254, 0.2)",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      background: "rgba(99, 102, 241, 0.3)",
                      border: "1px solid rgba(165, 180, 252, 0.4)",
                      display: "grid",
                      placeItems: "center",
                      color: "#A5B4FC",
                    }}
                  >
                    <ShieldCheck size={24} />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <h2 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 700, color: "#FFFFFF", letterSpacing: "-0.01em" }}>
                        Bảng Điều Hành Ca Trực Vận Hành
                      </h2>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          background: "rgba(16, 185, 129, 0.2)",
                          color: "#6EE7B7",
                          border: "1px solid rgba(110, 231, 183, 0.4)",
                          padding: "2px 8px",
                          borderRadius: "999px",
                          fontSize: "var(--text-micro)",
                          fontWeight: 700,
                        }}
                      >
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10B981" }} />
                        CA TRỰC HOẠT ĐỘNG
                      </span>
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: "var(--text-xs)", color: "#C7D2FE" }}>
                      Trưởng ca: <strong>{userEmail || "Operations Manager"}</strong> · Giám sát 5 phân hệ dịch vụ (Ride, Delivery, Food, Restaurant, Healthcare).
                    </p>
                  </div>
                </div>

                {/* Quick Action Shortcuts for Manager */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => onOpenCompensation?.("wf_manual_recovery", "Bồi thường sự cố điều phối ca trực", 50000)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "#F59E0B",
                      color: "#78350F",
                      border: "none",
                      fontWeight: 700,
                      fontSize: "var(--text-xs)",
                      padding: "8px 14px",
                      borderRadius: "8px",
                      cursor: "pointer",
                    }}
                  >
                    <Zap size={14} />
                    <span>Bồi thường sự cố (Voucher)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigateTab("support", "support-queue")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "rgba(255, 255, 255, 0.12)",
                      color: "#FFFFFF",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                      fontWeight: 600,
                      fontSize: "var(--text-xs)",
                      padding: "8px 14px",
                      borderRadius: "8px",
                      cursor: "pointer",
                    }}
                  >
                    <LifeBuoy size={14} />
                    <span>Xử lý ticket ({summary.data?.counts?.open_support_tickets ?? 0})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigateTab("transactions", "workflow-reconciliation")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "rgba(255, 255, 255, 0.12)",
                      color: "#FFFFFF",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                      fontWeight: 600,
                      fontSize: "var(--text-xs)",
                      padding: "8px 14px",
                      borderRadius: "8px",
                      cursor: "pointer",
                    }}
                  >
                    <Workflow size={14} />
                    <span>Đối soát lỗi ({summary.data?.counts?.failed_workflows ?? 0})</span>
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Responsive KPI Grid */}
          <div className="admin-metric-grid">
            <MetricCard
              label="Tài khoản"
              value={summary.data.counts?.total_users ?? 0}
              icon={<Users size={16} />}
              subtext="Đã đăng ký trong Core"
              onClick={() => onNavigateTab("users", "user-list")}
            />
            <MetricCard
              label="Thanh toán"
              value={summary.data.counts?.payments ?? 0}
              icon={<CreditCard size={16} />}
              subtext="Giao dịch qua Saga"
              onClick={() => onNavigateTab("transactions", "payments-list")}
            />
            <MetricCard
              label="Hoàn tiền"
              value={summary.data.counts?.refunds ?? 0}
              icon={<RefreshCw size={16} />}
              subtext="Yêu cầu hoàn trả"
              onClick={() => onNavigateTab("transactions", "payments-list")}
            />
            <MetricCard
              label="Support đang mở"
              value={summary.data.counts?.open_support_tickets ?? 0}
              icon={<LifeBuoy size={16} />}
              subtext="Ticket chờ hỗ trợ"
              onClick={() => onNavigateTab("support", "support-queue")}
            />
            <MetricCard
              label="Workflow lỗi"
              value={summary.data.counts?.failed_workflows ?? 0}
              icon={<AlertTriangle size={16} />}
              tone={Number(summary.data.counts?.failed_workflows ?? 0) > 0 ? "warning" : "default"}
              subtext={Number(summary.data.counts?.failed_workflows ?? 0) === 0 ? "100% khớp lệnh" : "Cần đối soát"}
              onClick={() => onNavigateTab("transactions", "workflow-reconciliation")}
            />
            <MetricCard
              label="Workflow partial"
              value={summary.data.counts?.partial_success_workflows ?? 0}
              icon={<Workflow size={16} />}
              tone={Number(summary.data.counts?.partial_success_workflows ?? 0) > 0 ? "warning" : "default"}
              subtext={Number(summary.data.counts?.partial_success_workflows ?? 0) === 0 ? "Không có phân mảnh" : "Cần xử lý"}
              onClick={() => onNavigateTab("transactions", "workflow-reconciliation")}
            />
          </div>

          {userRole === "manager" && <OperationsQueue />}
          {userRole === "admin" && <ProviderDocumentReview />}

          <div className="admin-two-column">
            {/* Domain Summary Card */}
            <div className="admin-card">
              <CardTitle title="Domain summary" note="Dữ liệu từ 4 microservices nghiệp vụ" />
              <div className="admin-domain-list">
                {(summary.data.domains ?? []).map((domain) => (
                  <DomainRow
                    key={domain.domain}
                    label={domain.domain}
                    status={domain.status}
                    detail={domain.data ? formatDomainCounts(domain.domain, domain.data.counts ?? domain.data) : domain.error}
                  />
                ))}
              </div>
            </div>

            {/* Live Health Probes Card */}
            <div className="admin-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--color-border)", paddingBottom: "10px", marginBottom: "8px" }}>
                <CardTitle title="Tín hiệu hệ thống" note="Probe thời gian thực" noBorder />
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "var(--text-xs)", cursor: "pointer", color: "var(--color-muted)" }}>
                    <input
                      type="checkbox"
                      checked={autoPollHealth}
                      onChange={(e) => setAutoPollHealth(e.target.checked)}
                    />
                    Auto-refresh (15s)
                  </label>
                  <button className="button button-secondary" type="button" onClick={onRefreshHealth} style={{ padding: "0.2rem 0.5rem", fontSize: "var(--text-xs)", height: "26px" }}>
                    <RefreshCw size={12} /> Probe ngay
                  </button>
                </div>
              </div>
              <HealthList items={summary.data.health?.items ?? []} compact />
            </div>
          </div>

          {/* Shift Handover Notes — Manager only */}
          {userRole === "manager" && (
            <div
              className="admin-card"
              style={{ marginTop: "16px" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid var(--color-border)", paddingBottom: "10px", marginBottom: "12px" }}>
                <span style={{ display: "grid", placeItems: "center", width: "30px", height: "30px", borderRadius: "8px", background: "#EEF2FF", color: "#4F46E5" }}>
                  <ScrollText size={16} />
                </span>
                <div>
                  <strong style={{ display: "block", fontSize: "var(--text-sm)", color: "#1E293B" }}>Ghi chú Bàn giao Ca</strong>
                  <span style={{ fontSize: "var(--text-micro)", color: "#64748B" }}>Nhật ký ca trực — lưu trong phiên hiện tại, chuyển cho ca sau</span>
                </div>
              </div>

              {storedNotes.length > 0 && (
                <div style={{ marginBottom: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {storedNotes.map((note, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "7px 10px",
                        borderRadius: "6px",
                        background: "#F8FAFC",
                        border: "1px solid #E2E8F0",
                        fontSize: "var(--text-xs)",
                        color: "#334155",
                        fontFamily: "var(--font-mono)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {note}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <textarea
                  rows={3}
                  value={handoverNote}
                  onChange={(e) => setHandoverNote(e.target.value)}
                  placeholder="Ghi chú sự cố, công việc còn dở, cảnh báo cần bàn giao cho ca sau…"
                  aria-label="Ghi chú bàn giao ca"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #CBD5E1",
                    fontSize: "var(--text-xs)",
                    resize: "vertical",
                    fontFamily: "inherit",
                    color: "#0F172A",
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end" }}>
                  {handoverSaved && (
                    <span style={{ fontSize: "var(--text-xs)", color: "#16A34A", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Check size={13} /> Đã lưu ghi chú bàn giao!
                    </span>
                  )}
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={handleSaveHandover}
                    disabled={handoverLoading || !handoverNote.trim()}
                    style={{ height: "34px", padding: "0 14px", fontSize: "var(--text-xs)", display: "inline-flex", alignItems: "center", gap: "5px" }}
                  >
                    {handoverLoading ? <LoaderCircle className="spin" size={13} /> : <ScrollText size={13} />}
                    <span>Lưu ghi chú bàn giao</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyPanel label="Chưa có dữ liệu tổng quan." />
      )}
    </section>
  );
}

function ProviderDocumentReview() {
  const [documents, setDocuments] = useState<Array<{ id: string; providerId: string; documentType: string; status: string; expiresAt?: string; reviewNote?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      setDocuments(await getOperationsProviderDocuments());
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải hồ sơ provider.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const review = async (id: string, status: "APPROVED" | "REJECTED") => {
    try {
      const updated = await reviewOperationsProviderDocument(id, { status });
      setDocuments((prev) => prev.map((document) => document.id === id ? { ...document, ...updated } : document));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật hồ sơ.");
    }
  };

  return (
    <div className="admin-card" style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
        <CardTitle title="Duyệt hồ sơ Provider" note="Admin kiểm soát tài liệu và trạng thái xác minh" noBorder />
        <button type="button" className="button button-secondary" onClick={() => void reload()} disabled={loading} style={{ height: "30px", padding: "0 10px", fontSize: "var(--text-xs)" }}><RefreshCw size={12} /> Làm mới</button>
      </div>
      {message && <p style={{ color: "#B91C1C", fontSize: "var(--text-xs)" }}>{message}</p>}
      {!loading && documents.length === 0 && <p style={{ color: "#64748B", fontSize: "var(--text-xs)" }}>Chưa có hồ sơ chờ duyệt.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {documents.slice(0, 8).map((document) => (
          <div key={document.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", padding: "9px 10px", border: "1px solid #E2E8F0", borderRadius: "8px" }}>
            <div>
              <strong style={{ fontSize: "var(--text-xs)", color: "#0F172A" }}>{document.documentType}</strong>
              <span style={{ display: "block", color: "#64748B", fontSize: "11px" }}>Provider {document.providerId} · {document.status}</span>
            </div>
            {document.status === "PENDING" && <div style={{ display: "flex", gap: "6px" }}><button type="button" className="button button-sm button-primary" onClick={() => void review(document.id, "APPROVED")}>Duyệt</button><button type="button" className="button button-sm button-secondary" onClick={() => void review(document.id, "REJECTED")}>Từ chối</button></div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function OperationsQueue() {
  const [items, setItems] = useState<Array<{
    id: string;
    providerId: string;
    domain: string;
    resourceId: string;
    status: string;
    dueAt?: string;
  }>>([]);
  const [overdue, setOverdue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ providerId: "", domain: "ride", resourceId: "", dueAt: "" });

  const reload = async () => {
    setLoading(true);
    try {
      const result = await getOperationsAssignments();
      setItems(result.items);
      setOverdue(result.overdue);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải hàng đợi điều phối.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const assign = async () => {
    if (!form.providerId.trim() || !form.resourceId.trim()) {
      setMessage("Cần nhập provider ID và resource ID trước khi phân công.");
      return;
    }
    try {
      await createOperationsAssignment({ provider_id: form.providerId.trim(), domain: form.domain, resource_id: form.resourceId.trim(), ...(form.dueAt ? { due_at: new Date(form.dueAt).toISOString() } : {}) });
      setForm((current) => ({ ...current, resourceId: "", dueAt: "" }));
      await reload();
      setMessage("Đã tạo assignment và đưa vào hàng đợi provider.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tạo assignment.");
    }
  };

  const transition = async (id: string, status: "CANCELLED" | "IN_PROGRESS") => {
    try {
      await updateOperationsAssignment(id, { status });
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật assignment.");
    }
  };

  return (
    <section className="admin-card" aria-labelledby="operations-queue-title" style={{ marginTop: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h3 id="operations-queue-title" style={{ margin: 0, fontSize: "var(--text-sm)", color: "#0F172A" }}>Hàng đợi điều phối provider</h3>
          <p style={{ margin: "4px 0 0", color: "#64748B", fontSize: "var(--text-xs)" }}>{overdue} assignment quá SLA · {items.length} assignment hiện tại</p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => void reload()} disabled={loading} style={{ height: "32px", padding: "0 10px", fontSize: "var(--text-xs)" }}><RefreshCw size={13} className={loading ? "spin" : undefined} /> Làm mới</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px", marginTop: "12px" }}>
        <input aria-label="Provider ID điều phối" placeholder="Provider ID" value={form.providerId} onChange={(event) => setForm((current) => ({ ...current, providerId: event.target.value }))} />
        <select aria-label="Domain điều phối" value={form.domain} onChange={(event) => setForm((current) => ({ ...current, domain: event.target.value }))}><option value="ride">Ride</option><option value="food">Food</option><option value="restaurant">Restaurant</option><option value="healthcare">Healthcare</option><option value="delivery">Delivery</option></select>
        <input aria-label="Resource ID điều phối" placeholder="Resource ID" value={form.resourceId} onChange={(event) => setForm((current) => ({ ...current, resourceId: event.target.value }))} />
        <input aria-label="Hạn SLA điều phối" type="datetime-local" value={form.dueAt} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} />
        <button className="button button-primary" type="button" onClick={() => void assign()} style={{ height: "34px" }}>Phân công</button>
      </div>
      {message && <p style={{ color: "#B45309", fontSize: "var(--text-xs)", margin: "8px 0 0" }}>{message}</p>}
      <div style={{ display: "grid", gap: "6px", marginTop: "12px" }}>
        {items.slice(0, 8).map((item) => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", padding: "8px 10px", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "var(--text-xs)" }}>
            <span><strong>{item.domain}</strong> · {item.resourceId} · {item.providerId}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><span>{item.status}</span>{item.status === "OFFERED" && <button className="button button-secondary" type="button" onClick={() => void transition(item.id, "IN_PROGRESS")} style={{ height: "26px", padding: "0 8px", fontSize: "11px" }}>Bắt đầu</button>}{!['COMPLETED', 'CANCELLED', 'REJECTED'].includes(item.status) && <button className="button button-secondary" type="button" onClick={() => void transition(item.id, "CANCELLED")} style={{ height: "26px", padding: "0 8px", fontSize: "11px" }}>Hủy</button>}</span>
          </div>
        ))}
        {!loading && items.length === 0 && <span style={{ color: "#64748B", fontSize: "var(--text-xs)" }}>Chưa có assignment nào.</span>}
      </div>
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
          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "var(--text-sm)", cursor: "pointer", color: "#166534", fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={autoPollHealth}
              onChange={(e) => setAutoPollHealth(e.target.checked)}
            />
            Auto-refresh (15s)
          </label>
          <button className="button button-secondary" type="button" onClick={onRefreshHealth} style={{ height: "32px", padding: "0 10px", fontSize: "var(--text-sm)" }}>
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
        (item.data && datasetDetail(item.domain, item.data).toLowerCase().includes(q)),
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
                detail={item.data ? datasetDetail(item.domain, item.data) : item.error}
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
  onFetchPage,
  onUpdateStatus,
  onUpdateRole,
  canManageRole,
  currentUserId,
}: {
  users: Loadable<{ items: AdminUserRecord[]; total: number; page: number; page_size: number }>;
  onRetry: () => void;
  onManageServices: () => void;
  onFetchPage?: (page: number, pageSize: number) => Promise<void>;
  onUpdateStatus?: (id: string, status: "active" | "suspended") => Promise<AdminUserRecord>;
  onUpdateRole?: (id: string, role: AdminUserRecord["role"]) => Promise<AdminUserRecord>;
  canManageRole?: boolean;
  currentUserId?: string;
}) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [roleChangeModal, setRoleChangeModal] = useState<{ user: AdminUserRecord; nextRole: AdminUserRecord["role"] } | null>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, roleFilter, statusFilter, pageSize]);

  const filteredItems = useMemo(() => {
    const items = users.data?.items ?? [];
    return items.filter((u) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        u.email.toLowerCase().includes(q) ||
        u.full_name.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q);
      const matchRole =
        roleFilter === "all" ||
        u.role.toLowerCase() === roleFilter.toLowerCase() ||
        (roleFilter === "user" && (u.role === "user" || u.role === "customer"));
      const matchStatus = statusFilter === "all" || u.status.toLowerCase() === statusFilter.toLowerCase();
      return matchSearch && matchRole && matchStatus;
    });
  }, [users.data?.items, search, roleFilter, statusFilter]);

  const totalFiltered = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, safePage, pageSize]);

  const startRecord = totalFiltered === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endRecord = Math.min(safePage * pageSize, totalFiltered);

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, safePage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }, [safePage, totalPages]);

  const handleToggleStatus = async (userId: string, nextStatus: "active" | "suspended", userName: string) => {
    if (!onUpdateStatus) return;
    const actionLabel = nextStatus === "suspended" ? "khóa (disband)" : "mở khóa (kích hoạt lại)";
    const confirmed = window.confirm(`Bạn có chắc chắn muốn ${actionLabel} tài khoản "${userName}"?`);
    if (!confirmed) return;

    setActionLoadingId(userId);
    setActionMessage(null);
    try {
      await onUpdateStatus(userId, nextStatus);
      setActionMessage({
        text: `Đã ${nextStatus === "suspended" ? "khóa tài khoản" : "mở khóa và kích hoạt lại"} "${userName}" thành công.`,
        type: "success",
      });
      setTimeout(() => setActionMessage(null), 4000);
    } catch (error) {
      setActionMessage({
        text: `Không thể cập nhật trạng thái: ${error instanceof Error ? error.message : "Đã có lỗi xảy ra"}`,
        type: "error",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRoleChangeConfirm = async () => {
    if (!roleChangeModal || !onUpdateRole) return;
    const { user: targetUser, nextRole } = roleChangeModal;
    setActionLoadingId(targetUser.id);
    setActionMessage(null);
    try {
      await onUpdateRole(targetUser.id, nextRole);
      setActionMessage({
        text: `Đã cập nhật vai trò tài khoản "${targetUser.full_name || targetUser.email}" thành "${nextRole}".`,
        type: "success",
      });
      setTimeout(() => setActionMessage(null), 4000);
      setRoleChangeModal(null);
    } catch (error) {
      setActionMessage({
        text: `Không thể cập nhật vai trò: ${error instanceof Error ? error.message : "Đã có lỗi xảy ra"}`,
        type: "error",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <section className="admin-section" id="users" aria-labelledby="users-title">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
        <SectionHeading icon={<Users size={17} />} title="Người dùng" id="users-title" />
        <button
          className="button button-secondary"
          type="button"
          onClick={onManageServices}
          style={{ fontSize: "var(--text-micro)", height: "32px", padding: "0 12px" }}
        >
          <ShieldCheck size={14} />
          <span>Quản lý phân quyền dịch vụ →</span>
        </button>
      </div>

      {/* Action Banner Toast */}
      {actionMessage && (
        <div
          className="admin-toast-banner"
          style={{
            marginBottom: "12px",
            padding: "8px 14px",
            fontSize: "var(--text-xs)",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: actionMessage.type === "success" ? "#F0FDF4" : "#FEF2F2",
            color: actionMessage.type === "success" ? "#166534" : "#991B1B",
            border: `1px solid ${actionMessage.type === "success" ? "#BBF7D0" : "#FECACA"}`,
          }}
        >
          {actionMessage.type === "success" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          <strong>{actionMessage.text}</strong>
        </div>
      )}

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
            <option value="manager">Manager</option>
            <option value="provider">Provider</option>
            <option value="user">User / Customer</option>
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
          <span>
            Hiển thị {startRecord} - {endRecord} / {totalFiltered} tài khoản
            {users.data?.total !== undefined && users.data.total > totalFiltered ? ` (Tổng cộng ${users.data.total})` : ""}
          </span>
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
                <strong>Danh sách tài khoản ({totalFiltered}) · Trang {safePage}/{totalPages}</strong>
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
                      <th scope="col" style={{ textAlign: "right", paddingRight: "16px" }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedItems.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="admin-user-cell">
                            <span className="admin-user-avatar">{initials(u.full_name || u.email)}</span>
                            <div>
                              <strong style={{ display: "block", color: "#0F172A", fontSize: "var(--text-xs)" }}>
                                {u.full_name || "Chưa đặt tên"}
                              </strong>
                              <span style={{ color: "#64748B", fontSize: "var(--text-micro)" }}>{u.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          {canManageRole && currentUserId !== u.id ? (
                            <select
                              className="admin-select-filter"
                              value={u.role === "customer" ? "user" : u.role}
                              disabled={actionLoadingId === u.id}
                              onChange={(e) => {
                                const nextRole = e.target.value as AdminUserRecord["role"];
                                if (nextRole !== u.role) {
                                  setRoleChangeModal({ user: u, nextRole });
                                }
                              }}
                              aria-label={`Thay đổi vai trò cho ${u.email}`}
                              style={{
                                padding: "2px 8px",
                                fontSize: "var(--text-micro)",
                                height: "26px",
                                borderRadius: "6px",
                                border: "1px solid #CBD5E1",
                                background: "#F8FAFC",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              <option value="user">user</option>
                              <option value="manager">manager</option>
                              <option value="provider">provider</option>
                              <option value="admin">admin</option>
                            </select>
                          ) : (
                            <span className={`admin-role-badge role-${u.role}`}>{u.role}</span>
                          )}
                        </td>
                        <td>
                          <span className={`admin-badge status-${u.status === "active" ? "healthy" : "suspended"}`}>
                            {u.status === "active" ? "Hoạt động" : "Đã khóa"}
                          </span>
                        </td>
                        <td style={{ color: "#64748B" }}>{formatDate(u.created_at)}</td>
                        <td style={{ textAlign: "right", paddingRight: "16px" }}>
                          {currentUserId === u.id ? (
                            <span style={{ fontSize: "var(--text-micro)", color: "#94A3B8", fontStyle: "italic" }}>Tài khoản của bạn</span>
                          ) : u.status === "active" ? (
                            <button
                              className="admin-action-btn-suspend"
                              type="button"
                              disabled={actionLoadingId === u.id}
                              onClick={() => void handleToggleStatus(u.id, "suspended", u.full_name || u.email)}
                              aria-label={`Khóa tài khoản ${u.full_name || u.email}`}
                              title="Khóa / Vô hiệu hóa tài khoản (Disband)"
                            >
                              {actionLoadingId === u.id ? <LoaderCircle className="spinner" size={12} /> : <UserX size={12} />}
                              <span>Khóa tài khoản</span>
                            </button>
                          ) : (
                            <button
                              className="admin-action-btn-activate"
                              type="button"
                              disabled={actionLoadingId === u.id}
                              onClick={() => void handleToggleStatus(u.id, "active", u.full_name || u.email)}
                              aria-label={`Mở khóa tài khoản ${u.full_name || u.email}`}
                              title="Mở khóa / Kích hoạt lại tài khoản"
                            >
                              {actionLoadingId === u.id ? <LoaderCircle className="spinner" size={12} /> : <UserCheck size={12} />}
                              <span>Kích hoạt lại</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phân trang (Pagination) */}
              <div className="admin-pagination">
                <div className="admin-page-size-selector">
                  <span>Hiển thị:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="admin-select-filter"
                    style={{ height: "28px", padding: "0 6px", fontSize: "var(--text-micro)" }}
                    aria-label="Số hàng mỗi trang"
                  >
                    <option value={5}>5 / trang</option>
                    <option value={10}>10 / trang</option>
                    <option value={20}>20 / trang</option>
                    <option value={50}>50 / trang</option>
                  </select>
                </div>

                <div className="admin-pagination-info">
                  Trang <strong>{safePage}</strong> / <strong>{totalPages}</strong> ({startRecord} - {endRecord} trên {totalFiltered})
                </div>

                <div className="admin-pagination-controls">
                  <button
                    className="admin-pagination-btn"
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={safePage <= 1}
                    aria-label="Trang đầu"
                    title="Trang đầu"
                  >
                    <ChevronsLeft size={14} />
                  </button>
                  <button
                    className="admin-pagination-btn"
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={safePage <= 1}
                    aria-label="Trang trước"
                  >
                    <ChevronLeft size={14} /> Trước
                  </button>

                  <div className="admin-pagination-pages">
                    {pageNumbers.map((p) => (
                      <button
                        key={p}
                        className={`admin-pagination-btn ${p === safePage ? "is-active" : ""}`}
                        type="button"
                        onClick={() => setCurrentPage(p)}
                        aria-label={`Trang ${p}`}
                        aria-current={p === safePage ? "page" : undefined}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  <button
                    className="admin-pagination-btn"
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={safePage >= totalPages}
                    aria-label="Trang sau"
                  >
                    Sau <ChevronRight size={14} />
                  </button>
                  <button
                    className="admin-pagination-btn"
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={safePage >= totalPages}
                    aria-label="Trang cuối"
                    title="Trang cuối"
                  >
                    <ChevronsRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          )
        )}
      </PanelState>
      {/* Role Change Modal */}
      {roleChangeModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px",
          }}
        >
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "440px",
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <ShieldAlert size={22} style={{ color: "#EA580C" }} />
              <h3 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 600, color: "#0F172A" }}>
                Xác nhận thay đổi vai trò người dùng
              </h3>
            </div>
            <p style={{ fontSize: "var(--text-sm)", color: "#475569", lineHeight: "var(--leading-normal)", marginBottom: "16px" }}>
              Bạn đang chuyển vai trò của tài khoản <strong>{roleChangeModal.user.full_name || roleChangeModal.user.email}</strong> từ{" "}
              <code style={{ background: "#F1F5F9", padding: "2px 6px", borderRadius: "4px" }}>{roleChangeModal.user.role}</code>{" "}
              sang{" "}
              <code style={{ background: "#FEF3C7", color: "#92400E", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>
                {roleChangeModal.nextRole}
              </code>.
            </p>
            <div
              style={{
                fontSize: "var(--text-xs)",
                color: "#64748B",
                background: "#F8FAFC",
                padding: "10px 14px",
                borderRadius: "8px",
                marginBottom: "20px",
                border: "1px solid #E2E8F0",
              }}
            >
              ⚠️ Lưu ý: Khi vai trò thay đổi, tất cả các phiên đăng nhập hiện tại của người dùng này sẽ bị thu hồi tự động để đảm bảo an toàn.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="button button-secondary"
                disabled={actionLoadingId === roleChangeModal.user.id}
                onClick={() => setRoleChangeModal(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="button button-primary"
                disabled={actionLoadingId === roleChangeModal.user.id}
                onClick={() => void handleRoleChangeConfirm()}
              >
                {actionLoadingId === roleChangeModal.user.id ? <LoaderCircle className="spinner" size={14} /> : null}
                <span>Xác nhận thay đổi</span>
              </button>
            </div>
          </div>
        </div>
      )}
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
          style={{ height: "32px", padding: "0 10px", fontSize: "var(--text-sm)" }}
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
            <option value="delivery">Giao hàng (Delivery)</option>
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

function WorkflowsSubtab({
  workflows,
  onRetry,
  onOpenCompensation,
}: {
  workflows: Loadable<{ items: AdminWorkflowRecord[]; total: number }>;
  onRetry: () => void;
  onOpenCompensation?: (workflowId?: string, reason?: string, amount?: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [compensatingId, setCompensatingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleCompensate = async (orderId: string) => {
    setCompensatingId(orderId);
    try {
      const res = await issueAdminCompensation(orderId, 50000, "Bù trừ tự động từ Trung tâm vận hành");
      setNotice(`Đã phát hành bồi thường 50.000 đ cho workflow ${orderId} (Mã bồi hoàn: ${res?.id || "COMP-OK"})`);
      setTimeout(() => setNotice(null), 5000);
      onRetry();
    } catch (err: any) {
      setNotice(`Lỗi bồi thường: ${err?.message || "Không thể phát hành bồi thường"}`);
      setTimeout(() => setNotice(null), 5000);
    } finally {
      setCompensatingId(null);
    }
  };

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
        <div style={{ display: "flex", gap: "8px" }}>
          {onOpenCompensation ? (
            <button
              className="button button-primary"
              type="button"
              onClick={() => onOpenCompensation("wf_manual_recovery", "Bồi thường sự cố đối soát workflow", 50000)}
              style={{ height: "32px", padding: "0 12px", fontSize: "var(--text-sm)", display: "inline-flex", alignItems: "center", gap: "5px", background: "#F59E0B", borderColor: "#D97706", color: "#78350F" }}
            >
              <Zap size={14} />
              <span>Bồi thường sự cố (Voucher)</span>
            </button>
          ) : (
            <button
              className="button button-secondary"
              type="button"
              disabled={Boolean(compensatingId)}
              onClick={() => void handleCompensate("wf_manual_recovery")}
              style={{ height: "32px", padding: "0 10px", fontSize: "var(--text-sm)", display: "inline-flex", alignItems: "center", gap: "5px" }}
            >
              {compensatingId === "wf_manual_recovery" ? <LoaderCircle className="spin" size={13} /> : <ShieldAlert size={13} />}
              <span>Bù trừ sự cố (1-Click)</span>
            </button>
          )}
          <button
            className="button button-secondary"
            type="button"
            onClick={onRetry}
            disabled={workflows.loading}
            style={{ height: "32px", padding: "0 10px", fontSize: "var(--text-sm)" }}
          >
            <RefreshCw size={13} className={workflows.loading ? "spin" : ""} /> Làm mới trạng thái
          </button>
        </div>
      </div>

      {notice && (
        <div style={{ marginBottom: "10px", padding: "8px 12px", borderRadius: "8px", background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0", fontSize: "var(--text-xs)", display: "flex", alignItems: "center", gap: "6px" }}>
          <CheckCircle2 size={14} />
          <span>{notice}</span>
        </div>
      )}

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

function FeatureFlagsSubtab() {
  const [flags, setFlags] = useState<Array<{ flag_key: string; enabled: boolean; description: string; updated_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadFlags = async () => {
    setLoading(true);
    try {
      const items = await getAdminFeatureFlags();
      setFlags(items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFlags();
  }, []);

  const handleToggle = async (key: string, currentStatus: boolean) => {
    setUpdatingKey(key);
    try {
      await updateAdminFeatureFlag(key, !currentStatus);
      setFlags((prev) => prev.map((f) => f.flag_key === key ? { ...f, enabled: !currentStatus, updated_at: new Date().toISOString() } : f));
      setNotice(`Đã ${!currentStatus ? "kích hoạt" : "tắt"} cờ tính năng "${key}" thành công!`);
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      setNotice(`Không thể cập nhật cờ: ${err?.message || "Lỗi"}`);
      setTimeout(() => setNotice(null), 4000);
    } finally {
      setUpdatingKey(null);
    }
  };

  return (
    <section className="admin-section" id="feature-flags" aria-labelledby="feature-flags-title">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
        <SectionHeading icon={<Sliders size={17} />} title="Dynamic Feature Flags (Cờ tính năng thời gian thực)" id="feature-flags-title" />
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void loadFlags()}
          disabled={loading}
          style={{ height: "32px", padding: "0 10px", fontSize: "var(--text-sm)" }}
        >
          <RefreshCw size={13} className={loading ? "spin" : ""} /> Làm mới
        </button>
      </div>

      {notice && (
        <div style={{ marginBottom: "12px", padding: "8px 12px", borderRadius: "8px", background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0", fontSize: "var(--text-xs)", display: "flex", alignItems: "center", gap: "6px" }}>
          <CheckCircle2 size={14} />
          <span>{notice}</span>
        </div>
      )}

      {loading ? (
        <div className="admin-loading"><span className="loading-mark" /> Đang tải danh sách Feature Flags…</div>
      ) : flags.length === 0 ? (
        <div className="admin-empty">Không có cờ tính năng nào trong hệ thống.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: "14px" }}>
          {flags.map((flag) => (
            <div
              key={flag.flag_key}
              className="admin-table-card"
              style={{
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                borderLeft: flag.enabled ? "4px solid #10B981" : "4px solid #CBD5E1",
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                  <strong style={{ fontSize: "var(--text-base)", color: "#0F172A", fontFamily: "var(--font-mono)" }}>{flag.flag_key}</strong>
                  <span
                    className="admin-role-badge"
                    style={{
                      background: flag.enabled ? "#ECFDF5" : "#F1F5F9",
                      color: flag.enabled ? "#065F46" : "#64748B",
                      border: `1px solid ${flag.enabled ? "#A7F3D0" : "#E2E8F0"}`,
                      fontSize: "var(--text-micro)",
                      fontWeight: 700,
                    }}
                  >
                    {flag.enabled ? "ĐANG BẬT" : "ĐÃ TẮT"}
                  </span>
                </div>
                <p style={{ margin: "4px 0 10px 0", fontSize: "var(--text-xs)", color: "#475569", lineHeight: 1.4 }}>
                  {flag.description || "Không có mô tả chi tiết."}
                </p>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "10px", borderTop: "1px solid #F1F5F9" }}>
                <span style={{ fontSize: "var(--text-micro)", color: "#94A3B8" }}>
                  Cập nhật: {new Date(flag.updated_at).toLocaleDateString("vi-VN")}
                </span>
                <button
                  type="button"
                  disabled={updatingKey === flag.flag_key}
                  onClick={() => void handleToggle(flag.flag_key, flag.enabled)}
                  className={`button ${flag.enabled ? "button-secondary" : "button-primary"}`}
                  style={{ height: "30px", padding: "0 12px", fontSize: "var(--text-micro)" }}
                >
                  {updatingKey === flag.flag_key ? (
                    <LoaderCircle className="spin" size={13} />
                  ) : flag.enabled ? (
                    "Tắt tính năng"
                  ) : (
                    "Kích hoạt ngay"
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AuditLogsSubtab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = async (p = 1) => {
    setLoading(true);
    try {
      const res = await getAdminAuditLogs(p, 25);
      setLogs(res.items);
      setTotal(res.total);
      setPage(p);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs(1);
  }, []);

  return (
    <section className="admin-section" id="audit-trail" aria-labelledby="audit-trail-title">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
        <SectionHeading icon={<ShieldCheck size={17} />} title="Audit Trail (Lưu vết can thiệp quản trị CSDL)" id="audit-trail-title" />
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void fetchLogs(page)}
          disabled={loading}
          style={{ height: "32px", padding: "0 10px", fontSize: "var(--text-sm)" }}
        >
          <RefreshCw size={13} className={loading ? "spin" : ""} /> Làm mới
        </button>
      </div>

      <div className="admin-table-card">
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: "var(--text-sm)", color: "#0F172A" }}>Nhật ký kiểm toán hệ thống ({total} bản ghi)</strong>
          <span style={{ fontSize: "var(--text-micro)", color: "#64748B" }}>Bất biến · Lưu trữ PostgreSQL</span>
        </div>

        {loading ? (
          <div className="admin-loading"><span className="loading-mark" /> Đang tải dữ liệu kiểm toán…</div>
        ) : logs.length === 0 ? (
          <div className="admin-empty">Chưa có bản ghi kiểm toán nào được ghi nhận.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-xs)" }}>
              <thead>
                <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", textAlign: "left" }}>
                  <th style={{ padding: "10px 14px", color: "#475569", fontWeight: 700 }}>Thời gian</th>
                  <th style={{ padding: "10px 14px", color: "#475569", fontWeight: 700 }}>Hành động (Action)</th>
                  <th style={{ padding: "10px 14px", color: "#475569", fontWeight: 700 }}>Người thực hiện</th>
                  <th style={{ padding: "10px 14px", color: "#475569", fontWeight: 700 }}>Đối tượng can thiệp</th>
                  <th style={{ padding: "10px 14px", color: "#475569", fontWeight: 700 }}>IP</th>
                  <th style={{ padding: "10px 14px", color: "#475569", fontWeight: 700, textAlign: "right" }}>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "10px 14px", color: "#64748B", whiteSpace: "nowrap" }}>
                      {new Date(log.created_at).toLocaleString("vi-VN")}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "var(--text-micro)",
                          fontWeight: 700,
                          fontFamily: "var(--font-mono)",
                          background: log.action.includes("CREATE") || log.action.includes("COMPENSAT") ? "#ECFDF5" : log.action.includes("UPDATE") ? "#EEF2FF" : "#FFFBEB",
                          color: log.action.includes("CREATE") || log.action.includes("COMPENSAT") ? "#047857" : log.action.includes("UPDATE") ? "#4338CA" : "#EA580C",
                          border: `1px solid ${log.action.includes("CREATE") || log.action.includes("COMPENSAT") ? "#A7F3D0" : log.action.includes("UPDATE") ? "#C7D2FE" : "#FDE68A"}`,
                        }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", color: "#334155" }}>
                      {log.actor_id || "system"}
                    </td>
                    <td style={{ padding: "10px 14px", color: "#475569" }}>
                      {log.target_type ? `${log.target_type}: ${log.target_id || "—"}` : "—"}
                    </td>
                    <td style={{ padding: "10px 14px", color: "#64748B", fontFamily: "var(--font-mono)" }}>
                      {log.ip_address || "127.0.0.1"}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                        className="button button-secondary"
                        style={{ height: "26px", padding: "0 8px", fontSize: "var(--text-micro)" }}
                      >
                        {expandedId === log.id ? "Đóng" : "Payload"}
                      </button>
                      {expandedId === log.id && (
                        <div style={{ marginTop: "6px", textAlign: "left" }}>
                          <pre style={{ margin: 0, padding: "8px", background: "#0F172A", color: "#F8FAFC", borderRadius: "6px", fontSize: "var(--text-micro)", overflowX: "auto" }}>
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Subtab Panels: Support & Feedback
// ---------------------------------------------------------------------------

function SupportSubtab({
  support,
  onUpdateTicket,
  onAddMessage,
  onRetry,
  onOpenCompensation,
  userRole,
}: {
  support: Loadable<{ items: SupportTicket[]; total: number }>;
  onUpdateTicket: (id: string, patch: { status?: SupportTicketStatus; priority?: SupportPriority }) => Promise<void>;
  onAddMessage: (id: string, message: string) => Promise<SupportTicket>;
  onRetry: () => void;
  onOpenCompensation?: (workflowId?: string, reason?: string, amount?: number, ticketId?: string) => void;
  userRole?: string;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const allItems = support.data?.items ?? [];

  const queueStats = useMemo(() => ({
    OPEN: allItems.filter((ticket) => ticket.status === "OPEN").length,
    IN_PROGRESS: allItems.filter((ticket) => ticket.status === "IN_PROGRESS").length,
    RESOLVED: allItems.filter((ticket) => ticket.status === "RESOLVED").length,
    CLOSED: allItems.filter((ticket) => ticket.status === "CLOSED").length,
  }), [allItems]);

  const filteredItems = useMemo(() => {
    return allItems.filter((ticket) => {
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
  }, [allItems, search, statusFilter, priorityFilter]);

  const hasFilters = Boolean(search || statusFilter !== "all" || priorityFilter !== "all");

  // Auto-select first ticket whenever the filtered list changes
  useEffect(() => {
    setSelectedTicketId((prev) => {
      if (filteredItems.length === 0) return null;
      const stillExists = filteredItems.some((t) => t.id === prev);
      return stillExists ? prev : (filteredItems[0]?.id ?? null);
    });
  }, [filteredItems]);

  const selectedTicket = filteredItems.find((t) => t.id === selectedTicketId) ?? null;

  return (
    <section className={`admin-section ${styles.queue}`} id="support" aria-labelledby="support-title">
      <div className={styles.sectionHead}>
        <div>
          <SectionHeading icon={<LifeBuoy size={17} />} title="Support queue" id="support-title" />
          <p className={styles.sectionDescription}>Tập trung vào các yêu cầu cần xử lý và cập nhật trạng thái ngay tại đây.</p>
        </div>
        <span className={styles.resultCount}>{filteredItems.length} ticket{filteredItems.length === 1 ? "" : "s"}</span>
      </div>

      <div className={styles.queueStats} aria-label="Tóm tắt trạng thái ticket">
        {(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const).map((status) => (
          <button
            className={`${styles.queueStat} ${statusFilter === status ? styles.queueStatActive : ""}`}
            type="button"
            key={status}
            aria-pressed={statusFilter === status}
            onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
          >
            <span>{status === "OPEN" ? "Mới" : status === "IN_PROGRESS" ? "Đang xử lý" : status === "RESOLVED" ? "Đã xử lý" : "Đã đóng"}</span>
            <strong>{queueStats[status]}</strong>
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className={`admin-filter-bar ${styles.filterBar}`}>
        <div className="admin-filter-left">
          <div className={styles.filterField}>
            <span>Tìm trong ticket</span>
            <div className={`admin-search-input-wrap ${styles.searchWrap}`}>
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Tiêu đề, mã ticket hoặc người gửi…"
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
          </div>

          <label className={styles.filterField}>
            <span>Trạng thái</span>
            <select
              className={`admin-select-filter ${styles.filterSelect}`}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Lọc theo trạng thái"
            >
              <option value="all">Tất cả</option>
              <option value="OPEN">Mới</option>
              <option value="IN_PROGRESS">Đang xử lý</option>
              <option value="RESOLVED">Đã xử lý</option>
              <option value="CLOSED">Đã đóng</option>
            </select>
          </label>

          <label className={styles.filterField}>
            <span>Ưu tiên</span>
            <select
              className={`admin-select-filter ${styles.filterSelect}`}
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              aria-label="Lọc theo mức độ ưu tiên"
            >
              <option value="all">Tất cả</option>
              <option value="LOW">Thấp</option>
              <option value="NORMAL">Thường</option>
              <option value="HIGH">Cao</option>
              <option value="URGENT">Khẩn cấp</option>
            </select>
          </label>
        </div>
        <div className="admin-filter-right">
          {hasFilters ? <button className={`button button-secondary ${styles.clearFilters}`} type="button" onClick={() => { setSearch(""); setStatusFilter("all"); setPriorityFilter("all"); }}><X size={13} /> Xóa bộ lọc</button> : <span className={styles.filterHint}>Lọc theo mã, người gửi hoặc trạng thái</span>}
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
            <div className={`admin-support-split ${styles.supportSplit}`}>
              {/* Cột trái: Hàng đợi ticket */}
              <div className={`admin-support-queue-col ${styles.supportQueueCol}`} role="list" aria-label="Hàng đợi ticket">
                {filteredItems.map((ticket) => {
                  const isSelected = ticket.id === selectedTicketId;
                  return (
                    <button
                      key={ticket.id}
                      type="button"
                      role="listitem"
                      className={`${styles.queueCard} ${isSelected ? styles.queueCardActive : ""}`}
                      onClick={() => setSelectedTicketId(ticket.id)}
                      aria-current={isSelected ? "true" : undefined}
                    >
                      <div className={styles.queueCardHeader}>
                        <span className={styles.ticketId}>{ticket.id}</span>
                        <span className={`${styles.statusTag} ${styles[`status${ticket.status}`]}`}>
                          {supportStatusLabel(ticket.status)}
                        </span>
                        <span className={`${styles.priorityTag} ${styles[`priority${ticket.priority}`]}`}>
                          {priorityLabel(ticket.priority)}
                        </span>
                        {slaTier(ticket.created_at) !== "ok" && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3px",
                              padding: "1px 6px",
                              borderRadius: "999px",
                              fontSize: "var(--text-micro)",
                              fontWeight: 700,
                              background: slaTier(ticket.created_at) === "breach" ? "#FEF2F2" : "#FFFBEB",
                              color: slaTier(ticket.created_at) === "breach" ? "#991B1B" : "#92400E",
                              border: `1px solid ${slaTier(ticket.created_at) === "breach" ? "#FECACA" : "#FDE68A"}`,
                            }}
                            title={slaTier(ticket.created_at) === "breach" ? "SLA đã vượt 24h — cần xử lý ngay" : "SLA cảnh báo — đã quá 4h"}
                          >
                            {slaTier(ticket.created_at) === "breach" ? "⚠ Vi phạm SLA" : "⏱ Cảnh báo SLA"}
                          </span>
                        )}
                      </div>
                      <h4 className={styles.queueCardSubject}>{ticket.subject}</h4>
                      <p className={styles.queueCardSnippet}>{ticket.description}</p>
                      <div className={styles.queueCardFooter}>
                        <span><UserRound size={12} /> {ticket.actor_id}</span>
                        <time dateTime={ticket.created_at} title={`Tạo: ${formatDate(ticket.created_at)}`}>
                          <Clock3 size={12} /> {formatAge(ticket.created_at)}
                        </time>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Cột phải: Chi tiết & Điều phối ticket đang chọn */}
              <div className={`admin-support-detail-col ${styles.supportDetailCol}`}>
                {selectedTicket ? (
                  <SupportRow
                    key={selectedTicket.id}
                    ticket={selectedTicket}
                    onUpdate={onUpdateTicket}
                    onAddMessage={onAddMessage}
                    onOpenCompensation={onOpenCompensation}
                  />
                ) : (
                  <div className={styles.emptyDetail}>
                    <LifeBuoy size={32} />
                    <p>Chọn một ticket bên trái để xem chi tiết và xử lý.</p>
                  </div>
                )}
              </div>
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
  subtext,
  onClick,
}: {
  label: string;
  value: unknown;
  icon: React.ReactNode;
  tone?: "default" | "warning";
  subtext?: string;
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
      {subtext && <span className="admin-metric-subtext">{subtext}</span>}
      {onClick && <span className="admin-metric-hint">Xem chi tiết →</span>}
    </article>
  );
}

function DomainRow({ label, status, detail }: { label: string; status: string; detail?: string }) {
  const domainMeta = DOMAIN_DATASET_DEFAULTS[label.toLowerCase()];
  const displayLabel = domainMeta?.title ? `${domainMeta.title} (${label})` : label;
  return (
    <div className="admin-domain-row">
      <span className={`admin-status-dot status-${status}`} aria-hidden="true" />
      <strong>{displayLabel}</strong>
      <span className="admin-domain-detail">{detail ?? "Chưa có dữ liệu"}</span>
      <span className={`admin-badge status-${status}`}>
        {status === "healthy" ? "Sẵn sàng" : status === "degraded" ? "Suy giảm" : "Mất kết nối"}
      </span>
    </div>
  );
}

const SERVICE_FRIENDLY_NAMES: Record<string, { name: string; tag: string }> = {
  "api-gateway": { name: "api-gateway", tag: "Cổng Edge & Router" },
  "gateway-core": { name: "gateway-core", tag: "Database Core & Saga" },
  "agent-service": { name: "agent-service", tag: "AI Orchestrator" },
  "food-service": { name: "food-service", tag: "Ẩm thực & Thực đơn" },
  "ride-service": { name: "ride-service", tag: "Gọi xe & Tài xế" },
  "delivery-service": { name: "delivery-service", tag: "Giao hàng & Bưu tá" },
  "restaurant-service": { name: "restaurant-service", tag: "Nhà hàng & Đặt bàn" },
  "healthcare-service": { name: "healthcare-service", tag: "Y tế & Đặt khám" },
};

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
            fontSize: "var(--text-micro)",
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
      {(items ?? []).map((item) => {
        const info = SERVICE_FRIENDLY_NAMES[item.service.toLowerCase()];
        const isExpanded = expandedService === item.service;
        return (
          <div key={item.service} className="admin-health-card-item">
            <div
              className={`admin-health-row ${compact ? "is-compact-row" : ""}`}
              onClick={compact && item.detail ? () => setExpandedService(isExpanded ? null : item.service) : undefined}
              style={compact && item.detail ? { cursor: "pointer" } : undefined}
              title={compact && item.detail ? "Bấm để xem kết quả live probe" : undefined}
            >
              <span className={`admin-status-dot status-${item.status}`} aria-hidden="true" />
              <div>
                <strong>{item.service}</strong>
                {info && <span style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)", display: "block" }}>{info.tag}</span>}
              </div>
              <span
                className={`admin-latency-badge ${
                  item.latency_ms < 30
                    ? "admin-latency-fast"
                    : item.latency_ms < 90
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
              <div style={{ textAlign: "right", minWidth: "60px" }}>
                {item.detail && Object.keys(item.detail).length > 0 ? (
                  <button
                    className="button button-secondary"
                    style={{ padding: "0.15rem 0.5rem", fontSize: "var(--text-xs)", height: "26px" }}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedService(isExpanded ? null : item.service);
                    }}
                  >
                    {isExpanded ? "Ẩn" : "Chi tiết"}
                  </button>
                ) : (
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--color-muted-soft)" }}>—</span>
                )}
              </div>
            </div>
            {isExpanded && item.detail && (
              <HealthDetailViewer detail={item.detail} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function HealthDetailViewer({ detail }: { detail: Record<string, unknown> }) {
  const [showJson, setShowJson] = useState(false);

  return (
    <div className="admin-health-detail-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", borderBottom: "1px dashed #E2E8F0", paddingBottom: "6px" }}>
        <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "var(--tracking-normal)" }}>
          Kết quả kiểm tra chẩn đoán (Live Probe Response)
        </span>
        <button
          type="button"
          className="button button-secondary"
          style={{ padding: "0.1rem 0.4rem", fontSize: "var(--text-micro)", height: "22px" }}
          onClick={() => setShowJson(!showJson)}
        >
          {showJson ? "Ẩn JSON" : "Xem Raw JSON"}
        </button>
      </div>
      <div className="admin-health-detail-grid">
        {Object.entries(detail).map(([key, val]) => {
          const isHealthy = val === "healthy" || val === "connected" || val === true || (typeof val === "string" && val.includes("200 OK"));
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
      {showJson && (
        <pre style={{ margin: "8px 0 0", padding: "8px 12px", background: "#0F172A", color: "#F8FAFC", borderRadius: "6px", fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)", overflowX: "auto" }}>
          {JSON.stringify(detail, null, 2)}
        </pre>
      )}
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

const QUICK_REPLIES = [
  "Cảm ơn bạn đã liên hệ với X-One.",
  "X-One đã ghi nhận và đang kiểm tra giúp bạn.",
  "X-One chân thành xin lỗi vì sự bất tiện này. Khoản bồi thường sự cố đã được gửi vào ví của bạn.",
  "Tài xế/đối tác đã được thông báo để hỗ trợ bạn ngay lập tức.",
  "Sự cố đã được giải quyết thành công. Chúc bạn có trải nghiệm tốt!",
] as const;

function SupportRow({
  ticket,
  onUpdate,
  onAddMessage,
  onOpenCompensation,
  userRole,
}: {
  ticket: SupportTicket;
  onUpdate: (id: string, patch: { status?: SupportTicketStatus; priority?: SupportPriority }) => Promise<void>;
  onAddMessage: (id: string, message: string) => Promise<SupportTicket>;
  onOpenCompensation?: (workflowId?: string, reason?: string, amount?: number, ticketId?: string) => void;
  userRole?: string;
}) {
  const [message, setMessage] = useState("");
  const [messagePending, setMessagePending] = useState(false);
  const [messageError, setMessageError] = useState("");
  const [escalating, setEscalating] = useState(false);
  const [escalateSuccess, setEscalateSuccess] = useState(false);

  async function handleEscalate(): Promise<void> {
    setEscalating(true);
    const escalationMsg =
      `[ESCALATION — Báo cáo kỹ thuật từ Manager]\n` +
      `Ticket ID: ${ticket.id}\n` +
      `Tiêu đề: ${ticket.subject}\n` +
      `Người dùng: ${ticket.actor_id}\n` +
      `Ưu tiên: ${ticket.priority}\n` +
      `SLA: ${formatAge(ticket.created_at)} (${slaTier(ticket.created_at) === "breach" ? "VI PHẠM SLA" : slaTier(ticket.created_at) === "warning" ? "CẢNH BÁO SLA" : "Bình thường"})\n` +
      `Nội dung: ${ticket.description}\n` +
      `Yêu cầu Admin kỹ thuật can thiệp ngay.`;
    try {
      await onAddMessage(ticket.id, escalationMsg);
      setEscalateSuccess(true);
      setTimeout(() => setEscalateSuccess(false), 4000);
    } catch {
      // best effort
    } finally {
      setEscalating(false);
    }
  }

  async function submitMessage(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!message.trim() || messagePending || ticket.status === "CLOSED") return;
    setMessagePending(true);
    setMessageError("");
    try {
      await onAddMessage(ticket.id, message.trim());
      setMessage("");
    } catch {
      setMessageError("Không thể gửi phản hồi. Vui lòng thử lại.");
    } finally {
      setMessagePending(false);
    }
  }

  return (
    <article className={`admin-support-detail ${styles.detailPanel}`}>
      {/* Header */}
      <div className={styles.detailHeader}>
        <div className={styles.ticketMeta}>
          <span className={styles.ticketId}>{ticket.id}</span>
          <span className={`${styles.statusTag} ${styles[`status${ticket.status}`]}`}>{supportStatusLabel(ticket.status)}</span>
          <span className={`${styles.priorityTag} ${styles[`priority${ticket.priority}`]}`}>{priorityLabel(ticket.priority)}</span>
          {slaTier(ticket.created_at) !== "ok" && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                padding: "2px 7px",
                borderRadius: "999px",
                fontSize: "var(--text-micro)",
                fontWeight: 700,
                background: slaTier(ticket.created_at) === "breach" ? "#FEF2F2" : "#FFFBEB",
                color: slaTier(ticket.created_at) === "breach" ? "#991B1B" : "#92400E",
                border: `1px solid ${slaTier(ticket.created_at) === "breach" ? "#FECACA" : "#FDE68A"}`,
              }}
            >
              {slaTier(ticket.created_at) === "breach" ? "⚠ Vi phạm SLA" : "⏱ Cảnh báo SLA"}
            </span>
          )}
        </div>
        <h3 className={styles.detailSubject}>{ticket.subject}</h3>
        <div className={styles.ticketFooter}>
          <span><UserRound size={14} /> {ticket.actor_id}</span>
          <time dateTime={ticket.updated_at}><Clock3 size={14} /> Cập nhật {formatDate(ticket.updated_at)}</time>
        </div>
      </div>

      {/* Description */}
      <div className={styles.detailBody}>
        <p className={styles.detailDescription}>{ticket.description}</p>
      </div>

      {/* Điều phối */}
      <div className={styles.detailControls}>
        <div className={styles.controlsHeading} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Sliders size={15} />
            <span>Điều phối ticket</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {escalateSuccess ? (
              <span style={{ fontSize: "var(--text-micro)", color: "#16A34A", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                <Check size={13} /> Đã chuyển cấp Admin!
              </span>
            ) : (
              <button
                type="button"
                className="button button-secondary"
                disabled={escalating || ticket.status === "CLOSED"}
                onClick={() => void handleEscalate()}
                style={{
                  height: "28px",
                  padding: "0 9px",
                  fontSize: "var(--text-micro)",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  background: "#FEF2F2",
                  borderColor: "#FECACA",
                  color: "#991B1B",
                }}
                title="Báo cáo ticket này lên kênh kỹ thuật / Admin để xử lý khẩn cấp"
              >
                {escalating ? <LoaderCircle className="spin" size={12} /> : <AlertTriangle size={12} />}
                <span>Báo cáo kỹ thuật</span>
              </button>
            )}
            {onOpenCompensation && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => onOpenCompensation(ticket.id, `Bồi thường sự cố cho ticket #${ticket.id}: ${ticket.subject}`, 50000, ticket.id)}
                style={{
                  height: "28px",
                  padding: "0 10px",
                  fontSize: "var(--text-micro)",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  background: "#FFFBEB",
                  borderColor: "#FDE68A",
                  color: "#B45309",
                }}
                title="Phát hành voucher bồi thường sự cố cho khách hàng này"
              >
                <Zap size={13} />
                <span>Cấp bồi thường Voucher</span>
              </button>
            )}
          </div>
        </div>
        <div className={styles.controlsRow}>
          <label>
            <span>Trạng thái</span>
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
            <span>Ưu tiên</span>
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
      </div>

      {/* Phản hồi */}
      {ticket.status !== "CLOSED" ? (
        <form className={styles.replyForm} onSubmit={(event) => void submitMessage(event)}>
          <div className={styles.replyHeading}><MessageSquare size={15} /><span>Phản hồi khách hàng</span></div>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={5000} rows={3} placeholder="Nhập lời cảm ơn hoặc phản hồi cho khách hàng…" aria-label={`Phản hồi ticket ${ticket.id}`} />
          <div className={styles.quickReplies} aria-label="Mẫu phản hồi nhanh">
            <span>Gợi ý:</span>
            {QUICK_REPLIES.map((reply) => <button key={reply} type="button" onClick={() => setMessage(reply)}>{reply}</button>)}
          </div>
          <div className={styles.replyFooter}>
            <span>Khách sẽ thấy nội dung này trong timeline.</span>
            <button className="button button-primary" type="submit" disabled={messagePending || !message.trim()}>
              <Send size={14} />{messagePending ? "Đang gửi…" : "Gửi phản hồi"}
            </button>
          </div>
          {messageError ? <p className={styles.replyError} role="alert">{messageError}</p> : null}
        </form>
      ) : (
        <p className={styles.closedNote}>Ticket đã đóng, không thể gửi thêm phản hồi.</p>
      )}
    </article>
  );
}

function supportStatusLabel(value: SupportTicketStatus): string {
  return value === "OPEN" ? "Mở" : value === "IN_PROGRESS" ? "Đang xử lý" : value === "RESOLVED" ? "Đã xử lý" : "Đã đóng";
}

function priorityLabel(value: SupportPriority): string {
  return value === "LOW" ? "Thấp" : value === "NORMAL" ? "Thường" : value === "HIGH" ? "Cao" : "Khẩn";
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
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{message}</span>
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
          fontSize: "var(--text-xs)",
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

/** Returns hours elapsed since a ticket/workflow was created. */
function ticketAgeHours(createdAt: string | undefined): number {
  if (!createdAt) return 0;
  const ms = Date.now() - new Date(createdAt).valueOf();
  return Math.max(0, ms / 3_600_000);
}

/** Returns SLA tier based on age. */
function slaTier(createdAt: string | undefined): "ok" | "warning" | "breach" {
  const h = ticketAgeHours(createdAt);
  if (h >= 24) return "breach";
  if (h >= 4) return "warning";
  return "ok";
}

/** Format age as human-readable Vietnamese string. */
function formatAge(createdAt: string | undefined): string {
  const h = ticketAgeHours(createdAt);
  if (h < 1) return `${Math.round(h * 60)} phút trước`;
  if (h < 24) return `${Math.floor(h)} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

const DOMAIN_DATASET_DEFAULTS: Record<string, { title: string; datasetName: string; source: string }> = {
  food: { title: "Ẩm thực", datasetName: "Thực đơn món ăn & Quán ăn", source: "PostgreSQL" },
  ride: { title: "Di chuyển", datasetName: "Đội ngũ Tài xế & Phương tiện", source: "PostgreSQL / Geo" },
  delivery: { title: "Giao hàng", datasetName: "Bưu kiện & Đội ngũ Giao vận", source: "PostgreSQL" },
  restaurant: { title: "Nhà hàng", datasetName: "Danh mục Nhà hàng & Bàn", source: "PostgreSQL" },
  healthcare: { title: "Y tế", datasetName: "Cơ sở Y tế & Bác sĩ", source: "PostgreSQL" },
};

function formatDomainCounts(domain: string, value: unknown): string {
  if (!value || typeof value !== "object") return "Đã kết nối trực tiếp";
  const counts = value as Record<string, unknown>;
  const parts: string[] = [];

  const keyLabels: Record<string, string> = {
    orders: "đơn hàng",
    bookings: "chuyến xe",
    deliveries: "đơn giao hàng",
    couriers: "bưu tá",
    packages: "kiện hàng",
    restaurants: "nhà hàng",
    reservations: "lượt đặt bàn",
    appointments: "lịch khám",
    drivers: "tài xế",
    available_drivers: "sẵn sàng",
    facilities: "cơ sở y tế",
    doctors: "bác sĩ",
    active_rides: "chuyến đang chạy",
    menu_items: "món ăn",
  };

  // Primary count keys
  for (const [k, label] of Object.entries(keyLabels)) {
    if (typeof counts[k] === "number") {
      parts.push(`${valueNumber(counts[k])} ${label}`);
    }
  }

  // Handle nested status breakdown if present (e.g. orders_by_status, bookings_by_status)
  for (const [k, val] of Object.entries(counts)) {
    if (k.endsWith("_by_status") && val && typeof val === "object") {
      const subEntries = Object.entries(val as Record<string, unknown>)
        .filter(([, v]) => typeof v === "number" && (v as number) > 0)
        .map(([st, cnt]) => `${st.toLowerCase()}: ${valueNumber(cnt)}`);
      if (subEntries.length > 0) {
        parts.push(`(${subEntries.join(", ")})`);
      }
    }
  }

  if (parts.length > 0) return parts.join(" · ");

  return Object.entries(counts)
    .filter(([, v]) => typeof v === "number" || typeof v === "string")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${valueNumber(v)}`)
    .join(" · ") || "Đã kết nối";
}

function datasetDetail(domain: string, value: Record<string, unknown>): string {
  const meta = DOMAIN_DATASET_DEFAULTS[domain.toLowerCase()];
  const name = typeof value.dataset_name === "string" && value.dataset_name.trim()
    ? value.dataset_name
    : typeof value.dataset === "string" && value.dataset.trim()
    ? value.dataset
    : meta?.datasetName ?? "Dữ liệu nghiệp vụ";

  const rowCount = typeof value.row_count === "number" ? `${valueNumber(value.row_count)} bản ghi` : undefined;
  const version = typeof value.version === "string" && value.version.trim() ? `Phiên bản: ${value.version}` : `Nguồn: ${meta?.source ?? "PostgreSQL"}`;
  const freshness = typeof value.freshness_status === "string" && value.freshness_status.trim()
    ? value.freshness_status
    : "Sẵn sàng thời gian thực";

  return [name, rowCount, version, freshness].filter(Boolean).join(" · ");
}

function initials(email: string): string {
  return email.trim().slice(0, 2).toUpperCase() || "XO";
}

// ---------------------------------------------------------------------------
// Incident Compensation Modal for Manager / Admin
// ---------------------------------------------------------------------------

function IncidentCompensationModal({
  open,
  onClose,
  initialWorkflowId = "",
  initialReason = "",
  initialAmount = 50000,
  managerEmail,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  initialWorkflowId?: string;
  initialReason?: string;
  initialAmount?: number;
  managerEmail?: string;
  onSuccess?: (res: { id?: string; workflow_id?: string; amount?: number; voucher_code?: string; message?: string }) => void;
}) {
  const [workflowId, setWorkflowId] = useState(initialWorkflowId);
  const [amount, setAmount] = useState(initialAmount);
  const [reason, setReason] = useState(initialReason || "Bồi thường sự cố ca trực: Chậm chuyến / Hủy đơn ngoài ý muốn");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ voucher_code?: string; amount?: number; message?: string; id?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setWorkflowId(initialWorkflowId);
    setAmount(initialAmount);
    setReason(initialReason || "Bồi thường sự cố ca trực: Chậm chuyến / Hủy đơn ngoài ý muốn");
    setResult(null);
    setError(null);
  }, [initialWorkflowId, initialReason, initialAmount, open]);

  const presetAmounts = [20000, 50000, 100000, 200000];

  const presetReasons = [
    "Tài xế/Bưu tá hủy chuyến phút chót",
    "Giao hàng hoặc chế biến trễ trên 45 phút",
    "Nhà hàng hết món không báo trước",
    "Sự cố phân mảnh workflow kỹ thuật",
    "Đổi lịch khám y tế đột xuất ngoài ý muốn",
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workflowId.trim()) {
      setError("Vui lòng nhập Mã Workflow hoặc Mã Đơn hàng.");
      return;
    }
    if (amount <= 0) {
      setError("Số tiền bồi thường phải lớn hơn 0 VND.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await issueAdminCompensation(workflowId.trim(), amount, reason.trim());
      setResult(res);
      onSuccess?.(res);
    } catch (err: any) {
      setError(err?.message || "Không thể phát hành bồi thường. Vui lòng kiểm tra lại kết nối hoặc quyền truy cập.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyCode = async () => {
    const code = result?.voucher_code || result?.id;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // clipboard fallback
    }
  };

  if (!open) return null;

  const voucherCodeDisplay = result?.voucher_code || result?.id || "COMP-ISSUED";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="compensation-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: "16px",
      }}
    >
      <div
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: "16px",
          padding: "24px",
          maxWidth: "520px",
          width: "100%",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          border: "1px solid #E2E8F0",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", borderBottom: "1px solid #F1F5F9", paddingBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#FEF3C7", color: "#D97706", display: "grid", placeItems: "center" }}>
              <Zap size={20} />
            </div>
            <div>
              <h3 id="compensation-modal-title" style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: 700, color: "#0F172A" }}>
                Cấp Bồi Thường Vận Hành Ca Trực
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: "#64748B" }}>
                Phát hành voucher bù trừ sự cố dịch vụ qua Saga Core
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94A3B8", padding: "4px" }}
          >
            <X size={18} />
          </button>
        </div>

        {result ? (
          /* Success Screen */
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: "12px", padding: "18px", textAlign: "center" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#D1FAE5", color: "#059669", display: "grid", placeItems: "center", margin: "0 auto 10px" }}>
                <CheckCircle2 size={28} />
              </div>
              <h4 style={{ margin: "0 0 6px", fontSize: "var(--text-base)", fontWeight: 700, color: "#065F46" }}>
                Phát Hành Bồi Thường Thành Công!
              </h4>
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "#047857", lineHeight: 1.5 }}>
                {result.message || `Đã phát hành bồi thường ${amount.toLocaleString("vi-VN")} VND cho ${workflowId}.`}
              </p>

              <div style={{ marginTop: "14px", padding: "12px", background: "#FFFFFF", borderRadius: "8px", border: "1px dashed #059669", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span style={{ fontSize: "var(--text-micro)", color: "#64748B", display: "block", textAlign: "left", fontWeight: 600 }}>MÃ VOUCHER BỒI THƯỜNG</span>
                  <strong style={{ fontSize: "var(--text-lg)", fontFamily: "var(--font-mono)", color: "#0F172A", letterSpacing: "0.05em" }}>
                    {voucherCodeDisplay}
                  </strong>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void handleCopyCode()}
                  style={{ height: "32px", padding: "0 10px", fontSize: "var(--text-xs)", display: "flex", alignItems: "center", gap: "5px" }}
                >
                  {copied ? <Check size={14} color="#059669" /> : <Copy size={14} />}
                  <span>{copied ? "Đã chép!" : "Sao chép"}</span>
                </button>
              </div>
            </div>

            <div style={{ fontSize: "var(--text-xs)", color: "#64748B", background: "#F8FAFC", padding: "10px 14px", borderRadius: "8px" }}>
              Giao dịch đã được lưu vào hệ thống kiểm toán (Audit Trail) dưới quyền ca trực của <strong>{managerEmail || "Operations Manager"}</strong>.
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "6px" }}>
              <button
                type="button"
                className="button button-primary"
                onClick={onClose}
                style={{ height: "36px", padding: "0 18px", fontSize: "var(--text-sm)" }}
              >
                Hoàn tất
              </button>
            </div>
          </div>
        ) : (
          /* Form Input */
          <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {error && (
              <div style={{ padding: "8px 12px", borderRadius: "8px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: "var(--text-xs)", display: "flex", alignItems: "center", gap: "6px" }}>
                <AlertTriangle size={14} />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 700, color: "#334155", marginBottom: "5px" }}>
                Mã Workflow hoặc Mã Đơn hàng <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <input
                type="text"
                value={workflowId}
                onChange={(e) => setWorkflowId(e.target.value)}
                placeholder="Ví dụ: wf_del_901, ord_food_123, ticket-01..."
                required
                style={{
                  width: "100%",
                  height: "38px",
                  padding: "0 12px",
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  fontSize: "var(--text-sm)",
                  fontFamily: "var(--font-mono)",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 700, color: "#334155", marginBottom: "5px" }}>
                Mức bồi thường (VND) <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <div style={{ display: "flex", gap: "6px", marginBottom: "8px", flexWrap: "wrap" }}>
                {presetAmounts.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAmount(p)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      fontSize: "var(--text-xs)",
                      fontWeight: 600,
                      border: amount === p ? "1.5px solid #4F46E5" : "1px solid #E2E8F0",
                      background: amount === p ? "#EEF2FF" : "#F8FAFC",
                      color: amount === p ? "#4338CA" : "#475569",
                      cursor: "pointer",
                    }}
                  >
                    {p.toLocaleString("vi-VN")} đ
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1000}
                step={5000}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
                style={{
                  width: "100%",
                  height: "38px",
                  padding: "0 12px",
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  fontSize: "var(--text-sm)",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 700, color: "#334155", marginBottom: "5px" }}>
                Lý do bồi thường sự cố
              </label>
              <select
                onChange={(e) => {
                  if (e.target.value) setReason(e.target.value);
                }}
                style={{
                  width: "100%",
                  height: "36px",
                  padding: "0 10px",
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  fontSize: "var(--text-xs)",
                  background: "#F8FAFC",
                  marginBottom: "6px",
                }}
              >
                <option value="">-- Chọn lý do mẫu nhanh --</option>
                {presetReasons.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ghi chú chi tiết nguyên nhân bồi thường..."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  fontSize: "var(--text-xs)",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ fontSize: "var(--text-micro)", color: "#64748B", background: "#F1F5F9", padding: "8px 12px", borderRadius: "6px" }}>
              Hành động này phát hành trực tiếp Voucher và ghi nhận nhật ký kiểm toán ca trực.
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={onClose}
                disabled={submitting}
                style={{ height: "36px", padding: "0 14px", fontSize: "var(--text-xs)" }}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={submitting || !workflowId.trim() || amount <= 0}
                style={{ height: "36px", padding: "0 16px", fontSize: "var(--text-xs)", display: "flex", alignItems: "center", gap: "6px", background: "#F59E0B", borderColor: "#D97706", color: "#78350F" }}
              >
                {submitting ? <LoaderCircle className="spin" size={14} /> : <Zap size={14} />}
                <span>{submitting ? "Đang phát hành…" : "Xác nhận phát hành"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
