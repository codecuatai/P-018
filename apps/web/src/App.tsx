import { useEffect, useState } from "react";
import { MessageSquare, Clock, User, Bell, Users, CreditCard, ChevronUp, Share2, Copy, Download, Check, HelpCircle, Sparkles, Gift } from "lucide-react";
import { AuthPage } from "./pages/AuthPage";
import { UnifiedDashboard } from "./pages/UnifiedDashboard";
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
  const [copied, setCopied] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

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
  };

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    setActionNotice("Đã sao chép liên kết!");
    setTimeout(() => {
      setCopied(false);
      setActionNotice(null);
    }, 2000);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: "NaviGo AI Assistant", url: window.location.href }).catch(() => {});
    } else {
      handleCopyLink();
    }
  };

  const handleDownload = () => {
    setActionNotice("Đang tải dữ liệu phiên làm việc...");
    setTimeout(() => setActionNotice(null), 2500);
  };

  const renderContent = () => {
    switch (activeTab) {
      case "chat":
        return <UnifiedDashboard />;
      case "history": 
        return <HistoryView />;
      case "profile": 
        return <ProfileSettings onSaved={setProfile} />;
    }
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case "chat": return "AI Service Assistant";
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
            <span className="logo-badge-n">N</span>
            NaviGo
          </h2>
        </div>
        <nav className="sidebar-nav">
          <button 
            className={`nav-btn ${activeTab === "chat" ? "active" : ""}`}
            onClick={() => setActiveTab("chat")}
          >
            <MessageSquare size={18} />
            AI Service Assistant
          </button>
          <button 
            className={`nav-btn ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            <Clock size={18} />
            Booking History
          </button>
          <button 
            className={`nav-btn ${activeTab === "profile" ? "active" : ""}`}
            onClick={() => setActiveTab("profile")}
          >
            <User size={18} />
            Profile
          </button>
          <button className="nav-btn">
            <Bell size={18} />
            Notifications
            <span className="badge-count">3</span>
          </button>
          <button className="nav-btn">
            <Users size={18} />
            Saved Travelers
          </button>
          <button className="nav-btn">
            <CreditCard size={18} />
            Payment Methods
          </button>
          
          <div className="pro-upgrade-card">
            <div className="pro-header">
              <strong>Nâng cấp trải nghiệm</strong>
              <span className="pro-badge">PRO</span>
            </div>
            <p>Ưu đãi độc quyền, hoàn hủy linh hoạt và hỗ trợ ưu tiên 24/7.</p>
            <button className="btn-upgrade">Nâng cấp ngay</button>
          </div>
        </nav>
        
        <div className="sidebar-footer">
          <div className="user-profile-admin">
            <div className="avatar">A</div>
            <div className="user-info">
              <span className="name">Admin NaviGo</span>
              <span className="email">admin@navigo.vn</span>
            </div>
            <ChevronUp size={16} className="text-muted" />
          </div>
          
          <div className="premium-status">
            <div>
              <strong>NaviGo Premium</strong>
              <span>Hiệu lực đến: 02/12/2025</span>
            </div>
            <div className="crown-icon"><Sparkles size={16} /></div>
          </div>
          
          <button className="btn-help">
            <HelpCircle size={16} />
            Trợ giúp & hỗ trợ
            <ChevronUp size={14} className="ml-auto" />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <h1>{getTabTitle()}</h1>
            <p className="topbar-subtitle">
              {activeTab === "chat" && "Trợ lý AI thông minh, giúp bạn đặt dịch vụ nhanh chóng và thuận tiện."}
              {activeTab === "history" && "Quản lý các chuyến đi và dịch vụ bạn đã đặt."}
              {activeTab === "profile" && "Cập nhật thông tin cá nhân và tài khoản."}
            </p>
          </div>
          <div className="topbar-actions">
            {activeTab === "chat" && (
              <div className="coupon-completed-badge">
                <Gift size={16} />
                Mã sử dụng hoàn tất!
                <span className="percent-badge">85%</span>
              </div>
            )}
            
            <div className="topbar-right-profile" style={{ borderLeft: "none", marginLeft: 0 }}>
              <button className="notification-bell">
                <Bell size={18} />
                <span className="bell-badge">3</span>
              </button>
              <div className="topbar-user">
                <div className="avatar">A</div>
                <div className="user-info-text">
                  <span className="name">Admin NaviGo</span>
                  <span className="email">admin@navigo.vn</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {actionNotice && <div className="action-toast-banner">{actionNotice}</div>}

        <div className="content-area">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}

