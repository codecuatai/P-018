import React from "react";
import { ChatDashboard } from "./ChatDashboard";
import { HistoryView } from "../components/HistoryView";
import { ProfileSettings } from "./ProfileSettings";
import { 
  Plane, 
  Hotel, 
  Gift, 
  Car, 
  Train, 
  MapPin, 
  Calendar, 
  Users, 
  Star,
  CheckCircle2,
  CreditCard
} from "lucide-react";
import "./UnifiedDashboard.css";

export const UnifiedDashboard: React.FC = () => {
  return (
    <div className="unified-dashboard">
      {/* COLUMN 1: AI Chat & Services */}
      <section className="dashboard-col col-main">
        <h3 className="section-title">Bạn muốn đặt dịch vụ nào?</h3>
        
        <div className="service-cards-row">
          <div className="service-card-mini bg-flight">
            <img src="/images/3d_airplane_icon.jpg" alt="Flight" onError={(e) => e.currentTarget.style.display='none'} />
            <div className="sc-content">
              <h4>Vé máy bay</h4>
              <p>Đặt vé nhanh chóng và ưu đãi hấp dẫn</p>
              <div className="sc-arrow">→</div>
            </div>
          </div>
          <div className="service-card-mini bg-hotel">
            <img src="/images/3d_hotel_icon.jpg" alt="Hotel" onError={(e) => e.currentTarget.style.display='none'} />
            <div className="sc-content">
              <h4>Khách sạn</h4>
              <p>Đa dạng lựa chọn giá tốt mỗi ngày</p>
              <div className="sc-arrow">→</div>
            </div>
          </div>
          <div className="service-card-mini bg-combo">
            <div className="badge-discount">Ưu đãi đến 15%</div>
            <img src="/images/3d_gift_combo_icon.jpg" alt="Combo" onError={(e) => e.currentTarget.style.display='none'} />
            <div className="sc-content">
              <h4>Combo trọn gói</h4>
              <p>Bay + Khách sạn tiết kiệm hơn</p>
              <div className="sc-arrow">→</div>
            </div>
          </div>
          <div className="service-card-mini bg-car">
            <img src="/images/3d_car_icon.jpg" alt="Car" onError={(e) => e.currentTarget.style.display='none'} />
            <div className="sc-content">
              <h4>Xe đưa đón</h4>
              <p>Đón tận nơi, tiện lợi & linh hoạt</p>
              <div className="sc-arrow">→</div>
            </div>
          </div>
          <div className="service-card-mini bg-train">
            <div className="sc-content">
              <h4>Vé tàu hỏa</h4>
              <p>Dễ dàng đặt vé, toàn quốc</p>
              <div className="sc-arrow">→</div>
            </div>
          </div>
        </div>

        <div className="chat-container-wrapper">
          <ChatDashboard isUnified={true} />
        </div>
      </section>

      {/* COLUMN 2: Progress & Suggestions */}
      <section className="dashboard-col col-side">
        <div className="widget-card stepper-widget">
          <h4>Tiến trình đặt dịch vụ</h4>
          <div className="stepper">
            <div className="step active">
              <div className="step-num">1</div>
              <div className="step-text">
                <strong>Chọn dịch vụ</strong>
                <span>Đang thực hiện</span>
              </div>
            </div>
            <div className="step-line"></div>
            <div className="step">
              <div className="step-num">2</div>
              <div className="step-text">Cung cấp thông tin</div>
            </div>
            <div className="step-line"></div>
            <div className="step">
              <div className="step-num">3</div>
              <div className="step-text">Xác nhận & thanh toán</div>
            </div>
            <div className="step-line"></div>
            <div className="step">
              <div className="step-num">4</div>
              <div className="step-text">Hoàn thành</div>
            </div>
          </div>
        </div>

        <div className="widget-card trip-widget">
          <div className="trip-header">
            <h4>Chuyến đi của bạn</h4>
            <button className="btn-icon"><MapPin size={16} /></button>
          </div>
          <div className="trip-main">
            <img src="https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&q=80&w=100&h=100" alt="Da Nang" className="trip-img" />
            <div className="trip-info">
              <div className="trip-title">
                <strong>Đà Nẵng</strong>
                <span className="guest-badge">2 khách</span>
              </div>
              <span className="trip-dates">15/06/2025 - 17/06/2025</span>
            </div>
          </div>
          <div className="trip-details">
            <div className="detail-item"><MapPin size={14}/> TP. Hồ Chí Minh (SGN) → Đà Nẵng (DAD)</div>
            <div className="detail-item"><Calendar size={14}/> 2 ngày 1 đêm</div>
          </div>
          <button className="btn-edit-trip">Chỉnh sửa</button>
        </div>

        <div className="widget-card profile-completion-widget">
          <div className="completion-ring">
            <span>65%</span>
          </div>
          <div className="completion-text">
            <strong>Hoàn tất hồ sơ để nhận ưu đãi</strong>
            <p>Điền thông tin hồ sơ để nhận các ưu đãi đặc biệt và hỗ trợ nhanh hơn.</p>
            <a href="#">Hoàn tất ngay →</a>
          </div>
        </div>

        <div className="widget-card suggestion-widget">
          <h4>Gợi ý dành cho bạn</h4>
          <div className="hotel-suggestion">
            <img src="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=80&h=80" alt="Sala Hotel" />
            <div className="hotel-info">
              <strong>Sala Danang Beach Hotel</strong>
              <div className="hotel-rating">
                <Star size={12} className="text-warning" fill="currentColor" />
                <span>4.5</span>
                <span className="text-muted">(2.3k đánh giá)</span>
              </div>
              <div className="hotel-price">Từ <span>1.260.000 VND</span>/đêm</div>
            </div>
          </div>
        </div>

        <div className="widget-card promo-widget">
          <h4>Ưu đãi hôm nay</h4>
          <div className="promo-item">
            <div className="promo-icon"><Gift size={20}/></div>
            <div className="promo-info">
              <strong>Giảm 10% combo</strong>
              <span>Vé máy bay + Khách sạn</span>
              <small>HSD: 27/05/2025</small>
            </div>
          </div>
        </div>
      </section>

      {/* COLUMN 3: History & Profile Widgets */}
      <section className="dashboard-col col-right">
        <div className="widget-card history-widget-mini">
          <div className="widget-header">
            <h4>Lịch sử đặt dịch vụ</h4>
            <a href="#">Xem tất cả</a>
          </div>
          <div className="history-stats-mini">
            <div className="stat-box"><span>Tổng đặt chỗ</span><strong>24</strong></div>
            <div className="stat-box text-success"><span>Đã hoàn tất</span><strong>15</strong></div>
            <div className="stat-box text-primary"><span>Hoàn thành</span><strong>5</strong></div>
            <div className="stat-box text-danger"><span>Đã hủy</span><strong>4</strong></div>
          </div>
          
          <div className="history-tabs-mini">
            <button className="active">Tất cả</button>
            <button>Sắp tới</button>
            <button>Hoàn thành</button>
            <button>Đã hủy</button>
          </div>

          <div className="history-list-mini">
            <div className="history-item-mini">
              <div className="hi-icon"><Plane size={16}/></div>
              <div className="hi-info">
                <strong>SGN → DAD</strong>
                <span>15/06/2025 · 2 khách</span>
              </div>
              <div className="hi-status">
                <div className="hi-price">3.560.000 VND</div>
                <div className="badge-upcoming">Sắp tới</div>
              </div>
            </div>
            <div className="history-item-mini">
              <div className="hi-icon"><Hotel size={16}/></div>
              <div className="hi-info">
                <strong>Hà Nội → Phú Quốc</strong>
                <span>02/05 - 05/05/2025 · 2 khách</span>
              </div>
              <div className="hi-status">
                <div className="hi-price">4.880.000 VND</div>
                <div className="badge-completed">Hoàn thành</div>
              </div>
            </div>
            <div className="history-item-mini">
              <div className="hi-icon"><Hotel size={16}/></div>
              <div className="hi-info">
                <strong>Đà Nẵng → Milizz Hotel</strong>
                <span>01/04 - 03/04/2025 · 2 khách</span>
              </div>
              <div className="hi-status">
                <div className="hi-price">2.750.000 VND</div>
                <div className="badge-completed">Hoàn thành</div>
              </div>
            </div>
          </div>
          <div className="pagination-mini">
            <span>Hiển thị 1-4 của 24 kết quả</span>
            <div className="pages">
              <button>&lt;</button>
              <button className="active">1</button>
              <button>2</button>
              <button>3</button>
              <button>&gt;</button>
            </div>
          </div>
        </div>

        <div className="widget-card profile-widget-mini">
          <div className="widget-header">
            <h4>Hồ sơ cá nhân</h4>
            <span className="badge-warning">80% hoàn tất</span>
          </div>
          <div className="profile-mini-layout">
            <div className="profile-tabs-left">
              <button className="active"><UserCircle size={14}/> Thông tin cá nhân</button>
              <button><MapPin size={14}/> Thông tin liên hệ</button>
              <button><CreditCard size={14}/> Giấy tờ tùy thân</button>
              <button><Calendar size={14}/> Lịch sử đặt chỗ</button>
              <button><CheckCircle2 size={14}/> Tùy chọn dịch vụ</button>
            </div>
            <div className="profile-form-mini">
              <h5>Thông tin cơ bản</h5>
              <div className="form-grid-mini">
                <div className="form-group-mini">
                  <label>Họ và tên</label>
                  <input type="text" defaultValue="Nguyễn Văn An" />
                </div>
                <div className="form-group-mini">
                  <label>Giới tính</label>
                  <select defaultValue="Nam"><option value="Nam">Nam</option></select>
                </div>
                <div className="form-group-mini">
                  <label>Ngày sinh</label>
                  <input type="text" defaultValue="15/10/1990" />
                </div>
                <div className="form-group-mini">
                  <label>Quốc tịch</label>
                  <select defaultValue="Việt Nam"><option value="Việt Nam">Việt Nam</option></select>
                </div>
              </div>

              <h5>Thông tin liên hệ</h5>
              <div className="form-group-mini full">
                <label>Số điện thoại</label>
                <input type="text" defaultValue="090xxxxxxx" />
              </div>
              <div className="form-group-mini full">
                <label>Email</label>
                <input type="text" defaultValue="an.nguyen@navigo.vn" />
              </div>

              <div className="profile-actions-mini">
                <button className="btn-cancel-mini">Hủy</button>
                <button className="btn-save-mini">Lưu thay đổi</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

// Simple icon fallback for UserCircle
const UserCircle = ({size}: {size:number}) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
);
