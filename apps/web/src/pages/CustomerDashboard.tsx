import React, { useEffect, useRef, useState } from "react";
import {
  Car,
  ChevronDown,
  CreditCard,
  Gift,
  Headphones,
  Loader2,
  Lock,
  Plane,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Train,
  X,
  Zap,
} from "lucide-react";
import { ComboPackage, Message, PaymentMethod, ServiceTicket, SupportTicketContext, UserProfile } from "../types";
import { ApiService } from "../api";
import { TicketCard } from "../components/TicketCard";
import { HistoryView } from "../components/HistoryView";
import { ProfileSettings } from "./ProfileSettings";

// Import local image assets
import navicarImg from "../assets/navicar.jpg";
import premiumImg from "../assets/premium_suv.jpg";
import limousineImg from "../assets/limousine.jpg";
import diningImg from "../assets/dining.jpg";

const MOCK_SUGGESTIONS = [
  "Đặt thêm buổi kiểm tra sức khỏe trước đó",
  "Chuyển lịch sang ngày mai thay vì hôm nay",
];

const isProfileComplete = (profile: any) => {
  return Boolean(
    profile?.fullName &&
      profile?.phone &&
      profile?.email &&
      profile?.idNumber
  );
};

interface Props {
  currentUser: any;
  onLogout: () => void;
}

const paymentLabels: Record<PaymentMethod, string> = {
  momo: "Ví MoMo",
  bank_transfer: "Chuyển khoản VietQR",
  card: "Thẻ Visa / Mastercard",
  cash: "Thanh toán tại quầy",
};

