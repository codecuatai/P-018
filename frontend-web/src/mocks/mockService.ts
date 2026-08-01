import { ServiceTicket, BookingHistory, Message, UserProfile } from "../types";
import { MOCK_TICKETS, INITIAL_HISTORY } from "./mockData";

// Simulate network delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let chatMessages: Message[] = [
  {
    id: "msg-0",
    role: "bot",
    text: "Xin chào! Tôi có thể giúp bạn đặt vé xe hoặc vé máy bay. Bạn muốn đi đâu?",
    timestamp: new Date().toISOString(),
  }
];

let bookingHistory: BookingHistory[] = [...INITIAL_HISTORY];

export const MockService = {
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

    // Simple keyword matching for mock response
    const lowerText = text.toLowerCase();
    let botMsg: Message = {
      id: `msg-${Date.now() + 1}`,
      role: "bot",
      text: "Vui lòng cung cấp thêm thông tin về điểm đi, điểm đến, ngày và giờ khởi hành.",
      timestamp: new Date().toISOString(),
    };

    if (lowerText.includes("hải phòng")) {
      const ticket = MOCK_TICKETS.find(t => t.destination === "Hải Phòng");
      if (ticket) {
        botMsg.text = `Tôi tìm thấy 1 chuyến đi Hải Phòng phù hợp với yêu cầu của bạn. Bạn kiểm tra thông tin dưới đây nhé:`;
        botMsg.ticket = ticket;
      }
    } else if (lowerText.includes("đà nẵng") && lowerText.includes("máy bay")) {
      const ticket = MOCK_TICKETS.find(t => t.destination === "Đà Nẵng" && t.type === "flight");
      if (ticket) {
        botMsg.text = `Dưới đây là thông tin chuyến bay đi Đà Nẵng tôi tìm được:`;
        botMsg.ticket = ticket;
      }
    } else if (lowerText.includes("đà nẵng")) {
       const ticket = MOCK_TICKETS.find(t => t.destination === "Đà Nẵng" && t.type === "bus");
       if (ticket) {
         botMsg.text = `Có 1 chuyến xe khách đi Đà Nẵng, bạn xem qua nhé:`;
         botMsg.ticket = ticket;
       }
    } else if (lowerText.includes("sài gòn") || lowerText.includes("hồ chí minh")) {
      const ticket = MOCK_TICKETS.find(t => t.destination === "TP. Hồ Chí Minh");
      if (ticket) {
        botMsg.text = `Thông tin chuyến bay đi TP. Hồ Chí Minh của bạn đây:`;
        botMsg.ticket = ticket;
      }
    }

    chatMessages.push(botMsg);
    return [...chatMessages];
  },

  confirmBooking: async (ticket: ServiceTicket): Promise<BookingHistory> => {
    await delay(800);
    const newBooking: BookingHistory = {
      ...ticket,
      bookingId: `BKG-${Math.floor(Math.random() * 100000)}`,
      bookedAt: new Date().toISOString(),
      status: "confirmed",
    };
    bookingHistory.unshift(newBooking);
    
    // Add bot confirmation message
    const botMsg: Message = {
      id: `msg-${Date.now()}`,
      role: "bot",
      text: `Đặt vé thành công! Mã đặt chỗ của bạn là ${newBooking.bookingId}. Bạn có thể kiểm tra trong phần Lịch sử.`,
      timestamp: new Date().toISOString(),
    };
    chatMessages.push(botMsg);

    return newBooking;
  },

  getHistory: async (): Promise<BookingHistory[]> => {
    await delay(400);
    return [...bookingHistory];
  },

  cancelBooking: async (bookingId: string): Promise<boolean> => {
    await delay(600);
    const index = bookingHistory.findIndex(b => b.bookingId === bookingId);
    if (index > -1) {
      bookingHistory[index].status = "cancelled";
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
  }
};

