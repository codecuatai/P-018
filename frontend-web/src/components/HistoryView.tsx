import React, { useEffect, useState } from "react";
import { ListFilter, SearchX, CheckCircle, Clock, XCircle, MoreHorizontal } from "lucide-react";
import { BookingHistory, ServiceType, BookingStatus } from "../types";
import { MockService } from "../mocks/mockService";
import "./HistoryView.css";
import { TicketCard } from "./TicketCard";

export const HistoryView: React.FC = () => {
  const [history, setHistory] = useState<BookingHistory[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<ServiceType | "all">("all");

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    const data = await MockService.getHistory();
    setHistory(data);
    setLoading(false);
  };

  const handleCancel = async (bookingId: string) => {
    if (window.confirm("Bạn có chắc chắn muốn hủy vé này?")) {
      const success = await MockService.cancelBooking(bookingId);
      if (success) {
        alert("Hủy vé thành công");
        loadHistory();
      }
    }
  };

  const handleRate = async (bookingId: string) => {
    const ratingStr = window.prompt("Nhập điểm đánh giá (1-5):", "5");
    if (ratingStr) {
      const rating = parseInt(ratingStr);
      if (rating >= 1 && rating <= 5) {
        await MockService.rateService(bookingId, rating);
        alert("Cảm ơn bạn đã đánh giá!");
        loadHistory();
      } else {
        alert("Điểm đánh giá không hợp lệ");
      }
    }
  };

  const filteredHistory = history.filter(h => {
    const matchStatus = statusFilter === "all" || h.status === statusFilter;
    const matchType = typeFilter === "all" || h.type === typeFilter;
    return matchStatus && matchType;
  });

  const getStatusBadge = (status: BookingStatus) => {
    if (status === "confirmed") return <span className="status-badge confirmed"><Clock size={14}/> Sắp tới</span>;
    if (status === "completed") return <span className="status-badge completed"><CheckCircle size={14}/> Hoàn thành</span>;
    if (status === "cancelled") return <span className="status-badge cancelled"><XCircle size={14}/> Đã hủy</span>;
    return null;
  };

  if (loading) return <div className="history-loading"><Clock className="spinner" size={24} /> Đang tải lịch sử...</div>;

  return (
    <div className="history-view">
      <div className="history-header">
        <h2><ListFilter size={24} className="text-primary" /> Lịch sử đặt dịch vụ</h2>
        
        <div className="filter-group">
          <label>Trạng thái:</label>
          <div className="history-filters">
            <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>Tất cả</button>
            <button className={statusFilter === "confirmed" ? "active" : ""} onClick={() => setStatusFilter("confirmed")}>Sắp tới</button>
            <button className={statusFilter === "completed" ? "active" : ""} onClick={() => setStatusFilter("completed")}>Đã hoàn thành</button>
            <button className={statusFilter === "cancelled" ? "active" : ""} onClick={() => setStatusFilter("cancelled")}>Đã hủy</button>
          </div>
        </div>

        <div className="filter-group">
          <label>Loại dịch vụ:</label>
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
      </div>

      <div className="history-content">
        {filteredHistory.length === 0 ? (
          <div className="empty-state">
            <SearchX size={48} className="empty-icon" />
            <p>Không tìm thấy dịch vụ nào khớp với bộ lọc.</p>
          </div>
        ) : (
          <div className="history-list">
            {filteredHistory.map(booking => (
              <div key={booking.bookingId} className={`history-card status-${booking.status}`}>
                <div className="history-card-header">
                  <strong>Mã đặt chỗ: {booking.bookingId}</strong>
                  {getStatusBadge(booking.status)}
                </div>
                
                <TicketCard ticket={booking} readOnly />
                
                <div className="history-card-footer">
                  <div className="total-cost">Tổng chi phí: {booking.price.toLocaleString("vi-VN")} VND</div>
                  <div className="history-card-actions">
                    {booking.status === "confirmed" && (
                      <button className="btn-secondary" onClick={() => handleCancel(booking.bookingId)}>Hủy dịch vụ</button>
                    )}
                    {booking.status === "completed" && !booking.rating && (
                      <button className="btn-primary" onClick={() => handleRate(booking.bookingId)}>Đánh giá dịch vụ</button>
                    )}
                    {booking.status === "completed" && booking.rating && (
                      <span className="rating-display">
                        Đánh giá của bạn: {"⭐".repeat(booking.rating)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
