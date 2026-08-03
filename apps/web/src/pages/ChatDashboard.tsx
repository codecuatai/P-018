import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRightLeft,
  BadgeCheck,
  Car,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CreditCard,
  Gift,
  Headphones,
  Hotel,
  Loader2,
  Lock,
  Luggage,
  Mic,
  Package,
  Paperclip,
  Plane,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Train,
  UserCheck,
  X,
  Zap,
} from "lucide-react";
import { ComboPackage, Message, PaymentMethod, RescheduleOption, RideVehicleOption, ServiceTicket, SupportTicketContext } from "../types";
import { isProfileComplete, MockService } from "../mocks/mockService";
import { MOCK_COMBOS, MOCK_SUGGESTIONS } from "../mocks/mockData";
import { TicketCard } from "../components/TicketCard";
import "./ChatDashboard.css";

interface Props {
  onRequireProfile?: () => void;
  onOpenHistory?: () => void;
  profileComplete?: boolean;
}

const paymentLabels: Record<PaymentMethod, string> = {
  momo: "Ví MoMo",
  bank_transfer: "Chuyển khoản VietQR",
  card: "Thẻ Visa / Mastercard",
  cash: "Thanh toán tại quầy",
};

const demoScenarios = [
  {
    title: "1. Đặt vé máy bay",
    subtitle: "Single Ticket Booking",
    prompt: MOCK_SUGGESTIONS[0],
    icon: <Plane size={18} />,
    category: "Vé đơn",
    type: "flight",
    image: "/images/3d_airplane_icon.jpg",
    highlight: false,
  },
  {
    title: "2. Combo Trọn gói",
    subtitle: "Bay + Khách sạn 4*",
    prompt: MOCK_SUGGESTIONS[1],
    icon: <Gift size={18} />,
    category: "Combo 15%",
    type: "combo",
    image: "/images/3d_gift_combo_icon.jpg",
    highlight: true,
  },
  {
    title: "3. Đặt phòng Khách sạn",
    subtitle: "Resort & Stay Booking",
    prompt: MOCK_SUGGESTIONS[2],
    icon: <Hotel size={18} />,
    category: "Khách sạn",
    type: "stay",
    image: "/images/3d_hotel_icon.jpg",
    highlight: false,
  },
  {
    title: "4. Đặt xe & Đưa đón",
    subtitle: "Ride & Vehicle Choice",
    prompt: MOCK_SUGGESTIONS[3],
    icon: <Car size={18} />,
    category: "Xe đưa đón",
    type: "ride",
    image: "/images/3d_car_icon.jpg",
    highlight: false,
  },
];

