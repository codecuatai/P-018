import React, { useState, useEffect, useRef } from "react";
import { Send, Zap, Loader2 } from "lucide-react";
import { Message, ServiceTicket } from "../types";
import { MockService } from "../mocks/mockService";
import { MOCK_SUGGESTIONS } from "../mocks/mockData";
import { TicketCard } from "../components/TicketCard";
import "./ChatDashboard.css";

interface Props {
  onRequireProfile?: () => void;
}

export const ChatDashboard: React.FC<Props> = ({ onRequireProfile }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadInitialMessages();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadInitialMessages = async () => {
    const msgs = await MockService.getMessages();
    setMessages(msgs);
  };

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    setInput("");
    setLoading(true);
    const newMsgs = await MockService.sendMessage(text);
    setMessages([...newMsgs]);
    setLoading(false);
  };

  const handleConfirm = async (ticket: ServiceTicket) => {
    // Validate profile
    const profile = await MockService.getUserProfile();
    if (!profile || !profile.fullName || !profile.phone || !profile.email || !profile.idNumber) {
      alert("Bạn cần hoàn thiện hồ sơ cá nhân (Họ tên, SĐT, Email, CCCD) trước khi đặt dịch vụ.");
      if (onRequireProfile) {
        onRequireProfile();
      }
      return;
    }

    setLoading(true);
    await MockService.confirmBooking(ticket);
    const msgs = await MockService.getMessages();
    setMessages([...msgs]);
    setLoading(false);
  };

  const handleRequestChange = async (ticket: ServiceTicket) => {
    await handleSend(`Tôi muốn đổi vé chuyến này (Mã vé tham khảo: ${ticket.id})`);
  };

  return (
    <div className="chat-dashboard">
      <div className="chat-messages">
        {messages.map(msg => (
          <div key={msg.id} className={`message-row ${msg.role}`}>
            {msg.role === 'bot' && <div className="bot-avatar"><Zap size={16} /></div>}
            <div className="message-content-wrapper">
              <div className="message-bubble">
                <p className="message-text">{msg.text}</p>
                {msg.ticket && (
                  <TicketCard 
                    ticket={msg.ticket} 
                    onConfirm={handleConfirm}
                    onRequestChange={handleRequestChange}
                  />
                )}
                <span className="message-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="message-row bot">
            <div className="bot-avatar"><Zap size={16} /></div>
            <div className="message-content-wrapper">
              <div className="message-bubble loading">
                <Loader2 className="spinner" size={20} />
                <span>Đang xử lý...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <div className="suggestions">
          {MOCK_SUGGESTIONS.map((suggestion, idx) => (
            <button key={idx} onClick={() => setInput(suggestion)} className="suggestion-chip">
              <Zap size={14} className="suggestion-icon" />
              {suggestion}
            </button>
          ))}
        </div>
        <form 
          className="input-form"
          onSubmit={e => {
            e.preventDefault();
            handleSend(input);
          }}
        >
          <input 
            type="text" 
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Bạn muốn đặt dịch vụ gì hôm nay?"
            disabled={loading}
          />
          <button type="submit" disabled={!input.trim() || loading} className="btn-send">
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};
