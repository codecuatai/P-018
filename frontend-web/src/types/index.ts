export type ServiceType = "bus" | "flight" | "train" | "car" | "hotel" | "delivery" | "other";

export interface UserProfile {
  fullName: string;
  phone: string;
  email: string;
  idNumber: string; // CCCD / Passport
  dob: string; // YYYY-MM-DD
  gender: "male" | "female" | "other" | "";
  address: string;
  nationality: string;
  idIssueDate: string; // YYYY-MM-DD
  idIssuePlace: string;
}


export type BookingStatus = "pending_confirmation" | "confirmed" | "cancelled" | "completed";

export interface ServiceTicket {
  id: string;
  type: ServiceType;
  origin: string;
  destination: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  price: number;
  seats: string | number;
  provider: string;
}

export interface Message {
  id: string;
  role: "user" | "bot";
  text: string;
  timestamp: string;
  ticket?: ServiceTicket; // If the bot proposes a ticket
}

export interface BookingHistory extends ServiceTicket {
  bookingId: string;
  bookedAt: string;
  status: BookingStatus;
  rating?: number;
}