export const ChatDashboard: React.FC<Props> = ({
  onRequireProfile,
  onOpenHistory,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const paymentMethod: PaymentMethod = "momo";
  const [notice, setNotice] = useState<{ type: "success" | "warning"; text: string } | null>(null);
  const [lastBookingId, setLastBookingId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Flow 2 & Ticket Payment Modal States
  const [selectedCombo, setSelectedCombo] = useState<ComboPackage | null>(null);
  const [pendingTicket, setPendingTicket] = useState<ServiceTicket | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMethod, setAuthMethod] = useState<PaymentMethod>("momo");
  const [otpCode, setOtpCode] = useState("888999");
  const [isVerifying, setIsVerifying] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadInitialMessages();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleScroll = () => {
    if (!chatMessagesRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatMessagesRef.current;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 120);
  };

  const loadInitialMessages = async () => {
    const msgs = await MockService.getMessages();
    setMessages(msgs);
  };

  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;
    setInput("");
    setNotice(null);
    setLoading(true);
    const newMsgs = await MockService.sendMessage(text);
    setMessages([...newMsgs]);
    setLoading(false);
  };

  const handleConfirm = async (ticket: ServiceTicket) => {
    const profile = await MockService.getUserProfile();
    if (!isProfileComplete(profile)) {
      setNotice({
        type: "warning",
        text: "Bạn cần hoàn thiện hồ sơ hành khách trước khi xác nhận thanh toán.",
      });
      onRequireProfile?.();
      return;
    }

    setPendingTicket(ticket);
    setSelectedCombo(null);
    setShowAuthModal(true);
  };

  const handleRequestChange = async (ticket: ServiceTicket) => {
    await handleSend(`Tôi muốn đổi phương án cho mã vé tham khảo ${ticket.id}`);
  };

  // Combo Selection & OTP Auth
  const handleSelectComboPackage = (combo: ComboPackage) => {
    setSelectedCombo(combo);
    setPendingTicket(null);
    setShowAuthModal(true);
  };

  const handleConfirmOtpPayment = async () => {
    if (!selectedCombo && !pendingTicket) return;
    setIsVerifying(true);
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (pendingTicket) {
      const booking = await MockService.confirmBooking(pendingTicket, authMethod);
      const msgs = await MockService.getMessages();
      setLastBookingId(booking.bookingId);
      setNotice({
        type: "success",
        text: `Xác thực ${paymentLabels[authMethod]} THÀNH CÔNG! Đã thanh toán và tạo mã đặt chỗ ${booking.bookingId}.`,
      });
      setMessages([...msgs]);
      setPendingTicket(null);
    } else if (selectedCombo) {
      const bookingFlight = await MockService.confirmBooking(selectedCombo.flight, authMethod);
      const bookingHotel = await MockService.confirmBooking(selectedCombo.hotel, authMethod);
      const msgs = await MockService.getMessages();
      setLastBookingId(bookingFlight.bookingId);
      setNotice({
        type: "success",
        text: `Xác thực ${paymentLabels[authMethod]} THÀNH CÔNG! Đã tạo mã Booking Combo ${bookingFlight.bookingId} & ${bookingHotel.bookingId}.`,
      });
      setMessages([...msgs]);
      setSelectedCombo(null);
    }

    setIsVerifying(false);
    setShowAuthModal(false);
  };

  // Flow 3: Confirm Reschedule & Refund
  const handleConfirmReschedule = async (reschedule: RescheduleOption) => {
    setLoading(true);
    const booking = await MockService.confirmBooking(reschedule.newTicket, "momo");
    setLastBookingId(booking.bookingId);
    setNotice({
      type: "success",
      text: `Đã đổi sang ${reschedule.newTicket.provider} và tự động hoàn trả 520.000 VND về Ví MoMo của bạn!`,
    });
    const msgs = await MockService.getMessages();
    setMessages([...msgs]);
    setLoading(false);
  };

  // Flow 4: CSKH Operator Handoff
  const handleConnectOperator = async (handoff: SupportTicketContext) => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    setNotice({
      type: "success",
      text: `Nhân viên ${handoff.operatorName} đã tham gia phiên chat hỗ trợ trực tiếp cho Ticket ${handoff.ticketId}.`,
    });
    setLoading(false);
  };

  // Flow 5: Select Ride Vehicle Option
  const handleSelectRideOption = async (rideOpt: RideVehicleOption) => {
    const rideTicket: ServiceTicket = {
      id: `ride-${Date.now()}`,
      type: "car",
      origin: "Sân bay Đà Nẵng",
      destination: "Khách sạn Minh An Riverside",
      date: "2026-08-08",
      time: "14:30",
      price: rideOpt.price,
      seats: rideOpt.seats,
      provider: rideOpt.name,
      duration: rideOpt.eta,
      note: `Tài xế: ${rideOpt.driverName || "Nguyễn Văn Hùng"} · BSK: ${rideOpt.licensePlate || "43A-889.12"} · Mẫu xe: ${rideOpt.vehicleModel}`,
      refundPolicy: "Miễn phí hủy trước giờ đón 30 phút.",
    };

    setLoading(true);
    await handleSend(`Tôi chọn loại xe ${rideOpt.name} (${rideOpt.vehicleModel}) với giá ${rideOpt.price.toLocaleString("vi-VN")} VND`);
  };

  const renderRideOptions = (options: RideVehicleOption[]) => (
    <div className="ride-options-grid">
      {options.map((opt) => (
        <div key={opt.id} className="ride-option-card">
          <div className="ride-option-header">
            <div className="ride-icon-badge"><Car size={18} /></div>
            <div>
              <h4>{opt.name}</h4>
              <small>{opt.vehicleModel} · {opt.seats}</small>
            </div>
            <div className="ride-price-badge">
              <strong>{opt.price.toLocaleString("vi-VN")} VND</strong>
            </div>
          </div>
          <ul className="ride-highlights">
            {opt.highlights.map((h, i) => (
              <li key={i}><CheckCircle2 size={13} className="text-success" /> {h}</li>
            ))}
          </ul>
          <div className="ride-driver-preview">
            <span>Tài xế đề xuất: <strong>{opt.driverName}</strong> ({opt.licensePlate})</span>
            <span className="eta-tag">Đón sau {opt.eta}</span>
          </div>
          <button
            type="button"
            className="btn-select-ride"
            onClick={() => handleSelectRideOption(opt)}
            disabled={loading}
          >
            <Car size={15} />
            Chọn {opt.name}
          </button>
        </div>
      ))}
    </div>
  );

  const renderComboPackages = (packages: ComboPackage[]) => (
    <div className="combo-packages-list">
      {packages.map((combo) => (
        <div className="combo-card" key={combo.id}>
          <div className="combo-card-header">
            <div className="combo-badge">{combo.badge}</div>
            <h4>{combo.title}</h4>
          </div>
          <div className="combo-items-grid">
            <div className="combo-item-box">
              <span className="combo-item-type"><Plane size={15} /> Vé Máy Bay</span>
              <strong>{combo.flight.origin} → {combo.flight.destination}</strong>
              <small>{combo.flight.provider} · {combo.flight.date} {combo.flight.time}</small>
            </div>
            <div className="combo-item-box">
              <span className="combo-item-type"><Hotel size={15} /> Khách Sạn</span>
              <strong>{combo.hotel.destination}</strong>
              <small>{combo.hotel.seats} · {combo.hotel.duration}</small>
            </div>
          </div>
          <ul className="combo-highlights">
            {combo.highlights.map((h, i) => (
              <li key={i}><CheckCircle2 size={14} className="text-success" /> {h}</li>
            ))}
          </ul>
          <div className="combo-price-bar">
            <div className="price-details">
              <span className="original-price">{combo.originalPrice.toLocaleString("vi-VN")} VND</span>
              <strong className="combo-price">{combo.comboPrice.toLocaleString("vi-VN")} VND</strong>
            </div>
            <button
              type="button"
              className="btn-select-combo"
              onClick={() => handleSelectComboPackage(combo)}
            >
              <Gift size={16} />
              Chọn Gói Combo Này
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  const renderRescheduleCard = (reschedule: RescheduleOption) => (
    <div className="reschedule-card">
      <div className="reschedule-header">
        <ArrowRightLeft size={20} className="text-primary" />
        <div>
          <h4>So sánh Đổi Lịch trình & Hoàn tiền</h4>
          <p>Tự động tính chênh lệch giá vé và hoàn tiền theo chính sách hãng</p>
        </div>
      </div>

      <div className="reschedule-compare-grid">
        <div className="ticket-compare-box old">
          <span className="compare-label danger">Vé cũ (Đã đặt)</span>
          <strong>{reschedule.oldTicket.provider} ({reschedule.oldTicket.origin} → {reschedule.oldTicket.destination})</strong>
          <span className="compare-price">{reschedule.oldTicket.price.toLocaleString("vi-VN")} VND</span>
        </div>

        <div className="compare-arrow">➔</div>

        <div className="ticket-compare-box new">
          <span className="compare-label success">Vé mới (Đề xuất)</span>
          <strong>{reschedule.newTicket.provider} ({reschedule.newTicket.origin} → {reschedule.newTicket.destination})</strong>
          <span className="compare-price">{reschedule.newTicket.price.toLocaleString("vi-VN")} VND</span>
        </div>
      </div>

      <div className="refund-summary-box">
        <div className="refund-amount-row">
          <span>Số tiền chênh lệch hoàn lại:</span>
          <strong className="refund-value">{reschedule.refundAmount.toLocaleString("vi-VN")} VND</strong>
        </div>
        <p className="refund-policy-text"><ShieldCheck size={14} /> {reschedule.refundPolicy}</p>
      </div>

      <button
        type="button"
        className="btn-confirm-reschedule"
        onClick={() => handleConfirmReschedule(reschedule)}
        disabled={loading}
      >
        <RefreshCw size={16} />
        Xác nhận đổi sang Tàu hỏa & Nhận hoàn tiền
      </button>
    </div>
  );

  const renderHandoffCard = (handoff: SupportTicketContext) => (
    <div className="handoff-card">
      <div className="handoff-header">
        <div className="handoff-avatar">{handoff.operatorAvatar || "L"}</div>
        <div>
          <h4>{handoff.operatorName} (CSKH NaviGo)</h4>
          <span className="handoff-status-badge">● Đã tiếp quản phiên hỗ trợ</span>
        </div>
      </div>
      <div className="handoff-ticket-info">
        <div><span>Mã Ticket:</span> <strong>{handoff.ticketId}</strong></div>
        <div><span>Mức ưu tiên:</span> <strong className="priority-high">{handoff.priority}</strong></div>
        <div><span>Nội dung:</span> <strong>{handoff.category}</strong></div>
      </div>
      <button
        type="button"
        className="btn-connect-operator"
        onClick={() => handleConnectOperator(handoff)}
        disabled={loading}
      >
        <Headphones size={16} />
        Trò chuyện trực tiếp với CSKH Linh
      </button>
    </div>
  );

  const getChipClass = (suggestion: string) => {
    const s = suggestion.toLowerCase();
    if (s.includes("combo") || s.includes("phú quốc")) return "suggestion-chip glow-border-orange";
    if (s.includes("vé máy bay") || s.includes("máy bay") || s.includes("đà nẵng")) return "suggestion-chip glow-border-cyan";
    return "suggestion-chip";
  };

  return (
    <div className="chat-dashboard">
      <section className="chat-main">
        <div className="scenario-grid">
          {demoScenarios.map((scenario) => (
            <button
              type="button"
              key={scenario.title}
              className={`scenario-card scenario-${scenario.type} ${scenario.highlight ? "highlight-glow-orange" : ""}`}
              onClick={() => handleSend(scenario.prompt)}
              disabled={loading}
            >
              <img src={scenario.image} alt={scenario.title} className="scenario-3d-img" />
              <div className="scenario-card-header">
                <span className={`scenario-icon icon-${scenario.type}`}>{scenario.icon}</span>
                <span className={`scenario-badge badge-${scenario.type}`}>{scenario.category}</span>
              </div>
              <div className="scenario-card-body">
                <strong>{scenario.title}</strong>
                <small>{scenario.subtitle}</small>
              </div>
            </button>
          ))}
        </div>

        {notice && (
          <div className={`flow-notice ${notice.type}`}>
            {notice.type === "success" ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
            <span>{notice.text}</span>
            {lastBookingId && (
              <button type="button" onClick={onOpenHistory}>
                Xem lịch sử
              </button>
            )}
          </div>
        )}

        <div className="chat-messages" ref={chatMessagesRef} onScroll={handleScroll}>
          {messages.map((msg) => (
            <div key={msg.id} className={`message-row ${msg.role}`}>
              {msg.role === "bot" && (
                <div className="bot-avatar robot-avatar-3d">
                  <img src="/images/3d_robot_avatar.jpg" alt="Bot Avatar 3D" className="bot-avatar-img" />
                </div>
              )}
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
                  {msg.comboPackages && renderComboPackages(msg.comboPackages)}
                  {msg.rescheduleComparison && renderRescheduleCard(msg.rescheduleComparison)}
                  {msg.handoffInfo && renderHandoffCard(msg.handoffInfo)}
                  {msg.rideOptions && renderRideOptions(msg.rideOptions)}
                  <span className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="message-row bot">
              <div className="bot-avatar robot-avatar-3d">
                <img src="/images/3d_robot_avatar.jpg" alt="Bot Avatar 3D" className="bot-avatar-img" />
              </div>
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

        {showScrollBottom && (
          <button
            type="button"
            className="scroll-bottom-btn"
            onClick={scrollToBottom}
            aria-label="Cuộn xuống tin nhắn mới nhất"
          >
            <ChevronDown size={16} />
            <span>Tin nhắn mới nhất</span>
          </button>
        )}

        <div className="chat-input-container">
          <div className="suggestions">
            {MOCK_SUGGESTIONS.map((suggestion, idx) => (
              <button key={idx} onClick={() => setInput(suggestion)} className={getChipClass(suggestion)}>
                <Sparkles size={14} className="suggestion-icon" />
                {suggestion}
              </button>
            ))}
          </div>
          <form
            className="input-form glass-input-pill"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
          >
            <div className="input-utility-buttons">
              <button type="button" className="input-util-btn" title="Đính kèm tệp / hình ảnh">
                <Paperclip size={18} />
              </button>
              <button type="button" className="input-util-btn" title="Nhập bằng giọng nói">
                <Mic size={18} />
              </button>
            </div>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Nhập yêu cầu đặt dịch vụ..."
              disabled={loading}
            />
            <button type="submit" disabled={!input.trim() || loading} className="btn-send bright-cyan-send" aria-label="Gửi yêu cầu">
              <Send size={18} />
            </button>
          </form>
        </div>
      </section>

      {showAuthModal && (selectedCombo || pendingTicket) && (
        <div className="auth-modal-overlay">
          <div className="auth-modal-content">
            <div className="auth-modal-header">
              <div className="modal-title">
                <Lock size={20} className="text-primary" />
                <h3>Xác thực Thanh toán {selectedCombo ? "Combo" : (pendingTicket?.type === "car" ? "Đặt xe đưa đón" : "Dịch vụ")}</h3>
              </div>
              <button type="button" className="btn-close-modal" onClick={() => setShowAuthModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="auth-modal-body">
              <div className="selected-combo-summary">
                <strong>{selectedCombo ? selectedCombo.title : `${pendingTicket?.provider} (${pendingTicket?.origin} → ${pendingTicket?.destination})`}</strong>
                <span className="summary-price">{(selectedCombo ? selectedCombo.comboPrice : (pendingTicket?.price || 0)).toLocaleString("vi-VN")} VND</span>
              </div>

              <div className="form-group">
                <label>Chọn Phương thức Thanh toán</label>
                <div className="method-selector">
                  {(["momo", "card", "bank_transfer"] as PaymentMethod[]).map((method) => (
                    <button
                      key={method}
                      type="button"
                      className={`method-btn ${authMethod === method ? "active" : ""}`}
                      onClick={() => setAuthMethod(method)}
                    >
                      {paymentLabels[method]}
                    </button>
                  ))}
                </div>
              </div>

              {authMethod === "momo" && (
                <div className="auth-step-box momo">
                  <span className="momo-badge">Ví MoMo</span>
                  <p>Nhập mã OTP 6 chữ số được gửi tới số điện thoại ví của bạn (Mã demo: <strong>888999</strong>):</p>
                  <input
                    type="text"
                    className="otp-input"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="Nhập mã OTP (888999)"
                    maxLength={6}
                  />
                </div>
              )}

              {authMethod === "card" && (
                <div className="auth-step-box visa">
                  <CreditCard size={20} className="text-primary" />
                  <p>Cửa sổ xác thực 3D-Secure từ Ngân hàng (Visa/Mastercard). Nhập OTP giao dịch trực tuyến:</p>
                  <input
                    type="password"
                    className="otp-input"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="Mã OTP 3D-Secure"
                    maxLength={6}
                  />
                </div>
              )}

              {authMethod === "bank_transfer" && (
                <div className="auth-step-box qr">
                  <QrCode size={24} className="text-primary" />
                  <p>Mã VietQR tự động khớp nội dung chuyển khoản <strong>BKG-COMBO-9901</strong></p>
                  <div className="mock-qr-placeholder">
                    <span>[ MÃ VIETQR CODE DEMO ]</span>
                  </div>
                </div>
              )}
            </div>

            <div className="auth-modal-footer">
              <button type="button" className="btn-cancel-modal" onClick={() => setShowAuthModal(false)}>
                Hủy bỏ
              </button>
              <button
                type="button"
                className="btn-confirm-otp"
                onClick={handleConfirmOtpPayment}
                disabled={isVerifying || !otpCode.trim()}
              >
                {isVerifying ? <Loader2 size={18} className="spinner" /> : <ShieldCheck size={18} />}
                {isVerifying ? "Đang xác thực..." : "Xác nhận OTP & Hoàn tất"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
