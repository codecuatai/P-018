import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bus,
  CalendarDays,
  Car,
  CheckCircle,
  Clock,
  Eye,
  Hotel,
  Package,
  Plane,
  Search,
  SearchX,
  SlidersHorizontal,
  Star,
  Train,
  Users,
  WalletCards,
  X,
  XCircle,
  QrCode,
} from "lucide-react";
import { BookingHistory, BookingStatus, PaymentMethod, ServiceType, UserProfile } from "../types";
import { MockService } from "../mocks/mockService";
import "./HistoryView.css";

const paymentLabels: Record<PaymentMethod, string> = {
  momo: "Ví MoMo",
  bank_transfer: "Chuyển khoản",
  card: "Thẻ nội địa/quốc tế",
  cash: "Thanh toán tại quầy",
};

const serviceLabels: Record<ServiceType, string> = {
  bus: "Xe khách",
  flight: "Máy bay",
  train: "Tàu hỏa",
  car: "Đặt xe",
  hotel: "Khách sạn",
  delivery: "Giao hàng",
  medical: "Khám bệnh",
  other: "Dịch vụ",
};

const getServiceIcon = (type: ServiceType) => {
  switch (type) {
    case "flight": return <Plane size={20} />;
    case "bus": return <Bus size={20} />;
    case "train": return <Train size={20} />;
    case "hotel": return <Hotel size={20} />;
    case "car": return <Car size={20} />;
    default: return <Package size={20} />;
  }
};

