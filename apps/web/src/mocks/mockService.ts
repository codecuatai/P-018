import {
  AdminDashboardSummary,
  AuthCredentials,
  AuthUser,
  BookingHistory,
  DemoFlowResult,
  Message,
  PaymentMethod,
  RegisterPayload,
  ServiceTicket,
  UserProfile,
} from "../types";
import { MOCK_TICKETS, MOCK_COMBOS, MOCK_RIDE_OPTIONS, INITIAL_HISTORY } from "./mockData";

// Simulate network delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const USERS_KEY = "navigo_users";
const SESSION_KEY = "navigo_current_user";

type StoredUser = AuthUser & {
  password: string;
};

const DEFAULT_USERS: StoredUser[] = [
  {
    id: "usr-admin-demo",
    fullName: "Admin NaviGo",
    email: "admin@navigo.vn",
    password: "admin123",
    role: "admin",
  },
  {
    id: "usr-customer-demo",
    fullName: "User Demo",
    email: "user@navigo.vn",
    password: "user123",
    role: "customer",
  },
];

let chatMessages: Message[] = [
  {
    id: "msg-0",
    role: "bot",
    text: "Xin chào! Tôi có thể giúp bạn đặt vé xe hoặc vé máy bay. Bạn muốn đi đâu?",
    timestamp: new Date().toISOString(),
  }
];

let bookingHistory: BookingHistory[] = [...INITIAL_HISTORY];

const getStoredUsers = (): StoredUser[] => {
  const data = localStorage.getItem(USERS_KEY);
  if (!data) {
    localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
    return [...DEFAULT_USERS];
  }

  return JSON.parse(data);
};

const saveStoredUsers = (users: StoredUser[]) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

const stripPassword = (user: StoredUser): AuthUser => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
});

export const DEMO_PROFILE: UserProfile = {
  fullName: "Nguyễn Minh Anh",
  phone: "0901234567",
  email: "demo@navigo.vn",
  idNumber: "012345678901",
  dob: "1995-04-12",
  gender: "female",
  address: "25 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh",
  city: "TP. Hồ Chí Minh",
  district: "Quận 1",
  nationality: "Việt Nam",
  idIssueDate: "2021-05-20",
  idIssuePlace: "Cục Cảnh sát quản lý hành chính về trật tự xã hội",
  emergencyName: "Nguyễn Thanh Bình",
  emergencyPhone: "0912345678",
  emergencyRelation: "Anh trai",
  preferredPayment: "momo",
  preferredCabin: "economy",
  specialRequests: "Ưu tiên chỗ gần cửa sổ, cần nhắc lịch trước chuyến đi.",
  notifyEmail: true,
  notifySms: true,
  notifyReminder: true,
  momoPhone: "0901234567",
  momoAccountName: "NGUYEN MINH ANH",
  momoLinked: true,
  cardNumber: "4123 4567 8901 2345",
  cardHolder: "NGUYEN MINH ANH",
  cardExpiry: "12/28",
  cardCvv: "888",
  bankName: "Vietcombank",
  bankAccountNumber: "10123456789",
  bankAccountName: "NGUYEN MINH ANH",
  cashNote: "Thanh toán bằng tiền mặt hoặc quẹt thẻ tại quầy giao dịch / điểm đón NaviGo.",
};

export const isProfileComplete = (profile: UserProfile | null) => {
  return Boolean(
    profile?.fullName &&
      profile.phone &&
      profile.email &&
      profile.idNumber &&
      profile.dob &&
      profile.nationality &&
      profile.address &&
      profile.city &&
      profile.emergencyName &&
      profile.emergencyPhone &&
      profile.preferredPayment,
  );
};

const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const findTicketForMessage = (text: string): ServiceTicket | undefined => {
  const lowerText = normalizeText(text);

  if (lowerText.includes("hai phong")) {
    return MOCK_TICKETS.find((ticket) => ticket.destination === "Hải Phòng");
  }

  if (lowerText.includes("da nang") && (lowerText.includes("may bay") || lowerText.includes("bay"))) {
    return MOCK_TICKETS.find((ticket) => ticket.destination === "Đà Nẵng" && ticket.type === "flight");
  }

  if (lowerText.includes("da nang") && (lowerText.includes("khach san") || lowerText.includes("hotel"))) {
    return MOCK_TICKETS.find((ticket) => ticket.type === "hotel");
  }

  if (lowerText.includes("da nang")) {
    return MOCK_TICKETS.find((ticket) => ticket.destination === "Đà Nẵng" && ticket.type === "bus");
  }

  if (lowerText.includes("sai gon") || lowerText.includes("ho chi minh")) {
    return MOCK_TICKETS.find((ticket) => ticket.destination === "TP. Hồ Chí Minh");
  }

  if (lowerText.includes("hue") || lowerText.includes("tau")) {
    return MOCK_TICKETS.find((ticket) => ticket.type === "train");
  }

  return undefined;
};

