import { useEffect, useState } from "react";
import { MessageSquare, Clock, User, Navigation, CheckCircle2, CircleAlert, LogOut, ChevronUp } from "lucide-react";
import { AuthPage } from "./pages/AuthPage";
import { ChatDashboard } from "./pages/ChatDashboard";
import { HistoryView } from "./components/HistoryView";
import { ProfileSettings } from "./pages/ProfileSettings";
import { MockService, isProfileComplete } from "./mocks/mockService";
import { AuthUser, UserProfile } from "./types";
import "./styles.css";

export default function App() {
  const [activeTab, setActiveTab] = useState<"chat" | "history" | "profile">("chat");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    Promise.all([MockService.getCurrentUser(), MockService.getUserProfile()]).then(([user, userProfile]) => {
      setCurrentUser(user);
      setProfile(userProfile);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    MockService.getUserProfile().then(setProfile);
  }, [activeTab]);

  const profileComplete = isProfileComplete(profile);

  const handleAuthenticated = (user: AuthUser) => {
    setCurrentUser(user);
    setActiveTab("chat");
  };

  const handleLogout = async () => {
    await MockService.logout();
    setCurrentUser(null);
    setUserMenuOpen(false);
    setActiveTab("chat");
  };

  const renderContent = () => {
    switch (activeTab) {
      case "chat":
        return (
          <ChatDashboard
            profileComplete={profileComplete}
            onRequireProfile={() => setActiveTab("profile")}
            onOpenHistory={() => setActiveTab("history")}
          />
        );
      case "history": return <HistoryView />;
      case "profile": return <ProfileSettings onSaved={setProfile} />;
    }
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case "chat": return "Trợ lý Đặt dịch vụ AI";
      case "history": return "Lịch sử dịch vụ";
      case "profile": return "Cài đặt Hồ sơ";
    }
  };

  if (authLoading) {
    return <div className="app-loading">Đang tải phiên đăng nhập...</div>;
  }

  if (!currentUser) {
    return <AuthPage onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>
            <Navigation className="text-primary" size={28} color="#3b82f6" />
            NaviGo
          </h2>
        </div>
        <nav className="sidebar-nav">
          <button 
            className={`nav-btn ${activeTab === "chat" ? "active" : ""}`}
            onClick={() => setActiveTab("chat")}
          >
            <MessageSquare size={20} />
            Trợ lý đặt dịch vụ
          </button>
          <button 
            className={`nav-btn ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            <Clock size={20} />
            Lịch sử dịch vụ
          </button>
          <button 
            className={`nav-btn ${activeTab === "profile" ? "active" : ""}`}
            onClick={() => setActiveTab("profile")}
          >
            <User size={20} />
            Hồ sơ cá nhân
            <span className={`nav-status ${profileComplete ? "done" : "warning"}`}>
              {profileComplete ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
            </span>
          </button>
        </nav>
        <div className="sidebar-footer">
          {userMenuOpen && (
            <div className="user-menu">
              <button className="user-menu-item danger" onClick={handleLogout}>
                <LogOut size={16} />
                Đăng xuất
              </button>
            </div>
          )}
          <button
            type="button"
            className={`user-profile ${userMenuOpen ? "open" : ""}`}
            onClick={() => setUserMenuOpen((open) => !open)}
            aria-expanded={userMenuOpen}
          >
            <div className="avatar">{currentUser.fullName.charAt(0).toUpperCase()}</div>
            <div className="user-info">
              <span className="name">{currentUser.fullName}</span>
              <span className="email">{currentUser.email}</span>
            </div>
            <ChevronUp className={`user-menu-chevron ${userMenuOpen ? "open" : ""}`} size={16} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h1>{getTabTitle()}</h1>
            <p className="topbar-subtitle">
              {activeTab === "chat" && "Demo luồng tìm kiếm, xác nhận và chuyển booking sang lịch sử."}
              {activeTab === "history" && "Quản lý đặt chỗ, hủy dịch vụ, xem chi tiết và đánh giá."}
              {activeTab === "profile" && "Dữ liệu hành khách bắt buộc trước khi xác nhận đặt dịch vụ."}
            </p>
          </div>
          <div className="topbar-actions">
            <button
              className={`profile-pill ${profileComplete ? "complete" : "incomplete"}`}
              onClick={() => setActiveTab("profile")}
            >
              {profileComplete ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
              <span>{profileComplete ? "Hồ sơ sẵn sàng" : "Cần bổ sung hồ sơ"}</span>
            </button>
          </div>
        </header>
        
        <div className="content-area">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
