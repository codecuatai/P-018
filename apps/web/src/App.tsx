import { useEffect, useState, type ReactNode } from "react";
import { Bot, CircleUserRound, Clock3, LogOut, MessageSquare, Plus, UserRound } from "lucide-react";
import { clearAuthSession, configureApiClient, getAccessToken, getCurrentUser } from "./api";
import { HistoryView } from "./components/HistoryView";
import { AuthPage } from "./pages/AuthPage";
import { ChatDashboard } from "./pages/ChatDashboard";
import { ProfileSettings } from "./pages/ProfileSettings";
import type { AuthUser, SessionActivity } from "./types";
import "./styles.css";

type AppView = "assistant" | "activity" | "account";

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeView, setActiveView] = useState<AppView>("assistant");
  const [activities, setActivities] = useState<SessionActivity[]>([]);
  const [chatKey, setChatKey] = useState(0);

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
      .then(setCurrentUser)
      .catch(() => clearAuthSession())
      .finally(() => setAuthLoading(false));
  }, []);

  function handleLogout() {
    clearAuthSession();
    setCurrentUser(null);
    setActivities([]);
    setActiveView("assistant");
  }

  if (authLoading) return <div className="screen-loading"><div className="brand-mark"><Bot size={20} /></div><span>Đang mở X-One…</span></div>;
  if (!currentUser) return <AuthPage onAuthenticated={setCurrentUser} />;

  return (
    <div className="xone-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand"><div className="brand-mark"><Bot size={20} /></div><div><strong>X-One</strong><span>Trợ lý hằng ngày</span></div></div>
        <button className="new-chat-button" type="button" onClick={() => { setChatKey((value) => value + 1); setActiveView("assistant"); }}><Plus size={16} /> Cuộc trò chuyện mới</button>
        <nav className="primary-nav" aria-label="Điều hướng chính">
          <NavButton active={activeView === "assistant"} icon={<MessageSquare size={17} />} label="Trò chuyện" onClick={() => setActiveView("assistant")} />
          <NavButton active={activeView === "activity"} icon={<Clock3 size={17} />} label="Hoạt động gần đây" onClick={() => setActiveView("activity")} />
          <NavButton active={activeView === "account"} icon={<UserRound size={17} />} label="Tài khoản" onClick={() => setActiveView("account")} />
        </nav>
        <div className="sidebar-bottom"><div className="identity-card"><div className="identity-avatar">{initials(currentUser.email)}</div><div><strong>{currentUser.email}</strong><span>Đang hoạt động</span></div></div><button className="sidebar-logout" type="button" onClick={handleLogout}><LogOut size={15} /> Đăng xuất</button></div>
      </aside>

      <main className="app-main">
        <div className="mobile-header"><div className="sidebar-brand"><div className="brand-mark"><Bot size={18} /></div><strong>X-One</strong></div><button className="mobile-account-button" type="button" onClick={() => setActiveView("account")} aria-label="Mở tài khoản"><CircleUserRound size={19} /></button></div>
        <div className="page-container">
          {activeView === "assistant" ? <ChatDashboard user={currentUser} resetKey={chatKey} onActivity={(activity) => setActivities((current) => [activity, ...current.filter((item) => item.id !== activity.id)].slice(0, 40))} /> : null}
          {activeView === "activity" ? <HistoryView activities={activities} onOpenAssistant={() => setActiveView("assistant")} /> : null}
          {activeView === "account" ? <ProfileSettings user={currentUser} onLogout={handleLogout} /> : null}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Điều hướng di động">
        <NavButton active={activeView === "assistant"} icon={<MessageSquare size={18} />} label="Trò chuyện" onClick={() => setActiveView("assistant")} compact />
        <NavButton active={activeView === "activity"} icon={<Clock3 size={18} />} label="Hoạt động" onClick={() => setActiveView("activity")} compact />
        <NavButton active={activeView === "account"} icon={<UserRound size={18} />} label="Tài khoản" onClick={() => setActiveView("account")} compact />
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
