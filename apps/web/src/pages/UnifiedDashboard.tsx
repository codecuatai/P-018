import { Car, Hotel, Stethoscope, Utensils, Plane, Train, Bell, Share2, Copy, Download, HelpCircle, User, CreditCard, Users, History, Bot } from "lucide-react";
import { ChatDashboard } from "./ChatDashboard";
import "./UnifiedDashboard.css";

const services = [
  { name: "Vé máy bay", description: "Đặt vé nhanh chóng", icon: Plane, bg: "linear-gradient(135deg, #0072ff 0%, #00c6ff 100%)" },
  { name: "Khách sạn", description: "Đa dạng lựa chọn", icon: Hotel, bg: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" },
  { name: "Combo trọn gói", description: "Bay + Khách sạn", icon: Utensils, bg: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)" },
  { name: "Xe đưa đón", description: "Đón tận nơi, tiện lợi", icon: Car, bg: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)" },
  { name: "Vé tàu hỏa", description: "Dễ dàng đặt vé", icon: Train, bg: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)" },
];

export function UnifiedDashboard() {
  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">N</span>
          <span className="logo-text">NaviGo</span>
        </div>
        <nav className="sidebar-nav">
          <a href="#" className="nav-item active"><Bot size={18} /> AI Service Assistant</a>
          <a href="#" className="nav-item"><History size={18} /> Booking History</a>
          <a href="#" className="nav-item"><User size={18} /> Profile</a>
          <a href="#" className="nav-item"><Bell size={18} /> Notifications <span className="badge">3</span></a>
          <a href="#" className="nav-item"><Users size={18} /> Saved Travelers</a>
          <a href="#" className="nav-item"><CreditCard size={18} /> Payment Methods</a>
        </nav>
        
        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <h3>Nâng cấp trải nghiệm <span className="pro-badge">PRO</span></h3>
            <p>Ưu đãi đặc quyền, hoàn hủy linh hoạt và hỗ trợ 24/7.</p>
            <button className="upgrade-btn">Nâng cấp ngay</button>
          </div>
          <div className="user-profile-mini">
            <div className="avatar">A</div>
            <div className="info">
              <p className="name">Admin NaviGo</p>
              <p className="email">admin@navigo.vn</p>
            </div>
          </div>
          <a href="#" className="nav-item help-item"><HelpCircle size={18} /> Trợ giúp & hỗ trợ</a>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Header */}
        <header className="top-header">
          <div className="header-left">
            <h1>AI Service Assistant</h1>
            <p>Trợ lý AI thông minh, giúp bạn đặt dịch vụ nhanh chóng và thuận tiện.</p>
          </div>
          <div className="header-right">
            <div className="header-actions">
              <button className="action-btn"><Share2 size={14} /> Chia sẻ</button>
              <button className="action-btn"><Copy size={14} /> Sao chép</button>
              <button className="action-btn"><Download size={14} /> Tải xuống</button>
            </div>
            <div className="notification-icon">
              <Bell size={20} />
              <span className="dot"></span>
            </div>
            <div className="user-profile-header">
              <div className="avatar">A</div>
              <div className="info">
                <p className="name">Admin NaviGo</p>
                <p className="email">admin@navigo.vn</p>
              </div>
            </div>
          </div>
        </header>

        <div className="dashboard-body">
          {/* Left Column (Services + Chat) */}
          <div className="dashboard-left">
            <div className="services-section">
              <h2>Bạn muốn đặt dịch vụ nào?</h2>
              <div className="service-cards-row">
                {services.map(({ name, description, icon: Icon, bg }) => (
                  <article className="service-card-mini" key={name} style={{ background: bg }}>
                    <div className="card-content">
                      <h2>{name}</h2>
                      <p>{description}</p>
                    </div>
                    <Icon className="service-icon-bg" size={64} opacity={0.2} />
                  </article>
                ))}
              </div>
            </div>
            
            <section className="dashboard-chat-wrapper">
              <ChatDashboard />
            </section>
          </div>

          {/* Right Column (Widgets) */}
          <div className="dashboard-right">
            <div className="widget booking-progress">
              <h3>Tiến trình đặt dịch vụ</h3>
              <div className="steps-container">
                <div className="step active">
                  <div className="step-number">1</div>
                  <div className="step-info">
                    <p className="step-title">Chọn dịch vụ</p>
                    <p className="step-desc">Đang thực hiện</p>
                  </div>
                </div>
                <div className="step">
                  <div className="step-number">2</div>
                  <div className="step-info"><p className="step-title">Cung cấp thông tin</p></div>
                </div>
                <div className="step">
                  <div className="step-number">3</div>
                  <div className="step-info"><p className="step-title">Xác nhận & thanh toán</p></div>
                </div>
                <div className="step">
                  <div className="step-number">4</div>
                  <div className="step-info"><p className="step-title">Hoàn thành</p></div>
                </div>
              </div>
            </div>

            <div className="widget trip-details">
              <div className="widget-header">
                <h3>Chuyến đi của bạn</h3>
              </div>
              <div className="trip-empty">
                <p>Chưa có thông tin chuyến đi.</p>
                <p className="sub-text">Hãy yêu cầu AI hỗ trợ đặt dịch vụ.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