const buildDemoFlow = (text: string): DemoFlowResult | undefined => {
  const lowerText = normalizeText(text);

  if (lowerText.includes("7.1") || (lowerText.includes("dat xe") && !lowerText.includes("kham"))) {
    return {
      kind: "ride",
      title: "7.1 Đặt xe",
      subtitle: "User request → classify intent → extract slots → ask missing → search_rides → show cards → select → confirmation summary → confirm → book_ride → payment sandbox → realtime tracking → receipt",
      statusLabel: "Sẵn sàng chạy từng bước",
      statusTone: "success",
      steps: [
        { label: "Start request", detail: "User yêu cầu đặt xe từ VinUni đến Bệnh viện Vinmec lúc 08:00.", status: "active" },
        { label: "Classify intent", detail: "Intent: book_ride, confidence 0.96.", status: "active" },
        { label: "Extract slots", detail: "Pickup VinUni, dropoff Bệnh viện Vinmec, time 08:00.", status: "active" },
        { label: "Ask missing", detail: "Thiếu loại xe; user chọn 4 chỗ tiêu chuẩn.", status: "active" },
        { label: "search_rides", detail: "Tìm thấy 3 tài xế trong bán kính 3.2km.", status: "active" },
        { label: "Show cards + select", detail: "Chọn NaviCar 4 chỗ, ETA 6 phút, giá 128.000 VND.", status: "active" },
        { label: "Confirmation summary", detail: "Hiển thị điểm đón, điểm đến, tài xế, giá, chính sách hủy.", status: "active" },
        { label: "Confirm + book_ride", detail: "Tạo chuyến RID-80421 và khóa tài xế trong sandbox.", status: "active" },
        { label: "Payment complete", detail: "Payment sandbox approved qua Ví MoMo, amount 128.000 VND.", status: "done" },
        { label: "Realtime tracking + receipt", detail: "Tài xế đang đến điểm đón, biên nhận đã sẵn sàng.", status: "done" },
      ],
      artifacts: [
        { label: "Mã chuyến", value: "RID-80421", tone: "success" },
        { label: "Tài xế", value: "Nguyễn Văn Hùng · 30F-568.21" },
        { label: "Giá tạm tính", value: "128.000 VND" },
        { label: "Tracking", value: "ETA 6 phút · đang đến điểm đón", tone: "success" },
      ],
      actions: [
        { label: "Xem receipt", prompt: "Mở biên nhận chuyến RID-80421", tone: "primary" },
        { label: "Theo dõi xe", prompt: "Theo dõi realtime chuyến RID-80421", tone: "secondary" },
      ],
    };
  }

  if (lowerText.includes("7.2") || lowerText.includes("lich kham") || lowerText.includes("khám")) {
    return {
      kind: "medical_ride",
      title: "7.2 Đặt lịch khám và xe",
      subtitle: "Request → build plan → search facility/doctor/slot → select appointment → calculate travel time → search ride → conflict check → confirm plan → book appointment → book ride → return linked orders",
      statusLabel: "Sẵn sàng chạy từng bước",
      statusTone: "success",
      steps: [
        { label: "Start request", detail: "User yêu cầu khám tim mạch sáng mai và cần xe đưa đón.", status: "active" },
        { label: "Build plan", detail: "Kế hoạch gồm lịch khám tim mạch và xe đưa đón.", status: "active" },
        { label: "Search facility/doctor/slot", detail: "Vinmec Times City · BS. Lê Minh · 09:30.", status: "active" },
        { label: "Select appointment", detail: "Chọn slot 09:30, chuyên khoa Tim mạch.", status: "active" },
        { label: "Calculate travel time", detail: "VinUni → Vinmec: 42 phút, buffer 20 phút.", status: "active" },
        { label: "Search ride", detail: "Xe 4 chỗ đón 08:25, ETA pickup 7 phút.", status: "active" },
        { label: "Conflict check", detail: "Không xung đột, đến trước lịch khám 23 phút.", status: "active" },
        { label: "Confirm plan", detail: "User xác nhận cả lịch khám và xe đưa đón.", status: "active" },
        { label: "Book linked orders", detail: "Appointment APT-22018 và Ride RID-22018 được liên kết.", status: "active" },
        { label: "Payment complete", detail: "Thanh toán sandbox thành công cho cả lịch khám và xe.", status: "done" },
      ],
      artifacts: [
        { label: "Lịch khám", value: "APT-22018 · Tim mạch · 09:30", tone: "success" },
        { label: "Xe đưa đón", value: "RID-22018 · Đón 08:25 · NaviCar" },
        { label: "Linked order", value: "PLAN-22018", tone: "success" },
        { label: "Conflict check", value: "Passed · buffer 23 phút", tone: "success" },
      ],
      actions: [
        { label: "Xem plan", prompt: "Mở kế hoạch PLAN-22018", tone: "primary" },
        { label: "Đổi giờ đón", prompt: "Tôi muốn đổi giờ đón của RID-22018", tone: "secondary" },
      ],
    };
  }

  if (lowerText.includes("7.3") || lowerText.includes("partial failure") || lowerText.includes("khong tim duoc xe") || lowerText.includes("không tìm được xe")) {
    return {
      kind: "partial_failure",
      title: "7.3 Partial failure",
      subtitle: "Nếu lịch khám đã đặt nhưng không tìm được xe, hệ thống giữ lịch khám, ghi rõ trạng thái và đưa ra lựa chọn xử lý. Không rollback mù quáng.",
      statusLabel: "Chạy từng bước có lỗi một phần",
      statusTone: "warning",
      steps: [
        { label: "Start request", detail: "User yêu cầu đặt lịch khám và xe đi cùng lịch.", status: "active" },
        { label: "Book appointment", detail: "Appointment APT-33072 đã đặt thành công.", status: "active" },
        { label: "Appointment payment", detail: "Thanh toán lịch khám thành công, receipt MEDPAY-33072.", status: "done" },
        { label: "Search ride", detail: "Không có xe phù hợp cho khung 07:45-08:15.", status: "blocked" },
        { label: "Persist partial state", detail: "Giữ lịch khám, không rollback. ride_status = NEEDS_ACTION.", status: "warning" },
        { label: "Offer recovery", detail: "Đưa lựa chọn: tìm xe khác, đổi giờ đón, đổi lịch khám hoặc hủy lịch.", status: "active" },
        { label: "Payment state final", detail: "Lịch khám đã thanh toán; xe chưa charge cho tới khi user chọn phương án xử lý.", status: "done" },
      ],
      artifacts: [
        { label: "Lịch khám", value: "APT-33072 · Đã giữ chỗ", tone: "success" },
        { label: "Xe", value: "NEEDS_ACTION · chưa tìm được xe", tone: "warning" },
        { label: "Rollback", value: "Không rollback lịch khám", tone: "success" },
        { label: "SLA", value: "Cần user chọn hướng xử lý", tone: "warning" },
      ],
      actions: [
        { label: "Tìm loại xe khác", prompt: "Tìm loại xe khác cho lịch khám APT-33072", tone: "primary" },
        { label: "Đổi giờ đón", prompt: "Đổi giờ đón sang 08:30 cho APT-33072", tone: "secondary" },
        { label: "Đổi lịch khám", prompt: "Đổi lịch khám APT-33072 sang khung khác", tone: "secondary" },
        { label: "Hủy lịch", prompt: "Hủy lịch khám APT-33072", tone: "danger" },
      ],
    };
  }

  if (lowerText.includes("7.4") || lowerText.includes("human handoff") || lowerText.includes("ho tro vien") || lowerText.includes("hỗ trợ viên") || lowerText.includes("dang ngo") || lowerText.includes("đáng ngờ")) {
    return {
      kind: "human_handoff",
      title: "7.4 Human handoff",
      subtitle: "Agent failure / user request / suspicious transaction → create support ticket → transfer conversation context → operator takeover → continue in same thread",
      statusLabel: "Chạy từng bước handoff",
      statusTone: "info",
      steps: [
        { label: "Start request", detail: "User yêu cầu tiếp tục thanh toán booking nhưng giao dịch có dấu hiệu bất thường.", status: "active" },
        { label: "Detect trigger", detail: "Suspicious transaction: thanh toán lặp 3 lần trong 2 phút.", status: "warning" },
        { label: "Pause payment", detail: "Agent tạm dừng thanh toán tự động để tránh charge sai.", status: "warning" },
        { label: "Create support ticket", detail: "Ticket SUP-77812 priority HIGH.", status: "active" },
        { label: "Transfer context", detail: "Đính kèm intent, slots, payment logs, booking draft.", status: "active" },
        { label: "Operator takeover", detail: "Operator Linh đã nhận phiên và xác minh giao dịch.", status: "active" },
        { label: "Continue same thread", detail: "User tiếp tục trao đổi ngay trong hội thoại này.", status: "active" },
        { label: "Payment complete", detail: "Operator xác nhận hợp lệ, payment sandbox approved, receipt PAY-77812.", status: "done" },
      ],
      artifacts: [
        { label: "Support ticket", value: "SUP-77812", tone: "success" },
        { label: "Priority", value: "HIGH · suspicious payment", tone: "danger" },
        { label: "Context bundle", value: "12 messages · 2 tool traces · 1 payment log" },
        { label: "Owner", value: "Operator Linh", tone: "success" },
      ],
      actions: [
        { label: "Tiếp tục với operator", prompt: "Tôi muốn tiếp tục với hỗ trợ viên trong ticket SUP-77812", tone: "primary" },
        { label: "Xem ticket", prompt: "Mở ticket hỗ trợ SUP-77812", tone: "secondary" },
      ],
    };
  }

  return undefined;
};

