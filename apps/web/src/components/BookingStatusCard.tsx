import React from 'react';
import { CheckCircle2, Phone, MessageSquare, X, Star } from 'lucide-react';
import './BookingStatusCard.css';

interface Driver {
  display_name: string;
  rating: number;
  total_trips: number;
  vehicle: {
    make: string;
    model: string;
    color: string;
    license_plate: string;
  };
}

export interface BookingData {
  id: string;
  status: string;
  driver?: Driver | null;
  driver_eta_seconds?: number | null;
  amount: number;
}

interface Props {
  booking: BookingData;
  onCancel: (bookingId: string) => void;
  loading?: boolean;
}

export const BookingStatusCard: React.FC<Props> = ({ booking, onCancel, loading }) => {
  const isDriverAssigned = booking.driver && booking.status === 'DRIVER_ASSIGNED';
  const etaMinutes = booking.driver_eta_seconds ? Math.ceil(booking.driver_eta_seconds / 60) : null;

  return (
    <div className="booking-status-card">
      <div className="booking-header">
        <div className={`status-badge ${booking.status === 'PAID' ? 'success' : 'active'}`}>
          <CheckCircle2 size={16} />
          <span>{booking.status === 'PAID' ? 'Chuyến đi đã hoàn thành' : 'Đã đặt xe thành công'}</span>
        </div>
        <span className="booking-id">#{booking.id.split('_')[1]}</span>
      </div>

      {isDriverAssigned ? (
        <div className="driver-info-box">
          <div className="driver-main">
            <div className="driver-avatar-placeholder">
              {booking.driver?.display_name.charAt(0)}
            </div>
            <div className="driver-details">
              <h4>{booking.driver?.display_name}</h4>
              <div className="driver-stats">
                <span className="rating"><Star size={12} className="star-icon"/> {booking.driver?.rating}</span>
                <span className="trips">({booking.driver?.total_trips} chuyến)</span>
              </div>
            </div>
            {etaMinutes !== null && (
              <div className="eta-badge">
                {etaMinutes} phút
              </div>
            )}
          </div>
          
          <div className="vehicle-details">
            <div className="vehicle-plate">{booking.driver?.vehicle.license_plate}</div>
            <div className="vehicle-desc">
              {booking.driver?.vehicle.color} · {booking.driver?.vehicle.make} {booking.driver?.vehicle.model}
            </div>
          </div>

          <div className="driver-actions">
            <button className="action-btn call-btn">
              <Phone size={16} /> Gọi tài xế
            </button>
            <button className="action-btn chat-btn">
              <MessageSquare size={16} /> Nhắn tin
            </button>
          </div>
        </div>
      ) : booking.status === 'PENDING_PAYMENT' || booking.status === 'CONFIRMED' ? (
        <div className="finding-driver-box">
          <div className="radar-spinner"></div>
          <p>Đang tìm tài xế gần bạn nhất...</p>
        </div>
      ) : null}

      <div className="booking-footer">
        <div className="booking-price">
          <span>Tổng tiền</span>
          <strong>{booking.amount.toLocaleString('vi-VN')}₫</strong>
        </div>
        
        {['CONFIRMED', 'DRIVER_ASSIGNED'].includes(booking.status) && (
          <button 
            className="cancel-booking-btn"
            onClick={() => onCancel(booking.id)}
            disabled={loading}
          >
            <X size={16} /> Hủy chuyến
          </button>
        )}
      </div>
    </div>
  );
};
