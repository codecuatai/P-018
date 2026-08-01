import React from "react";
import { Plane, Bus, Train, Hotel, Car, Package, Calendar, Clock, Users, ArrowRight } from "lucide-react";
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
    <div className="ticket-card">
      <div className="ticket-header">
        <span className="ticket-type">
          {getTypeIcon()}
          {getTypeName()}
        </span>
        <span className="ticket-provider">{ticket.provider}</span>
      </div>
      
      <div className="ticket-body">
        <div className="route">
          <div className="location">
            <strong>{ticket.origin}</strong>
          </div>
          <div className="arrow"><ArrowRight size={20} className="text-muted" /></div>
          <div className="location">
            <strong>{ticket.destination}</strong>
          </div>
        </div>
        
        <div className="details">
          <p><Calendar size={16} /> {ticket.date}</p>
          <p><Clock size={16} /> {ticket.time}</p>
          <p><Users size={16} /> {ticket.seats}</p>
          <p className="price">💰 Giá: {ticket.price.toLocaleString("vi-VN")} VND</p>
        </div>
      </div>

      {!readOnly && (
        <div className="ticket-actions">
          {onRequestChange && (
            <button className="btn-secondary" onClick={() => onRequestChange(ticket)}>
              Yêu cầu đổi vé
            </button>
          )}
          {onConfirm && (
            <button className="btn-primary" onClick={() => onConfirm(ticket)}>
              Xác nhận đặt vé
            </button>
          )}
        </div>
      )}
    </div>
  );
};
