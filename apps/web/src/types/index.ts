export type ServiceType = "bus" | "flight" | "train" | "car" | "hotel" | "delivery" | "other";

export interface UserProfile {
  fullName: string;
  phone: string;
  email: string;
  idNumber: string; // CCCD / Passport
  dob: string; // YYYY-MM-DD
  gender: "male" | "female" | "other" | "";
  address: string;
  city: string;
  district: string;
  nationality: string;
  idIssueDate: string; // YYYY-MM-DD
  idIssuePlace: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelation: string;
  preferredPayment: PaymentMethod | "";
  preferredCabin: "economy" | "premium" | "business" | "";
  specialRequests: string;
  notifyEmail: boolean;
  notifySms: boolean;
  notifyReminder: boolean;
  // Payment connection simulated fields
  momoPhone?: string;
  momoAccountName?: string;
  momoLinked?: boolean;
  maskedCard?: string;
  paymentMethodToken?: string;
  cardHolder?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
}

export type UserRole = "admin" | "operator" | "customer" | "provider";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload extends AuthCredentials {
  fullName: string;
  role: UserRole;
}

export interface AdminDashboardSummary {
  totalBookings: number;
  confirmedBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  paidRevenue: number;
  refundedAmount: number;
  averageRating: number;
  activeUsers: number;
  serviceBreakdown: Array<{
    type: ServiceType;
    count: number;
  }>;
  recentBookings: BookingHistory[];
}


export type BookingStatus = "pending_confirmation" | "confirmed" | "cancelled" | "completed";
export type PaymentStatus = "unpaid" | "paid" | "refunded";
export type PaymentMethod = "momo" | "bank_transfer" | "card";

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
  duration?: string;
  note?: string;
  baggage?: string;
  refundPolicy?: string;
}

export interface ComboPackage {
  id: string;
  title: string;
  badge: string;
  discountPercent: number;
  originalPrice: number;
  comboPrice: number;
  flight: ServiceTicket;
  hotel: ServiceTicket;
  highlights: string[];
}

export interface RescheduleOption {
  oldTicket: ServiceTicket;
  newTicket: ServiceTicket;
  priceDifference: number; // Positive = pay extra, negative = refund
  refundAmount: number;
  refundPolicy: string;
}

export interface RideVehicleOption {
  id: string;
  name: string;
  category: "4-seats" | "7-seats" | "limousine";
  seats: string;
  price: number;
  eta: string;
  vehicleModel: string;
  highlights: string[];
  driverName?: string;
  licensePlate?: string;
  driverPhone?: string;
}

export interface SupportTicketContext {
  ticketId: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  category: string;
  operatorName?: string;
  operatorAvatar?: string;
  status: "open" | "assigned" | "resolved";
}

export interface Message {
  id: string;
  role: "user" | "bot";
  text: string;
  timestamp: string;
  ticket?: ServiceTicket; // If the bot proposes a ticket
  comboPackages?: ComboPackage[];
  rescheduleComparison?: RescheduleOption;
  handoffInfo?: SupportTicketContext;
  rideOptions?: RideVehicleOption[];
  demoFlow?: DemoFlowResult;
  customCombo?: boolean;
}

export type DemoFlowKind = "ride" | "medical_ride" | "partial_failure" | "human_handoff";
export type DemoStepStatus = "done" | "active" | "warning" | "blocked" | "pending";

export interface DemoFlowStep {
  label: string;
  detail: string;
  status: DemoStepStatus;
}

export interface DemoFlowArtifact {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
}

export interface DemoFlowAction {
  label: string;
  prompt: string;
  tone?: "primary" | "secondary" | "danger";
}

export interface DemoFlowResult {
  kind: DemoFlowKind;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusTone: "success" | "warning" | "danger" | "info";
  steps: DemoFlowStep[];
  artifacts: DemoFlowArtifact[];
  actions: DemoFlowAction[];
}

export interface BookingHistory extends ServiceTicket {
  bookingId: string;
  bookedAt: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod;
  rating?: number;
  customerName?: string;
  customerPhone?: string;
}