const formatDateTime = (value: string) => new Date(value).toLocaleString("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export const HistoryView: React.FC = () => {
  const [history, setHistory] = useState<BookingHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<ServiceType | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortMode, setSortMode] = useState<"newest" | "price_desc" | "price_asc">("newest");
  const [selectedBooking, setSelectedBooking] = useState<BookingHistory | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BookingHistory | null>(null);
  const [rateTarget, setRateTarget] = useState<BookingHistory | null>(null);
  const [rating, setRating] = useState(5);
  const [toast, setToast] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    const data = await MockService.getHistory();
    setHistory(data);
    const profile = await MockService.getUserProfile();
    setUserProfile(profile);
    setLoading(false);
  };

  const summary = useMemo(() => {
    const paidTotal = history
      .filter((booking) => booking.paymentStatus === "paid")
      .reduce((total, booking) => total + booking.price, 0);

    return {
      total: history.length,
      confirmed: history.filter((booking) => booking.status === "confirmed").length,
      completed: history.filter((booking) => booking.status === "completed").length,
      cancelled: history.filter((booking) => booking.status === "cancelled").length,
      paidTotal,
    };
  }, [history]);

  const filteredHistory = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return history
      .filter((booking) => {
        const matchStatus = statusFilter === "all" || booking.status === statusFilter;
        const matchType = typeFilter === "all" || booking.type === typeFilter;
        const searchable = `${booking.bookingId} ${booking.provider} ${booking.origin} ${booking.destination} ${booking.customerName ?? ""}`.toLowerCase();
        const matchSearch = !keyword || searchable.includes(keyword);
        return matchStatus && matchType && matchSearch;
      })
      .sort((a, b) => {
        if (sortMode === "price_desc") return b.price - a.price;
        if (sortMode === "price_asc") return a.price - b.price;
        return new Date(b.bookedAt).getTime() - new Date(a.bookedAt).getTime();
      });
  }, [history, searchTerm, sortMode, statusFilter, typeFilter]);

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    const success = await MockService.cancelBooking(cancelTarget.bookingId);
    if (success) {
      setToast(`Đã hủy ${cancelTarget.bookingId} và cập nhật trạng thái hoàn tiền.`);
      setCancelTarget(null);
      loadHistory();
    }
  };

  const submitRating = async () => {
    if (!rateTarget) return;
    await MockService.rateService(rateTarget.bookingId, rating);
    setToast(`Cảm ơn bạn đã đánh giá ${rating}/5 cho ${rateTarget.bookingId}.`);
    setRateTarget(null);
    loadHistory();
  };

  const getStatusBadge = (status: BookingStatus) => {
    if (status === "confirmed") return <span className="status-badge confirmed"><Clock size={14}/> Sắp tới</span>;
    if (status === "completed") return <span className="status-badge completed"><CheckCircle size={14}/> Hoàn thành</span>;
    if (status === "cancelled") return <span className="status-badge cancelled"><XCircle size={14}/> Đã hủy</span>;
    return <span className="status-badge pending"><Clock size={14}/> Chờ xác nhận</span>;
  };

  if (loading) {
    return (
      <div className="history-loading">
        <Clock className="spinner" size={24} /> Đang tải lịch sử...
      </div>
    );
  }

  return (
    <div className="history-view">
      {toast && (
        <div className="history-toast">
          <CheckCircle size={18} />
          <span>{toast}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Đóng thông báo">
            <X size={16} />
          </button>
        </div>
      )}

      <section className="history-hero">
        <div>
          <span className="section-kicker"><SlidersHorizontal size={16} /> Lịch sử đặt dịch vụ</span>
          <h2>Theo dõi mọi booking trong một nơi</h2>
          <p>Tra cứu mã đặt chỗ, kiểm tra thanh toán, hủy dịch vụ sắp tới hoặc đánh giá các chuyến đã hoàn thành.</p>
        </div>
        <div className="history-hero-total">
          <span>Doanh thu đã thanh toán</span>
          <strong>{summary.paidTotal.toLocaleString("vi-VN")} VND</strong>
        </div>
      </section>

      <section className="history-summary">
        <div className="summary-card-history">
          <CalendarDays size={20} />
          <span>Tổng booking</span>
          <strong>{summary.total}</strong>
        </div>
        <div className="summary-card-history success">
          <Clock size={20} />
          <span>Sắp tới</span>
          <strong>{summary.confirmed}</strong>
        </div>
        <div className="summary-card-history info">
          <CheckCircle size={20} />
          <span>Hoàn thành</span>
          <strong>{summary.completed}</strong>
        </div>
        <div className="summary-card-history danger">
          <XCircle size={20} />
          <span>Đã hủy</span>
          <strong>{summary.cancelled}</strong>
        </div>
      </section>

      <section className="history-toolbar">
        <div className="history-search">
          <Search size={18} />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Tìm mã đặt chỗ, nhà xe, điểm đến..."
          />
        </div>
        <select value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)}>
          <option value="newest">Mới nhất</option>
          <option value="price_desc">Giá cao đến thấp</option>
          <option value="price_asc">Giá thấp đến cao</option>
        </select>
      </section>

      <section className="filter-panel">
        <div className="filter-group">
          <label>Trạng thái</label>
          <div className="history-filters">
            <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>Tất cả</button>
            <button className={statusFilter === "confirmed" ? "active" : ""} onClick={() => setStatusFilter("confirmed")}>Sắp tới</button>
            <button className={statusFilter === "completed" ? "active" : ""} onClick={() => setStatusFilter("completed")}>Hoàn thành</button>
            <button className={statusFilter === "cancelled" ? "active" : ""} onClick={() => setStatusFilter("cancelled")}>Đã hủy</button>
          </div>
        </div>

        <div className="filter-group">
          <label>Loại dịch vụ</label>
          <div className="history-filters type-filters">
            <button className={typeFilter === "all" ? "active" : ""} onClick={() => setTypeFilter("all")}>Tất cả</button>
            <button className={typeFilter === "flight" ? "active" : ""} onClick={() => setTypeFilter("flight")}>Máy bay</button>
            <button className={typeFilter === "train" ? "active" : ""} onClick={() => setTypeFilter("train")}>Tàu hỏa</button>
            <button className={typeFilter === "bus" ? "active" : ""} onClick={() => setTypeFilter("bus")}>Xe khách</button>
            <button className={typeFilter === "car" ? "active" : ""} onClick={() => setTypeFilter("car")}>Đặt xe</button>
            <button className={typeFilter === "hotel" ? "active" : ""} onClick={() => setTypeFilter("hotel")}>Khách sạn</button>
            <button className={typeFilter === "delivery" ? "active" : ""} onClick={() => setTypeFilter("delivery")}>Giao hàng</button>
          </div>
        </div>
      </section>

      <section className="history-content">
        {filteredHistory.length === 0 ? (
          <div className="empty-state">
            <SearchX size={48} className="empty-icon" />
            <p>Không tìm thấy dịch vụ nào khớp với bộ lọc.</p>
          </div>
        ) : (
          <div className="history-list">
            {filteredHistory.map((booking) => (
              <article key={booking.bookingId} className={`history-card status-${booking.status}`}>
                <div className="booking-main">
                  <div className={`service-icon ${booking.type}`}>
                    {getServiceIcon(booking.type)}
                  </div>
                  <div className="booking-info">
                    <div className="booking-title-row">
                      <div>
                        <h3>{serviceLabels[booking.type]} · {booking.provider}</h3>
                        <span>Mã đặt chỗ {booking.bookingId} · Đặt lúc {formatDateTime(booking.bookedAt)}</span>
                      </div>
                      {getStatusBadge(booking.status)}
                    </div>

                    <div className="route-line">
                      <strong>{booking.origin}</strong>
                      <ArrowRight size={18} />
                      <strong>{booking.destination}</strong>
                    </div>

                    <div className="booking-meta">
                      <span><CalendarDays size={15} /> {booking.date}</span>
                      <span><Clock size={15} /> {booking.time}</span>
                      <span><Users size={15} /> {booking.seats}</span>
                      <span><WalletCards size={15} /> {booking.paymentStatus === "paid" && `Đã thanh toán qua ${booking.paymentMethod ? paymentLabels[booking.paymentMethod] : "NaviGo"}`}{booking.paymentStatus === "refunded" && "Đã hoàn tiền"}{booking.paymentStatus === "unpaid" && "Chưa thanh toán"}</span>
                    </div>
                  </div>
                </div>

                <div className="booking-side">
                  <strong>{booking.price.toLocaleString("vi-VN")} VND</strong>
                  <div className="history-card-actions">
                    <button className="btn-secondary" onClick={() => setSelectedBooking(booking)}>
                      <Eye size={16} />
                      Chi tiết
                    </button>
                    {booking.status === "confirmed" && (
                      <button className="btn-danger" onClick={() => setCancelTarget(booking)}>Hủy</button>
                    )}
                    {booking.status === "completed" && !booking.rating && (
                      <button className="btn-primary" onClick={() => {
                        setRating(5);
                        setRateTarget(booking);
                      }}>
                        Đánh giá
                      </button>
                    )}
                    {booking.status === "completed" && booking.rating && (
                      <span className="rating-display">
                        {Array.from({ length: booking.rating }).map((_, index) => (
                          <Star key={index} size={16} fill="currentColor" />
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedBooking && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          {selectedBooking.type === "medical" ? (
            <div className="booking-modal medical-ticket" style={{ maxWidth: '500px', padding: 0, overflow: 'hidden', backgroundColor: '#f8fafc' }}>
              <div style={{ backgroundColor: '#0ea5e9', color: 'white', padding: '20px', textAlign: 'center', position: 'relative' }}>
                <button type="button" onClick={() => setSelectedBooking(null)} aria-label="Đóng" style={{ position: 'absolute', right: '16px', top: '16px', background: 'transparent', color: 'white', border: 'none', cursor: 'pointer' }}>
                  <X size={24} />
                </button>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                  <div style={{ background: 'white', padding: '12px', borderRadius: '12px', display: 'inline-block' }}>
                    <QrCode size={64} color="#0284c7" />
                  </div>
                </div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '20px' }}>PHIẾU KHÁM BỆNH ĐIỆN TỬ</h3>
                <p style={{ margin: 0, opacity: 0.9 }}>Mã số: <strong>{selectedBooking.bookingId}</strong></p>
              </div>
              
              <div style={{ padding: '24px' }}>
                <div style={{ marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
                  <h4 style={{ color: '#0369a1', marginTop: 0, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Users size={18} /> THÔNG TIN HÀNH CHÍNH
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
                    <div><span style={{ color: '#64748b', display: 'block', fontSize: '12px' }}>Họ và tên</span><strong style={{ textTransform: 'uppercase' }}>{selectedBooking.customerName ?? userProfile?.fullName ?? "CHƯA CẬP NHẬT"}</strong></div>
                    <div><span style={{ color: '#64748b', display: 'block', fontSize: '12px' }}>Số điện thoại</span><strong>{selectedBooking.customerPhone ?? userProfile?.phone ?? "Chưa cập nhật"}</strong></div>
                    <div><span style={{ color: '#64748b', display: 'block', fontSize: '12px' }}>Ngày sinh</span><strong>{userProfile?.dob || "Chưa cập nhật"}</strong></div>
                    <div><span style={{ color: '#64748b', display: 'block', fontSize: '12px' }}>Số giấy tờ / BHYT</span><strong>{userProfile?.idNumber || "Chưa cập nhật"}</strong></div>
                  </div>
                </div>

                <div style={{ marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
                  <h4 style={{ color: '#0369a1', marginTop: 0, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CalendarDays size={18} /> THÔNG TIN CUỘC HẸN
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', fontSize: '14px' }}>
                    <div><span style={{ color: '#64748b', display: 'inline-block', width: '100px' }}>Chuyên khoa:</span><strong style={{ color: '#0f172a' }}>{selectedBooking.origin}</strong></div>
                    <div><span style={{ color: '#64748b', display: 'inline-block', width: '100px' }}>Bác sĩ khám:</span><strong style={{ color: '#0f172a' }}>{selectedBooking.destination}</strong></div>
                    <div><span style={{ color: '#64748b', display: 'inline-block', width: '100px' }}>Thời gian:</span><strong style={{ color: '#ea580c' }}>{selectedBooking.time}, ngày {selectedBooking.date}</strong></div>
                    <div><span style={{ color: '#64748b', display: 'inline-block', width: '100px' }}>Địa điểm:</span><strong>Phòng khám số 3, Tầng 2, Khu A - {selectedBooking.provider}</strong></div>
                  </div>
                </div>

                <div style={{ marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
                  <h4 style={{ color: '#0369a1', marginTop: 0, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <WalletCards size={18} /> THÔNG TIN TÀI CHÍNH
                  </h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{selectedBooking.price.toLocaleString("vi-VN")} VNĐ</span>
                    {selectedBooking.paymentStatus === "paid" ? (
                      <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '4px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #bbf7d0' }}>ĐÃ THANH TOÁN</span>
                    ) : (
                      <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '4px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #fecaca' }}>CHƯA THANH TOÁN</span>
                    )}
                  </div>
                </div>

                <div style={{ backgroundColor: '#fff7ed', padding: '12px', borderRadius: '8px', border: '1px solid #fed7aa', fontSize: '13px', color: '#9a3412', marginBottom: '20px' }}>
                  <strong>Lưu ý quan trọng:</strong>
                  <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px' }}>
                    <li>Vui lòng có mặt trước giờ khám 15 phút để làm thủ tục.</li>
                    <li>{(selectedBooking.origin?.toLowerCase() || "").includes("tiêu hóa") || (selectedBooking.origin?.toLowerCase() || "").includes("nội tiết") ? "Vui lòng nhịn ăn sáng để thực hiện xét nghiệm máu." : "Mang theo sổ khám bệnh và các kết quả xét nghiệm cũ (nếu có)."}</li>
                  </ul>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  {selectedBooking.status === "confirmed" && (
                    <button 
                      className="btn-danger" 
                      style={{ flex: 1, padding: '12px', borderRadius: '8px', fontSize: '15px', border: 'none', cursor: 'pointer', fontWeight: '600' }}
                      onClick={() => {
                        setCancelTarget(selectedBooking);
                        setSelectedBooking(null);
                      }}
                    >
                      Hủy lịch hẹn
                    </button>
                  )}
                  <button 
                    className="btn-primary" 
                    style={{ flex: 1, padding: '12px', borderRadius: '8px', fontSize: '15px', border: 'none', cursor: 'pointer', fontWeight: '600' }}
                    onClick={() => setSelectedBooking(null)}
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="booking-modal">
              <div className="modal-header">
                <div>
                  <h3>Chi tiết {selectedBooking.bookingId}</h3>
                  <p>{selectedBooking.provider} · {selectedBooking.origin} → {selectedBooking.destination}</p>
                </div>
                <button type="button" onClick={() => setSelectedBooking(null)} aria-label="Đóng">
                  <X size={18} />
                </button>
              </div>
              <div className="modal-grid">
                <div><span>Khách hàng</span><strong>{selectedBooking.customerName ?? "User Demo"}</strong></div>
                <div><span>Số điện thoại</span><strong>{selectedBooking.customerPhone ?? "0901234567"}</strong></div>
                <div><span>Trạng thái</span>{getStatusBadge(selectedBooking.status)}</div>
                <div><span>Thanh toán</span><strong>{selectedBooking.paymentStatus === "paid" ? "Đã thanh toán" : selectedBooking.paymentStatus === "refunded" ? "Đã hoàn tiền" : "Chưa thanh toán"}</strong></div>
                <div><span>Thời lượng</span><strong>{selectedBooking.duration ?? "Linh hoạt"}</strong></div>
                <div><span>Chỗ/Phòng</span><strong>{selectedBooking.seats}</strong></div>
              </div>
              <div className="modal-note">
                <strong>Ghi chú dịch vụ</strong>
                <p>{selectedBooking.note ?? "Không có ghi chú bổ sung."}</p>
                <p>{selectedBooking.refundPolicy ?? "Áp dụng theo chính sách nhà cung cấp."}</p>
              </div>
              {selectedBooking.status === "confirmed" && (
                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn-danger" onClick={() => {
                    setCancelTarget(selectedBooking);
                    setSelectedBooking(null);
                  }}>
                    Hủy dịch vụ này
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {cancelTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="booking-modal compact">
            <div className="modal-header">
              <h3>Xác nhận hủy dịch vụ</h3>
              <button type="button" onClick={() => setCancelTarget(null)} aria-label="Đóng">
                <X size={18} />
              </button>
            </div>
            <p>Bạn đang hủy {cancelTarget.bookingId}. Sau khi xác nhận, trạng thái sẽ chuyển sang Đã hủy và thanh toán chuyển sang Đã hoàn tiền.</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setCancelTarget(null)}>Giữ booking</button>
              <button className="btn-danger" onClick={confirmCancel}>Xác nhận hủy</button>
            </div>
          </div>
        </div>
      )}

      {rateTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="booking-modal compact">
            <div className="modal-header">
              <h3>Đánh giá dịch vụ</h3>
              <button type="button" onClick={() => setRateTarget(null)} aria-label="Đóng">
                <X size={18} />
              </button>
            </div>
            <p>{rateTarget.provider} · {rateTarget.bookingId}</p>
            <div className="rating-picker">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" className={rating >= value ? "active" : ""} onClick={() => setRating(value)}>
                  <Star size={24} fill="currentColor" />
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setRateTarget(null)}>Để sau</button>
              <button className="btn-primary" onClick={submitRating}>Gửi đánh giá</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
