import React from "react";
import "./FareBreakdownCard.css";
import { Receipt, Car, MapPin } from "lucide-react";

interface FareBreakdownProps {
  data: {
    base_fee: number;
    distance_fee: number;
    time_fee: number;
    weather_surcharge: number;
    peak_surcharge: number;
    demand_surcharge: number;
    discount: number;
    amount: number;
    demand_level?: string;
  };
}

export function FareBreakdownCard({ data }: FareBreakdownProps) {
  const formatVND = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
  };

  return (
    <div className="fare-breakdown-card">
      <div className="card-header">
        <Receipt className="header-icon" size={20} />
        <h3>Chi tiết phân tách giá</h3>
      </div>
      
      <div className="card-body">
        <div className="fee-row">
          <span>Phí cơ bản</span>
          <span>{formatVND(data.base_fee)}</span>
        </div>
        
        {data.distance_fee > 0 && (
          <div className="fee-row">
            <span>Phí quãng đường</span>
            <span>{formatVND(data.distance_fee)}</span>
          </div>
        )}
        
        {data.time_fee > 0 && (
          <div className="fee-row">
            <span>Phí thời gian</span>
            <span>{formatVND(data.time_fee)}</span>
          </div>
        )}
        
        {data.weather_surcharge > 0 && (
          <div className="fee-row surcharge">
            <span>Phụ phí mưa</span>
            <span>{formatVND(data.weather_surcharge)}</span>
          </div>
        )}
        
        {data.peak_surcharge > 0 && (
          <div className="fee-row surcharge">
            <span>Phụ phí cao điểm</span>
            <span>{formatVND(data.peak_surcharge)}</span>
          </div>
        )}
        
        {data.demand_surcharge > 0 && (
          <div className="fee-row surcharge">
            <span>Phụ phí nhu cầu cao ({data.demand_level})</span>
            <span>{formatVND(data.demand_surcharge)}</span>
          </div>
        )}
        
        {data.discount > 0 && (
          <div className="fee-row discount">
            <span>Giảm giá</span>
            <span>-{formatVND(data.discount)}</span>
          </div>
        )}
      </div>
      
      <div className="card-footer">
        <div className="total-row">
          <span>Tổng cộng</span>
          <span className="total-amount">{formatVND(data.amount)}</span>
        </div>
      </div>
    </div>
  );
}
