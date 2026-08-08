import { useEffect, useState, type ReactNode } from "react";
import { Activity, Bot, CircleUserRound, LayoutGrid, MessageSquare, Settings, LogOut } from "lucide-react";
import {
  clearAuthSession,
  configureApiClient,
  getAccessToken,
  getCurrentUser,
} from "./api";
import { ServiceHub } from "./components/ServiceSelector";
import { HistoryView } from "./components/HistoryView";
import { AuthPage } from "./pages/AuthPage";
import { ChatDashboard } from "./pages/ChatDashboard";
import { ProfileSettings } from "./pages/ProfileSettings";
import { createClientSessions, type AppView, type AuthUser, type ClientSessions, type Domain, type SessionActivity } from "./types";

import "./styles.css";

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeView, setActiveView] = useState<AppView>("assistant");
  const [activeDomain, setActiveDomain] = useState<Domain>("ride");
  const [sessions, setSessions] = useState<ClientSessions>(() => createClientSessions());
  const [activities, setActivities] = useState<SessionActivity[]>([]);

  useEffect(() => {
    configureApiClient({
      onUnauthorized: () => {
        clearAuthSession();
        setCurrentUser(null);
        setActiveView("assistant");
      },
    });
    if (!getAccessToken()) {
      setAuthLoading(false);
      return;
    }
    void getCurrentUser()
      .then((user) => setCurrentUser(user))
      .catch(() => clearAuthSession())
      .finally(() => setAuthLoading(false));
  }, []);

  function handleAuthenticated(user: AuthUser) {
    setCurrentUser(user);
    setActiveView("assistant");
  }

  function handleLogout() {
    clearAuthSession();
    setCurrentUser(null);
    setSessions(createClientSessions());
    setActivities([]);
    setActiveView("assistant");
  }

  function openDomain(domain: Domain) {
    setActiveDomain(domain);
    setActiveView("assistant");
  }

  function recordActivity(activity: SessionActivity) {
    setActivities((previous) => [activity, ...previous.filter((item) => item.id !== activity.id)].slice(0, 40));
  }

  if (authLoading) return <div className="screen-loading"><LoaderMark /><span>Đang kiểm tra phiên đăng nhập…</span></div>;
  if (!currentUser) return <AuthPage onAuthenticated={handleAuthenticated} />;

  return (
    <div className="xone-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark"><Bot size={20} /></div>
          <div><strong>X-One</strong><span>Trợ lý dịch vụ AI</span></div>
        </div>
        <nav className="primary-nav" aria-label="Điều hướng chính">
          <NavButton active={activeView === "assistant"} icon={<MessageSquare size={18} />} label="Trợ lý" onClick={() => setActiveView("assistant")} />
          <NavButton active={activeView === "services"} icon={<LayoutGrid size={18} />} label="Dịch vụ" onClick={() => setActiveView("services")} />
          <NavButton active={activeView === "activity"} icon={<Activity size={18} />} label="Hoạt động" onClick={() => setActiveView("activity")} />
          <NavButton active={activeView === "account"} icon={<CircleUserRound size={18} />} label="Tài khoản" onClick={() => setActiveView("account")} />
        </nav>
        <div className="sidebar-bottom">
          <div className="identity-card"><div className="identity-avatar">{initials(currentUser.email)}</div><div><strong>{currentUser.email}</strong><span>{currentUser.role} · Gateway</span></div></div>
          <button className="sidebar-logout" type="button" onClick={handleLogout}><LogOut size={16} /> Đăng xuất</button>
        </div>
      </aside>

      <main className="app-main">
        <div className="mobile-header"><div className="sidebar-brand"><div className="brand-mark"><Bot size={18} /></div><strong>X-One</strong></div><button className="mobile-account-button" type="button" onClick={() => setActiveView("account")} aria-label="Mở tài khoản"><CircleUserRound size={19} /></button></div>
        <div className="page-container">
          {activeView === "assistant" ? <ChatDashboard user={currentUser} activeDomain={activeDomain} sessions={sessions} onDomainChange={setActiveDomain} onSessionsChange={setSessions} onActivity={recordActivity} onOpenServices={() => setActiveView("services")} /> : null}
          {activeView === "services" ? <ServiceHub onStart={openDomain} /> : null}
          {activeView === "activity" ? <HistoryView activities={activities} onOpenAssistant={() => setActiveView("assistant")} /> : null}
          {activeView === "account" ? <ProfileSettings user={currentUser} onLogout={handleLogout} /> : null}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Điều hướng di động">
        <NavButton active={activeView === "assistant"} icon={<MessageSquare size={18} />} label="Trợ lý" onClick={() => setActiveView("assistant")} compact />
        <NavButton active={activeView === "services"} icon={<LayoutGrid size={18} />} label="Dịch vụ" onClick={() => setActiveView("services")} compact />
        <NavButton active={activeView === "activity"} icon={<Activity size={18} />} label="Hoạt động" onClick={() => setActiveView("activity")} compact />
        <NavButton active={activeView === "account"} icon={<Settings size={18} />} label="Tài khoản" onClick={() => setActiveView("account")} compact />
      </nav>
    </div>
  );
}

function NavButton({ active, icon, label, onClick, compact = false }: { active: boolean; icon: ReactNode; label: string; onClick: () => void; compact?: boolean }) {
  return <button className={`nav-button ${active ? "active" : ""} ${compact ? "compact" : ""}`} type="button" onClick={onClick}>{icon}<span>{label}</span></button>;
}

function initials(email: string): string {
  return email.trim().slice(0, 2).toUpperCase() || "XO";
}

function LoaderMark() {
  return <div className="brand-mark brand-mark-loading"><Bot size={20} /></div>;
}