export const MockService = {
  resetChat: async (): Promise<Message[]> => {
    await delay(200);
    chatMessages = [
      {
        id: "msg-0",
        role: "bot",
        text: "Xin chào! Tôi có thể giúp bạn đặt vé xe, vé máy bay, tàu hỏa hoặc khách sạn. Bạn muốn đi đâu?",
        timestamp: new Date().toISOString(),
      },
    ];
    return [...chatMessages];
  },

  getCurrentUser: async (): Promise<AuthUser | null> => {
    await delay(200);
    const data = localStorage.getItem(SESSION_KEY);
    return data ? JSON.parse(data) : null;
  },

  login: async ({ email, password }: AuthCredentials): Promise<AuthUser> => {
    await delay(500);
    const user = getStoredUsers().find(
      (item) => item.email.toLowerCase() === email.trim().toLowerCase() && item.password === password,
    );

    if (!user) {
      throw new Error("Email hoặc mật khẩu không đúng.");
    }

    const authUser = stripPassword(user);
    localStorage.setItem(SESSION_KEY, JSON.stringify(authUser));
    return authUser;
  },

  register: async (payload: RegisterPayload): Promise<AuthUser> => {
    await delay(600);
    const users = getStoredUsers();
    const existed = users.some((item) => item.email.toLowerCase() === payload.email.trim().toLowerCase());
    if (existed) {
      throw new Error("Email này đã được đăng ký.");
    }

    const user: StoredUser = {
      id: `usr-${Date.now()}`,
      fullName: payload.fullName.trim(),
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      role: payload.role,
    };
    users.push(user);
    saveStoredUsers(users);

    const authUser = stripPassword(user);
    localStorage.setItem(SESSION_KEY, JSON.stringify(authUser));
    return authUser;
  },

  logout: async (): Promise<void> => {
    await delay(150);
    localStorage.removeItem(SESSION_KEY);
  },

  getMessages: async (): Promise<Message[]> => {
    await delay(300);
    return [...chatMessages];
  },

  sendMessage: async (text: string): Promise<Message[]> => {
    await delay(600);
    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      text,
      timestamp: new Date().toISOString(),
    };
    chatMessages.push(userMsg);

    const lowerText = normalizeText(text);
    let botMsg: Message = {
      id: `msg-${Date.now() + 1}`,
      role: "bot",
      text: "Tôi có thể hỗ trợ bạn tìm vé máy bay, xe khách, tàu hỏa, đặt phòng khách sạn hoặc gói Combo du lịch trọn gói.",
      timestamp: new Date().toISOString(),
    };

    // Flow 2: Combo booking
    if (lowerText.includes("luong 2") || lowerText.includes("combo")) {
      botMsg = {
        ...botMsg,
        text: "Tôi đã tìm thấy 2 Gói Combo Chuyến đi & Khách sạn phù hợp với chiết khấu lên đến 20%. Vui lòng chọn gói bạn muốn đặt:",
        comboPackages: MOCK_COMBOS,
      };
    }
    // Flow 3: Reschedule & Refund
    else if (lowerText.includes("luong 3") || lowerText.includes("tau hoa") || lowerText.includes("tau") || lowerText.includes("doi sang")) {
      botMsg = {
        ...botMsg,
        text: "Tôi đã tra cứu phương án đổi lịch từ Vé máy bay sang Tàu hỏa đêm đi Huế. Dưới đây là bảng so sánh giá vé và số tiền hoàn lại:",
        rescheduleComparison: {
          oldTicket: MOCK_TICKETS[2], // 1.200.000 VND
          newTicket: MOCK_TICKETS[4], // 680.000 VND
          priceDifference: -520000,
          refundAmount: 520000,
          refundPolicy: "Số tiền chênh lệch 520.000 VND sẽ được tự động hoàn lại vào tài khoản Ví MoMo của bạn.",
        },
      };
    }
    // Flow 4: Ride Booking & Vehicle Selection (Gợi ý 4)
    else if (lowerText.includes("luong 4") || lowerText.includes("luong 5") || lowerText.includes("san bay da nang") || lowerText.includes("xe dua don") || lowerText.includes("14:30")) {
      botMsg = {
        ...botMsg,
        text: "Tôi đã tra cứu hành trình từ Sân bay Đà Nẵng về Khách sạn Minh An Riverside (14:30). Dưới đây là 3 loại xe đưa đón phù hợp cho bạn lựa chọn:",
        rideOptions: MOCK_RIDE_OPTIONS,
      };
    }
    // Flow 4 Step 2: User selects specific vehicle option (NaviCar)
    else if (lowerText.includes("navicar") || lowerText.includes("toi chon loai xe") || lowerText.includes("chon xe")) {
      const is7Seats = lowerText.includes("7 cho") || lowerText.includes("premium") || lowerText.includes("xpander");
      const isLimousine = lowerText.includes("limousine") || lowerText.includes("luxury") || lowerText.includes("9 cho");
      const selectedOpt = isLimousine ? MOCK_RIDE_OPTIONS[2] : (is7Seats ? MOCK_RIDE_OPTIONS[1] : MOCK_RIDE_OPTIONS[0]);

      const carTicket: ServiceTicket = {
        id: `ride-tkt-${Date.now()}`,
        type: "car",
        origin: "Sân bay Đà Nẵng",
        destination: "Khách sạn Minh An Riverside",
        date: "2026-08-08",
        time: "14:30",
        price: selectedOpt.price,
        seats: selectedOpt.seats,
        provider: selectedOpt.name,
        duration: selectedOpt.eta,
        note: `Tài xế: ${selectedOpt.driverName || "Nguyễn Văn Hùng"} · BSK: ${selectedOpt.licensePlate || "43A-889.12"} · SĐT: ${selectedOpt.driverPhone || "0905123456"}`,
        baggage: "Miễn phí thời gian chờ 15 phút tại sảnh đón Sân bay Đà Nẵng",
        refundPolicy: "Miễn phí hủy trước giờ đón 30 phút.",
      };

      botMsg = {
        ...botMsg,
        text: `Đã ghi nhận lựa chọn ${selectedOpt.name}. Thông tin tài xế ${selectedOpt.driverName} (${selectedOpt.licensePlate}) đã được gán tự động. Vui lòng bấm "Xác nhận và thanh toán" để hoàn tất:`,
        ticket: carTicket,
      };
    }
    // Flow 1: Single Ticket (Flight ticket)
    else if (lowerText.includes("luong 1") || lowerText.includes("may bay") || lowerText.includes("da nang") || lowerText.includes("ha noi")) {
      const ticket = MOCK_TICKETS[2]; // Vietnam Airlines
      botMsg = {
        ...botMsg,
        text: `Tôi đã tìm thấy phương án ${ticket.provider} phù hợp cho hành trình ${ticket.origin} đi ${ticket.destination}. Vui lòng kiểm tra chi tiết và bấm Xác nhận và thanh toán.`,
        ticket,
      };
    } 
    // Thêm luồng Mock Y tế (Medical Booking) để test UI khi Backend lỗi
    else if (lowerText.includes("kham") || lowerText.includes("đau đầu") || lowerText.includes("dau dau") || lowerText.includes("bác sĩ") || lowerText.includes("bac si")) {
      botMsg = {
        ...botMsg,
        text: "Dựa vào triệu chứng của bạn, tôi đề xuất khám chuyên khoa Thần kinh. Dưới đây là lịch trống của bác sĩ chuyên khoa phù hợp, bạn vui lòng chọn giờ khám:",
        doctorSchedule: {
          doctorId: "doc_001",
          doctorName: "BS. Nguyễn Văn An",
          specialty: "Thần kinh",
          price: 500000,
          date: "2026-08-08",
          availableSlots: ["08:00", "09:30", "14:00", "15:30"]
        }
      };
    }
    else {
      const ticket = findTicketForMessage(text);
      if (ticket) {
        botMsg = {
          ...botMsg,
          text: `Tôi đã tìm thấy phương án ${ticket.provider} phù hợp. Vui lòng kiểm tra hành trình, giá và chính sách trước khi xác nhận.`,
          ticket,
        };
      }
    }

    chatMessages.push(botMsg);
    return [...chatMessages];
  },

  confirmBooking: async (ticket: ServiceTicket, paymentMethod: PaymentMethod = "momo"): Promise<BookingHistory> => {
    await delay(800);
    const profile = await MockService.getUserProfile();
    const newBooking: BookingHistory = {
      ...ticket,
      bookingId: `BKG-${Math.floor(Math.random() * 100000)}`,
      bookedAt: new Date().toISOString(),
      status: "confirmed",
      paymentStatus: "paid",
      paymentMethod,
      customerName: profile?.fullName,
      customerPhone: profile?.phone,
    };
    bookingHistory.unshift(newBooking);
    
    // Add bot confirmation message
    const botMsg: Message = {
      id: `msg-${Date.now()}`,
      role: "bot",
      text: `Đặt dịch vụ thành công! Mã đặt chỗ của bạn là ${newBooking.bookingId}. Thanh toán đã được ghi nhận và vé đã chuyển sang Lịch sử dịch vụ.`,
      timestamp: new Date().toISOString(),
    };
    chatMessages.push(botMsg);

    return newBooking;
  },

  getHistory: async (): Promise<BookingHistory[]> => {
    await delay(400);
    return [...bookingHistory];
  },

  getAdminDashboard: async (): Promise<AdminDashboardSummary> => {
    await delay(500);
    const users = getStoredUsers();
    const ratings = bookingHistory
      .map((booking) => booking.rating)
      .filter((rating): rating is number => typeof rating === "number");
    const serviceBreakdown = bookingHistory.reduce<AdminDashboardSummary["serviceBreakdown"]>((acc, booking) => {
      const existing = acc.find((item) => item.type === booking.type);
      if (existing) {
        existing.count += 1;
      } else {
        acc.push({ type: booking.type, count: 1 });
      }
      return acc;
    }, []);

    return {
      totalBookings: bookingHistory.length,
      confirmedBookings: bookingHistory.filter((booking) => booking.status === "confirmed").length,
      completedBookings: bookingHistory.filter((booking) => booking.status === "completed").length,
      cancelledBookings: bookingHistory.filter((booking) => booking.status === "cancelled").length,
      paidRevenue: bookingHistory
        .filter((booking) => booking.paymentStatus === "paid")
        .reduce((total, booking) => total + booking.price, 0),
      refundedAmount: bookingHistory
        .filter((booking) => booking.paymentStatus === "refunded")
        .reduce((total, booking) => total + booking.price, 0),
      averageRating: ratings.length ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length : 0,
      activeUsers: users.length,
      serviceBreakdown,
      recentBookings: [...bookingHistory]
        .sort((a, b) => new Date(b.bookedAt).getTime() - new Date(a.bookedAt).getTime())
        .slice(0, 5),
    };
  },

  cancelBooking: async (bookingId: string): Promise<boolean> => {
    await delay(600);
    const index = bookingHistory.findIndex(b => b.bookingId === bookingId);
    if (index > -1) {
      bookingHistory[index].status = "cancelled";
      bookingHistory[index].paymentStatus = "refunded";
      return true;
    }
    return false;
  },

  rateService: async (bookingId: string, rating: number): Promise<boolean> => {
    await delay(500);
    const index = bookingHistory.findIndex(b => b.bookingId === bookingId);
    if (index > -1) {
      bookingHistory[index].rating = rating;
      return true;
    }
    return false;
  },

  getUserProfile: async (): Promise<UserProfile | null> => {
    await delay(300);
    const data = localStorage.getItem("user_profile");
    if (data) {
      return JSON.parse(data);
    }
    return null;
  },

  updateUserProfile: async (profile: UserProfile): Promise<boolean> => {
    await delay(500);
    localStorage.setItem("user_profile", JSON.stringify(profile));
    return true;
  },

  saveDemoProfile: async (): Promise<UserProfile> => {
    await delay(300);
    localStorage.setItem("user_profile", JSON.stringify(DEMO_PROFILE));
    return DEMO_PROFILE;
  }
};

