import React, { useState } from 'react';
import { Car, Bike, CheckCircle2, Ticket } from 'lucide-react';
import './VehicleSelector.css';

export interface VehicleQuote {
  vehicle_type: string;
  amount: number;
  duration_minutes: number;
  distance_km: number;
  id: string;
}

interface Props {
  quotes: VehicleQuote[];
  pickupAddress: string;
  dropoffAddress: string;
  onSelect: (quoteId: string) => void;
  loading?: boolean;
}

export const VehicleSelector: React.FC<Props> = ({ 
  quotes, 
  pickupAddress, 
  dropoffAddress, 
  onSelect,
  loading 
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (id: string) => {
    if (loading) return;
    setSelectedId(id);
    onSelect(id);
  };

  const getVehicleInfo = (type: string) => {
    switch(type) {
      case 'BIKE': return { name: 'Xe máy', icon: <Bike size={24} /> };
      case 'CAR_7': return { name: 'Xe 7 chỗ', icon: <Car size={24} /> };
      case 'CAR_4': 
      default: return { name: 'Xe 4 chỗ', icon: <Car size={24} /> };
    }
  };

  const sortedQuotes = [...quotes].sort((a, b) => {
    const order = ['BIKE', 'CAR_4', 'CAR_7'];
    return order.indexOf(a.vehicle_type) - order.indexOf(b.vehicle_type);
  });

  return (
    <div className="vehicle-selector-card">
      <div className="vehicle-selector-header">
        <h4>Chọn loại xe cho chuyến đi</h4>
        <p className="route-info">
          {pickupAddress} ➔ {dropoffAddress}
        </p>
      </div>

      <div className="vehicle-grid">
        {sortedQuotes.map((quote) => {
          const info = getVehicleInfo(quote.vehicle_type);
          const isSelected = selectedId === quote.id;
          
          return (
            <div 
              key={quote.id} 
              className={`vehicle-option ${isSelected ? 'selected' : ''} ${loading && isSelected ? 'loading' : ''}`}
              onClick={() => handleSelect(quote.id)}
            >
              <div className="vehicle-icon">{info.icon}</div>
              <span className="vehicle-name">{info.name}</span>
              <strong className="vehicle-price">{quote.amount.toLocaleString('vi-VN')}₫</strong>
              <small className="vehicle-duration">~{quote.duration_minutes} phút</small>
              
              <div className="select-indicator">
                {isSelected ? <CheckCircle2 size={16} /> : "Chọn"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="promo-hint">
        <Ticket size={16} className="text-warning" />
        <span>Tự động áp dụng mã <strong>SAVE5000</strong> (-5,000₫)</span>
      </div>
    </div>
  );
};
