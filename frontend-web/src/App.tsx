import { useState } from "react";
import { MessageSquare, Clock, User, Navigation } from "lucide-react";
import { ChatDashboard } from "./pages/ChatDashboard";
import { HistoryView } from "./components/HistoryView";
import { ProfileSettings } from "./pages/ProfileSettings";
import "./styles.css";

export default function App() {
  const [activeTab, setActiveTab] = useState<"chat" | "history" | "profile">("chat");

  const renderContent = () => {
    switch (activeTab) {
      case "chat": return <ChatDashboard onRequireProfile={() => setActiveTab("profile")} />;
      case "history": return <HistoryView />;
      case "profile": return <ProfileSettings />;
    }
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case "chat": return "Trợ lý Đặt vé AI";
      case "history": return "Lịch sử dịch vụ";
      case "profile": return "Cài đặt Hồ sơ";
    }
  };

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
            Trợ lý đặt vé
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
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="avatar">U</div>
            <div className="user-info">
              <span className="name">User Demo</span>
              <span className="email">user@demo.com</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <h1>{getTabTitle()}</h1>
        </header>
        
        <div className="content-area">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
