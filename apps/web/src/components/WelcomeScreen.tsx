import React, { useState } from 'react';
import { Home, Briefcase, Plane, MapPin, Bot } from 'lucide-react';
import './WelcomeScreen.css';

interface Props {
  onQuickAction: (action: string) => void;
}

export const WelcomeScreen: React.FC<Props> = ({ onQuickAction }) => {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="welcome-screen">
      <div className="welcome-header">
        <div className="welcome-avatar-container">
          {!imgError ? (
            <img 
              src="/images/3d_robot_avatar.jpg" 
              alt="NaviGo AI" 
              className="bot-avatar-img"
              onError={() => setImgError(true)} 
            />
          ) : (
            <div className="bot-avatar-fallback">
              <Bot size={32} />
            </div>
          )}
        </div>
        <h2>Xin chào! Tôi là NaviGo</h2>
        <p>Trợ lý đặt xe thông minh của bạn. Tôi có thể giúp bạn đặt xe đi đâu hôm nay?</p>
      </div>
      
      <div className="quick-actions-grid">
        <button className="quick-action-btn" onClick={() => onQuickAction("Tôi muốn đi về nhà")}>
          <div className="quick-icon-wrap icon-blue">
            <Home size={20} />
          </div>
          <span>Về nhà</span>
        </button>
        <button className="quick-action-btn" onClick={() => onQuickAction("Tôi muốn đến văn phòng")}>
          <div className="quick-icon-wrap icon-amber">
            <Briefcase size={20} />
          </div>
          <span>Đi làm</span>
        </button>
        <button className="quick-action-btn" onClick={() => onQuickAction("Tôi muốn ra sân bay")}>
          <div className="quick-icon-wrap icon-emerald">
            <Plane size={20} />
          </div>
          <span>Sân bay</span>
        </button>
      </div>
      
      <div className="welcome-hint">
        <MapPin size={16} />
        <span>Hoặc nhập điểm đón và điểm đến của bạn vào ô chat bên dưới...</span>
      </div>
    </div>
  );
};
