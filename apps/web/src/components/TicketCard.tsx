import React from "react";
import { Plane, Bus, Train, Hotel, Car, Package, Calendar, Clock, Users, ArrowRight, BadgeCheck, Luggage, ShieldCheck } from "lucide-react";
import { ServiceTicket } from "../types";
import "./TicketCard.css";

interface Props {
  ticket: ServiceTicket;
  onConfirm?: (ticket: ServiceTicket) => void;
  onRequestChange?: (ticket: ServiceTicket) => void;
  readOnly?: boolean;
}

export const TicketCard: React.FC<Props> = ({ ticket, onConfirm, onRequestChange, readOnly }) => {
  const getTypeIcon = () => {
    switch (ticket.type) {
      case "flight": return <Plane size={18} />;
      case "bus": return <Bus size={18} />;
      case "train": return <Train size={18} />;
      case "hotel": return <Hotel size={18} />;
      case "car": return <Car size={18} />;
      default: return <Package size={18} />;
    }
  };

  const getTypeName = () => {
    switch (ticket.type) {
      case "flight": return "Vé Máy Bay";
      case "bus": return "Vé Xe Khách";
      case "train": return "Vé Tàu Hỏa";
      case "hotel": return "Khách Sạn";
      case "car": return "Đặt Xe";
      default: return "Dịch vụ";
    }
  };

  return (
    <div className={`ticket-card ticket-type-${ticket.type}`}>
      <div className="ticket-top-bar" />
      <div className="ticket-header">
        <span className="ticket-type">
          {getTypeIcon()}
          {getTypeName()}
        </span>
        <span className="ticket-provider">{ticket.provider}</span>
      </div>

      <div className="ticket-body">
        <div className="route-diagram">
          <div className="location-box origin">
            <span className="location-label">Điểm đi</span>
            <strong>{ticket.origin}</strong>
          </div>
          <div className="flight-path">
            <div className="path-line" />
            <div className="path-icon">{getTypeIcon()}</div>
          </div>
          <div className="location-box destination">
            <span className="location-label">Điểm đến</span>
            <strong>{ticket.destination}</strong>
          </div>
        </div>

        <div className="ticket-info-grid">
          <div className="info-item">
            <Calendar size={15} />
            <div>
              <span>Ngày đi</span>
              <strong>{ticket.date}</strong>
            </div>
          </div>
          <div className="info-item">
            <Clock size={15} />
            <div>
              <span>Giờ xuất phát</span>
              <strong>{ticket.time}</strong>
            </div>
          </div>
          <div className="info-item">
            <Users size={15} />
            <div>
              <span>Vị trí / Ghế</span>
              <strong>{ticket.seats}</strong>
            </div>
          </div>
          <div className="info-item">
            <BadgeCheck size={15} />
            <div>
              <span>Thời gian đi</span>
              <strong>{ticket.duration ?? "Linh hoạt"}</strong>
            </div>
          </div>
        </div>

        <div className="price-row">
          <div className="price-tag">
            <span>Tổng chi phí:</span>
            <strong>{ticket.price.toLocaleString("vi-VN")} VND</strong>
          </div>
        </div>

        {(ticket.note || ticket.baggage || ticket.refundPolicy) && (
          <div className="ticket-meta">
            {ticket.note && <p className="meta-item">{ticket.note}</p>}
            {ticket.baggage && (
              <p className="meta-item">
                <Luggage size={14} /> {ticket.baggage}
              </p>
            )}
            {ticket.refundPolicy && (
              <p className="meta-item highlight">
                <ShieldCheck size={14} /> {ticket.refundPolicy}
              </p>
            )}
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="ticket-actions">
          {onRequestChange && (
            <button className="btn-secondary" onClick={() => onRequestChange(ticket)}>
              Đổi phương án
            </button>
          )}
          {onConfirm && (
            <button className="btn-primary" onClick={() => onConfirm(ticket)}>
              Xác nhận và thanh toán
            </button>
          )}
        </div>
      )}
    </div>
  );
};