export const CustomerDashboard: React.FC<Props> = ({
  currentUser,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<"chat" | "explore" | "tracking" | "memory" | "history" | "profile">("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [workflowId, setWorkflowId] = useState<string | undefined>();
  const [notice, setNotice] = useState<{ type: "success" | "warning" | "error"; text: string } | null>(null);
  const [lastBookingId, setLastBookingId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Profile status
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const profileComplete = Boolean(
    profile && profile.fullName && profile.phone && profile.email && profile.idNumber
  );

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
    ApiService.getProfile().then((p) => setProfile(p as UserProfile | null));
    loadInitialMessages();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (activeTab === "chat") {
      scrollToBottom();
    }
  }, [messages, loading, activeTab]);

  const handleScroll = () => {
    if (!chatMessagesRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatMessagesRef.current;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 120);
  };

  const loadInitialMessages = async () => {
    setMessages([
      {
        id: "msg-0",
        role: "bot",
        text: "Tôi cần một chuyến xe đến Central District, và đặt bàn cho hai người tại một nhà hàng Ý lúc khoảng 8 giờ tối.",
        timestamp: new Date(Date.now() - 360000).toISOString(),
      },
      {
        id: "msg-1",
        role: "bot",
        text: "Tôi đã sắp xếp các phương án cho cả chuyến đi đến Central District lẫn đặt bàn ăn của bạn.",
        timestamp: new Date(Date.now() - 300000).toISOString(),
        customCombo: true // triggers custom visual bento card layout matching the mock
      }
    ]);
  };

  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;
    setInput("");
    setNotice(null);
    setLoading(true);

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      text,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const responseData = await ApiService.sendRestaurantChatMessage(text, workflowId);
      if (responseData.workflow_id) setWorkflowId(responseData.workflow_id);
      const botMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        role: "bot",
        text: responseData.response,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (err) {
      setNotice({
        type: "error",
        text: "Không thể kết nối tới trợ lý AI. Vui lòng kiểm tra Gateway backend.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (ticket: ServiceTicket) => {
    const currentProfile = await ApiService.getProfile();
    if (!isProfileComplete(currentProfile)) {
      setNotice({
        type: "warning",
        text: "Bạn cần hoàn thiện Hồ sơ hành khách trước khi xác nhận đặt chỗ.",
      });
      setActiveTab("profile");
      return;
    }

    setPendingTicket(ticket);
    setSelectedCombo(null);
    setShowAuthModal(true);
  };

  const handleSelectComboPackage = (combo: ComboPackage) => {
    setSelectedCombo(combo);
    setPendingTicket(null);
    setShowAuthModal(true);
  };

  const handleConfirmOtpPayment = async () => {
    if (!selectedCombo && !pendingTicket) return;
    setIsVerifying(true);

    try {
      if (pendingTicket) {
        const booking = await ApiService.createBooking({
          ...pendingTicket,
          paymentMethod: authMethod,
        });
        setLastBookingId(booking.bookingId);
        setNotice({
          type: "success",
          text: `Thanh toán qua ${paymentLabels[authMethod]} thành công! Mã tham chiếu: ${booking.bookingId}.`,
        });
        setPendingTicket(null);
      } else if (selectedCombo) {
        const bookingFlight = await ApiService.createBooking({
          ...selectedCombo.flight,
          paymentMethod: authMethod,
        });
        const bookingHotel = await ApiService.createBooking({
          ...selectedCombo.hotel,
          paymentMethod: authMethod,
        });
        setLastBookingId(bookingFlight.bookingId);
        setNotice({
          type: "success",
          text: `Thanh toán Combo thành công! Mã đặt chỗ: ${bookingFlight.bookingId} & ${bookingHotel.bookingId}.`,
        });
        setSelectedCombo(null);
      }
    } catch {
      setNotice({
        type: "error",
        text: "Xác thực giao dịch thất bại. Vui lòng thử lại.",
      });
    } finally {
      setIsVerifying(false);
      setShowAuthModal(false);
    }
  };

  const handleBookMockCombo = () => {
    handleConfirm({
      id: "BK-8821",
      type: "car",
      provider: "Premium Ride & Table for Two",
      origin: "Pickup",
      destination: "Central District",
      date: new Date().toISOString().substring(0, 10),
      time: "20:00",
      price: 220000,
      seats: 1
    });
  };

  const renderContent = () => {
    switch (activeTab) {
      case "explore":
        return (
          <div className="p-8 max-w-4xl">
            <h2 className="text-xl font-bold text-white mb-4">Khám phá dịch vụ</h2>
            <p className="text-sm text-[#bdc8d1]">Khám phá các lựa chọn chăm sóc sức khỏe, đặt lịch, đặt bàn nhà hàng và di chuyển cao cấp.</p>
          </div>
        );
      case "tracking":
        return (
          <div className="p-8 max-w-4xl">
            <h2 className="text-xl font-bold text-white mb-4">Theo dõi đơn hàng</h2>
            <p className="text-sm text-[#bdc8d1]">Theo dõi đơn hàng điều phối đang hoạt động, lộ trình xe và các xác nhận dịch vụ đang chờ xử lý theo thời gian thực.</p>
          </div>
        );
      case "memory":
        return (
          <div className="p-8 max-w-4xl">
            <h2 className="text-xl font-bold text-white mb-4">Bộ nhớ AI</h2>
            <p className="text-sm text-[#bdc8d1]">Quản lý tùy chọn cá nhân, địa chỉ đã liên kết, nhà hàng yêu thích và cấu hình xe đã lưu.</p>
          </div>
        );
      case "history":
        return (
          <div className="flex-grow h-full bg-[#051424] text-[#d4e4fa]">
            <HistoryView />
          </div>
        );
      case "profile":
        return (
          <div className="flex-grow h-full bg-[#051424] text-[#d4e4fa]">
            <ProfileSettings onSaved={(updated) => setProfile(updated)} />
          </div>
        );
      case "chat":
      default:
        return (
          <div className="flex-grow flex flex-col justify-between h-full relative overflow-hidden bg-[#051424]">
            {/* Header info */}
            <div className="px-8 py-6 flex justify-between items-center border-b border-white/5 bg-[#051424]">
              <div>
                <h1 className="font-['Outfit',sans-serif] text-[32px] leading-10 font-bold text-white">Hôm nay tôi có thể giúp gì cho bạn?</h1>
                <p className="text-[#bdc8d1] text-sm mt-1">Điều phối chuyến đi, bữa ăn và sức khỏe của bạn.</p>
              </div>
              <div className="flex bg-[#2c3a4c]/50 border border-[#87929a]/30 rounded-full px-4 py-1.5 items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#38bdf8] shadow-[0_0_8px_#38bdf8] animate-pulse"></span>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[#8ed5ff]">Navi System Online</span>
              </div>
            </div>

            {/* Notice Banner */}
            {notice && (
              <div className={`flex items-center justify-between p-3.5 mx-8 mt-4 rounded-lg border text-sm ${
                notice.type === "success" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-[#ffb4ab]/10 border-[#ffb4ab]/20 text-[#ffb4ab]"
              }`}>
                <span>{notice.text}</span>
                {lastBookingId && (
                  <button onClick={() => setActiveTab("history")} className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs transition-colors">
                    Xem đặt chỗ
                  </button>
                )}
              </div>
            )}

            {/* Chat Messages */}
            <div
              className="flex-1 overflow-y-auto px-8 py-6 space-y-6 flex flex-col"
              ref={chatMessagesRef}
              onScroll={handleScroll}
            >
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 max-w-[85%] ${msg.role === "user" ? "self-end flex-row-reverse" : "self-start"}`}>
                  {msg.role === "bot" && (
                    <div className="w-8 h-8 rounded-full bg-[#1b293d] flex items-center justify-center border border-[#38bdf8]/30 text-[#38bdf8] self-start mt-1">
                      <Zap size={14} />
                    </div>
                  )}
                  <div className="flex flex-col">
                    <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#1e293b]/70 text-white rounded-tr-none border border-white/5"
                        : "bg-[#111c2e] border border-white/5 rounded-tl-none text-[#d4e4fa]"
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.text}</p>

                      {/* Render custom composite card for bento combo demo */}
                      {msg.customCombo && (
                        <div className="mt-4 border-t border-white/5 pt-4 space-y-4">
                          {/* Recommended Rides Section */}
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-xs font-bold uppercase text-[#8ed5ff]">
                              <span className="material-symbols-outlined text-[16px]">local_taxi</span>
                              Chuyến đi gợi ý
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              {/* Option 1 */}
                              <div className="bg-[#1a2638]/50 border border-white/5 rounded-xl p-3 flex flex-col justify-between h-48 relative overflow-hidden">
                                <div className="flex justify-between items-center z-10">
                                  <strong className="text-sm font-semibold text-white">NaviCar</strong>
                                  <span className="text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded-full text-[#bdc8d1]">4 phút</span>
                                </div>
                                <img src={navicarImg} alt="NaviCar" className="absolute inset-0 w-full h-full object-cover opacity-45 pointer-events-none" />
                                <div className="flex justify-between items-end z-10 pt-24">
                                  <span className="text-[10px] text-[#bdc8d1]">Standard Electric</span>
                                  <strong className="text-sm font-bold text-white font-mono">145k VND</strong>
                                </div>
                              </div>
                              {/* Option 2 (Active/Best Match) */}
                              <div className="bg-[#1a2638]/50 border border-[#38bdf8]/50 rounded-xl p-3 flex flex-col justify-between h-48 relative overflow-hidden shadow-[0_0_15px_rgba(56,189,248,0.15)]">
                                <div className="flex justify-between items-center z-10">
                                  <strong className="text-sm font-bold text-white">Premium</strong>
                                  <span className="text-[10px] bg-[#38bdf8]/20 border border-[#38bdf8]/40 px-2 py-0.5 rounded-full text-[#38bdf8]">Phù hợp nhất</span>
                                </div>
                                <img src={premiumImg} alt="Premium SUV" className="absolute inset-0 w-full h-full object-cover opacity-50 pointer-events-none" />
                                <div className="flex justify-between items-end z-10 pt-24">
                                  <span className="text-[10px] text-[#bdc8d1]">Luxury SUV</span>
                                  <strong className="text-sm font-bold text-white font-mono">220k VND</strong>
                                </div>
                              </div>
                              {/* Option 3 */}
                              <div className="bg-[#1a2638]/50 border border-white/5 rounded-xl p-3 flex flex-col justify-between h-48 relative overflow-hidden">
                                <div className="flex justify-between items-center z-10">
                                  <strong className="text-sm font-semibold text-white">Limousine</strong>
                                  <span className="text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded-full text-[#bdc8d1]">12 phút</span>
                                </div>
                                <img src={limousineImg} alt="Limousine" className="absolute inset-0 w-full h-full object-cover opacity-45 pointer-events-none" />
                                <div className="flex justify-between items-end z-10 pt-24">
                                  <span className="text-[10px] text-[#bdc8d1]">Executive</span>
                                  <strong className="text-sm font-bold text-white font-mono">450k VND</strong>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Dining Options Section */}
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-xs font-bold uppercase text-[#8ed5ff]">
                              <span className="material-symbols-outlined text-[16px]">restaurant</span>
                              Lựa chọn ẩm thực
                            </div>
                            <div className="bg-[#1a2638]/50 border border-white/5 rounded-xl p-3 flex items-center justify-between relative overflow-hidden h-28">
                              <img src={diningImg} alt="Dining Option" className="absolute inset-0 w-full h-full object-cover opacity-35 pointer-events-none" />
                              <div className="z-10 flex gap-3 items-center">
                                <div className="w-16 h-16 rounded bg-[#051424]/60 border border-white/10 overflow-hidden flex items-center justify-center">
                                  <span className="material-symbols-outlined text-[#8ed5ff] text-[24px]">restaurant_menu</span>
                                </div>
                                <div>
                                  <strong className="text-sm font-semibold text-white block">L'Osteria Moderna</strong>
                                  <span className="text-xs text-[#bdc8d1] block mt-0.5">Central District • Món Ý • $$$</span>
                                  <div className="flex gap-2 mt-2">
                                    <span className="px-2 py-0.5 bg-white/5 text-[10px] text-[#bdc8d1] rounded">7:30 PM</span>
                                    <span className="px-2 py-0.5 bg-[#38bdf8]/20 border border-[#38bdf8]/40 text-[10px] text-[#38bdf8] rounded font-bold">8:00 PM</span>
                                    <span className="px-2 py-0.5 bg-white/5 text-[10px] text-[#bdc8d1] rounded">8:30 PM</span>
                                  </div>
                                </div>
                              </div>
                              <div className="z-10 text-right pr-2">
                                <span className="text-[#fbbf24] font-bold text-sm flex items-center gap-1">★ 4.8</span>
                              </div>
                            </div>
                          </div>

                          {/* Interactive action buttons */}
                          <div className="flex gap-3 pt-2">
                            <button
                              type="button"
                              onClick={handleBookMockCombo}
                              className="px-5 py-2 bg-[#38bdf8] hover:bg-[#8ed5ff] text-[#001e2c] font-bold text-xs rounded-lg transition-colors"
                            >
                              Đặt xe Premium & bàn lúc 20:00
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSend("Show other Italian restaurants in Central District")}
                              className="px-4 py-2 border border-white/10 hover:bg-white/5 text-white font-semibold text-xs rounded-lg transition-colors"
                            >
                              Xem nhà hàng khác
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-[#bdc8d1] mt-1 self-start">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-3 max-w-[85%] self-start">
                  <div className="w-8 h-8 rounded-full bg-[#1b293d] flex items-center justify-center border border-[#38bdf8]/30 text-[#38bdf8] self-start mt-1">
                    <Zap size={14} />
                  </div>
                  <div className="glass-pane p-3.5 rounded-2xl rounded-tl-none text-sm flex items-center gap-2">
                    <Loader2 className="spinner animate-spin" size={16} />
                    <span>Đang xử lý...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {showScrollBottom && (
              <button
                type="button"
                onClick={scrollToBottom}
                className="absolute bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-[#38bdf8] text-[#001e2c] hover:bg-[#8ed5ff] font-bold text-xs rounded-full shadow-lg flex items-center gap-1.5 transition-all z-10"
              >
                <ChevronDown size={14} />
                <span>Tin nhắn mới nhất</span>
              </button>
            )}

            {/* Input Form with plus, microphone and suggestions */}
            <div className="p-4 border-t border-white/5 bg-[#122131]/20">
              <div className="flex flex-wrap gap-2 mb-3">
                {MOCK_SUGGESTIONS.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => setInput(suggestion)}
                    className="px-3.5 py-1.5 bg-[#273647]/50 border border-white/5 hover:bg-[#273647] text-xs text-[#d4e4fa] rounded-full transition-colors flex items-center gap-1"
                  >
                    <Zap size={12} className="text-[#8ed5ff]" />
                    {suggestion}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend(input);
                }}
                className="flex gap-2 items-center bg-[#051424]/60 border border-[#3e484f] focus-within:border-[#38bdf8] rounded-xl px-4 py-1"
              >
                <button type="button" className="text-[#bdc8d1] hover:text-white mr-2">
                  <span className="material-symbols-outlined text-[20px] font-bold">add</span>
                </button>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Nhập yêu cầu hoặc hỏi trợ lý AI của bạn..."
                  disabled={loading}
                  className="flex-1 bg-transparent py-3 text-sm text-white focus:outline-none placeholder-[#bdc8d1]"
                />
                <button type="button" className="text-[#bdc8d1] hover:text-white mx-2">
                  <span className="material-symbols-outlined text-[20px]">mic</span>
                </button>
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="w-8 h-8 bg-[#38bdf8] hover:bg-[#8ed5ff] text-[#001e2c] rounded-lg flex items-center justify-center transition-colors disabled:opacity-50"
                  aria-label="Send"
                >
                  <span className="material-symbols-outlined text-[18px] font-bold">send</span>
                </button>
              </form>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="bg-[#051424] text-[#d4e4fa] antialiased overflow-hidden flex h-screen font-['Inter',sans-serif]">
      {/* Dynamic left sidebar matching mockup exactly */}
      <aside className="hidden md:flex bg-[#122131]/40 backdrop-blur-2xl text-[#8ed5ff] flex-col pt-12 pb-8 w-64 border-r border-white/10 shadow-2xl shrink-0 h-full">
        {/* Logo brand */}
        <div className="px-6 mb-8">
          <h2 className="font-['Outfit',sans-serif] text-xl font-black text-white tracking-wide">Aetheris AI</h2>
          <div className="mt-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#273647] flex items-center justify-center border border-[#8ed5ff]/30 text-[#8ed5ff]">
              <span className="material-symbols-outlined">person</span>
            </div>
            <div>
              <p className="font-['Outfit',sans-serif] text-sm font-semibold text-white">Alex Chen</p>
              <p className="text-[10px] text-[#bdc8d1]">Thành viên Premium</p>
            </div>
          </div>
        </div>

        {/* Menu Navigation */}
        <nav className="flex-1 px-2 space-y-1 overflow-y-auto">
          <button
            onClick={() => setActiveTab("chat")}
            className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg text-left transition-colors text-sm font-semibold ${
              activeTab === "chat" ? "bg-[#38bdf8]/10 text-[#8ed5ff]" : "text-[#bdc8d1] hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className="material-symbols-outlined">forum</span>
            Chat trợ lý
          </button>
          <button
            onClick={() => setActiveTab("explore")}
            className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg text-left transition-colors text-sm font-semibold ${
              activeTab === "explore" ? "bg-[#38bdf8]/10 text-[#8ed5ff]" : "text-[#bdc8d1] hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className="material-symbols-outlined">explore</span>
            Khám phá dịch vụ
          </button>
          <button
            onClick={() => setActiveTab("tracking")}
            className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg text-left transition-colors text-sm font-semibold ${
              activeTab === "tracking" ? "bg-[#38bdf8]/10 text-[#8ed5ff]" : "text-[#bdc8d1] hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className="material-symbols-outlined">local_shipping</span>
            Theo dõi đơn hàng
          </button>
          <button
            onClick={() => setActiveTab("memory")}
            className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg text-left transition-colors text-sm font-semibold ${
              activeTab === "memory" ? "bg-[#38bdf8]/10 text-[#8ed5ff]" : "text-[#bdc8d1] hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className="material-symbols-outlined">psychology</span>
            Bộ nhớ AI
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg text-left transition-colors text-sm font-semibold ${
              activeTab === "history" ? "bg-[#38bdf8]/10 text-[#8ed5ff]" : "text-[#bdc8d1] hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className="material-symbols-outlined">history</span>
            Lịch sử
          </button>
          <button
            onClick={() => setActiveTab("profile")}
            className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg text-left transition-colors text-sm font-semibold ${
              activeTab === "profile" ? "bg-[#38bdf8]/10 text-[#8ed5ff]" : "text-[#bdc8d1] hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className="material-symbols-outlined">manage_accounts</span>
            Cài đặt hồ sơ
          </button>
        </nav>

        {/* Footer actions */}
        <div className="px-4 mt-auto space-y-4 pt-4 border-t border-white/5">
          <button className="w-full py-2.5 bg-[#2c3a4c]/50 border border-white/10 rounded-xl hover:bg-[#38bdf8]/20 text-[#8ed5ff] transition-all flex items-center justify-center gap-2 text-xs font-semibold">
            <span className="material-symbols-outlined text-[16px]">support_agent</span>
            Hỗ trợ trực tiếp
          </button>
          <button
            onClick={onLogout}
            className="w-full py-2 flex items-center gap-4 text-[#bdc8d1] hover:text-[#ffb4ab] transition-colors text-left px-4 text-xs font-semibold"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Content wrapper */}
      <div className="flex-grow h-full flex flex-col overflow-hidden">
        {renderContent()}
      </div>

      {/* Payment OTP Modal */}
      {showAuthModal && (selectedCombo || pendingTicket) && (
        <div className="fixed inset-0 bg-[#010f1f]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-pane w-full max-w-md rounded-2xl overflow-hidden shadow-2xl bg-[#122131]">
            <div className="flex justify-between items-center p-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Lock size={18} className="text-[#8ed5ff]" />
                <h3 className="font-bold text-white">Xác thực Thanh toán</h3>
              </div>
              <button onClick={() => setShowAuthModal(false)} className="text-[#bdc8d1] hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-[#051424]/60 p-4 rounded-xl border border-white/5">
                <strong className="text-sm text-white block">
                  {selectedCombo ? selectedCombo.title : `${pendingTicket?.provider} (${pendingTicket?.origin} ➔ ${pendingTicket?.destination})`}
                </strong>
                <span className="text-xl font-bold font-mono text-[#8ed5ff] mt-1 block">
                  {(selectedCombo ? selectedCombo.comboPrice : (pendingTicket?.price || 0)).toLocaleString()}đ
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-[#bdc8d1] block">Chọn Phương thức Thanh toán</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["momo", "card", "bank_transfer"] as PaymentMethod[]).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setAuthMethod(method)}
                      className={`py-2 text-xs font-semibold rounded-lg border transition-colors ${
                        authMethod === method ? "bg-[#38bdf8]/20 text-[#8ed5ff] border-[#38bdf8]" : "bg-white/5 text-[#bdc8d1] border-white/5 hover:bg-white/10"
                      }`}
                    >
                      {paymentLabels[method]}
                    </button>
                  ))}
                </div>
              </div>

              {authMethod === "momo" && (
                <div className="bg-[#051424]/40 border border-white/5 p-4 rounded-lg space-y-2">
                  <span className="text-xs bg-[#ffb4ab]/10 border border-[#ffb4ab]/20 text-[#ffb4ab] px-2 py-0.5 rounded uppercase font-bold">Momo OTP Link</span>
                  <p className="text-xs text-[#bdc8d1]">Nhập mã OTP 6 chữ số được gửi tới số điện thoại ví của bạn (Mã demo: <strong className="text-white">888999</strong>):</p>
                  <input
                    type="text"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="Mã OTP (888999)"
                    maxLength={6}
                    className="w-full bg-[#051424]/60 border border-[#3e484f] rounded-lg px-3 py-2 text-sm text-center text-white tracking-widest font-mono focus:outline-none focus:border-[#38bdf8]"
                  />
                </div>
              )}

              {authMethod === "card" && (
                <div className="bg-[#051424]/40 border border-white/5 p-4 rounded-lg space-y-2">
                  <span className="text-xs bg-[#8ed5ff]/10 border border-[#38bdf8]/20 text-[#8ed5ff] px-2 py-0.5 rounded uppercase font-bold">3D-Secure OTP</span>
                  <p className="text-xs text-[#bdc8d1]">Cửa sổ xác thực giao dịch trực tuyến từ Ngân hàng. Nhập mã OTP bảo mật:</p>
                  <input
                    type="password"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="Mã OTP 3D-Secure"
                    maxLength={6}
                    className="w-full bg-[#051424]/60 border border-[#3e484f] rounded-lg px-3 py-2 text-sm text-center text-white tracking-widest font-mono focus:outline-none focus:border-[#38bdf8]"
                  />
                </div>
              )}

              {authMethod === "bank_transfer" && (
                <div className="bg-[#051424]/40 border border-white/5 p-4 rounded-lg space-y-2 text-center">
                  <QrCode size={36} className="text-[#8ed5ff] mx-auto" />
                  <p className="text-xs text-[#bdc8d1]">Quét mã VietQR bên dưới. Giao dịch sẽ tự động được ghi nhận sau khi khớp chuyển khoản.</p>
                  <div className="bg-white/5 p-4 rounded border border-white/5 font-mono text-[10px] text-[#8ed5ff]">
                    [ MÃ VIETQR CODE DEMO ]
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 p-4 border-t border-white/5 bg-[#051424]/30">
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="flex-1 py-2 text-xs font-semibold border border-white/10 hover:bg-white/5 text-[#bdc8d1] rounded-lg transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmOtpPayment}
                disabled={isVerifying || !otpCode.trim()}
                className="flex-1 py-2 bg-[#38bdf8] hover:bg-[#8ed5ff] text-[#001e2c] rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {isVerifying ? <Loader2 size={14} className="spinner animate-spin" /> : <ShieldCheck size={14} />}
                {isVerifying ? "Đang xác thực..." : "Xác nhận OTP"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
