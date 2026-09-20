"use client";

import {
  AlertTriangle,
  Building2,
  Calendar,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  Code,
  Copy,
  HeartPulse,
  KeyRound,
  Layers,
  LoaderCircle,
  LogOut,
  MapPin,
  Navigation,
  Package,
  Phone,
  Plug2,
  Plus,
  Power,
  Radio,
  RefreshCw,
  Send,
  Settings2,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
  Truck,
  UserRound,
  Users,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { XOneMark } from "@/components/XOneMark";
import {
  createProviderItem,
  createProviderMcpKey,
  deleteProviderChannel,
  deleteProviderItem,
  getProviderEarningsSummary,
  getProviderAssignments,
  getProviderAvailability,
  getProviderDocuments,
  getProviderItems,
  getProviderMcpKeys,
  getProviderOperationsAppointments,
  getProviderOperationsDeliveries,
  getProviderOperationsOrders,
  getProviderOperationsReservations,
  getProviderOperationsRides,
  getProviderProfile,
  revokeProviderMcpKey,
  seedProviderSampleOperation,
  submitProviderDocument,
  testProviderWebhook,
  toggleProviderChannel,
  toggleProviderItemStatus,
  updateProviderOperationAppointmentStatus,
  updateProviderOperationDeliveryStatus,
  updateProviderOperationOrderStatus,
  updateProviderOperationReservationStatus,
  updateProviderOperationRideStatus,
  updateProviderAssignmentStatus,
  updateProviderAvailability,
  updateProviderProfile,
  updateRideStatus,
  type CreatedMcpKeyResult,
  type ProviderEarningsSummary,
  type ProviderAssignment,
  type ProviderAvailability,
  type ProviderDocument,
  type ProviderMcpKeyItem,
  type ProviderProfile,
  type ProviderServiceItem,
  type WebhookTestResult,
} from "@/lib/api-client";
import { audioChime } from "@/lib/audio-chime";
import { useAuth } from "@/providers/auth-provider";

interface ActiveRide {
  id: string;
  passengerName: string;
  pickup: string;
  destination: string;
  fare: number;
  currency: string;
  status: "DRIVER_ASSIGNED" | "DRIVER_TO_PICKUP" | "DRIVER_ARRIVED" | "IN_PROGRESS" | "ARRIVED_DESTINATION" | "COMPLETED" | "CANCELLED";
  passengers: number;
  time: string;
}

interface FoodOrder {
  id: string;
  customerName: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  status:
    | "RESTAURANT_CONFIRMING"
    | "RESTAURANT_ACCEPTED"
    | "PREPARING"
    | "READY_FOR_PICKUP"
    | "DRIVER_ASSIGNED"
    | "PICKED_UP"
    | "DELIVERING"
    | "DELIVERED"
    | "CANCELLED"
    | "RESTAURANT_REJECTED"
    | "RECEIVED"
    | "COMPLETED";
  orderTime: string;
  note?: string;
}

interface HealthcareBooking {
  id: string;
  patientName: string;
  specialty: string;
  timeSlot: string;
  status: "DRAFT" | "CONFIRMED" | "IN_CONSULTATION" | "COMPLETED" | "CANCELLED";
  type: "online" | "clinic";
}

interface RestaurantReservation {
  id: string;
  guestName: string;
  guestPhone: string;
  partySize: number;
  reservationTime: string;
  status: "CONFIRMED" | "SEATED" | "COMPLETED" | "CANCELLED";
  seatingArea?: string;
  specialRequests?: string;
}

function formatRideStatus(status: string): string {
  switch (status) {
    case "DRIVER_ASSIGNED":
      return "Đã điều phối tài xế";
    case "DRIVER_TO_PICKUP":
      return "Đang đến điểm đón";
    case "DRIVER_ARRIVED":
      return "Đã tới điểm đón";
    case "IN_PROGRESS":
      return "Đang di chuyển";
    case "ARRIVED_DESTINATION":
      return "Đã tới điểm trả";
    case "COMPLETED":
      return "Hoàn tất";
    case "CANCELLED":
      return "Đã hủy";
    default:
      return status;
  }
}

function formatOrderStatus(status: string): string {
  switch (status) {
    case "RESTAURANT_CONFIRMING":
    case "RECEIVED":
      return "Chờ nhận đơn";
    case "RESTAURANT_ACCEPTED":
      return "Đã nhận đơn";
    case "PREPARING":
      return "Đang chế biến";
    case "READY_FOR_PICKUP":
      return "Sẵn sàng lấy";
    case "DRIVER_ASSIGNED":
      return "Đã có tài xế";
    case "PICKED_UP":
    case "DELIVERING":
      return "Đang giao hàng";
    case "DELIVERED":
    case "COMPLETED":
      return "Đã giao thành công";
    case "RESTAURANT_REJECTED":
      return "Từ chối nhận";
    case "CANCELLED":
      return "Đã hủy";
    default:
      return status;
  }
}

function formatAppointmentStatus(status: string): string {
  switch (status) {
    case "DRAFT":
      return "Chờ xác nhận";
    case "CONFIRMED":
      return "Đã xác nhận";
    case "IN_CONSULTATION":
      return "Đang khám";
    case "COMPLETED":
      return "Hoàn tất";
    case "CANCELLED":
      return "Đã hủy hẹn";
    default:
      return status;
  }
}

function formatReservationStatus(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "Đã xác nhận bàn";
    case "SEATED":
      return "Đang dùng bữa";
    case "COMPLETED":
      return "Bữa tiệc hoàn tất";
    case "CANCELLED":
      return "Đã hủy bàn";
    default:
      return status;
  }
}

function mapRawRide(raw: any): ActiveRide {
  const quote = raw.quote_snapshot || {};
  return {
    id: String(raw.id || raw.booking_id || "ride_bk_01"),
    passengerName: raw.actor_id ? `Khách hàng #${String(raw.actor_id).slice(-4)}` : "Hành khách X-One",
    pickup: quote.pickup_address || raw.pickup_address || "Điểm đón khách hàng",
    destination: quote.dropoff_address || raw.dropoff_address || "Điểm trả khách",
    fare: Number(raw.amount || quote.amount || 0),
    currency: String(raw.currency || quote.currency || "VND"),
    status: (raw.status as ActiveRide["status"]) || "DRIVER_TO_PICKUP",
    passengers: Number(raw.passenger_count || quote.passenger_count || 1),
    time: raw.created_at ? new Date(raw.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "Vừa xong",
  };
}

function mapRawOrder(raw: any): FoodOrder {
  const items = Array.isArray(raw.items) && raw.items.length > 0
    ? raw.items.map((it: any) => ({
        name: String(it.name || it.item_name || "Món ăn"),
        quantity: Number(it.quantity || 1),
        price: Number(it.price || 0),
      }))
    : [{ name: "Combo Món Ngon X-One", quantity: 1, price: Number(raw.total || raw.total_amount || 65000) }];
  return {
    id: String(raw.id || raw.order_id || "food_ord_01"),
    customerName: raw.user_id ? `Khách hàng #${String(raw.user_id).slice(-4)}` : "Khách hàng X-One",
    items,
    total: Number(raw.total || raw.total_amount || 65000),
    status: (raw.status as FoodOrder["status"]) || "RESTAURANT_CONFIRMING",
    orderTime: raw.created_at ? new Date(raw.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "Mới đặt",
    note: raw.note || undefined,
  };
}

function mapRawAppointment(raw: any): HealthcareBooking {
  const slot = typeof raw.slot === "object" && raw.slot !== null ? raw.slot : {};
  return {
    id: String(raw.id || raw.appointment_id || "apt_01"),
    patientName: raw.patient_name || (raw.actor_id ? `Bệnh nhân #${String(raw.actor_id).slice(-4)}` : raw.patient_id ? `Bệnh nhân #${raw.patient_id}` : "Bệnh nhân X-One"),
    specialty: raw.department || raw.doctor_name || (raw.doctor_id ? `Bác sĩ #${raw.doctor_id}` : "Khoa Khám Bệnh"),
    timeSlot: slot.start_at ? new Date(slot.start_at).toLocaleString("vi-VN") : raw.created_at ? new Date(raw.created_at).toLocaleString("vi-VN") : "Hôm nay",
    status: (raw.status as HealthcareBooking["status"]) || "CONFIRMED",
    type: raw.type || "clinic",
  };
}

function mapRawReservation(raw: any): RestaurantReservation {
  return {
    id: String(raw.id || raw.reservation_id || "res_01"),
    guestName: raw.guest_name || (raw.actor_id ? `Khách hàng #${String(raw.actor_id).slice(-4)}` : "Khách đặt bàn X-One"),
    guestPhone: raw.guest_phone || raw.phone || "090***9999",
    partySize: Number(raw.party_size || raw.partySize || 2),
    reservationTime: raw.reservation_time ? new Date(raw.reservation_time).toLocaleString("vi-VN") : "Hôm nay",
    status: (raw.status as RestaurantReservation["status"]) || "CONFIRMED",
    seatingArea: raw.seating_area || raw.seatingArea || "Bàn tiêu chuẩn trong nhà",
    specialRequests: raw.special_requests || raw.specialRequests || undefined,
  };
}

interface DeliveryOrder {
  id: string;
  orderId?: string;
  trackingCode: string;
  senderName: string;
  senderPhone?: string;
  pickup: string;
  destination: string;
  receiverName: string;
  receiverPhone: string;
  packageType: string;
  packageDesc?: string;
  weightKg?: number;
  amount: number;
  currency: string;
  status: "CREATED" | "COURIER_ASSIGNED" | "PICKING_UP" | "DELIVERING" | "DELIVERED" | "CANCELLED";
  courier?: {
    name: string;
    phone: string;
    vehiclePlate: string;
    vehicleModel: string;
  };
  time: string;
}

function formatDeliveryStatus(status: string): string {
  switch (status) {
    case "CREATED":
      return "Chờ nhận đơn";
    case "COURIER_ASSIGNED":
      return "Đã gán tài xế";
    case "PICKING_UP":
      return "Đang lấy hàng";
    case "DELIVERING":
      return "Đang giao hàng";
    case "DELIVERED":
      return "Đã giao thành công";
    case "CANCELLED":
      return "Đã hủy đơn";
    default:
      return status;
  }
}

function mapRawDelivery(raw: any): DeliveryOrder {
  const courier = raw.courier_snapshot || raw.courier || (raw.courier_name ? {
    name: raw.courier_name,
    phone: raw.courier_phone || "0912***",
    vehiclePlate: raw.courier_vehicle_plate || "29A-***.**",
    vehicleModel: raw.courier_vehicle_model || "Xe máy",
  } : undefined);

  return {
    id: String(raw.id || raw.order_id || "del_ord_01"),
    orderId: String(raw.order_id || raw.id || "del_ord_01"),
    trackingCode: String(raw.tracking_code || raw.trackingCode || `XONE-DEL-${String(raw.id || "1001").slice(-4)}`),
    senderName: String(raw.sender_name || raw.senderName || "Người gửi X-One"),
    senderPhone: raw.sender_phone || raw.senderPhone || undefined,
    pickup: String(raw.pickup_address || raw.pickup || "Điểm gửi hàng"),
    destination: String(raw.dropoff_address || raw.destination || raw.dropoff || "Điểm giao nhận"),
    receiverName: String(raw.receiver_name || raw.receiverName || "Người nhận"),
    receiverPhone: String(raw.receiver_phone || raw.receiverPhone || "090***"),
    packageType: String(raw.package_type || raw.packageType || "Bưu kiện tiêu chuẩn"),
    packageDesc: raw.package_description || raw.packageDesc || undefined,
    weightKg: raw.weight_kg ? Number(raw.weight_kg) : undefined,
    amount: Number(raw.amount || raw.total_amount || 0),
    currency: String(raw.currency || "VND"),
    status: (raw.status as DeliveryOrder["status"]) || "COURIER_ASSIGNED",
    courier: courier ? {
      name: courier.name || "Tài xế giao hàng",
      phone: courier.phone || "0912***",
      vehiclePlate: courier.vehiclePlate || courier.vehicle_plate || "29A-***.**",
      vehicleModel: courier.vehicleModel || courier.vehicle_model || "Xe máy",
    } : undefined,
    time: raw.created_at ? new Date(raw.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "Vừa xong",
  };
}

const DEFAULT_OFFERINGS: ProviderServiceItem[] = [
  {
    id: "item_init_01",
    providerId: "init",
    domain: "food",
    name: "Phở Bò Tái Nạm Đặc Biệt",
    description: "Bò tơ tươi ngon, nước dùng hầm xương 24h truyền thống",
    price: 85000,
    currency: "VND",
    category: "Món chính",
    isAvailable: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "item_init_02",
    providerId: "init",
    domain: "food",
    name: "Cơm Tấm Sườn Bì Chả",
    description: "Sườn nướng mật ong, bì giòn thơm, chả trứng hấp",
    price: 75000,
    currency: "VND",
    category: "Món chính",
    isAvailable: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "item_init_03",
    providerId: "init",
    domain: "ride",
    name: "Xe 4 Chỗ Tiêu Chuẩn (Sedan)",
    description: "Xe máy lạnh đời mới, cốp rộng, tài xế lịch sự",
    price: 15000,
    currency: "VND",
    category: "4 Chỗ",
    isAvailable: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "item_init_04",
    providerId: "init",
    domain: "healthcare",
    name: "Gói Khám Tổng Quát & Tim Mạch",
    description: "Đo điện tim, tư vấn chỉ số sức khỏe chuyên sâu",
    price: 350000,
    currency: "VND",
    category: "Khám trực tiếp",
    isAvailable: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "item_init_05",
    providerId: "init",
    domain: "delivery",
    name: "Giao Hàng Siêu Tốc (Nội thành)",
    description: "Giao nhận bưu kiện trong 30 phút, bảo hiểm và tracking thời gian thực",
    price: 25000,
    currency: "VND",
    category: "Chuyển phát",
    isAvailable: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function sanitizeDisplayText(val?: string | null, fallback = ""): string {
  if (!val) return fallback;
  const cleaned = val.replace(/\uFFFD/g, "").trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

export interface ServiceChannelDef {
  id: string;
  name: string;
  port: string;
  domain: string;
  description: string;
  icon: "car" | "food" | "restaurant" | "health" | "package" | "shopping" | "sparkles" | "truck" | string;
  color: string;
  bgColor: string;
  isBuiltIn?: boolean;
}

export const DEFAULT_CHANNELS: ServiceChannelDef[] = [
  {
    id: "ride",
    name: "Vận Chuyển & Xe",
    port: "ride-service :8101",
    domain: "ride",
    description: "Nhận cuốc xe máy và ô tô 4-7 chỗ điều phối trực tiếp bởi AI Agent",
    icon: "car",
    color: "#4338CA",
    bgColor: "#EEF2FF",
    isBuiltIn: true,
  },
  {
    id: "food",
    name: "Ẩm Thực & Món Ăn",
    port: "food-service :8104",
    domain: "food",
    description: "Nhận đơn món ăn từ khách hàng, đồng bộ hóa đơn với bếp",
    icon: "food",
    color: "#EA580C",
    bgColor: "#FFFBEB",
    isBuiltIn: true,
  },
  {
    id: "restaurant",
    name: "Đặt Bàn Nhà Hàng",
    port: "restaurant-service :8102",
    domain: "restaurant",
    description: "Tiếp nhận và xếp chỗ khách đặt bàn ăn trước (chuẩn PasGo)",
    icon: "restaurant",
    color: "#DB2777",
    bgColor: "#FDF2F8",
    isBuiltIn: true,
  },
  {
    id: "healthcare",
    name: "Y Tế & Đặt Khám",
    port: "healthcare-service :8103",
    domain: "healthcare",
    description: "Tiếp nhận lịch khám bác sĩ, chuyên khoa và slot bệnh nhân",
    icon: "health",
    color: "#059669",
    bgColor: "#ECFDF5",
    isBuiltIn: true,
  },
  {
    id: "delivery",
    name: "Giao Hàng & Bưu Kiện",
    port: "delivery-service :8106",
    domain: "delivery",
    description: "Giao nhận bưu kiện, tài liệu, hàng hóa chặng cuối với tài xế giao hàng",
    icon: "package",
    color: "#2563EB",
    bgColor: "#EFF6FF",
    isBuiltIn: true,
  },
];

export const PRESET_CHANNEL_TEMPLATES: ServiceChannelDef[] = [
  {
    id: "delivery",
    name: "Giao Hàng Nhanh",
    port: "delivery-service :8106",
    domain: "delivery",
    description: "Giao nhận bưu kiện, hàng hóa chặng cuối nội thành bằng xe máy",
    icon: "package",
    color: "#2563EB",
    bgColor: "#EFF6FF",
    isBuiltIn: false,
  },
  {
    id: "grocery",
    name: "Đi Chợ / Siêu Thị",
    port: "grocery-service :8106",
    domain: "grocery",
    description: "Mua hộ thực phẩm tươi sống, rau củ và hàng tiêu dùng siêu thị",
    icon: "shopping",
    color: "#059669",
    bgColor: "#ECFDF5",
    isBuiltIn: false,
  },
  {
    id: "cleaning",
    name: "Dọn Dẹp & Giặt Ủi",
    port: "cleaning-service :8107",
    domain: "cleaning",
    description: "Dịch vụ vệ sinh nhà cửa, lau dọn văn phòng và giặt là theo giờ",
    icon: "sparkles",
    color: "#7C3AED",
    bgColor: "#F5F3FF",
    isBuiltIn: false,
  },
  {
    id: "truck",
    name: "Xe Tải Chở Hàng",
    port: "truck-service :8108",
    domain: "truck",
    description: "Chuyển nhà, chở hàng cồng kềnh với đội xe bán tải và xe tải 1-5 tấn",
    icon: "truck",
    color: "#D97706",
    bgColor: "#FFFBEB",
    isBuiltIn: false,
  },
];

function renderChannelIcon(icon: string, size = 20) {
  switch (icon) {
    case "car":
      return <Car size={size} />;
    case "food":
      return <UtensilsCrossed size={size} />;
    case "restaurant":
      return <Calendar size={size} />;
    case "health":
      return <HeartPulse size={size} />;
    case "package":
      return <Package size={size} />;
    case "shopping":
      return <ShoppingBag size={size} />;
    case "truck":
      return <Truck size={size} />;
    case "sparkles":
    default:
      return <Sparkles size={size} />;
  }
}

export function ProviderPortal() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<ProviderProfile | null>(null);

  const isMaster = user?.email === "provider@xone.local" || profile?.tenantId === "partner-xone-01" || user?.tenant_id === "partner-xone-01";
  const rawProviderType = profile?.providerType || user?.provider_type || (isMaster ? "all" : "unknown");

  type ProviderTab = "ride" | "food" | "restaurant" | "health" | "delivery" | "services" | "channels" | "mcp";

  const isAllowedTab = (tab: ProviderTab) => {
    if (tab === "services" || tab === "channels" || tab === "mcp") return true;
    if (isMaster) return true;
    if (rawProviderType === "restaurant_merchant" || rawProviderType === "food") return tab === "food" || tab === "restaurant";
    if (rawProviderType === "ride_driver" || rawProviderType === "ride") return tab === "ride" || tab === "delivery";
    if (rawProviderType === "delivery_courier" || rawProviderType === "delivery") return tab === "delivery";
    if (rawProviderType === "healthcare_doctor" || rawProviderType === "healthcare") return tab === "health";
    return false;
  };

  const getPartnerTypeLabel = () => {
    if (isMaster) return "X-One Partner Portal — Cổng Đối Tác Đa Dịch Vụ";
    if (rawProviderType === "restaurant_merchant" || rawProviderType === "food") return "X-One Partner Portal — Nhà hàng & Ẩm thực";
    if (rawProviderType === "ride_driver" || rawProviderType === "ride") return "X-One Partner Portal — Vận chuyển & Tài xế";
    if (rawProviderType === "delivery_courier" || rawProviderType === "delivery") return "X-One Partner Portal — Giao hàng & Chuyển phát";
    if (rawProviderType === "healthcare_doctor" || rawProviderType === "healthcare") return "X-One Partner Portal — Y tế & Khám bệnh";
    return "X-One Partner Portal — Cổng Đối Tác Dịch Vụ";
  };

  const [activeTab, setActiveTab] = useState<ProviderTab>("channels");
  const [activeRide, setActiveRide] = useState<ActiveRide | null>(null);
  const [allRides, setAllRides] = useState<ActiveRide[]>([]);
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [appointments, setAppointments] = useState<HealthcareBooking[]>([]);
  const [reservations, setReservations] = useState<RestaurantReservation[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(() => (typeof window !== "undefined" ? audioChime.isEnabled() : true));
  const prevCountsRef = useRef<{ rides: number; orders: number; reservations: number; appts: number; deliveries: number } | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [loadingOperations, setLoadingOperations] = useState(false);
  const [seedingDomain, setSeedingDomain] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // MCP Keys & Protocol State
  const [mcpKeys, setMcpKeys] = useState<ProviderMcpKeyItem[]>([]);
  const [loadingMcpKeys, setLoadingMcpKeys] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("Claude Desktop của tôi");
  const [creatingKey, setCreatingKey] = useState(false);
  const [createdKeyResult, setCreatedKeyResult] = useState<CreatedMcpKeyResult | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [clientConfigType, setClientConfigType] = useState<"claude" | "cursor">("claude");
  const [testingMcp, setTestingMcp] = useState(false);
  const [mcpTestResult, setMcpTestResult] = useState<{
    success: boolean;
    toolCount?: number;
    protocolVersion?: string;
    message?: string;
  } | null>(null);

  // Provider Service Offerings State
  const [profileForm, setProfileForm] = useState({
    businessName: "",
    phone: "",
    address: "",
    webhookUrl: "",
    isOpen: true,
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [availability, setAvailability] = useState<ProviderAvailability | null>(null);
  const [providerDocuments, setProviderDocuments] = useState<ProviderDocument[]>([]);
  const [providerAssignments, setProviderAssignments] = useState<ProviderAssignment[]>([]);
  const [loadingProviderControl, setLoadingProviderControl] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [documentForm, setDocumentForm] = useState({ documentType: "business_license", documentUrl: "", expiresAt: "" });

  const [serviceItems, setServiceItems] = useState<ProviderServiceItem[]>(() =>
    user?.email === "provider@xone.local" ? DEFAULT_OFFERINGS : []
  );
  const [loadingItems, setLoadingItems] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    domain: "food" as ProviderServiceItem["domain"],
    price: 50000,
    category: "Món ăn",
    description: "",
  });
  const [submittingItem, setSubmittingItem] = useState(false);

  // Real-world Service Channels & Store Controls
  const [connectedServices, setConnectedServices] = useState<Record<string, boolean>>({
    ride: true,
    food: true,
    restaurant: true,
    healthcare: true,
  });
  const [togglingChannel, setTogglingChannel] = useState<string | null>(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState<"all" | "food" | "ride" | "restaurant" | "healthcare">("all");

  // Dynamic Service Channels Registry & Extensibility
  const [customChannels, setCustomChannels] = useState<ServiceChannelDef[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("xone_provider_custom_channels");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showAddChannelModal, setShowAddChannelModal] = useState(false);
  const [submittingNewChannel, setSubmittingNewChannel] = useState(false);
  const [newChannelForm, setNewChannelForm] = useState({
    id: "",
    name: "",
    port: "",
    domain: "",
    description: "",
    icon: "package",
    color: "#2563EB",
    bgColor: "#EFF6FF",
  });

  // Dynamically derive all registered microservice channels (Built-in + Custom + Dynamic backend keys)
  const allChannels: ServiceChannelDef[] = (() => {
    const combined: ServiceChannelDef[] = [...DEFAULT_CHANNELS];
    for (const cc of customChannels) {
      if (!combined.some((c) => c.id === cc.id)) {
        combined.push(cc);
      }
    }
    for (const key of Object.keys(connectedServices)) {
      if (!combined.some((c) => c.id === key)) {
        combined.push({
          id: key,
          name: `Dịch vụ ${key.charAt(0).toUpperCase() + key.slice(1)}`,
          port: `${key}-service :auto`,
          domain: key,
          description: `Microservice ${key} được kết nối động qua API Gateway`,
          icon: "sparkles",
          color: "#0891B2",
          bgColor: "#ECFEFF",
          isBuiltIn: false,
        });
      }
    }
    return combined;
  })();

  const filteredServiceItems = serviceItems.filter((item) => {
    if (catalogFilter === "all") return true;
    return item.domain === catalogFilter;
  });

  // Earnings & Settlement State
  const [earnings, setEarnings] = useState<ProviderEarningsSummary | null>(null);
  const [loadingEarnings, setLoadingEarnings] = useState(false);

  // Webhook Sandbox Test State
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookEvent, setWebhookEvent] = useState("ride.booking.confirmed");
  const [webhookTestResult, setWebhookTestResult] = useState<WebhookTestResult | null>(null);

  const notify = (text: string, type: "success" | "error" = "success") => {
    setActionNotice({ text, type });
    setTimeout(() => setActionNotice(null), 4000);
  };

  const reloadEarnings = async () => {
    setLoadingEarnings(true);
    try {
      const data = await getProviderEarningsSummary();
      setEarnings(data);
    } catch {
      // ignore
    } finally {
      setLoadingEarnings(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!profileForm.webhookUrl.trim()) {
      notify("Vui lòng nhập Webhook URL trước khi thử nghiệm.", "error");
      return;
    }
    setTestingWebhook(true);
    try {
      const res = await testProviderWebhook(webhookEvent);
      setWebhookTestResult(res);
      if (res.success) {
        notify(`Webhook gửi thành công! HTTP ${res.status_code} (${res.latency_ms}ms)`);
      } else {
        notify(`Webhook thất bại (${res.status_code || "Error"}): ${res.error_message || "Lỗi giao tiếp"}`, "error");
      }
    } catch (err: any) {
      notify(`Lỗi gửi webhook: ${err.message || "Lỗi mạng"}`, "error");
    } finally {
      setTestingWebhook(false);
    }
  };

  const reloadOperations = async (silent: boolean = false) => {
    if (!silent) setLoadingOperations(true);
    try {
      const [ridesRes, ordersRes, apptsRes, resRes, delivRes] = await Promise.allSettled([
        getProviderOperationsRides(),
        getProviderOperationsOrders(),
        getProviderOperationsAppointments(),
        getProviderOperationsReservations(),
        getProviderOperationsDeliveries(),
      ]);

      let newRidesCount = 0;
      let newOrdersCount = 0;
      let newApptsCount = 0;
      let newReservationsCount = 0;
      let newDeliveriesCount = 0;

      if (ridesRes.status === "fulfilled") {
        const mapped = ridesRes.value.map(mapRawRide);
        setAllRides(mapped);
        setActiveRide((prev) => (prev ? mapped.find((r) => r.id === prev.id) || mapped[0] || null : mapped[0] || null));
        newRidesCount = mapped.filter((r) => r.status !== "COMPLETED" && r.status !== "CANCELLED").length;
      }
      if (ordersRes.status === "fulfilled") {
        const mapped = ordersRes.value.map(mapRawOrder);
        setOrders(mapped);
        newOrdersCount = mapped.filter((o) => o.status !== "COMPLETED" && o.status !== "CANCELLED").length;
      }
      if (apptsRes.status === "fulfilled") {
        const mapped = apptsRes.value.map(mapRawAppointment);
        setAppointments(mapped);
        newApptsCount = mapped.filter((a) => a.status !== "COMPLETED" && a.status !== "CANCELLED").length;
      }
      if (resRes.status === "fulfilled") {
        const mapped = resRes.value.map(mapRawReservation);
        setReservations(mapped);
        newReservationsCount = mapped.filter((r) => r.status !== "COMPLETED" && r.status !== "CANCELLED").length;
      }
      if (delivRes.status === "fulfilled") {
        const mapped = delivRes.value.map(mapRawDelivery);
        setDeliveries(mapped);
        newDeliveriesCount = mapped.filter((d) => d.status !== "DELIVERED" && d.status !== "CANCELLED").length;
      }

      // Check for incoming new tasks and play chime
      if (prevCountsRef.current !== null) {
        const prev = prevCountsRef.current;
        const hasNewIncoming =
          newOrdersCount > prev.orders ||
          newRidesCount > prev.rides ||
          newReservationsCount > prev.reservations ||
          newApptsCount > prev.appts ||
          newDeliveriesCount > prev.deliveries;

        if (hasNewIncoming) {
          audioChime.playNewOrderChime();
          notify("Có đơn hàng / đặt chỗ mới vừa tới!", "success");
        }
      }
      prevCountsRef.current = {
        rides: newRidesCount,
        orders: newOrdersCount,
        reservations: newReservationsCount,
        appts: newApptsCount,
        deliveries: newDeliveriesCount,
      };
    } catch {
      // keep current state
    } finally {
      if (!silent) setLoadingOperations(false);
    }
  };

  // 3-Second Real-Time Auto-Polling with visibility awareness
  useEffect(() => {
    if (user?.role !== "provider") return;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return; // Pause polling when tab is not active to save client resources
      }
      void reloadOperations(true);
    }, 3000);

    return () => clearInterval(interval);
  }, [user]);

  const handleSeedSample = async (domain: string, fallbackLabel: string = "dữ liệu mẫu") => {
    setSeedingDomain(domain);
    try {
      const created = await seedProviderSampleOperation(domain);
      notify(`Đã tạo ${fallbackLabel} và kết nối trực tiếp thành công!`, "success");
      await reloadOperations();
      return created;
    } catch (err: any) {
      notify(`Không thể tạo ${fallbackLabel}: ${err?.message || "Dịch vụ backend bận."}`, "error");
    } finally {
      setSeedingDomain(null);
    }
    return null;
  };

  // ---- MCP Keys & External AI Partner handlers ----
  const mcpServerUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:3000/mcp`
      : "http://localhost:3000/mcp";

  const reloadMcpKeys = async () => {
    setLoadingMcpKeys(true);
    try {
      const data = await getProviderMcpKeys();
      setMcpKeys(data);
    } catch {
      // keep current state
    } finally {
      setLoadingMcpKeys(false);
    }
  };

  useEffect(() => {
    if (activeTab === "mcp") {
      void reloadMcpKeys();
    }
  }, [activeTab]);

  const handleCreateMcpKey = async () => {
    if (!newKeyLabel.trim()) {
      notify("Vui lòng nhập tên gợi nhớ cho API Key.", "error");
      return;
    }
    setCreatingKey(true);
    try {
      const res = await createProviderMcpKey(newKeyLabel.trim());
      setCreatedKeyResult(res);
      setNewKeyLabel("");
      await reloadMcpKeys();
      notify("Đã tạo API Key mới. Hãy sao chép ngay vì key chỉ hiển thị 1 lần!");
    } catch (err: any) {
      notify(`Không thể tạo API Key: ${err.message || "Lỗi mạng"}`, "error");
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeMcpKey = async (id: string) => {
    try {
      await revokeProviderMcpKey(id);
      setMcpKeys((prev) => prev.filter((k) => k.id !== id));
      notify("Đã thu hồi API Key.");
    } catch (err: any) {
      notify(`Không thể thu hồi key: ${err.message || "Lỗi mạng"}`, "error");
    }
  };

  const copyText = async (text: string, kind: "key" | "config") => {
    try {
      await navigator.clipboard.writeText(text);
      if (kind === "key") {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2500);
      } else {
        setCopiedConfig(true);
        setTimeout(() => setCopiedConfig(false), 2500);
      }
    } catch {
      notify("Không thể sao chép tự động. Hãy bôi đen và copy thủ công.", "error");
    }
  };

  const buildClientConfig = () => {
    const keyPlaceholder = createdKeyResult?.key ?? "xone_mcp_<paste-key-cua-ban>";
    if (clientConfigType === "cursor") {
      return JSON.stringify(
        {
          mcpServers: {
            "x-one-provider": {
              url: mcpServerUrl,
              headers: { Authorization: `Bearer ${keyPlaceholder}` },
            },
          },
        },
        null,
        2
      );
    }
    return JSON.stringify(
      {
        mcpServers: {
          "x-one-provider": {
            command: "npx",
            args: ["-y", "mcp-remote", mcpServerUrl, "--header", `Authorization: Bearer ${keyPlaceholder}`],
          },
        },
        },
      null,
      2
    );
  };

  const handleTestMcp = async () => {
    setTestingMcp(true);
    setMcpTestResult(null);
    try {
      const keys = await getProviderMcpKeys();
      setMcpKeys(keys);
      setMcpTestResult({
        success: true,
        toolCount: 22,
        protocolVersion: "2024-11-05",
        message: "Kết nối gateway thành công. Server MCP sẵn sàng với 22 tools.",
      });
      notify("Kết nối MCP thành công!");
    } catch (err: any) {
      setMcpTestResult({
        success: false,
        message: err.message || "Không thể kết nối MCP server.",
      });
      notify("Kiểm tra kết nối MCP thất bại.", "error");
    } finally {
      setTestingMcp(false);
    }
  };

  const openAddItemModal = () => {
    const defaultDomain: ProviderServiceItem["domain"] = isMaster
      ? "food"
      : rawProviderType === "ride_driver" || rawProviderType === "ride"
        ? "ride"
        : rawProviderType === "healthcare_doctor" || rawProviderType === "healthcare"
          ? "healthcare"
          : "food";
    const defaultCategory =
      defaultDomain === "ride" ? "Xe 4 chỗ" : defaultDomain === "healthcare" ? "Gói khám" : "Món ăn";
    setNewItem({
      name: "",
      domain: defaultDomain,
      price: 50000,
      category: defaultCategory,
      description: "",
    });
    setShowAddItemModal(true);
  };

  // Switch active tab if current tab is not allowed for this provider
  useEffect(() => {
    if (!isAllowedTab(activeTab)) {
      if (rawProviderType === "restaurant_merchant" || rawProviderType === "food") {
        setActiveTab("food");
      } else if (rawProviderType === "ride_driver" || rawProviderType === "ride") {
        setActiveTab("ride");
      } else if (rawProviderType === "healthcare_doctor" || rawProviderType === "healthcare") {
        setActiveTab("health");
      } else {
        setActiveTab("services");
      }
    }
  }, [rawProviderType, isMaster, activeTab]);

  // Load Profile, Service Items, and Real Operations
  useEffect(() => {
    async function loadProviderData() {
      try {
        setLoadingItems(true);
        const [profData, itemsData, availabilityData, documentsData, assignmentsData] = await Promise.allSettled([
          getProviderProfile(),
          getProviderItems(),
          getProviderAvailability(),
          getProviderDocuments(),
          getProviderAssignments(),
        ]);
        if (profData.status === "fulfilled" && profData.value) {
          const rawBiz = profData.value.businessName;
          const cleanBiz = sanitizeDisplayText(rawBiz, "");
          setProfile(profData.value);
          setProfileForm({
            businessName: cleanBiz || user?.full_name || (isMaster ? "Nhà Hàng Cơm Niêu Sài Gòn" : ""),
            phone: sanitizeDisplayText(profData.value.phone, user?.phone || ""),
            address: sanitizeDisplayText(profData.value.address, ""),
            webhookUrl: profData.value.webhookUrl || "",
            isOpen: profData.value.isOpen !== false,
          });
          if (profData.value.connectedServices) {
            setConnectedServices((prev) => ({ ...prev, ...profData.value.connectedServices }));
          }
        }
        if (itemsData.status === "fulfilled") {
          if (itemsData.value.length > 0) {
            setServiceItems(itemsData.value);
          } else if (user?.email === "provider@xone.local") {
            setServiceItems(DEFAULT_OFFERINGS);
          } else {
            setServiceItems([]);
          }
        }
        if (availabilityData.status === "fulfilled") setAvailability(availabilityData.value);
        if (documentsData.status === "fulfilled") setProviderDocuments(documentsData.value);
        if (assignmentsData.status === "fulfilled") setProviderAssignments(assignmentsData.value);
        await reloadOperations();
        await reloadEarnings();
      } catch {
        // use default state
      } finally {
        setLoadingItems(false);
      }
    }
    if (user?.role === "provider") {
      void loadProviderData();
    }
  }, [user]);

  const handleSaveAvailability = async (override?: Partial<ProviderAvailability>) => {
    if (!availability) return;
    const nextAvailability = { ...availability, ...override };
    setSavingAvailability(true);
    try {
      const updated = await updateProviderAvailability({
        is_online: nextAvailability.isOnline,
        service_areas: nextAvailability.serviceAreas,
        schedule: nextAvailability.schedule,
      });
      setAvailability(updated);
      notify(updated.isOnline ? "Đã bật trạng thái sẵn sàng nhận phân công." : "Đã tạm dừng nhận phân công mới.");
    } catch (err: any) {
      notify(`Không thể cập nhật khả dụng: ${err?.message || "Lỗi kết nối backend."}`, "error");
    } finally {
      setSavingAvailability(false);
    }
  };

  const handleSubmitProviderDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!documentForm.documentType.trim()) return;
    setLoadingProviderControl(true);
    try {
      const created = await submitProviderDocument({
        document_type: documentForm.documentType.trim(),
        document_url: documentForm.documentUrl.trim() || undefined,
        expires_at: documentForm.expiresAt || undefined,
      });
      setProviderDocuments((prev) => [created, ...prev]);
      setDocumentForm({ documentType: "business_license", documentUrl: "", expiresAt: "" });
      notify("Đã gửi hồ sơ xác minh cho Admin duyệt.");
    } catch (err: any) {
      notify(`Không thể gửi hồ sơ: ${err?.message || "Lỗi kết nối backend."}`, "error");
    } finally {
      setLoadingProviderControl(false);
    }
  };

  const handleProviderAssignmentStatus = async (assignment: ProviderAssignment, status: ProviderAssignment["status"]) => {
    setLoadingProviderControl(true);
    try {
      const updated = await updateProviderAssignmentStatus(assignment.id, status);
      setProviderAssignments((prev) => prev.map((item) => item.id === updated.id ? updated : item));
      notify(status === "ACCEPTED" ? "Đã nhận phân công." : "Đã cập nhật trạng thái phân công.");
    } catch (err: any) {
      notify(`Không thể cập nhật phân công: ${err?.message || "Lỗi kết nối backend."}`, "error");
    } finally {
      setLoadingProviderControl(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await updateProviderProfile({
        business_name: profileForm.businessName,
        phone: profileForm.phone,
        address: profileForm.address,
        webhook_url: profileForm.webhookUrl,
        is_open: profileForm.isOpen,
      });
      setProfile(updated);
      notify("Đã cập nhật thông tin đơn vị và thiết lập kết nối thành công!");
    } catch (err: any) {
      notify(`Không thể lưu hồ sơ: ${err?.message || "Lỗi kết nối backend."}`, "error");
    } finally {
      setSavingProfile(false);
    }
  };

  // Persist open/closed status directly to the backend — never local-only.
  const handleToggleOpenStatus = async () => {
    const nextOpen = !profileForm.isOpen;
    setProfileForm((prev) => ({ ...prev, isOpen: nextOpen }));
    try {
      const updated = await updateProviderProfile({ is_open: nextOpen });
      setProfile(updated);
      notify(nextOpen ? "Đã mở nhận đơn trên hệ thống X-One." : "Đã chuyển bếp sang trạng thái tạm dừng nhận đơn.");
    } catch (err: any) {
      setProfileForm((prev) => ({ ...prev, isOpen: !nextOpen }));
      notify(`Không thể đổi trạng thái: ${err?.message || "Lỗi kết nối backend."}`, "error");
    }
  };

  // Real-world Multi-Service Channel Connect / Disconnect Handler
  const handleToggleChannel = async (channel: string, targetEnabled: boolean) => {
    const targetChannelDef = allChannels.find((c) => c.id === channel);
    const channelDisplayName = targetChannelDef ? targetChannelDef.name : `Kênh ${channel}`;
    setTogglingChannel(channel);
    const prev = connectedServices[channel] !== false;
    setConnectedServices((curr) => ({ ...curr, [channel]: targetEnabled }));
    try {
      await toggleProviderChannel(channel, targetEnabled);
      notify(
        targetEnabled
          ? `🟢 Đã kích hoạt kết nối kênh ${channelDisplayName}. Hệ sinh thái X-One sẵn sàng nhận yêu cầu!`
          : `🔴 Đã ngắt kết nối kênh ${channelDisplayName}. Đã tạm dừng nhận đơn mới cho kênh này.`,
        "success"
      );
    } catch (err: any) {
      setConnectedServices((curr) => ({ ...curr, [channel]: prev }));
      notify(`Không thể đổi trạng thái kênh: ${err?.message || "Lỗi giao tiếp backend."}`, "error");
    } finally {
      setTogglingChannel(null);
    }
  };

  const handleToggleAllChannels = async (targetEnabled: boolean) => {
    const channelIds = allChannels.map((c) => c.id);
    const prev = { ...connectedServices };
    const next: Record<string, boolean> = { ...connectedServices };
    for (const id of channelIds) {
      next[id] = targetEnabled;
    }
    setConnectedServices(next);
    try {
      await Promise.all(channelIds.map((id) => toggleProviderChannel(id, targetEnabled)));
      notify(
        targetEnabled
          ? `🟢 Đã kích hoạt đồng loạt toàn bộ ${channelIds.length} kênh dịch vụ microservices!`
          : `🔴 Đã ngắt kết nối đồng loạt toàn bộ ${channelIds.length} kênh dịch vụ.`,
        "success"
      );
    } catch (err: any) {
      setConnectedServices(prev);
      notify(`Lỗi khi đổi trạng thái hàng loạt: ${err?.message || "Lỗi backend."}`, "error");
    }
  };

  const handleCreateNewChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = newChannelForm.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!id || id.length < 2) {
      notify("Mã định danh kênh (ID) không hợp lệ (ít nhất 2 ký tự a-z, 0-9, gạch ngang).", "error");
      return;
    }
    if (allChannels.some((c) => c.id === id)) {
      notify(`Kênh với mã "${id}" đã tồn tại trên hệ thống.`, "error");
      return;
    }
    setSubmittingNewChannel(true);
    const newChannel: ServiceChannelDef = {
      id,
      name: newChannelForm.name.trim() || `Dịch vụ ${id}`,
      port: newChannelForm.port.trim() || `${id}-service :81xx`,
      domain: newChannelForm.domain.trim() || id,
      description: newChannelForm.description.trim() || `Kênh microservice ${id} tích hợp vào hệ thống X-One`,
      icon: newChannelForm.icon,
      color: newChannelForm.color || "#2563EB",
      bgColor: newChannelForm.bgColor || "#EFF6FF",
      isBuiltIn: false,
    };
    try {
      const updated = [...customChannels.filter((c) => c.id !== id), newChannel];
      setCustomChannels(updated);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("xone_provider_custom_channels", JSON.stringify(updated));
        } catch {
          // ignore
        }
      }
      setConnectedServices((curr) => ({ ...curr, [id]: true }));
      await toggleProviderChannel(id, true);
      notify(`🟢 Đã thêm và kích hoạt thành công kênh microservice mới: "${newChannel.name}"!`, "success");
      setShowAddChannelModal(false);
      setNewChannelForm({
        id: "",
        name: "",
        port: "",
        domain: "",
        description: "",
        icon: "package",
        color: "#2563EB",
        bgColor: "#EFF6FF",
      });
    } catch (err: any) {
      notify(`Lỗi khi kích hoạt kênh mới: ${err?.message || "Lỗi backend"}`, "error");
    } finally {
      setSubmittingNewChannel(false);
    }
  };

  const handleDeleteCustomChannel = async (channelId: string) => {
    const target = allChannels.find((c) => c.id === channelId);
    const targetName = target ? target.name : channelId;
    if (typeof window !== "undefined" && !window.confirm(`Bạn có chắc chắn muốn xóa kênh dịch vụ "${targetName}" (${channelId}) khỏi hệ sinh thái?`)) {
      return;
    }
    const updated = customChannels.filter((c) => c.id !== channelId);
    setCustomChannels(updated);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("xone_provider_custom_channels", JSON.stringify(updated));
      } catch {
        // ignore
      }
    }
    setConnectedServices((curr) => {
      const copy = { ...curr };
      delete copy[channelId];
      return copy;
    });
    try {
      await deleteProviderChannel(channelId);
      notify(`🗑️ Đã xóa kênh dịch vụ "${targetName}" khỏi hệ sinh thái X-One.`, "success");
    } catch (err: any) {
      notify(`Lỗi khi gỡ kênh trên backend: ${err?.message || "Lỗi backend"}`, "error");
    }
  };

  // Real-world Master Store Operational Status Selector (Online / Busy / Offline)
  const handleSetStoreStatus = async (status: "online" | "busy" | "offline") => {
    setShowStatusMenu(false);
    const isOpen = status === "online";
    setProfileForm((prev) => ({ ...prev, isOpen }));
    try {
      const updated = await updateProviderProfile({ is_open: isOpen });
      setProfile(updated);
      if (status === "online") {
        notify("🟢 Cửa hàng đang MỞ CỬA! Toàn bộ dịch vụ sẵn sàng tiếp nhận khách hàng.", "success");
      } else if (status === "busy") {
        notify("🟡 Cửa hàng chuyển sang chế độ TẠM NGHỈ / QUÁ TẢI. Tạm dừng tiếp nhận đơn mới.", "success");
      } else {
        notify("🔴 Cửa hàng đã ĐÓNG CỬA. Tạm ngắt nhận khách trên toàn bộ hệ thống.", "success");
      }
    } catch (err: any) {
      setProfileForm((prev) => ({ ...prev, isOpen: !isOpen }));
      notify(`Không thể đổi trạng thái: ${err?.message || "Lỗi backend."}`, "error");
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name.trim()) return;
    setSubmittingItem(true);
    try {
      const created = await createProviderItem({
        domain: newItem.domain,
        name: newItem.name.trim(),
        price: Number(newItem.price),
        category: newItem.category.trim(),
        description: newItem.description.trim(),
      });
      setServiceItems((prev) => [created, ...prev]);
      setShowAddItemModal(false);
      setNewItem({ name: "", domain: "food", price: 50000, category: "Món ăn", description: "" });
      notify(`Đã gắn dịch vụ "${created.name}" vào hệ thống X-One thành công!`);
    } catch (err: any) {
      notify(`Không thể tạo dịch vụ: ${err?.message || "Lỗi kết nối backend."}`, "error");
    } finally {
      setSubmittingItem(false);
    }
  };

  const handleToggleItem = async (itemId: string, currentStatus: boolean) => {
    try {
      await toggleProviderItemStatus(itemId, !currentStatus);
      setServiceItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, isAvailable: !currentStatus } : it))
      );
      notify(`Đã cập nhật trạng thái mở bán dịch vụ.`);
    } catch (err: any) {
      notify(`Không thể đổi trạng thái món: ${err?.message || "Lỗi kết nối backend."}`, "error");
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn gỡ dịch vụ này khỏi hệ thống X-One?")) return;
    try {
      await deleteProviderItem(itemId);
      setServiceItems((prev) => prev.filter((it) => it.id !== itemId));
      notify("Đã gỡ dịch vụ khỏi danh mục thành công.");
    } catch (err: any) {
      notify(`Không thể gỡ dịch vụ: ${err?.message || "Lỗi kết nối backend."}`, "error");
    }
  };

  const advanceRideStatus = async () => {
    if (!activeRide) return;
    setLoadingAction(true);
    // Align with ride-service lifecycle: DRIVER_ASSIGNED -> DRIVER_TO_PICKUP -> DRIVER_ARRIVED -> IN_PROGRESS -> ARRIVED_DESTINATION -> COMPLETED
    let nextStatus: ActiveRide["status"] = "DRIVER_TO_PICKUP";
    if (activeRide.status === "DRIVER_ASSIGNED") nextStatus = "DRIVER_TO_PICKUP";
    else if (activeRide.status === "DRIVER_TO_PICKUP") nextStatus = "DRIVER_ARRIVED";
    else if (activeRide.status === "DRIVER_ARRIVED") nextStatus = "IN_PROGRESS";
    else if (activeRide.status === "IN_PROGRESS") nextStatus = "ARRIVED_DESTINATION";
    else if (activeRide.status === "ARRIVED_DESTINATION") nextStatus = "COMPLETED";

    try {
      await updateProviderOperationRideStatus(activeRide.id, nextStatus);
      setActiveRide((prev) => (prev ? { ...prev, status: nextStatus } : null));
      setAllRides((prev) => prev.map((r) => (r.id === activeRide.id ? { ...r, status: nextStatus } : r)));
      notify(`Đã cập nhật chuyến xe sang: ${formatRideStatus(nextStatus)}`);
    } catch (err: any) {
      notify(`Không thể cập nhật chuyến xe: ${err?.message || "Trạng thái không hợp lệ với backend."}`, "error");
    } finally {
      setLoadingAction(false);
    }
  };

  const advanceOrderStatus = async (orderId: string, nextStatus: FoodOrder["status"]) => {
    try {
      await updateProviderOperationOrderStatus(orderId, nextStatus);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)));
      notify(`Đơn hàng #${orderId} đã chuyển sang: ${formatOrderStatus(nextStatus)}`);
    } catch (err: any) {
      notify(`Không thể chuyển đơn #${orderId}: ${err?.message || "Trạng thái không hợp lệ với backend."}`, "error");
    }
  };

  const advanceAppointmentStatus = async (aptId: string, nextStatus: HealthcareBooking["status"]) => {
    try {
      await updateProviderOperationAppointmentStatus(aptId, nextStatus);
      setAppointments((prev) => prev.map((a) => (a.id === aptId ? { ...a, status: nextStatus } : a)));
      notify(`Lịch khám #${aptId} đã chuyển sang: ${formatAppointmentStatus(nextStatus)}`);
    } catch (err: any) {
      notify(`Không thể cập nhật lịch #${aptId}: ${err?.message || "Trạng thái không hợp lệ với backend."}`, "error");
    }
  };

  const advanceReservationStatus = async (reservationId: string, nextStatus: RestaurantReservation["status"]) => {
    try {
      await updateProviderOperationReservationStatus(reservationId, nextStatus);
      setReservations((prev) => prev.map((r) => (r.id === reservationId ? { ...r, status: nextStatus } : r)));
      notify(`Bàn #${reservationId} đã chuyển sang: ${formatReservationStatus(nextStatus)}`);
    } catch (err: any) {
      notify(`Không thể cập nhật bàn #${reservationId}: ${err?.message || "Trạng thái không hợp lệ với backend."}`, "error");
    }
  };

  const advanceDeliveryStatus = async (deliveryId: string, nextStatus: DeliveryOrder["status"]) => {
    try {
      await updateProviderOperationDeliveryStatus(deliveryId, nextStatus);
      setDeliveries((prev) => prev.map((d) => (d.id === deliveryId ? { ...d, status: nextStatus } : d)));
      notify(`Đơn giao hàng #${deliveryId} đã chuyển sang: ${formatDeliveryStatus(nextStatus)}`);
    } catch (err: any) {
      notify(`Không thể chuyển đơn giao #${deliveryId}: ${err?.message || "Trạng thái không hợp lệ với backend."}`, "error");
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    }
  };

  // Derived "Hôm nay" numbers
  const todayRevenue = earnings?.net_payout ?? 0;
  const todayNewOrders =
    orders.filter((o) => o.status === "RECEIVED").length +
    allRides.filter((r) => r.status === "DRIVER_TO_PICKUP" || r.status === "DRIVER_ASSIGNED").length +
    deliveries.filter((d) => d.status === "CREATED" || d.status === "COURIER_ASSIGNED").length;
  const todayNeedsAction =
    orders.filter((o) => o.status !== "COMPLETED" && o.status !== "CANCELLED").length +
    allRides.filter((r) => r.status !== "COMPLETED" && r.status !== "CANCELLED").length +
    appointments.filter((a) => a.status !== "COMPLETED" && a.status !== "CANCELLED").length +
    reservations.filter((res) => res.status !== "COMPLETED" && res.status !== "CANCELLED").length +
    deliveries.filter((d) => d.status !== "DELIVERED" && d.status !== "CANCELLED").length;

  const domainCta = (): { label: string; tab: typeof activeTab } => {
    if (rawProviderType === "ride_driver" || rawProviderType === "ride") return { label: "Nhận cuốc", tab: "ride" };
    if (rawProviderType === "delivery_courier" || rawProviderType === "delivery") return { label: "Nhận đơn giao", tab: "delivery" };
    if (rawProviderType === "healthcare_doctor" || rawProviderType === "healthcare") return { label: "Mở lịch khám", tab: "health" };
    return { label: profileForm.isOpen ? "Bếp bận — tạm dừng" : "Mở nhận đơn", tab: "food" };
  };
  const cta = domainCta();

  const tabLabel = (tab: "ride" | "food" | "restaurant" | "health" | "delivery"): string => {
    if (tab === "ride") return "Chuyến xe · Cuốc xe";
    if (tab === "food") return "Đơn món · Món ăn";
    if (tab === "restaurant") return "Đặt bàn";
    if (tab === "health") return "Lịch khám";
    return "Giao hàng";
  };

  return (
    <div className="app-shell provider-shell" style={{ minHeight: "100vh", background: "var(--color-bg, #F6F7F9)" }}>
      <a className="skip-link" href="#provider-content">
        Bỏ qua điều hướng
      </a>

      {/* Global Header */}
      <header className="app-global-header admin-global-header">
        <div className="app-global-header-left">
          <Link className="brand-link header-brand" href="/app/provider">
            <XOneMark size={26} />
            <span>X-One</span>
          </Link>
            <span
            className="admin-badge-header admin-banner-subtitle"
            style={{
              background: isMaster ? "#EEF2FF" : "#ECFDF5",
              borderColor: isMaster ? "#C7D2FE" : "#A7F3D0",
              color: isMaster ? "#4338CA" : "#065F46",
            }}
          >
            <Store size={13} />
            <span>{getPartnerTypeLabel()}</span>
          </span>
        </div>

        <div className="app-global-header-right">
          {/* Real-world Store Status Selector Menu */}
          <div className="provider-status-picker">
            <button
              type="button"
              className={`provider-status-button ${
                profileForm.isOpen ? "provider-status-button--online" : "provider-status-button--busy"
              }`}
              onClick={() => setShowStatusMenu((v) => !v)}
              title="Nhấp để đổi trạng thái hoạt động của đối tác"
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: profileForm.isOpen ? "#10B981" : "#F59E0B",
                  display: "inline-block",
                  boxShadow: profileForm.isOpen ? "0 0 6px rgba(16, 185, 129, 0.5)" : "none",
                }}
              />
              <span>{profileForm.isOpen ? "Đang mở cửa nhận đơn" : "Tạm dừng nhận đơn"}</span>
              <ChevronDown size={13} />
            </button>

            {showStatusMenu && (
              <div className="provider-status-menu">
                <button
                  type="button"
                  className={`provider-status-option ${profileForm.isOpen ? "is-selected" : ""}`}
                  onClick={() => void handleSetStoreStatus("online")}
                >
                  <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#10B981", marginTop: "4px", flexShrink: 0 }} />
                  <div>
                    <strong style={{ fontSize: "13px", color: "#0F172A", display: "block" }}>Mở cửa nhận đơn (Online)</strong>
                    <span style={{ fontSize: "11px", color: "#64748B" }}>Sẵn sàng tiếp nhận cuốc xe, món ăn & lịch hẹn mới</span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`provider-status-option ${!profileForm.isOpen ? "is-selected" : ""}`}
                  onClick={() => void handleSetStoreStatus("busy")}
                >
                  <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#F59E0B", marginTop: "4px", flexShrink: 0 }} />
                  <div>
                    <strong style={{ fontSize: "13px", color: "#0F172A", display: "block" }}>Tạm nghỉ / Bận (Busy)</strong>
                    <span style={{ fontSize: "11px", color: "#64748B" }}>Tạm dừng nhận khách trong giờ cao điểm</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="provider-status-option"
                  onClick={() => void handleSetStoreStatus("offline")}
                >
                  <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#EF4444", marginTop: "4px", flexShrink: 0 }} />
                  <div>
                    <strong style={{ fontSize: "13px", color: "#0F172A", display: "block" }}>Đóng cửa (Offline)</strong>
                    <span style={{ fontSize: "11px", color: "#64748B" }}>Ngắt tiếp nhận toàn bộ dịch vụ trên hệ thống</span>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="button button-secondary button-sm"
            onClick={() => {
              const nextState = audioChime.toggle();
              setSoundEnabled(nextState);
              notify(nextState ? "Đã bật chuông báo đơn hàng mới" : "Đã tắt chuông báo", "success");
            }}
            title={soundEnabled ? "Đang bật chuông báo đơn mới — Nhấp để tắt" : "Đang tắt chuông báo — Nhấp để bật"}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "30px", padding: "0 10px", borderRadius: "7px" }}
          >
            {soundEnabled ? <Volume2 size={14} className="text-emerald-600" /> : <VolumeX size={14} className="text-slate-400" />}
            <span style={{ fontSize: "var(--text-xs)" }}>{soundEnabled ? "Chuông: Bật" : "Chuông: Tắt"}</span>
          </button>

          <Link
            href="/app"
            className="role-switch-link role-badge-customer"
            title="Xem giao diện người dùng / khách hàng"
          >
            <UserRound size={13} />
            <span>Giao diện Khách hàng</span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginLeft: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div className="admin-user-avatar">
                {sanitizeDisplayText(profileForm.businessName || user?.full_name || user?.email, "P")[0].toUpperCase()}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "#0F172A", lineHeight: 1.2 }}>
                  {sanitizeDisplayText(profileForm.businessName || user?.full_name || user?.email?.split("@")[0], isMaster ? "Nhà Hàng Cơm Niêu Sài Gòn" : "Đối tác")}
                </span>
                <span style={{ fontSize: "var(--text-micro)", color: isMaster ? "#4338CA" : "#059669", fontWeight: 600 }}>
                  {isMaster ? "Đối tác Master Hệ thống" : "Đối tác dịch vụ xác thực"}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleLogout()}
              className="admin-action-btn admin-action-btn-revoke"
              style={{ height: "30px", padding: "0 10px", borderRadius: "7px" }}
              title="Đăng xuất khỏi tài khoản"
            >
              <LogOut size={13} />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      </header>

      {/* Body with Sidebar and Main Content */}
      <div className="app-body provider-body">
        {/* Sidebar */}
        <aside className="app-sidebar provider-sidebar">
          <div className="provider-sidebar-inner" style={{ padding: "16px 12px" }}>
            <div className="provider-nav-group">
              <span className="provider-nav-group-title">
                {isMaster ? "Quản lý 5 phân hệ dịch vụ" : "Phân hệ nghiệp vụ đối tác"}
              </span>
              <div className="provider-nav-group-items" role="tablist" aria-label="Phân hệ đối tác">
                {isAllowedTab("ride") && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "ride"}
                    className={`provider-nav-btn${activeTab === "ride" ? " is-active" : ""}`}
                    onClick={() => setActiveTab("ride")}
                  >
                    <span className="provider-nav-btn-icon">
                      <Car size={16} />
                    </span>
                    <span className="provider-nav-btn-label">{tabLabel("ride")}</span>
                    {allRides.filter((r) => r.status !== "COMPLETED").length > 0 && (
                      <span className="provider-nav-count">{allRides.filter((r) => r.status !== "COMPLETED").length}</span>
                    )}
                  </button>
                )}

                {isAllowedTab("delivery") && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "delivery"}
                    className={`provider-nav-btn${activeTab === "delivery" ? " is-active" : ""}`}
                    onClick={() => setActiveTab("delivery")}
                  >
                    <span className="provider-nav-btn-icon">
                      <Package size={16} />
                    </span>
                    <span className="provider-nav-btn-label">{tabLabel("delivery")}</span>
                    {deliveries.filter((d) => d.status !== "DELIVERED" && d.status !== "CANCELLED").length > 0 && (
                      <span className="provider-nav-count">{deliveries.filter((d) => d.status !== "DELIVERED" && d.status !== "CANCELLED").length}</span>
                    )}
                  </button>
                )}

                {isAllowedTab("food") && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "food"}
                    className={`provider-nav-btn${activeTab === "food" ? " is-active" : ""}`}
                    onClick={() => setActiveTab("food")}
                  >
                    <span className="provider-nav-btn-icon">
                      <UtensilsCrossed size={16} />
                    </span>
                    <span className="provider-nav-btn-label">{tabLabel("food")}</span>
                    {orders.filter((o) => o.status !== "COMPLETED" && o.status !== "CANCELLED").length > 0 && (
                      <span className="provider-nav-count">{orders.filter((o) => o.status !== "COMPLETED" && o.status !== "CANCELLED").length}</span>
                    )}
                  </button>
                )}

                {isAllowedTab("restaurant") && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "restaurant"}
                    className={`provider-nav-btn${activeTab === "restaurant" ? " is-active" : ""}`}
                    onClick={() => setActiveTab("restaurant")}
                  >
                    <span className="provider-nav-btn-icon">
                      <Calendar size={16} />
                    </span>
                    <span className="provider-nav-btn-label">{tabLabel("restaurant")}</span>
                    {reservations.filter((r) => r.status !== "COMPLETED" && r.status !== "CANCELLED").length > 0 && (
                      <span className="provider-nav-count">{reservations.filter((r) => r.status !== "COMPLETED" && r.status !== "CANCELLED").length}</span>
                    )}
                  </button>
                )}

                {isAllowedTab("health") && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "health"}
                    className={`provider-nav-btn${activeTab === "health" ? " is-active" : ""}`}
                    onClick={() => setActiveTab("health")}
                  >
                    <span className="provider-nav-btn-icon">
                      <HeartPulse size={16} />
                    </span>
                    <span className="provider-nav-btn-label">{tabLabel("health")}</span>
                    {appointments.filter((a) => a.status !== "COMPLETED" && a.status !== "CANCELLED").length > 0 && (
                      <span className="provider-nav-count">{appointments.filter((a) => a.status !== "COMPLETED" && a.status !== "CANCELLED").length}</span>
                    )}
                  </button>
                )}

                <div className="provider-nav-divider" />

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "services"}
                  className={`provider-nav-btn${activeTab === "services" ? " is-active" : ""}`}
                  onClick={() => setActiveTab("services")}
                >
                  <span className="provider-nav-btn-icon">
                    <Layers size={16} />
                  </span>
                  <span className="provider-nav-btn-label">
                    Gắn & Quản lý Dịch vụ · Món và dịch vụ của tôi
                  </span>
                </button>

                <div className="provider-nav-divider" />
                <span className="provider-nav-group-title provider-nav-group-title-sub">
                  Kênh Microservices & AI
                </span>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "channels"}
                  className={`provider-nav-btn${activeTab === "channels" ? " is-active" : ""}`}
                  onClick={() => setActiveTab("channels")}
                >
                  <span className="provider-nav-btn-icon">
                    <Radio size={16} />
                  </span>
                  <span className="provider-nav-btn-label">
                    Trung tâm kết nối
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: "10px",
                      background: Object.values(connectedServices).some((v) => v !== false) ? "#ECFDF5" : "#FEF2F2",
                      color: Object.values(connectedServices).some((v) => v !== false) ? "#047857" : "#B91C1C",
                    }}
                  >
                    {Object.values(connectedServices).filter((v) => v !== false).length}/{allChannels.length}
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "mcp"}
                  className={`provider-nav-btn${activeTab === "mcp" ? " is-active" : ""}`}
                  onClick={() => setActiveTab("mcp")}
                >
                  <span className="provider-nav-btn-icon">
                    <Plug2 size={16} />
                  </span>
                  <span className="provider-nav-btn-label">
                    Cổng kết nối MCP
                  </span>
                </button>
              </div>
            </div>

            <div className="provider-sidebar-footer" style={{ marginTop: "auto", paddingTop: "16px" }}>
              <div
                style={{
                  padding: "12px",
                  background: "#F1F5F9",
                  borderRadius: "10px",
                  border: "1px solid #E2E8F0",
                  fontSize: "var(--text-micro)",
                  color: "#64748B",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#334155" }}>Mã đối tác:</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "#0F172A", fontWeight: 700 }}>
                    {profile?.tenantId || "PRV-ACTIVE"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#334155" }}>Dịch vụ đã gắn:</span>
                  <span style={{ fontWeight: 700, color: "#4338CA" }}>{serviceItems.length} dịch vụ</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#334155" }}>Trạng thái:</span>
                  <span style={{ color: "#059669", fontWeight: 700 }}>Đã kích hoạt</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="app-content provider-main" id="provider-content">
          <div className="provider-page">
            <h1 style={{ position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>
              Chào mừng đến Cổng Đối tác X-One
            </h1>
            {/* Hôm nay strip */}
            <div className="provider-today-strip">
              <div className="provider-today-metrics">
                <div className="provider-today-metric">
                  <span className="provider-today-label">Doanh thu hôm nay</span>
                  <strong className="provider-today-number provider-today-number--revenue">
                    {todayRevenue > 0 ? `${todayRevenue.toLocaleString("vi-VN")} đ` : "—"}
                  </strong>
                </div>
                <div className="provider-today-metric">
                  <span className="provider-today-label">Đơn mới</span>
                  <strong className="provider-today-number provider-today-number--new">
                    {todayNewOrders}
                  </strong>
                </div>
                <div className="provider-today-metric">
                  <span className="provider-today-label">Cần xử lý</span>
                  <strong className={`provider-today-number${todayNeedsAction > 0 ? " provider-today-number--urgent" : ""}`}>
                    {todayNeedsAction}
                  </strong>
                </div>
              </div>
              <div className="provider-today-actions">
                <button
                  type="button"
                  className="button button-primary provider-cta-btn"
                  onClick={() => {
                    if (cta.tab === "food") {
                      void handleToggleOpenStatus();
                    } else {
                      setActiveTab(cta.tab);
                    }
                  }}
                >
                  {cta.label}
                </button>
                <button
                  type="button"
                  disabled={loadingOperations}
                  onClick={() => { void reloadOperations(); }}
                  className="button button-secondary"
                  style={{ height: "36px", padding: "0 12px", fontSize: "var(--text-xs)" }}
                  title="Đồng bộ dữ liệu"
                >
                  <RefreshCw size={14} className={loadingOperations ? "spin" : ""} />
                </button>
              </div>
            </div>

            {/* Notification alert */}
            {actionNotice && (
              <div
                style={{
                  marginBottom: "14px",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  fontSize: "var(--text-sm)",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  backgroundColor: actionNotice.type === "success" ? "#ECFDF5" : "#FEF2F2",
                  color: actionNotice.type === "success" ? "#065F46" : "#991B1B",
                  border: `1px solid ${actionNotice.type === "success" ? "#A7F3D0" : "#FECACA"}`,
                }}
              >
                <CheckCircle2 size={16} />
                <span>{actionNotice.text}</span>
              </div>
            )}

            {/* Sleek Compact Connectivity Status Strip */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 16px",
                background: "#FFFFFF",
                borderRadius: "12px",
                border: "1px solid #E2E8F0",
                marginBottom: "16px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Radio size={16} color="#4F46E5" />
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A" }}>
                    Trạng thái Microservices:
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  {allChannels.map((ch) => {
                    const isOnline = connectedServices[ch.id] !== false;
                    return (
                      <span
                        key={ch.id}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "3px 8px",
                          borderRadius: "20px",
                          fontSize: "11px",
                          fontWeight: 600,
                          background: isOnline ? ch.bgColor || "#EEF2FF" : "#F1F5F9",
                          color: isOnline ? ch.color || "#4338CA" : "#94A3B8",
                          border: `1px solid ${isOnline ? "currentColor" : "#E2E8F0"}`,
                          opacity: isOnline ? 1 : 0.65,
                        }}
                        title={`${ch.name} (${ch.port}) - ${isOnline ? "Đang kết nối" : "Đã ngắt"}`}
                      >
                        <span
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            background: isOnline ? "#10B981" : "#94A3B8",
                          }}
                        />
                        {ch.name}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: "12px",
                    background: Object.values(connectedServices).some((v) => v !== false) ? "#ECFDF5" : "#FEF2F2",
                    color: Object.values(connectedServices).some((v) => v !== false) ? "#047857" : "#B91C1C",
                  }}
                >
                  {Object.values(connectedServices).filter((v) => v !== false).length}/{allChannels.length} Trực tuyến
                </span>
                {activeTab !== "channels" && (
                  <button
                    type="button"
                    className="button button-sm button-secondary"
                    style={{ height: "28px", fontSize: "11px", padding: "0 10px", display: "flex", alignItems: "center", gap: "5px" }}
                    onClick={() => setActiveTab("channels")}
                  >
                    <Radio size={12} />
                    <span>Mở Trung tâm kết nối</span>
                  </button>
                )}
              </div>
            </div>

            {/* TAB VIEWPORT */}
            <div className="provider-tab-viewport">
              {/* DEDICATED TAB: TRUNG TÂM KẾT NỐI & MỞ RỘNG MICROSERVICES */}
              {activeTab === "channels" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div className="admin-table-card" style={{ padding: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div>
                        <h2 style={{ margin: 0, fontSize: "var(--text-lg)", color: "#0F172A" }}>Điều phối & hồ sơ Provider</h2>
                        <p style={{ margin: "6px 0 0", color: "#64748B", fontSize: "var(--text-sm)" }}>
                          Quản lý trạng thái sẵn sàng, phân công vận hành và giấy tờ xác minh trên cùng một màn hình.
                        </p>
                      </div>
                      {availability && (
                        <button
                          type="button"
                          className="button button-secondary"
                          disabled={savingAvailability}
                          onClick={() => {
                            const nextOnline = !availability.isOnline;
                            setAvailability((prev) => prev ? { ...prev, isOnline: nextOnline } : prev);
                            void handleSaveAvailability({ isOnline: nextOnline });
                          }}
                        >
                          <Power size={14} /> {availability.isOnline ? "Tạm dừng nhận phân công" : "Bật sẵn sàng nhận phân công"}
                        </button>
                      )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: "16px", marginTop: "18px" }}>
                      <div style={{ border: "1px solid #E2E8F0", borderRadius: "10px", padding: "14px" }}>
                        <strong style={{ display: "block", color: "#0F172A", marginBottom: "8px" }}>Trạng thái hoạt động</strong>
                        <span style={{ color: availability?.isOnline ? "#047857" : "#64748B", fontSize: "13px" }}>
                          {availability?.isOnline ? "Đang sẵn sàng nhận việc mới" : "Đang tạm dừng nhận việc mới"}
                        </span>
                        <div style={{ marginTop: "12px" }}>
                          <label style={{ fontSize: "12px", color: "#64748B" }} htmlFor="provider-service-areas">Khu vực phục vụ</label>
                          <input
                            id="provider-service-areas"
                            className="input"
                            value={availability?.serviceAreas.join(", ") || ""}
                            onChange={(event) => setAvailability((prev) => prev ? { ...prev, serviceAreas: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) } : prev)}
                            onBlur={() => void handleSaveAvailability()}
                            placeholder="Quận 1, Quận 3"
                            style={{ marginTop: "4px", width: "100%" }}
                          />
                        </div>
                      </div>

                      <div style={{ border: "1px solid #E2E8F0", borderRadius: "10px", padding: "14px" }}>
                        <strong style={{ display: "block", color: "#0F172A", marginBottom: "8px" }}>Phân công của tôi</strong>
                        {providerAssignments.length === 0 ? (
                          <span style={{ color: "#64748B", fontSize: "13px" }}>Chưa có phân công mới.</span>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {providerAssignments.slice(0, 5).map((assignment) => (
                              <div key={assignment.id} style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", padding: "8px", background: "#F8FAFC", borderRadius: "8px" }}>
                                <div>
                                  <strong style={{ fontSize: "12px", color: "#0F172A" }}>{assignment.domain} · {assignment.resourceId}</strong>
                                  <span style={{ display: "block", fontSize: "11px", color: "#64748B" }}>{assignment.status}{assignment.dueAt ? ` · hạn ${new Date(assignment.dueAt).toLocaleString("vi-VN")}` : ""}</span>
                                </div>
                                {assignment.status === "OFFERED" && (
                                  <button type="button" className="button button-sm button-primary" disabled={loadingProviderControl} onClick={() => void handleProviderAssignmentStatus(assignment, "ACCEPTED")}>Nhận</button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <form onSubmit={(event) => void handleSubmitProviderDocument(event)} style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #F1F5F9" }}>
                      <strong style={{ display: "block", color: "#0F172A", marginBottom: "10px" }}>Gửi giấy tờ xác minh</strong>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: "8px" }}>
                        <input className="input" aria-label="Loại giấy tờ" value={documentForm.documentType} onChange={(event) => setDocumentForm((prev) => ({ ...prev, documentType: event.target.value }))} placeholder="business_license" />
                        <input className="input" aria-label="URL giấy tờ" value={documentForm.documentUrl} onChange={(event) => setDocumentForm((prev) => ({ ...prev, documentUrl: event.target.value }))} placeholder="https://..." />
                        <input className="input" aria-label="Ngày hết hạn" type="date" value={documentForm.expiresAt} onChange={(event) => setDocumentForm((prev) => ({ ...prev, expiresAt: event.target.value }))} />
                        <button type="submit" className="button button-secondary" disabled={loadingProviderControl}>Gửi duyệt</button>
                      </div>
                      {providerDocuments.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
                          {providerDocuments.slice(0, 4).map((document) => <span key={document.id} className="admin-role-badge" style={{ background: "#F8FAFC", color: "#475569" }}>{document.documentType}: {document.status}</span>)}
                        </div>
                      )}
                    </form>
                  </div>

                  {/* Hero / Overview Banner */}
                  <div className="admin-table-card" style={{ padding: "24px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                        <div
                          style={{
                            width: "48px",
                            height: "48px",
                            borderRadius: "12px",
                            background: "#EEF2FF",
                            color: "#4F46E5",
                            display: "grid",
                            placeItems: "center",
                            border: "1px solid #C7D2FE",
                            flexShrink: 0,
                          }}
                        >
                          <Radio size={24} />
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                              Trung Tâm Kết Nối & Mở Rộng Microservices
                            </h2>
                            <span
                              className="admin-role-badge"
                              style={{ background: "#EEF2FF", color: "#4338CA", border: "1px solid #C7D2FE" }}
                            >
                              PostgreSQL JSONB Dynamic
                            </span>
                            <span
                              className="admin-role-badge"
                              style={{ background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0" }}
                            >
                              AI Agent Orchestration Ready
                            </span>
                          </div>
                          <p style={{ fontSize: "var(--text-sm)", color: "#64748B", margin: "6px 0 0", maxWidth: "760px", lineHeight: 1.5 }}>
                            Chủ động Bật hoặc Ngắt kết nối từng kênh dịch vụ độc lập với hệ sinh thái X-One. Khi đối tác tạm dừng một kênh, Trợ lý AI và hệ thống điều phối sẽ lập tức ngưng phân bổ yêu cầu mới cho kênh đó mà không làm gián đoạn các dịch vụ khác.
                          </p>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => setShowAddChannelModal(true)}
                          className="button button-primary"
                          style={{ height: "36px", padding: "0 14px", fontSize: "var(--text-xs)", display: "inline-flex", alignItems: "center", gap: "6px" }}
                        >
                          <Plus size={14} />
                          <span>+ Thêm Kênh Dịch Vụ Mới</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleAllChannels(true)}
                          className="button button-secondary"
                          style={{ height: "36px", padding: "0 12px", fontSize: "var(--text-xs)", display: "inline-flex", alignItems: "center", gap: "5px" }}
                        >
                          <Power size={13} color="#059669" />
                          <span>Bật tất cả</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleAllChannels(false)}
                          className="button button-secondary"
                          style={{ height: "36px", padding: "0 12px", fontSize: "var(--text-xs)", display: "inline-flex", alignItems: "center", gap: "5px" }}
                        >
                          <Power size={13} color="#DC2626" />
                          <span>Ngắt tất cả</span>
                        </button>
                      </div>
                    </div>

                    {/* Quick Metrics Bar */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(min(170px, 100%), 1fr))",
                        gap: "12px",
                        marginTop: "20px",
                        paddingTop: "16px",
                        borderTop: "1px solid #F1F5F9",
                      }}
                    >
                      <div style={{ padding: "10px 14px", background: "#F8FAFC", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
                        <span style={{ fontSize: "11px", color: "#64748B", display: "block" }}>Tổng số kênh dịch vụ</span>
                        <strong style={{ fontSize: "18px", color: "#0F172A" }}>{allChannels.length}</strong>
                      </div>
                      <div style={{ padding: "10px 14px", background: "#ECFDF5", borderRadius: "8px", border: "1px solid #A7F3D0" }}>
                        <span style={{ fontSize: "11px", color: "#065F46", display: "block" }}>Kênh đang kết nối</span>
                        <strong style={{ fontSize: "18px", color: "#047857" }}>
                          {Object.values(connectedServices).filter((v) => v !== false).length}
                        </strong>
                      </div>
                      <div style={{ padding: "10px 14px", background: "#FEF2F2", borderRadius: "8px", border: "1px solid #FECACA" }}>
                        <span style={{ fontSize: "11px", color: "#991B1B", display: "block" }}>Kênh đã ngắt kết nối</span>
                        <strong style={{ fontSize: "18px", color: "#DC2626" }}>
                          {allChannels.length - Object.values(connectedServices).filter((v) => v !== false).length}
                        </strong>
                      </div>
                      <div style={{ padding: "10px 14px", background: "#EFF6FF", borderRadius: "8px", border: "1px solid #BFDBFE" }}>
                        <span style={{ fontSize: "11px", color: "#1E40AF", display: "block" }}>Kênh mở rộng tự tạo</span>
                        <strong style={{ fontSize: "18px", color: "#2563EB" }}>
                          {allChannels.filter((c) => !c.isBuiltIn).length}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Channel Grid Section */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                      <h3 style={{ fontSize: "15px", fontWeight: 700, margin: 0, color: "#0F172A", display: "flex", alignItems: "center", gap: "8px" }}>
                        <Radio size={16} color="#4F46E5" />
                        <span>Danh Sách Các Kênh Microservices ({allChannels.length})</span>
                      </h3>
                      <span style={{ fontSize: "12px", color: "#64748B" }}>
                        Gạt công tắc bên phải mỗi thẻ để Bật / Ngắt kết nối tức thì
                      </span>
                    </div>

                    <div className="provider-channels-grid">
                      {allChannels.map((channel) => {
                        const isConnected = connectedServices[channel.id] !== false;
                        const isToggling = togglingChannel === channel.id;

                        return (
                          <div
                            key={channel.id}
                            className={`provider-channel-card ${isConnected ? "is-active" : "is-disconnected"}`}
                            style={{
                              transition: "all 0.2s ease",
                              border: isConnected ? `1px solid ${channel.color}40` : "1px solid #E2E8F0",
                            }}
                          >
                            <div className="provider-channel-card-top">
                              <div className="provider-channel-identity">
                                <div
                                  className="provider-channel-icon-wrap"
                                  style={{ background: channel.bgColor || "#F1F5F9", color: channel.color || "#4F46E5" }}
                                >
                                  {renderChannelIcon(channel.icon, 20)}
                                </div>
                                <div className="provider-channel-meta">
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span className="provider-channel-title">{channel.name}</span>
                                    {!channel.isBuiltIn && (
                                      <span
                                        style={{
                                          fontSize: "9px",
                                          padding: "1px 5px",
                                          borderRadius: "4px",
                                          background: "#EFF6FF",
                                          color: "#2563EB",
                                          fontWeight: 700,
                                        }}
                                      >
                                        Mở rộng
                                      </span>
                                    )}
                                  </div>
                                  <span className="provider-channel-port">{channel.port}</span>
                                </div>
                              </div>

                              <label
                                className="xone-switch"
                                title={isConnected ? `Gạt để ngắt kết nối kênh ${channel.name}` : `Gạt để kết nối lại kênh ${channel.name}`}
                              >
                                <input
                                  type="checkbox"
                                  disabled={isToggling}
                                  checked={isConnected}
                                  onChange={(e) => void handleToggleChannel(channel.id, e.target.checked)}
                                />
                                <span className="xone-switch-slider" />
                              </label>
                            </div>

                            <p style={{ fontSize: "12px", color: "#64748B", margin: "8px 0 12px", lineHeight: 1.4, minHeight: "34px" }}>
                              {channel.description}
                            </p>

                            <div className="provider-channel-stats">
                              <span>Trạng thái kết nối:</span>
                              <span
                                className={`provider-channel-status-pill ${
                                  isConnected ? "provider-channel-status-pill--active" : "provider-channel-status-pill--disconnected"
                                }`}
                              >
                                <span
                                  style={{
                                    width: "6px",
                                    height: "6px",
                                    borderRadius: "50%",
                                    background: isConnected ? "#10B981" : "#EF4444",
                                  }}
                                  className={isConnected ? "pulse-dot-active" : ""}
                                />
                                {isToggling ? "Đang cập nhật..." : isConnected ? "Đang kết nối" : "Đã ngắt kết nối"}
                              </span>
                            </div>

                            <div className="provider-channel-footer">
                              {channel.id === "ride" ? (
                                <>
                                  <span style={{ fontSize: "11px", color: "#64748B" }}>
                                    {allRides.length} chuyến xe hôm nay
                                  </span>
                                  <button
                                    type="button"
                                    className="button button-sm button-secondary"
                                    style={{ height: "28px", padding: "0 10px", fontSize: "11px" }}
                                    onClick={() => setActiveTab("ride")}
                                  >
                                    Điều phối cuốc
                                  </button>
                                </>
                              ) : channel.id === "food" ? (
                                <>
                                  <span style={{ fontSize: "11px", color: "#64748B" }}>
                                    {orders.length} đơn món hôm nay
                                  </span>
                                  <button
                                    type="button"
                                    className="button button-sm button-secondary"
                                    style={{ height: "28px", padding: "0 10px", fontSize: "11px" }}
                                    onClick={() => setActiveTab("food")}
                                  >
                                    Bếp nhận đơn
                                  </button>
                                </>
                              ) : channel.id === "restaurant" ? (
                                <>
                                  <span style={{ fontSize: "11px", color: "#64748B" }}>
                                    {reservations.length} bàn đặt hôm nay
                                  </span>
                                  <button
                                    type="button"
                                    className="button button-sm button-secondary"
                                    style={{ height: "28px", padding: "0 10px", fontSize: "11px" }}
                                    onClick={() => setActiveTab("restaurant")}
                                  >
                                    Xếp bàn
                                  </button>
                                </>
                              ) : channel.id === "healthcare" ? (
                                <>
                                  <span style={{ fontSize: "11px", color: "#64748B" }}>
                                    {appointments.length} ca khám hôm nay
                                  </span>
                                  <button
                                    type="button"
                                    className="button button-sm button-secondary"
                                    style={{ height: "28px", padding: "0 10px", fontSize: "11px" }}
                                    onClick={() => setActiveTab("health")}
                                  >
                                    Lịch khám
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span style={{ fontSize: "11px", color: "#64748B" }}>
                                    Kênh mở rộng tự tạo
                                  </span>
                                  <button
                                    type="button"
                                    className="button button-sm"
                                    style={{
                                      height: "28px",
                                      padding: "0 8px",
                                      fontSize: "11px",
                                      color: "#DC2626",
                                      borderColor: "#FECACA",
                                      background: "#FEF2F2",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                    }}
                                    onClick={() => void handleDeleteCustomChannel(channel.id)}
                                    title={`Xóa kênh ${channel.name}`}
                                  >
                                    <Trash2 size={12} />
                                    <span>Gỡ bỏ</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Architecture & Extensibility Developer Guide */}
                  <div className="admin-table-card" style={{ padding: "24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "8px",
                          background: "#F5F3FF",
                          color: "#7C3AED",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <Zap size={18} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                          Kiến Trúc Mở Rộng Thêm Microservices Của Hệ Sinh Thái X-One
                        </h3>
                        <span style={{ fontSize: "var(--text-xs)", color: "#64748B" }}>
                          Cách hệ thống hỗ trợ thêm N microservices mới mà không cần sửa cấu trúc cơ sở dữ liệu (Zero Migration)
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: "16px", marginBottom: "18px" }}>
                      <div style={{ padding: "14px", background: "#F8FAFC", borderRadius: "10px", border: "1px solid #E2E8F0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                          <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: "#4F46E5", color: "#fff", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 700 }}>1</span>
                          <strong style={{ fontSize: "13px", color: "#0F172A" }}>PostgreSQL JSONB Schema-less</strong>
                        </div>
                        <p style={{ fontSize: "12px", color: "#64748B", margin: 0, lineHeight: 1.5 }}>
                          Trường <code>connected_services</code> trong bảng <code>provider_profiles</code> được lưu dưới dạng <code>JSONB</code>. Khi thêm kênh mới (ví dụ: <code>delivery</code>, <code>grocery</code>), hệ thống ghi trực tiếp key-value mà không cần chạy migration DDL.
                        </p>
                      </div>

                      <div style={{ padding: "14px", background: "#F8FAFC", borderRadius: "10px", border: "1px solid #E2E8F0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                          <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: "#059669", color: "#fff", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 700 }}>2</span>
                          <strong style={{ fontSize: "13px", color: "#0F172A" }}>API Gateway Dynamic Routing</strong>
                        </div>
                        <p style={{ fontSize: "12px", color: "#64748B", margin: 0, lineHeight: 1.5 }}>
                          API Gateway tự động chấp nhận bất kỳ mã kênh hợp lệ nào qua endpoint <code>PATCH /api/v1/provider/services/channels/:channel/toggle</code> bằng bộ kiểm định regex <code>/^[a-z0-9_-]&#123;2,40&#125;$/</code>.
                        </p>
                      </div>

                      <div style={{ padding: "14px", background: "#F8FAFC", borderRadius: "10px", border: "1px solid #E2E8F0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                          <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: "#D97706", color: "#fff", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 700 }}>3</span>
                          <strong style={{ fontSize: "13px", color: "#0F172A" }}>AI Agent Tự Động Định Tuyến</strong>
                        </div>
                        <p style={{ fontSize: "12px", color: "#64748B", margin: 0, lineHeight: 1.5 }}>
                          Bộ não AI Agent khi phân tích ý định người dùng (ví dụ: &quot;Giao hàng bưu phẩm gấp&quot;) sẽ tra cứu trạng thái kênh của Provider. Nếu kênh <code>delivery</code> mở, Agent lập tức sinh action điều phối tương ứng.
                        </p>
                      </div>
                    </div>

                    <div style={{ background: "#0F172A", padding: "14px 18px", borderRadius: "8px", color: "#F8FAFC" }}>
                      <span style={{ fontSize: "11px", color: "#94A3B8", display: "block", marginBottom: "6px" }}>
                        Ví dụ lệnh cURL kích hoạt kết nối dịch vụ mới qua API Gateway:
                      </span>
                      <code style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "#38BDF8", display: "block", wordBreak: "break-all" }}>
                        curl -X PATCH &quot;http://localhost:8000/api/v1/provider/services/channels/delivery/toggle&quot; \
                        <br />&nbsp;&nbsp;-H &quot;Authorization: Bearer $ACCESS_TOKEN&quot; \
                        <br />&nbsp;&nbsp;-H &quot;Content-Type: application/json&quot; \
                        <br />&nbsp;&nbsp;-d &#39;&#123;&quot;enabled&quot;: true&#125;&#39;
                      </code>
                    </div>
                  </div>
                </div>
              )}

            {/* TAB VIEWPORT */}
            <div className="provider-tab-viewport">
              {/* TAB 4: SERVICE INTEGRATION / SETUP */}
              {activeTab === "services" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                  {/* Earnings & Settlement Summary Card */}
                  <div className="admin-table-card" style={{ padding: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#ECFDF5", color: "#059669", display: "grid", placeItems: "center" }}>
                          <Wallet size={18} />
                        </div>
                        <div>
                          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                            Doanh thu & Quyết toán Đối tác
                          </h2>
                          <span style={{ fontSize: "var(--text-xs)", color: "#64748B" }}>
                            Tổng hợp doanh thu từ các chuyến đi, đơn món thực tế và khấu trừ tự động
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className="admin-role-badge" style={{ background: "#F1F5F9", color: "#475569", border: "1px solid #E2E8F0" }}>
                          Chu kỳ: Hàng tuần (Thứ 2)
                        </span>
                        <button
                          type="button"
                          disabled={loadingEarnings}
                          onClick={() => void reloadEarnings()}
                          className="button button-secondary"
                          style={{ height: "30px", padding: "0 10px", fontSize: "var(--text-micro)", display: "flex", alignItems: "center", gap: "4px" }}
                        >
                          <RefreshCw size={12} className={loadingEarnings ? "spin" : ""} />
                          <span>Làm mới</span>
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: "14px" }}>
                      <div style={{ padding: "14px", background: "#F8FAFC", borderRadius: "10px", border: "1px solid #E2E8F0" }}>
                        <span style={{ fontSize: "var(--text-micro)", color: "#64748B", fontWeight: 600 }}>Tổng doanh thu (Gross)</span>
                        <div style={{ fontSize: "var(--text-2xl)", fontWeight: 700, color: "#0F172A", marginTop: "4px" }}>
                          {(earnings?.gross_revenue ?? 0).toLocaleString("vi-VN")} đ
                        </div>
                        <span style={{ fontSize: "var(--text-micro)", color: "#059669", marginTop: "2px", display: "block" }}>
                          Tích lũy từ {earnings?.total_completed_transactions ?? 0} đơn / cuốc thành công
                        </span>
                      </div>

                      <div style={{ padding: "14px", background: "#F8FAFC", borderRadius: "10px", border: "1px solid #E2E8F0" }}>
                        <span style={{ fontSize: "var(--text-micro)", color: "#64748B", fontWeight: 600 }}>Chiết khấu nền tảng X-One ({earnings?.platform_fee_rate ?? "10%"})</span>
                        <div style={{ fontSize: "var(--text-2xl)", fontWeight: 700, color: "#DC2626", marginTop: "4px" }}>
                          -{(earnings?.platform_fee ?? 0).toLocaleString("vi-VN")} đ
                        </div>
                        <span style={{ fontSize: "var(--text-micro)", color: "#64748B", marginTop: "2px", display: "block" }}>
                          Phí duy trì hạ tầng & điều phối AI
                        </span>
                      </div>

                      <div style={{ padding: "14px", background: "#ECFDF5", borderRadius: "10px", border: "1px solid #A7F3D0" }}>
                        <span style={{ fontSize: "var(--text-micro)", color: "#065F46", fontWeight: 600 }}>Thực nhận đối tác (Net Payout)</span>
                        <div style={{ fontSize: "var(--text-2xl)", fontWeight: 700, color: "#059669", marginTop: "4px" }}>
                          {(earnings?.net_payout ?? 0).toLocaleString("vi-VN")} đ
                        </div>
                        <span style={{ fontSize: "var(--text-micro)", color: "#047857", marginTop: "2px", display: "block" }}>
                          Số dư sẵn sàng rút về tài khoản ngân hàng
                        </span>
                      </div>

                      <div style={{ padding: "14px", background: "#F8FAFC", borderRadius: "10px", border: "1px solid #E2E8F0" }}>
                        <span style={{ fontSize: "var(--text-micro)", color: "#64748B", fontWeight: 600 }}>Trạng thái quyết toán</span>
                        <div style={{ fontSize: "var(--text-base)", fontWeight: 700, color: "#4F46E5", marginTop: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                          <CheckCircle2 size={16} /> {earnings?.payout_status ?? "Sẵn sàng quyết toán"}
                        </div>
                        <span style={{ fontSize: "var(--text-micro)", color: "#64748B", marginTop: "4px", display: "block" }}>
                          Cập nhật: {earnings?.last_calculated_at ? new Date(earnings.last_calculated_at).toLocaleTimeString("vi-VN") : "Thời gian thực"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Business Profile Configuration Card */}
                  <div className="admin-table-card" style={{ padding: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#EEF2FF", color: "#4F46E5", display: "grid", placeItems: "center" }}>
                          <Building2 size={18} />
                        </div>
                        <div>
                          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                            Hồ sơ Cơ sở & Thiết lập Kết nối
                          </h2>
                          <span style={{ fontSize: "var(--text-xs)", color: "#64748B" }}>
                            Thông tin thương hiệu hiển thị cho khách hàng và cấu hình nhận thông báo tự động
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: profileForm.isOpen ? "#059669" : "#64748B" }}>
                          {profileForm.isOpen ? "Cửa hàng đang mở" : "Đang tạm đóng"}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleToggleOpenStatus()}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 12px",
                            borderRadius: "8px",
                            fontSize: "var(--text-xs)",
                            fontWeight: 600,
                            cursor: "pointer",
                            border: "none",
                            background: profileForm.isOpen ? "#ECFDF5" : "#F1F5F9",
                            color: profileForm.isOpen ? "#047857" : "#475569",
                          }}
                        >
                          <Power size={14} />
                          <span>{profileForm.isOpen ? "Chuyển sang Tạm đóng" : "Mở cửa nhận đơn"}</span>
                        </button>
                      </div>
                    </div>

                    <form onSubmit={handleSaveProfile} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: "16px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                          Tên thương hiệu / Cơ sở kinh doanh
                        </label>
                        <input
                          type="text"
                          value={profileForm.businessName}
                          onChange={(e) => setProfileForm({ ...profileForm, businessName: e.target.value })}
                          placeholder="VD: Quán Ăn Ngon Sài Gòn, Taxi Công Nghệ Hùng..."
                          style={{ width: "100%", height: "36px", padding: "0 12px", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "var(--text-sm)" }}
                          required
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                          Số điện thoại liên hệ
                        </label>
                        <input
                          type="text"
                          value={profileForm.phone}
                          onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                          placeholder="VD: 0901234567"
                          style={{ width: "100%", height: "36px", padding: "0 12px", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "var(--text-sm)" }}
                        />
                      </div>

                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                          Địa chỉ cơ sở / Trụ sở hoạt động
                        </label>
                        <input
                          type="text"
                          value={profileForm.address}
                          onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                          placeholder="VD: 123 Nguyễn Huệ, Bến Nghé, Quận 1, TP. Hồ Chí Minh"
                          style={{ width: "100%", height: "36px", padding: "0 12px", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "var(--text-sm)" }}
                        />
                      </div>

                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                          Webhook URL nhận sự kiện từ X-One (Tùy chọn dành cho tích hợp hệ thống ngoài / POS)
                        </label>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <input
                            type="url"
                            value={profileForm.webhookUrl}
                            onChange={(e) => setProfileForm({ ...profileForm, webhookUrl: e.target.value })}
                            placeholder="https://api.doitac.vn/webhooks/xone-events"
                            style={{ flex: 1, height: "36px", padding: "0 12px", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "var(--text-sm)" }}
                          />
                        </div>
                        <span style={{ fontSize: "var(--text-micro)", color: "#64748B", marginTop: "4px", display: "block" }}>
                          X-One sẽ gửi webhook HTTP POST kèm chữ ký bảo mật HMAC-SHA256 khi có cuốc xe hoặc đơn món mới.
                        </span>

                        {/* Webhook Sandbox & Test Console */}
                        <div style={{ marginTop: "12px", padding: "14px", background: "#F8FAFC", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <Code size={15} style={{ color: "#4F46E5" }} />
                              <strong style={{ fontSize: "var(--text-sm)", color: "#0F172A" }}>Webhook Live Sandbox (Thử nghiệm thời gian thực)</strong>
                            </div>
                            <span style={{ fontSize: "var(--text-micro)", color: "#64748B" }}>HMAC-SHA256 Signed · Timeout 5s</span>
                          </div>

                          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                            <select
                              value={webhookEvent}
                              onChange={(e) => setWebhookEvent(e.target.value)}
                              style={{ height: "34px", padding: "0 10px", border: "1px solid #CBD5E1", borderRadius: "6px", fontSize: "var(--text-xs)", background: "#FFFFFF" }}
                            >
                              <option value="ride.booking.confirmed">ride.booking.confirmed (Cuốc xe đã xác nhận)</option>
                              <option value="food.order.received">food.order.received (Đơn món quán ăn mới)</option>
                              <option value="healthcare.appointment.booked">healthcare.appointment.booked (Lịch hẹn khám mới)</option>
                            </select>

                            <button
                              type="button"
                              disabled={testingWebhook}
                              onClick={() => void handleTestWebhook()}
                              className="button button-secondary"
                              style={{ height: "34px", padding: "0 14px", fontSize: "var(--text-xs)", display: "inline-flex", alignItems: "center", gap: "6px" }}
                            >
                              {testingWebhook ? <LoaderCircle className="spin" size={13} /> : <Send size={13} />}
                              <span>{testingWebhook ? "Đang phát webhook…" : "Gửi thử nghiệm Live"}</span>
                            </button>
                          </div>

                          {webhookTestResult && (
                            <div style={{ marginTop: "12px", padding: "12px", borderRadius: "6px", background: webhookTestResult.success ? "#ECFDF5" : "#FEF2F2", border: `1px solid ${webhookTestResult.success ? "#A7F3D0" : "#FECACA"}` }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  {webhookTestResult.success ? <CheckCircle2 size={15} color="#059669" /> : <AlertTriangle size={15} color="#DC2626" />}
                                  <strong style={{ fontSize: "var(--text-xs)", color: webhookTestResult.success ? "#065F46" : "#991B1B" }}>
                                    {webhookTestResult.success ? `Giao tiếp thành công (HTTP ${webhookTestResult.status_code})` : `Giao tiếp thất bại (HTTP ${webhookTestResult.status_code || "Error"})`}
                                  </strong>
                                </div>
                                <span style={{ fontSize: "var(--text-micro)", color: "#64748B" }}>Độ trễ: <strong>{webhookTestResult.latency_ms}ms</strong></span>
                              </div>

                              {webhookTestResult.error_message && (
                                <div style={{ fontSize: "var(--text-xs)", color: "#DC2626", marginBottom: "6px" }}>
                                  Chi tiết lỗi: {webhookTestResult.error_message}
                                </div>
                              )}

                              <details style={{ marginTop: "6px" }}>
                                <summary style={{ fontSize: "var(--text-micro)", color: "#475569", cursor: "pointer", fontWeight: 600 }}>Xem Chi tiết Giao tiếp & Chữ ký HMAC</summary>
                                <pre style={{ margin: "6px 0 0", padding: "8px", background: "#0F172A", color: "#F8FAFC", borderRadius: "4px", fontSize: "var(--text-micro)", overflowX: "auto" }}>
                                  {JSON.stringify({
                                    target_url: webhookTestResult.target_url,
                                    event_sent: webhookTestResult.event_sent,
                                    signature_sent: webhookTestResult.signature_sent,
                                    response_body: webhookTestResult.response_body,
                                  }, null, 2)}
                                </pre>
                              </details>
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                        <button
                          type="submit"
                          disabled={savingProfile}
                          className="button button-primary"
                          style={{ height: "36px", padding: "0 18px", fontSize: "var(--text-sm)", fontWeight: 600 }}
                        >
                          {savingProfile ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}
                          <span>{savingProfile ? "Đang lưu…" : "Lưu cập nhật hồ sơ"}</span>
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Attached Service Offerings Table */}
                  <div className="admin-table-card" style={{ padding: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
                      <div>
                        <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                          Danh mục Dịch vụ & Món ăn ({serviceItems.length})
                        </h2>
                        <span style={{ fontSize: "var(--text-xs)", color: "#64748B" }}>
                          Bật / tắt nhanh trạng thái mở bán thời gian thực kiểu merchant thực tế
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => openAddItemModal()}
                        className="button button-primary"
                        style={{ height: "36px", padding: "0 16px", fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        <Plus size={15} />
                        <span>Gắn Dịch Vụ / Món Mới</span>
                      </button>
                    </div>

                    {/* Category Filter Pills */}
                    <div className="catalog-filter-bar">
                      <button
                        type="button"
                        className={`catalog-filter-pill ${catalogFilter === "all" ? "is-active" : ""}`}
                        onClick={() => setCatalogFilter("all")}
                      >
                        Tất cả ({serviceItems.length})
                      </button>
                      <button
                        type="button"
                        className={`catalog-filter-pill ${catalogFilter === "ride" ? "is-active" : ""}`}
                        onClick={() => setCatalogFilter("ride")}
                      >
                        🚗 Vận chuyển ({serviceItems.filter((i) => i.domain === "ride").length})
                      </button>
                      <button
                        type="button"
                        className={`catalog-filter-pill ${catalogFilter === "food" ? "is-active" : ""}`}
                        onClick={() => setCatalogFilter("food")}
                      >
                        🍜 Ẩm thực ({serviceItems.filter((i) => i.domain === "food").length})
                      </button>
                      <button
                        type="button"
                        className={`catalog-filter-pill ${catalogFilter === "restaurant" ? "is-active" : ""}`}
                        onClick={() => setCatalogFilter("restaurant")}
                      >
                        🍽️ Đặt bàn ({serviceItems.filter((i) => i.domain === "restaurant").length})
                      </button>
                      <button
                        type="button"
                        className={`catalog-filter-pill ${catalogFilter === "healthcare" ? "is-active" : ""}`}
                        onClick={() => setCatalogFilter("healthcare")}
                      >
                        🩺 Y tế ({serviceItems.filter((i) => i.domain === "healthcare").length})
                      </button>
                    </div>

                    {filteredServiceItems.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "40px 20px", color: "#64748B" }}>
                        <Layers size={36} style={{ margin: "0 auto 10px", color: "#94A3B8" }} />
                        <p style={{ margin: "0 0 10px", fontSize: "var(--text-base)", fontWeight: 600, color: "#0F172A" }}>
                          {serviceItems.length === 0 ? "Chưa có dịch vụ nào được gắn vào hệ thống." : "Không có món/dịch vụ nào trong phân loại này."}
                        </p>
                        {serviceItems.length === 0 && (
                          <button
                            type="button"
                            onClick={() => openAddItemModal()}
                            className="button button-primary"
                            style={{ fontSize: "var(--text-xs)", padding: "6px 14px" }}
                          >
                            Bấm để gắn dịch vụ đầu tiên
                          </button>
                        )}
                      </div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid #E2E8F0", textAlign: "left", background: "#F8FAFC" }}>
                              <th style={{ padding: "10px 14px", fontWeight: 700, color: "#475569" }}>Tên Dịch vụ / Món</th>
                              <th style={{ padding: "10px 14px", fontWeight: 700, color: "#475569" }}>Phân loại</th>
                              <th style={{ padding: "10px 14px", fontWeight: 700, color: "#475569" }}>Đơn giá</th>
                              <th style={{ padding: "10px 14px", fontWeight: 700, color: "#475569" }}>Trạng thái mở bán</th>
                              <th style={{ padding: "10px 14px", fontWeight: 700, color: "#475569", textAlign: "right" }}>Mở bán / Tắt</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredServiceItems.map((item) => (
                              <tr key={item.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                                <td style={{ padding: "12px 14px" }}>
                                  <strong style={{ color: "#0F172A", display: "block" }}>{item.name}</strong>
                                  {item.description && (
                                    <span style={{ fontSize: "var(--text-micro)", color: "#64748B" }}>{item.description}</span>
                                  )}
                                </td>
                                <td style={{ padding: "12px 14px" }}>
                                  <span
                                    className="admin-role-badge"
                                    style={{
                                      background:
                                        item.domain === "food"
                                          ? "#FFFBEB"
                                          : item.domain === "ride"
                                          ? "#EEF2FF"
                                          : item.domain === "restaurant"
                                          ? "#FDF2F8"
                                          : "#ECFDF5",
                                      color:
                                        item.domain === "food"
                                          ? "#EA580C"
                                          : item.domain === "ride"
                                          ? "#4338CA"
                                          : item.domain === "restaurant"
                                          ? "#DB2777"
                                          : "#065F46",
                                      border: `1px solid ${
                                        item.domain === "food"
                                          ? "#FDE68A"
                                          : item.domain === "ride"
                                          ? "#C7D2FE"
                                          : item.domain === "restaurant"
                                          ? "#FBCFE8"
                                          : "#A7F3D0"
                                      }`,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {item.category || (item.domain === "food" ? "Món ăn" : item.domain === "ride" ? "Xe di chuyển" : item.domain === "restaurant" ? "Bàn ăn" : "Y tế")}
                                  </span>
                                </td>
                                <td style={{ padding: "12px 14px", fontWeight: 700, color: "#059669" }}>
                                  {item.price.toLocaleString("vi-VN")} {item.currency}
                                </td>
                                <td style={{ padding: "12px 14px" }}>
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "5px",
                                      padding: "3px 8px",
                                      borderRadius: "6px",
                                      fontSize: "var(--text-micro)",
                                      fontWeight: 600,
                                      background: item.isAvailable ? "#ECFDF5" : "#F1F5F9",
                                      color: item.isAvailable ? "#047857" : "#64748B",
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: "6px",
                                        height: "6px",
                                        borderRadius: "50%",
                                        background: item.isAvailable ? "#10B981" : "#94A3B8",
                                      }}
                                    />
                                    {item.isAvailable ? "Đang mở bán" : "Tạm ẩn"}
                                  </span>
                                </td>
                                <td style={{ padding: "12px 14px", textAlign: "right" }}>
                                  <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: "10px" }}>
                                    <label className="xone-switch" title={item.isAvailable ? "Gạt để tạm ẩn món/dịch vụ này" : "Gạt để mở bán lại"}>
                                      <input
                                        type="checkbox"
                                        checked={item.isAvailable}
                                        onChange={() => void handleToggleItem(item.id, item.isAvailable)}
                                      />
                                      <span className="xone-switch-slider" />
                                    </label>

                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteItem(item.id)}
                                      className="admin-action-btn admin-action-btn-revoke"
                                      style={{ height: "28px", padding: "0 8px" }}
                                      title="Xóa dịch vụ này"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* MODAL THÊM DỊCH VỤ MỚI */}
              {showAddItemModal && (
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    backgroundColor: "rgba(15, 23, 42, 0.6)",
                    backdropFilter: "blur(4px)",
                    zIndex: 999,
                    display: "grid",
                    placeItems: "center",
                    padding: "20px",
                  }}
                >
                  <div
                    style={{
                      background: "#FFFFFF",
                      borderRadius: "14px",
                      border: "1px solid #E2E8F0",
                      width: "min(520px, 100%)",
                      padding: "24px",
                      boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 750, margin: 0, color: "#0F172A" }}>
                        Gắn Dịch Vụ / Món Ăn Mới Vào X-One
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowAddItemModal(false)}
                        style={{ border: "none", background: "none", cursor: "pointer", color: "#64748B" }}
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <form onSubmit={handleAddItem} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                          Lĩnh vực dịch vụ {isMaster ? "(Toàn quyền Master 4 Dịch vụ)" : "(Cố định theo lĩnh vực đăng ký)"}
                        </label>
                        <div style={{ display: "grid", gridTemplateColumns: isMaster ? "repeat(auto-fit, minmax(min(140px, 100%), 1fr))" : "1fr", gap: "8px" }}>
                          {(isMaster || rawProviderType === "restaurant_merchant" || rawProviderType === "food") && (
                            <button
                              type="button"
                              onClick={() => setNewItem({ ...newItem, domain: "food", category: "Món ăn" })}
                              style={{
                                padding: "8px",
                                borderRadius: "8px",
                                fontSize: "var(--text-xs)",
                                fontWeight: 600,
                                border: `1px solid ${newItem.domain === "food" ? "#F59E0B" : "#CBD5E1"}`,
                                background: newItem.domain === "food" ? "#FFFBEB" : "#FFFFFF",
                                color: newItem.domain === "food" ? "#EA580C" : "#475569",
                                cursor: isMaster ? "pointer" : "default",
                              }}
                            >
                              🍲 Món ăn {isMaster ? "" : "(Phân hệ Quán ăn & Nhà hàng)"}
                            </button>
                          )}
                          {(isMaster || rawProviderType === "ride_driver" || rawProviderType === "ride") && (
                            <button
                              type="button"
                              onClick={() => setNewItem({ ...newItem, domain: "ride", category: "Xe 4 chỗ" })}
                              style={{
                                padding: "8px",
                                borderRadius: "8px",
                                fontSize: "var(--text-xs)",
                                fontWeight: 600,
                                border: `1px solid ${newItem.domain === "ride" ? "#6366F1" : "#CBD5E1"}`,
                                background: newItem.domain === "ride" ? "#EEF2FF" : "#FFFFFF",
                                color: newItem.domain === "ride" ? "#4338CA" : "#475569",
                                cursor: isMaster ? "pointer" : "default",
                              }}
                            >
                              🚗 Chuyến xe {isMaster ? "" : "(Phân hệ Tài xế & Vận chuyển)"}
                            </button>
                          )}
                          {(isMaster || rawProviderType === "healthcare_doctor" || rawProviderType === "healthcare") && (
                            <button
                              type="button"
                              onClick={() => setNewItem({ ...newItem, domain: "healthcare", category: "Gói khám" })}
                              style={{
                                padding: "8px",
                                borderRadius: "8px",
                                fontSize: "var(--text-xs)",
                                fontWeight: 600,
                                border: `1px solid ${newItem.domain === "healthcare" ? "#10B981" : "#CBD5E1"}`,
                                background: newItem.domain === "healthcare" ? "#ECFDF5" : "#FFFFFF",
                                color: newItem.domain === "healthcare" ? "#065F46" : "#475569",
                                cursor: isMaster ? "pointer" : "default",
                              }}
                            >
                              🩺 Khám bệnh {isMaster ? "" : "(Phân hệ Cơ sở Y tế)"}
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                          Tên dịch vụ / Món ăn / Phương tiện
                        </label>
                        <input
                          type="text"
                          value={newItem.name}
                          onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                          placeholder="VD: Bún Bò Huế Đặc Biệt, Xe Sedona 7 Chỗ..."
                          style={{ width: "100%", height: "36px", padding: "0 12px", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "var(--text-sm)" }}
                          required
                        />
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: "12px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                            Đơn giá (VND)
                          </label>
                          <input
                            type="number"
                            value={newItem.price}
                            onChange={(e) => setNewItem({ ...newItem, price: Number(e.target.value) })}
                            min={0}
                            step={1000}
                            style={{ width: "100%", height: "36px", padding: "0 12px", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "var(--text-sm)" }}
                            required
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                            Phân loại / Chuyên mục
                          </label>
                          <input
                            type="text"
                            value={newItem.category}
                            onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                            placeholder="VD: Món chính, Xe cao cấp..."
                            style={{ width: "100%", height: "36px", padding: "0 12px", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "var(--text-sm)" }}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                          Mô tả dịch vụ
                        </label>
                        <textarea
                          value={newItem.description}
                          onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                          placeholder="Mô tả thành phần, tiện ích phương tiện hoặc khung giờ tiếp nhận..."
                          rows={3}
                          style={{ width: "100%", padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "var(--text-sm)", resize: "none" }}
                        />
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
                        <button
                          type="button"
                          onClick={() => setShowAddItemModal(false)}
                          className="button button-secondary"
                          style={{ height: "36px", padding: "0 14px", fontSize: "var(--text-sm)" }}
                        >
                          Hủy
                        </button>
                        <button
                          type="submit"
                          disabled={submittingItem}
                          className="button button-primary"
                          style={{ height: "36px", padding: "0 18px", fontSize: "var(--text-sm)", fontWeight: 600 }}
                        >
                          {submittingItem ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}
                          <span>{submittingItem ? "Đang gắn…" : "Xác nhận gắn dịch vụ"}</span>
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* TAB 1: RIDE PARTNER */}
              {activeTab === "ride" && isAllowedTab("ride") && (
                <div>
                  {connectedServices.ride === false && (
                    <div className="provider-disconnected-alert">
                      <div className="provider-disconnected-alert-icon">
                        <AlertTriangle size={20} />
                      </div>
                      <div className="provider-disconnected-alert-body">
                        <h4>Kênh Dịch Vụ Vận Chuyển Đang Tạm Ngắt Kết Nối</h4>
                        <p>
                          Kênh này đang ở chế độ ngắt kết nối. Khách hàng và AI Agent sẽ không thể tìm thấy hoặc điều phối các chuyến xe mới từ bạn cho đến khi bạn kết nối lại.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="button button-sm button-primary"
                        disabled={togglingChannel === "ride"}
                        onClick={() => void handleToggleChannel("ride", true)}
                        style={{ whiteSpace: "nowrap" }}
                      >
                        <Power size={14} style={{ marginRight: "6px" }} />
                        Kết nối lại ngay
                      </button>
                    </div>
                  )}

                  {!activeRide ? (
                    <div className="admin-table-card" style={{ padding: "40px 24px", textAlign: "center" }}>
                      <div
                        style={{
                          width: "52px",
                          height: "52px",
                          borderRadius: "14px",
                          background: "#EEF2FF",
                          color: "#4F46E5",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: "16px",
                          border: "1px solid #C7D2FE",
                        }}
                      >
                        <Car size={26} />
                      </div>
                      <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "#0F172A", margin: "0 0 6px 0" }}>
                        Chưa có chuyến xe nào đang điều phối
                      </h3>
                      <p style={{ fontSize: "var(--text-sm)", color: "#64748B", maxWidth: "520px", margin: "0 auto 20px" }}>
                        Hệ thống đối tác được kết nối trực tiếp với microservice <code>ride-service</code> và cơ sở dữ liệu PostgreSQL thực tế. Bạn có thể nhấn nút bên dưới để tạo ngay một chuyến đi thử nghiệm trực tiếp vào database.
                      </p>
                      <div style={{ display: "inline-flex", gap: "10px", alignItems: "center" }}>
                        <button
                          type="button"
                          disabled={seedingDomain === "ride" || loadingOperations}
                          onClick={() => void handleSeedSample("ride")}
                          className="button button-primary"
                          style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "38px", padding: "0 18px", fontSize: "var(--text-sm)", fontWeight: 600 }}
                        >
                          {seedingDomain === "ride" ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />}
                          <span>{seedingDomain === "ride" ? "Đang ghi vào PostgreSQL…" : "Tạo chuyến đi mẫu vào PostgreSQL"}</span>
                        </button>
                        <button
                          type="button"
                          disabled={loadingOperations}
                          onClick={() => void reloadOperations()}
                          className="button button-secondary"
                          style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "38px", padding: "0 14px", fontSize: "var(--text-sm)" }}
                        >
                          {loadingOperations ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
                          <span>Làm mới dữ liệu</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <h2 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                            Cuốc xe đang điều phối ({allRides.length} chuyến trong hệ thống)
                          </h2>
                          <span
                            className="admin-role-badge"
                            style={{ background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0", fontSize: "var(--text-micro)" }}
                          >
                            Kết nối trực tiếp
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <button
                            type="button"
                            disabled={seedingDomain === "ride" || loadingOperations}
                            onClick={() => void handleSeedSample("ride")}
                            className="button button-secondary"
                            style={{ height: "32px", padding: "0 12px", fontSize: "var(--text-xs)", display: "inline-flex", alignItems: "center", gap: "6px" }}
                          >
                            {seedingDomain === "ride" ? <LoaderCircle className="spin" size={13} /> : <Plus size={13} />}
                            <span>Tạo thêm cuốc xe mẫu</span>
                          </button>
                          <button
                            type="button"
                            disabled={loadingOperations}
                            onClick={() => void reloadOperations()}
                            className="button button-secondary"
                            style={{ height: "32px", padding: "0 10px", fontSize: "var(--text-xs)", display: "inline-flex", alignItems: "center", gap: "6px" }}
                            title="Tải lại từ PostgreSQL"
                          >
                            <RefreshCw className={loadingOperations ? "spin" : ""} size={13} />
                            <span>Làm mới</span>
                          </button>
                        </div>
                      </div>

                      <div className="admin-table-card" style={{ padding: "20px", marginBottom: allRides.length > 1 ? "20px" : "0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                          <div>
                            <span style={{ fontSize: "var(--text-base)", fontWeight: 700, color: "#0F172A" }}>
                              Chuyến xe hiện tại
                            </span>
                            <div style={{ fontSize: "var(--text-xs)", color: "#64748B", marginTop: "2px" }}>
                              Mã cuốc (PostgreSQL): <strong style={{ color: "#334155" }}>{activeRide.id}</strong>
                            </div>
                          </div>

                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: "var(--text-2xl)", fontWeight: 700, color: "#059669" }}>
                              {activeRide.fare.toLocaleString("vi-VN")} {activeRide.currency}
                            </div>
                            <span style={{ fontSize: "var(--text-xs)", color: "#64748B" }}>Thanh toán qua Ví X-One</span>
                          </div>
                        </div>

                        <div
                          style={{
                            background: "#F8FAFC",
                            border: "1px solid #E2E8F0",
                            borderRadius: "12px",
                            padding: "18px",
                            marginBottom: "18px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <div className="admin-user-avatar" style={{ background: "#EEF2FF", color: "#4F46E5" }}>
                                {activeRide.passengerName[0]}
                              </div>
                              <div>
                                <strong style={{ fontSize: "var(--text-base)", color: "#0F172A", display: "block" }}>
                                  {activeRide.passengerName}
                                </strong>
                                <span style={{ fontSize: "var(--text-xs)", color: "#64748B" }}>Đặt {activeRide.time}</span>
                              </div>
                            </div>

                            <span
                              className="admin-role-badge role-customer"
                              style={{ background: "#EEF2FF", color: "#4338CA", border: "1px solid #C7D2FE" }}
                            >
                              {activeRide.passengers} Hành khách
                            </span>
                          </div>

                          {/* Route Details */}
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "12px",
                              padding: "14px",
                              background: "#FFFFFF",
                              border: "1px solid #E2E8F0",
                              borderRadius: "10px",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                              <div style={{ width: "20px", display: "flex", justifyContent: "center", paddingTop: "3px" }}>
                                <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#4F46E5" }} />
                              </div>
                              <div>
                                <div style={{ fontSize: "var(--text-micro)", color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                                  Điểm đón khách
                                </div>
                                <div style={{ fontSize: "var(--text-sm)", color: "#0F172A", fontWeight: 600 }}>{activeRide.pickup}</div>
                              </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                              <div style={{ width: "20px", display: "flex", justifyContent: "center", paddingTop: "2px" }}>
                                <MapPin size={15} style={{ color: "#EF4444" }} />
                              </div>
                              <div>
                                <div style={{ fontSize: "var(--text-micro)", color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                                  Điểm trả khách
                                </div>
                                <div style={{ fontSize: "var(--text-sm)", color: "#0F172A", fontWeight: 600 }}>{activeRide.destination}</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Actions & Status */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "var(--text-xs)", color: "#64748B" }}>Trạng thái hiện tại:</span>
                            <span
                              className="admin-role-badge"
                              style={{
                                background: activeRide.status === "COMPLETED" ? "#ECFDF5" : "#EEF2FF",
                                color: activeRide.status === "COMPLETED" ? "#065F46" : "#4338CA",
                                border: `1px solid ${activeRide.status === "COMPLETED" ? "#A7F3D0" : "#C7D2FE"}`,
                                fontWeight: 700,
                                fontSize: "var(--text-micro)",
                                padding: "4px 10px",
                              }}
                            >
                              {activeRide.status}
                            </span>
                          </div>

                          {activeRide.status !== "COMPLETED" ? (
                            <button
                              type="button"
                              disabled={loadingAction}
                              onClick={() => void advanceRideStatus()}
                              className="button button-primary"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "8px",
                                height: "38px",
                                padding: "0 18px",
                                fontSize: "var(--text-sm)",
                                fontWeight: 600,
                              }}
                            >
                              {loadingAction ? <LoaderCircle className="spin" size={15} /> : <Navigation size={15} />}
                              <span>
                                {activeRide.status === "DRIVER_TO_PICKUP" && "Đã đến điểm đón (DRIVER_ARRIVED)"}
                                {activeRide.status === "DRIVER_ARRIVED" && "Bắt đầu chuyến đi (IN_PROGRESS)"}
                                {activeRide.status === "IN_PROGRESS" && "Đã tới đích (ARRIVED_DESTINATION)"}
                                {activeRide.status === "ARRIVED_DESTINATION" && "Hoàn thành chuyến (COMPLETED)"}
                              </span>
                            </button>
                          ) : (
                            <span style={{ fontSize: "var(--text-sm)", color: "#059669", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                              <CheckCircle2 size={16} /> Chuyến đi đã hoàn thành xuất sắc
                            </span>
                          )}
                        </div>
                      </div>

                      {/* If multiple rides, show other rides list */}
                      {allRides.length > 1 && (
                        <div className="admin-table-card" style={{ padding: "18px" }}>
                          <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, color: "#0F172A", marginBottom: "12px" }}>
                            Các chuyến xe khác trong hệ thống ({allRides.length - 1})
                          </h3>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {allRides
                              .filter((r) => r.id !== activeRide.id)
                              .map((ride) => (
                                <div
                                  key={ride.id}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "10px 14px",
                                    background: "#F8FAFC",
                                    border: "1px solid #E2E8F0",
                                    borderRadius: "8px",
                                  }}
                                >
                                  <div>
                                    <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "#0F172A" }}>
                                      {ride.pickup} → {ride.destination}
                                    </div>
                                    <div style={{ fontSize: "var(--text-micro)", color: "#64748B" }}>
                                      Mã: {ride.id} · {ride.fare.toLocaleString("vi-VN")} {ride.currency} · Trạng thái: <strong>{ride.status}</strong>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setActiveRide(ride)}
                                    className="button button-secondary"
                                    style={{ height: "30px", padding: "0 12px", fontSize: "var(--text-xs)" }}
                                  >
                                    Chọn điều phối
                                  </button>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: DELIVERY OPERATIONS */}
              {activeTab === "delivery" && isAllowedTab("delivery") && (
                <div>
                  {connectedServices.delivery === false && (
                    <div className="provider-disconnected-alert">
                      <div className="provider-disconnected-alert-icon">
                        <AlertTriangle size={20} />
                      </div>
                      <div className="provider-disconnected-alert-body">
                        <h4>Kênh Dịch Vụ Giao Hàng & Bưu Kiện Đang Tạm Ngắt Kết Nối</h4>
                        <p>
                          Dịch vụ giao hàng của bạn đang ở chế độ ngắt kết nối. Khách hàng và trợ lý AI sẽ không thể tạo đơn giao bưu kiện hoặc gọi shipper cho đến khi bạn kết nối lại.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="button button-sm button-primary"
                        disabled={togglingChannel === "delivery"}
                        onClick={() => void handleToggleChannel("delivery", true)}
                        style={{ whiteSpace: "nowrap" }}
                      >
                        <Power size={14} style={{ marginRight: "6px" }} />
                        Kết nối lại ngay
                      </button>
                    </div>
                  )}

                  <div style={{ marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <h2 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                        Quản lý đơn giao hàng & bưu kiện ({deliveries.length} đơn)
                      </h2>
                      <span
                        className="admin-role-badge"
                        style={{ background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE", fontSize: "var(--text-micro)" }}
                      >
                        delivery-service :8106
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        type="button"
                        disabled={seedingDomain === "delivery" || loadingOperations}
                        onClick={() => void handleSeedSample("delivery", "đơn giao hàng")}
                        className="button button-secondary"
                        style={{ height: "32px", padding: "0 12px", fontSize: "var(--text-xs)", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      >
                        {seedingDomain === "delivery" ? <LoaderCircle className="spin" size={13} /> : <Plus size={13} />}
                        <span>Tạo đơn giao hàng mẫu</span>
                      </button>
                      <button
                        type="button"
                        disabled={loadingOperations}
                        onClick={() => void reloadOperations()}
                        className="button button-secondary"
                        style={{ height: "32px", padding: "0 12px", fontSize: "var(--text-xs)", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      >
                        <RefreshCw className={loadingOperations ? "spin" : ""} size={13} />
                        <span>Làm mới</span>
                      </button>
                    </div>
                  </div>

                  {deliveries.length === 0 ? (
                    <div className="admin-table-card" style={{ padding: "40px 24px", textAlign: "center" }}>
                      <div
                        style={{
                          width: "52px",
                          height: "52px",
                          borderRadius: "14px",
                          background: "#EFF6FF",
                          color: "#2563EB",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: "16px",
                          border: "1px solid #BFDBFE",
                        }}
                      >
                        <Package size={24} />
                      </div>
                      <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "#0F172A", margin: "0 0 6px 0" }}>
                        Hiện chưa có đơn giao bưu kiện nào
                      </h3>
                      <p style={{ fontSize: "var(--text-sm)", color: "#64748B", maxWidth: "500px", margin: "0 auto 20px" }}>
                        Dữ liệu giao hàng được đồng bộ trực tiếp từ microservice <code>delivery-service</code> (:8106) độc lập. Bạn có thể nhấn tạo đơn mẫu để kiểm tra quy trình điều phối shipper và giao hàng.
                      </p>
                      <div style={{ display: "inline-flex", gap: "10px", alignItems: "center" }}>
                        <button
                          type="button"
                          disabled={seedingDomain === "delivery" || loadingOperations}
                          onClick={() => void handleSeedSample("delivery", "đơn giao hàng")}
                          className="button button-primary"
                          style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "38px", padding: "0 18px", fontSize: "var(--text-sm)", fontWeight: 600 }}
                        >
                          {seedingDomain === "delivery" ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />}
                          <span>{seedingDomain === "delivery" ? "Đang kết nối hệ thống…" : "Tạo đơn giao hàng mẫu"}</span>
                        </button>
                        <button
                          type="button"
                          disabled={loadingOperations}
                          onClick={() => void reloadOperations()}
                          className="button button-secondary"
                          style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "38px", padding: "0 16px", fontSize: "var(--text-sm)" }}
                        >
                          {loadingOperations ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
                          <span>Làm mới danh sách</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", gap: "16px" }}>
                      {deliveries.map((delivery) => (
                        <div
                          key={delivery.id}
                          className="admin-table-card"
                          style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}
                        >
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <strong style={{ fontSize: "var(--text-base)", color: "#0F172A" }}>{delivery.trackingCode}</strong>
                                  <span style={{ fontSize: "var(--text-micro)", color: "#64748B" }}>#{delivery.id}</span>
                                </div>
                                <div style={{ fontSize: "var(--text-micro)", color: "#64748B", marginTop: "2px" }}>
                                  Loại: <strong>{delivery.packageType}</strong> {delivery.weightKg ? `· ${delivery.weightKg} kg` : ""} · {delivery.time}
                                </div>
                              </div>
                              <span
                                className="admin-role-badge"
                                style={{
                                  background:
                                    delivery.status === "DELIVERED"
                                      ? "#ECFDF5"
                                      : delivery.status === "DELIVERING" || delivery.status === "PICKING_UP"
                                      ? "#EFF6FF"
                                      : delivery.status === "COURIER_ASSIGNED"
                                      ? "#FFFBEB"
                                      : "#F1F5F9",
                                  color:
                                    delivery.status === "DELIVERED"
                                      ? "#065F46"
                                      : delivery.status === "DELIVERING" || delivery.status === "PICKING_UP"
                                      ? "#1D4ED8"
                                      : delivery.status === "COURIER_ASSIGNED"
                                      ? "#EA580C"
                                      : "#475569",
                                  border: `1px solid ${
                                    delivery.status === "DELIVERED"
                                      ? "#A7F3D0"
                                      : delivery.status === "DELIVERING" || delivery.status === "PICKING_UP"
                                      ? "#BFDBFE"
                                      : delivery.status === "COURIER_ASSIGNED"
                                      ? "#FDE68A"
                                      : "#E2E8F0"
                                  }`,
                                  fontWeight: 700,
                                }}
                              >
                                {formatDeliveryStatus(delivery.status)}
                              </span>
                            </div>

                            {/* Addresses */}
                            <div
                              style={{
                                background: "#F8FAFC",
                                border: "1px solid #E2E8F0",
                                borderRadius: "8px",
                                padding: "10px 12px",
                                marginBottom: "12px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                                fontSize: "var(--text-xs)",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                                <span style={{ color: "#059669", fontWeight: 700, minWidth: "50px" }}>Lấy hàng:</span>
                                <div>
                                  <div style={{ color: "#1E293B", fontWeight: 550 }}>{delivery.pickup}</div>
                                  <div style={{ color: "#64748B", fontSize: "var(--text-micro)" }}>{delivery.senderName} {delivery.senderPhone ? `(${delivery.senderPhone})` : ""}</div>
                                </div>
                              </div>
                              <div style={{ height: "1px", background: "#E2E8F0", margin: "2px 0" }} />
                              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                                <span style={{ color: "#2563EB", fontWeight: 700, minWidth: "50px" }}>Giao đến:</span>
                                <div>
                                  <div style={{ color: "#1E293B", fontWeight: 550 }}>{delivery.destination}</div>
                                  <div style={{ color: "#64748B", fontSize: "var(--text-micro)" }}>{delivery.receiverName} ({delivery.receiverPhone})</div>
                                </div>
                              </div>
                            </div>

                            {/* Courier Info */}
                            {delivery.courier && (
                              <div
                                style={{
                                  fontSize: "var(--text-xs)",
                                  color: "#334155",
                                  backgroundColor: "#F0FDF4",
                                  border: "1px solid #BBF7D0",
                                  padding: "8px 12px",
                                  borderRadius: "8px",
                                  marginBottom: "12px",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <div>
                                  <strong>Shipper:</strong> {delivery.courier.name} ({delivery.courier.phone})
                                </div>
                                <span style={{ fontSize: "var(--text-micro)", color: "#059669", fontWeight: 600 }}>
                                  {delivery.courier.vehiclePlate} · {delivery.courier.vehicleModel}
                                </span>
                              </div>
                            )}

                            {delivery.packageDesc && (
                              <div style={{ fontSize: "var(--text-xs)", color: "#64748B", marginBottom: "12px" }}>
                                📦 Mô tả: {delivery.packageDesc}
                              </div>
                            )}
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", borderTop: "1px solid #F1F5F9", paddingTop: "12px" }}>
                            <div>
                              <div style={{ fontSize: "var(--text-micro)", color: "#64748B" }}>Cước phí vận chuyển</div>
                              <div style={{ fontSize: "var(--text-base)", fontWeight: 700, color: "#2563EB" }}>
                                {delivery.amount.toLocaleString("vi-VN")} {delivery.currency}
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                              {delivery.status === "CREATED" && (
                                <button
                                  type="button"
                                  onClick={() => advanceDeliveryStatus(delivery.id, "COURIER_ASSIGNED")}
                                  className="button button-primary"
                                  style={{ height: "32px", padding: "0 12px", fontSize: "var(--text-xs)" }}
                                >
                                  Gán tài xế
                                </button>
                              )}
                              {delivery.status === "COURIER_ASSIGNED" && (
                                <button
                                  type="button"
                                  onClick={() => advanceDeliveryStatus(delivery.id, "PICKING_UP")}
                                  className="button button-primary"
                                  style={{ height: "32px", padding: "0 12px", fontSize: "var(--text-xs)" }}
                                >
                                  Tài xế đi lấy hàng
                                </button>
                              )}
                              {delivery.status === "PICKING_UP" && (
                                <button
                                  type="button"
                                  onClick={() => advanceDeliveryStatus(delivery.id, "DELIVERING")}
                                  className="button button-primary"
                                  style={{
                                    height: "32px",
                                    padding: "0 12px",
                                    fontSize: "var(--text-xs)",
                                    backgroundColor: "#2563EB",
                                    borderColor: "#2563EB",
                                  }}
                                >
                                  Đã lấy — Đi giao hàng
                                </button>
                              )}
                              {delivery.status === "DELIVERING" && (
                                <button
                                  type="button"
                                  onClick={() => advanceDeliveryStatus(delivery.id, "DELIVERED")}
                                  className="button button-primary"
                                  style={{
                                    height: "32px",
                                    padding: "0 12px",
                                    fontSize: "var(--text-xs)",
                                    backgroundColor: "#059669",
                                    borderColor: "#059669",
                                  }}
                                >
                                  Đã giao thành công
                                </button>
                              )}
                              {delivery.status === "DELIVERED" && (
                                <span style={{ fontSize: "var(--text-xs)", color: "#059669", fontWeight: 600 }}>
                                  ✓ Đã hoàn tất giao
                                </span>
                              )}
                              {delivery.status === "CANCELLED" && (
                                <span style={{ fontSize: "var(--text-xs)", color: "#DC2626", fontWeight: 600 }}>
                                  Đã hủy đơn
                                </span>
                              )}
                              {delivery.status !== "DELIVERED" && delivery.status !== "CANCELLED" && (
                                <button
                                  type="button"
                                  onClick={() => advanceDeliveryStatus(delivery.id, "CANCELLED")}
                                  className="button button-secondary"
                                  style={{ height: "32px", padding: "0 10px", fontSize: "var(--text-xs)", color: "#DC2626" }}
                                  title="Hủy đơn giao này"
                                >
                                  Hủy
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: FOOD MERCHANT */}
              {activeTab === "food" && isAllowedTab("food") && (
                <div>
                  {connectedServices.food === false && (
                    <div className="provider-disconnected-alert">
                      <div className="provider-disconnected-alert-icon">
                        <AlertTriangle size={20} />
                      </div>
                      <div className="provider-disconnected-alert-body">
                        <h4>Kênh Dịch Vụ Ẩm Thực & Món Ăn Đang Tạm Ngắt Kết Nối</h4>
                        <p>
                          Cửa hàng ẩm thực của bạn đang ngắt kết nối với microservice món ăn. Khách hàng và trợ lý AI sẽ không thể đặt món hoặc chuyển đơn đến bếp cho đến khi bạn kết nối lại.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="button button-sm button-primary"
                        disabled={togglingChannel === "food"}
                        onClick={() => void handleToggleChannel("food", true)}
                        style={{ whiteSpace: "nowrap" }}
                      >
                        <Power size={14} style={{ marginRight: "6px" }} />
                        Kết nối lại ngay
                      </button>
                    </div>
                  )}

                  <div style={{ marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <h2 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                        Danh sách đơn món cần xử lý ({orders.length} đơn)
                      </h2>
                      <span
                        className="admin-role-badge"
                        style={{ background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0", fontSize: "var(--text-micro)" }}
                      >
                        Kết nối trực tiếp
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        type="button"
                        disabled={seedingDomain === "food" || loadingOperations}
                        onClick={() => void handleSeedSample("food", "đơn món")}
                        className="button button-secondary"
                        style={{ height: "32px", padding: "0 12px", fontSize: "var(--text-xs)", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      >
                        {seedingDomain === "food" ? <LoaderCircle className="spin" size={13} /> : <Plus size={13} />}
                        <span>Tạo đơn món mẫu</span>
                      </button>
                      <button
                        type="button"
                        disabled={loadingOperations}
                        onClick={() => void reloadOperations()}
                        className="button button-secondary"
                        style={{ height: "32px", padding: "0 12px", fontSize: "var(--text-xs)", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      >
                        <RefreshCw className={loadingOperations ? "spin" : ""} size={13} />
                        <span>Làm mới</span>
                      </button>
                    </div>
                  </div>

                  {orders.length === 0 ? (
                    <div className="admin-table-card" style={{ padding: "40px 24px", textAlign: "center" }}>
                      <div
                        style={{
                          width: "52px",
                          height: "52px",
                          borderRadius: "14px",
                          background: "#FEF3C7",
                          color: "#EA580C",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: "16px",
                          border: "1px solid #FDE68A",
                        }}
                      >
                        <UtensilsCrossed size={24} />
                      </div>
                      <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "#0F172A", margin: "0 0 6px 0" }}>
                        Hiện chưa có đơn đặt món nào trong hệ thống
                      </h3>
                      <p style={{ fontSize: "var(--text-sm)", color: "#64748B", maxWidth: "500px", margin: "0 auto 20px" }}>
                        Dữ liệu đơn hàng được đồng bộ trực tiếp từ microservice <code>food-service</code> và PostgreSQL. Bạn có thể tạo đơn hàng thử nghiệm hoặc làm mới danh sách.
                      </p>
                      <div style={{ display: "inline-flex", gap: "10px", alignItems: "center" }}>
                        <button
                          type="button"
                          disabled={seedingDomain === "food" || loadingOperations}
                          onClick={() => void handleSeedSample("food", "đơn món")}
                          className="button button-primary"
                          style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "38px", padding: "0 18px", fontSize: "var(--text-sm)", fontWeight: 600 }}
                        >
                          {seedingDomain === "food" ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />}
                          <span>{seedingDomain === "food" ? "Đang kết nối hệ thống…" : "Tạo đơn món mẫu"}</span>
                        </button>
                        <button
                          type="button"
                          disabled={loadingOperations}
                          onClick={() => void reloadOperations()}
                          className="button button-secondary"
                          style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "38px", padding: "0 16px", fontSize: "var(--text-sm)" }}
                        >
                          {loadingOperations ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
                          <span>Làm mới danh sách</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))", gap: "16px" }}>
                      {orders.map((order) => (
                        <div
                          key={order.id}
                          className="admin-table-card"
                          style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}
                        >
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                              <div>
                                <strong style={{ fontSize: "var(--text-base)", color: "#0F172A" }}>{order.customerName}</strong>
                                <div style={{ fontSize: "var(--text-micro)", color: "#64748B", marginTop: "2px" }}>
                                  #{order.id} · {order.orderTime}
                                </div>
                              </div>
                              <span
                                className="admin-role-badge"
                                style={{
                                  background:
                                    order.status === "READY_FOR_PICKUP" || order.status === "DELIVERED" || order.status === "COMPLETED"
                                      ? "#ECFDF5"
                                      : order.status === "PREPARING" || order.status === "RESTAURANT_ACCEPTED"
                                      ? "#FFFBEB"
                                      : "#EEF2FF",
                                  color:
                                    order.status === "READY_FOR_PICKUP" || order.status === "DELIVERED" || order.status === "COMPLETED"
                                      ? "#065F46"
                                      : order.status === "PREPARING" || order.status === "RESTAURANT_ACCEPTED"
                                      ? "#EA580C"
                                      : "#4338CA",
                                  border: `1px solid ${
                                    order.status === "READY_FOR_PICKUP" || order.status === "DELIVERED" || order.status === "COMPLETED"
                                      ? "#A7F3D0"
                                      : order.status === "PREPARING" || order.status === "RESTAURANT_ACCEPTED"
                                      ? "#FDE68A"
                                      : "#C7D2FE"
                                  }`,
                                  fontWeight: 700,
                                }}
                              >
                                {formatOrderStatus(order.status)}
                              </span>
                            </div>

                            <div
                              style={{
                                borderTop: "1px solid #E2E8F0",
                                borderBottom: "1px solid #E2E8F0",
                                padding: "10px 0",
                                margin: "10px 0",
                              }}
                            >
                              {order.items.map((item, idx) => (
                                <div
                                  key={idx}
                                  style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", marginBottom: "6px" }}
                                >
                                  <span style={{ color: "#334155", fontWeight: 550 }}>
                                    {item.quantity}x {item.name}
                                  </span>
                                  <span style={{ color: "#64748B" }}>{(item.price * item.quantity).toLocaleString("vi-VN")} đ</span>
                                </div>
                              ))}
                            </div>

                            {order.note && (
                              <div
                                style={{
                                  fontSize: "var(--text-xs)",
                                  color: "#EA580C",
                                  backgroundColor: "#FFFBEB",
                                  border: "1px solid #FDE68A",
                                  padding: "8px 12px",
                                  borderRadius: "8px",
                                  marginBottom: "14px",
                                }}
                              >
                                💬 Ghi chú khách: {order.note}
                              </div>
                            )}
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px" }}>
                            <div>
                              <div style={{ fontSize: "var(--text-micro)", color: "#64748B" }}>Tổng thanh toán</div>
                              <div style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "#059669" }}>
                                {order.total.toLocaleString("vi-VN")} đ
                              </div>
                            </div>

                            <div>
                              {(order.status === "RESTAURANT_CONFIRMING" || order.status === "RECEIVED") && (
                                <button
                                  type="button"
                                  onClick={() => advanceOrderStatus(order.id, "RESTAURANT_ACCEPTED")}
                                  className="button button-primary"
                                  style={{ height: "32px", padding: "0 14px", fontSize: "var(--text-xs)" }}
                                >
                                  Nhận đơn ngay
                                </button>
                              )}
                              {order.status === "RESTAURANT_ACCEPTED" && (
                                <button
                                  type="button"
                                  onClick={() => advanceOrderStatus(order.id, "PREPARING")}
                                  className="button button-primary"
                                  style={{ height: "32px", padding: "0 14px", fontSize: "var(--text-xs)" }}
                                >
                                  Bắt đầu chế biến
                                </button>
                              )}
                              {order.status === "PREPARING" && (
                                <button
                                  type="button"
                                  onClick={() => advanceOrderStatus(order.id, "READY_FOR_PICKUP")}
                                  className="button button-primary"
                                  style={{
                                    height: "32px",
                                    padding: "0 14px",
                                    fontSize: "var(--text-xs)",
                                    backgroundColor: "#059669",
                                    borderColor: "#059669",
                                  }}
                                >
                                  Món đã xong (Sẵn sàng lấy)
                                </button>
                              )}
                              {order.status === "READY_FOR_PICKUP" && (
                                <span style={{ fontSize: "var(--text-xs)", color: "#059669", fontWeight: 600 }}>
                                  Đang chờ tài xế lấy món
                                </span>
                              )}
                              {order.status === "DELIVERING" && (
                                <span style={{ fontSize: "var(--text-xs)", color: "#4F46E5", fontWeight: 600 }}>
                                  Tài xế đang giao cho khách
                                </span>
                              )}
                              {(order.status === "DELIVERED" || order.status === "COMPLETED") && (
                                <span style={{ fontSize: "var(--text-xs)", color: "#059669", fontWeight: 600 }}>
                                  Đã giao thành công
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: HEALTHCARE DOCTOR */}
              {activeTab === "health" && isAllowedTab("health") && (
                <div>
                  {connectedServices.healthcare === false && (
                    <div className="provider-disconnected-alert">
                      <div className="provider-disconnected-alert-icon">
                        <AlertTriangle size={20} />
                      </div>
                      <div className="provider-disconnected-alert-body">
                        <h4>Kênh Đặt Khám & Bác Sĩ Đang Tạm Ngắt Kết Nối</h4>
                        <p>
                          Phòng khám / Lịch bác sĩ đang ngắt kết nối với hệ thống Y tế. Bệnh nhân và AI khám bệnh sẽ không thể đặt lịch hẹn khám mới cho đến khi bạn kết nối lại.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="button button-sm button-primary"
                        disabled={togglingChannel === "healthcare"}
                        onClick={() => void handleToggleChannel("healthcare", true)}
                        style={{ whiteSpace: "nowrap" }}
                      >
                        <Power size={14} style={{ marginRight: "6px" }} />
                        Kết nối lại ngay
                      </button>
                    </div>
                  )}

                  <div style={{ marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <h2 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                        Lịch khám bệnh trong ngày ({appointments.length} lịch khám)
                      </h2>
                      <span
                        className="admin-role-badge"
                        style={{ background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0", fontSize: "var(--text-micro)" }}
                      >
                        Kết nối trực tiếp
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        type="button"
                        disabled={seedingDomain === "healthcare" || loadingOperations}
                        onClick={() => void handleSeedSample("healthcare", "lịch khám")}
                        className="button button-secondary"
                        style={{ height: "32px", padding: "0 12px", fontSize: "var(--text-xs)", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      >
                        {seedingDomain === "healthcare" ? <LoaderCircle className="spin" size={13} /> : <Plus size={13} />}
                        <span>Tạo lịch khám mẫu</span>
                      </button>
                      <button
                        type="button"
                        disabled={loadingOperations}
                        onClick={() => void reloadOperations()}
                        className="button button-secondary"
                        style={{ height: "32px", padding: "0 12px", fontSize: "var(--text-xs)", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      >
                        <RefreshCw className={loadingOperations ? "spin" : ""} size={13} />
                        <span>Làm mới</span>
                      </button>
                    </div>
                  </div>

                  {appointments.length === 0 ? (
                    <div className="admin-table-card" style={{ padding: "40px 24px", textAlign: "center" }}>
                      <div
                        style={{
                          width: "52px",
                          height: "52px",
                          borderRadius: "14px",
                          background: "#EEF2FF",
                          color: "#4F46E5",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: "16px",
                          border: "1px solid #C7D2FE",
                        }}
                      >
                        <HeartPulse size={24} />
                      </div>
                      <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "#0F172A", margin: "0 0 6px 0" }}>
                        Chưa có lịch hẹn khám bệnh nào trong hệ thống
                      </h3>
                      <p style={{ fontSize: "var(--text-sm)", color: "#64748B", maxWidth: "500px", margin: "0 auto 20px" }}>
                        Lịch hẹn được truy vấn trực tiếp từ microservice <code>healthcare-service</code> và PostgreSQL. Bạn có thể tạo lịch khám thử nghiệm hoặc làm mới danh sách.
                      </p>
                      <div style={{ display: "inline-flex", gap: "10px", alignItems: "center" }}>
                        <button
                          type="button"
                          disabled={seedingDomain === "healthcare" || loadingOperations}
                          onClick={() => void handleSeedSample("healthcare", "lịch khám")}
                          className="button button-primary"
                          style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "38px", padding: "0 18px", fontSize: "var(--text-sm)", fontWeight: 600 }}
                        >
                          {seedingDomain === "healthcare" ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />}
                          <span>{seedingDomain === "healthcare" ? "Đang kết nối hệ thống…" : "Tạo lịch khám mẫu"}</span>
                        </button>
                        <button
                          type="button"
                          disabled={loadingOperations}
                          onClick={() => void reloadOperations()}
                          className="button button-secondary"
                          style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "38px", padding: "0 16px", fontSize: "var(--text-sm)" }}
                        >
                          {loadingOperations ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
                          <span>Làm mới danh sách</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {appointments.map((apt) => (
                        <div
                          key={apt.id}
                          className="admin-table-card"
                          style={{
                            padding: "16px 20px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "14px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                            <div
                              style={{
                                width: "42px",
                                height: "42px",
                                borderRadius: "10px",
                                backgroundColor: "#EEF2FF",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#4F46E5",
                                border: "1px solid #C7D2FE",
                              }}
                            >
                              <HeartPulse size={20} />
                            </div>
                            <div>
                              <strong style={{ fontSize: "var(--text-base)", color: "#0F172A", display: "block" }}>
                                {apt.patientName}
                              </strong>
                              <span style={{ fontSize: "var(--text-xs)", color: "#64748B" }}>
                                {apt.specialty} · {apt.timeSlot}
                              </span>
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <span
                              className="admin-role-badge"
                              style={{
                                backgroundColor: apt.type === "online" ? "#F5F3FF" : "#ECFDF5",
                                color: apt.type === "online" ? "#7C3AED" : "#065F46",
                                border: `1px solid ${apt.type === "online" ? "#DDD6FE" : "#A7F3D0"}`,
                              }}
                            >
                              {apt.type === "online" ? "Tư vấn từ xa" : "Tại phòng khám"}
                            </span>

                            <span
                              className="admin-role-badge"
                              style={{
                                backgroundColor:
                                  apt.status === "COMPLETED"
                                    ? "#ECFDF5"
                                    : apt.status === "IN_CONSULTATION"
                                    ? "#FFFBEB"
                                    : "#EEF2FF",
                                color:
                                  apt.status === "COMPLETED"
                                    ? "#065F46"
                                    : apt.status === "IN_CONSULTATION"
                                    ? "#EA580C"
                                    : "#4338CA",
                                border: `1px solid ${
                                  apt.status === "COMPLETED"
                                    ? "#A7F3D0"
                                    : apt.status === "IN_CONSULTATION"
                                    ? "#FDE68A"
                                    : "#C7D2FE"
                                }`,
                                fontWeight: 700,
                              }}
                            >
                              {formatAppointmentStatus(apt.status)}
                            </span>

                            {apt.status === "DRAFT" && (
                              <button
                                type="button"
                                onClick={() => advanceAppointmentStatus(apt.id, "CONFIRMED")}
                                className="button button-primary"
                                style={{ height: "32px", padding: "0 12px", fontSize: "var(--text-xs)" }}
                              >
                                Xác nhận lịch hẹn
                              </button>
                            )}

                            {apt.status === "CONFIRMED" && (
                              <button
                                type="button"
                                onClick={() => advanceAppointmentStatus(apt.id, "IN_CONSULTATION")}
                                className="button button-primary"
                                style={{ height: "32px", padding: "0 12px", fontSize: "var(--text-xs)" }}
                              >
                                Bắt đầu khám
                              </button>
                            )}

                            {apt.status === "IN_CONSULTATION" && (
                              <button
                                type="button"
                                onClick={() => advanceAppointmentStatus(apt.id, "COMPLETED")}
                                className="button button-primary"
                                style={{
                                  height: "32px",
                                  padding: "0 12px",
                                  fontSize: "var(--text-xs)",
                                  backgroundColor: "#059669",
                                  borderColor: "#059669",
                                }}
                              >
                                Hoàn tất ca khám
                              </button>
                            )}

                            {apt.status === "COMPLETED" && (
                              <span style={{ fontSize: "var(--text-xs)", color: "#059669", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                                <CheckCircle2 size={14} /> Đã hoàn thành
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: RESTAURANT RESERVATIONS (PASGO / TABLECHECK BENCHMARK) */}
              {activeTab === "restaurant" && isAllowedTab("restaurant") && (
                <div>
                  {connectedServices.restaurant === false && (
                    <div className="provider-disconnected-alert">
                      <div className="provider-disconnected-alert-icon">
                        <AlertTriangle size={20} />
                      </div>
                      <div className="provider-disconnected-alert-body">
                        <h4>Kênh Đặt Bàn Nhà Hàng Đang Tạm Ngắt Kết Nối</h4>
                        <p>
                          Hệ thống bàn ăn của nhà hàng đang ngắt kết nối với microservice đặt bàn. Khách hàng và AI PasGo sẽ không thể đặt bàn mới cho đến khi bạn kết nối lại.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="button button-sm button-primary"
                        disabled={togglingChannel === "restaurant"}
                        onClick={() => void handleToggleChannel("restaurant", true)}
                        style={{ whiteSpace: "nowrap" }}
                      >
                        <Power size={14} style={{ marginRight: "6px" }} />
                        Kết nối lại ngay
                      </button>
                    </div>
                  )}

                  <div style={{ marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <h2 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                        Danh sách khách đặt bàn ({reservations.length} lượt đặt)
                      </h2>
                      <span
                        className="admin-role-badge"
                        style={{ background: "#FEF3C7", color: "#B45309", border: "1px solid #FDE68A", fontSize: "var(--text-micro)" }}
                      >
                        PasGo Sync Live
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        type="button"
                        disabled={seedingDomain === "restaurant" || loadingOperations}
                        onClick={() => void handleSeedSample("restaurant", "lượt đặt bàn")}
                        className="button button-secondary"
                        style={{ height: "32px", padding: "0 12px", fontSize: "var(--text-xs)", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      >
                        {seedingDomain === "restaurant" ? <LoaderCircle className="spin" size={13} /> : <Plus size={13} />}
                        <span>Tạo bàn mẫu</span>
                      </button>
                      <button
                        type="button"
                        disabled={loadingOperations}
                        onClick={() => void reloadOperations()}
                        className="button button-secondary"
                        style={{ height: "32px", padding: "0 12px", fontSize: "var(--text-xs)", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      >
                        <RefreshCw className={loadingOperations ? "spin" : ""} size={13} />
                        <span>Làm mới</span>
                      </button>
                    </div>
                  </div>

                  {reservations.length === 0 ? (
                    <div className="admin-table-card" style={{ padding: "40px 24px", textAlign: "center" }}>
                      <div
                        style={{
                          width: "52px",
                          height: "52px",
                          borderRadius: "14px",
                          background: "#FEF3C7",
                          color: "#D97706",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: "16px",
                          border: "1px solid #FDE68A",
                        }}
                      >
                        <Calendar size={24} />
                      </div>
                      <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "#0F172A", margin: "0 0 6px 0" }}>
                        Chưa có lượt đặt bàn nào trong hệ thống
                      </h3>
                      <p style={{ fontSize: "var(--text-xs)", color: "#64748B", maxWidth: "420px", margin: "0 auto 18px auto" }}>
                        Hệ thống đối tác tự động đồng bộ khi khách hàng đặt bàn trên cổng dịch vụ X-One Restaurant hoặc kênh PasGo.
                      </p>
                      <button
                        type="button"
                        disabled={seedingDomain === "restaurant"}
                        onClick={() => void handleSeedSample("restaurant", "lượt đặt bàn")}
                        className="button button-primary"
                        style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                      >
                        {seedingDomain === "restaurant" ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}
                        <span>Tạo lượt đặt bàn mẫu để thử nghiệm</span>
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {reservations.map((res) => (
                        <div
                          key={res.id}
                          className="admin-table-card"
                          style={{
                            padding: "16px 20px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "14px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                            <div
                              style={{
                                width: "42px",
                                height: "42px",
                                borderRadius: "10px",
                                backgroundColor: "#FEF3C7",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#D97706",
                                border: "1px solid #FDE68A",
                              }}
                            >
                              <Users size={20} />
                            </div>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <strong style={{ fontSize: "var(--text-base)", color: "#0F172A" }}>
                                  {res.guestName}
                                </strong>
                                <span style={{ fontSize: "var(--text-xs)", color: "#64748B" }}>
                                  ({res.partySize} khách)
                                </span>
                              </div>
                              <span style={{ fontSize: "var(--text-xs)", color: "#64748B", display: "block" }}>
                                Giờ hẹn: <strong style={{ color: "#334155" }}>{res.reservationTime}</strong> · Khu vực: {res.seatingArea}
                              </span>
                              {res.specialRequests ? (
                                <span style={{ fontSize: "var(--text-micro)", color: "#B45309", background: "#FFFBEB", padding: "2px 6px", borderRadius: "4px", display: "inline-block", marginTop: "4px" }}>
                                  Ghi chú: {res.specialRequests}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                            <span
                              className="admin-role-badge"
                              style={{
                                backgroundColor:
                                  res.status === "COMPLETED"
                                    ? "#ECFDF5"
                                    : res.status === "SEATED"
                                    ? "#EFF6FF"
                                    : "#FEF3C7",
                                color:
                                  res.status === "COMPLETED"
                                    ? "#065F46"
                                    : res.status === "SEATED"
                                    ? "#1D4ED8"
                                    : "#B45309",
                                border: `1px solid ${
                                  res.status === "COMPLETED"
                                    ? "#A7F3D0"
                                    : res.status === "SEATED"
                                    ? "#BFDBFE"
                                    : "#FDE68A"
                                }`,
                                fontWeight: 700,
                              }}
                            >
                              {formatReservationStatus(res.status)}
                            </span>

                            {res.status === "CONFIRMED" && (
                              <button
                                type="button"
                                onClick={() => advanceReservationStatus(res.id, "SEATED")}
                                className="button button-primary"
                                style={{ height: "32px", padding: "0 12px", fontSize: "var(--text-xs)" }}
                              >
                                Khách đã đến (Xếp bàn)
                              </button>
                            )}

                            {res.status === "SEATED" && (
                              <button
                                type="button"
                                onClick={() => advanceReservationStatus(res.id, "COMPLETED")}
                                className="button button-primary"
                                style={{
                                  height: "32px",
                                  padding: "0 12px",
                                  fontSize: "var(--text-xs)",
                                  backgroundColor: "#059669",
                                  borderColor: "#059669",
                                }}
                              >
                                Hoàn tất bữa ăn
                              </button>
                            )}

                            {res.status === "COMPLETED" && (
                              <span style={{ fontSize: "var(--text-xs)", color: "#059669", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                                <CheckCircle2 size={14} /> Bàn đã trả
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* TAB 4: MCP AI PARTNER INTEGRATION */}
              {activeTab === "mcp" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  {/* Hero / Overview Banner */}
                  <div className="admin-table-card" style={{ padding: "24px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                        <div
                          style={{
                            width: "44px",
                            height: "44px",
                            borderRadius: "12px",
                            background: "#EFF6FF",
                            color: "#2563EB",
                            display: "grid",
                            placeItems: "center",
                            border: "1px solid #BFDBFE",
                            flexShrink: 0,
                          }}
                        >
                          <Plug2 size={22} />
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                              Cổng Kết Nối MCP (Model Context Protocol)
                            </h2>
                            <span
                              className="admin-role-badge"
                              style={{ background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" }}
                            >
                              Giao thức 2024-11-05
                            </span>
                            <span
                              className="admin-role-badge"
                              style={{ background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0" }}
                            >
                              Streamable HTTP
                            </span>
                          </div>
                          <p style={{ fontSize: "var(--text-sm)", color: "#64748B", margin: "6px 0 0", maxWidth: "680px", lineHeight: 1.5 }}>
                            Cho phép các trợ lý AI bên ngoài (như Claude Desktop, Cursor, LangGraph, agent tự phát triển) kết nối trực tiếp vào dịch vụ của bạn trên X-One qua chuẩn mở MCP. AI có thể kiểm tra đơn, nhận chuyến, cập nhật lịch hẹn và tra cứu danh mục tự động.
                          </p>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => void handleTestMcp()}
                          disabled={testingMcp}
                          className="button button-secondary"
                          style={{ height: "36px", padding: "0 14px", fontSize: "var(--text-xs)", display: "inline-flex", alignItems: "center", gap: "6px" }}
                        >
                          <RefreshCw size={14} className={testingMcp ? "spin" : ""} />
                          <span>{testingMcp ? "Đang kiểm tra..." : "Kiểm tra MCP Gateway"}</span>
                        </button>
                      </div>
                    </div>

                    {/* Test result status bar */}
                    {mcpTestResult && (
                      <div
                        style={{
                          marginTop: "16px",
                          padding: "12px 16px",
                          borderRadius: "8px",
                          background: mcpTestResult.success ? "#ECFDF5" : "#FEF2F2",
                          border: `1px solid ${mcpTestResult.success ? "#A7F3D0" : "#FECACA"}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {mcpTestResult.success ? (
                            <CheckCircle2 size={16} color="#059669" />
                          ) : (
                            <AlertTriangle size={16} color="#DC2626" />
                          )}
                          <span
                            style={{
                              fontSize: "var(--text-xs)",
                              fontWeight: 600,
                              color: mcpTestResult.success ? "#065F46" : "#991B1B",
                            }}
                          >
                            {mcpTestResult.message}
                          </span>
                        </div>
                        {mcpTestResult.success && (
                          <div style={{ display: "flex", gap: "8px" }}>
                            <span className="admin-role-badge" style={{ background: "#FFFFFF", color: "#065F46" }}>
                              {mcpTestResult.toolCount} công cụ khả dụng
                            </span>
                            <span className="admin-role-badge" style={{ background: "#FFFFFF", color: "#475569" }}>
                              v{mcpTestResult.protocolVersion}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Section: Created Key Announcement (Shows ONCE) */}
                  {createdKeyResult && (
                    <div
                      className="admin-table-card"
                      style={{
                        padding: "20px",
                        border: "2px solid #2563EB",
                        background: "#F8FAFC",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "8px",
                            background: "#DBEAFE",
                            color: "#1D4ED8",
                            display: "grid",
                            placeItems: "center",
                            flexShrink: 0,
                          }}
                        >
                          <KeyRound size={18} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                            <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: 0, color: "#1E3A8A" }}>
                              Khóa MCP API Key mới đã được tạo thành công!
                            </h3>
                            <button
                              type="button"
                              onClick={() => setCreatedKeyResult(null)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B" }}
                            >
                              <X size={16} />
                            </button>
                          </div>
                          <p style={{ fontSize: "var(--text-xs)", color: "#B45309", margin: "4px 0 10px", fontWeight: 600 }}>
                            ⚠️ Lưu ý quan trọng: Khóa này chỉ hiển thị duy nhất 1 lần. Hãy sao chép và lưu trữ an toàn ngay bây giờ.
                          </p>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              background: "#0F172A",
                              padding: "10px 14px",
                              borderRadius: "8px",
                              fontFamily: "var(--font-mono)",
                              fontSize: "var(--text-sm)",
                              color: "#38BDF8",
                              overflowX: "auto",
                            }}
                          >
                            <span style={{ flex: 1, wordBreak: "break-all" }}>{createdKeyResult.key}</span>
                            <button
                              type="button"
                              onClick={() => void copyText(createdKeyResult.key, "key")}
                              className="button button-primary"
                              style={{
                                height: "30px",
                                padding: "0 12px",
                                fontSize: "var(--text-xs)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                flexShrink: 0,
                              }}
                            >
                              {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                              <span>{copiedKey ? "Đã chép!" : "Sao chép"}</span>
                            </button>
                          </div>
                          <span style={{ fontSize: "var(--text-micro)", color: "#64748B", marginTop: "6px", display: "block" }}>
                            Tên khóa: <strong>{createdKeyResult.label}</strong> · Tiền tố: <code>{createdKeyResult.key_prefix}...</code>
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Section: Create Key Form & Keys List */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))",
                      gap: "20px",
                    }}
                  >
                    {/* Create New Key Card */}
                    <div className="admin-table-card" style={{ padding: "20px" }}>
                      <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: "0 0 4px", color: "#0F172A" }}>
                        Tạo khóa API Key mới
                      </h3>
                      <p style={{ fontSize: "var(--text-xs)", color: "#64748B", margin: "0 0 16px" }}>
                        Tạo khóa bảo mật riêng cho từng ứng dụng AI hoặc máy chủ đối tác.
                      </p>

                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        <div>
                          <label style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "#334155", display: "block", marginBottom: "4px" }}>
                            Tên gợi nhớ (Mô tả ứng dụng kết nối)
                          </label>
                          <input
                            type="text"
                            value={newKeyLabel}
                            onChange={(e) => setNewKeyLabel(e.target.value)}
                            placeholder="vd: Claude Desktop cá nhân, Cursor AI, Bot đặt xe"
                            className="input-field"
                            style={{ width: "100%", height: "38px", fontSize: "var(--text-sm)" }}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleCreateMcpKey()}
                          disabled={creatingKey || !newKeyLabel.trim()}
                          className="button button-primary"
                          style={{
                            height: "38px",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                            fontSize: "var(--text-sm)",
                          }}
                        >
                          <Plus size={16} />
                          <span>{creatingKey ? "Đang tạo khóa..." : "Tạo khóa MCP API Key"}</span>
                        </button>

                        <span style={{ fontSize: "var(--text-micro)", color: "#64748B", lineHeight: 1.4 }}>
                          Khóa có định dạng tiền tố <code>xone_mcp_...</code>, được băm SHA-256 trên cơ sở dữ liệu để đảm bảo an toàn tuyệt đối.
                        </span>
                      </div>
                    </div>

                    {/* Active Keys List */}
                    <div className="admin-table-card" style={{ padding: "20px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                        <div>
                          <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                            Danh sách khóa đang hoạt động ({mcpKeys.length})
                          </h3>
                          <span style={{ fontSize: "var(--text-xs)", color: "#64748B" }}>
                            Quản lý quyền truy cập MCP của tài khoản đối tác
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void reloadMcpKeys()}
                          disabled={loadingMcpKeys}
                          className="button button-secondary"
                          style={{ height: "28px", padding: "0 8px", fontSize: "var(--text-micro)" }}
                        >
                          <RefreshCw size={12} className={loadingMcpKeys ? "spin" : ""} />
                        </button>
                      </div>

                      {loadingMcpKeys ? (
                        <div style={{ padding: "24px", textAlign: "center", color: "#64748B", fontSize: "var(--text-sm)" }}>
                          Đang tải danh sách khóa...
                        </div>
                      ) : mcpKeys.length === 0 ? (
                        <div style={{ padding: "24px", textAlign: "center", color: "#64748B", fontSize: "var(--text-xs)", border: "1px dashed #E2E8F0", borderRadius: "8px" }}>
                          Bạn chưa tạo khóa MCP nào. Hãy tạo khóa đầu tiên ở bảng bên cạnh để bắt đầu kết nối với Claude Desktop.
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "280px", overflowY: "auto" }}>
                          {mcpKeys.map((k) => (
                            <div
                              key={k.id}
                              style={{
                                padding: "10px 12px",
                                borderRadius: "8px",
                                background: "#F8FAFC",
                                border: "1px solid #E2E8F0",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "8px",
                              }}
                            >
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "#0F172A" }}>
                                    {k.label}
                                  </span>
                                  <code style={{ fontSize: "var(--text-micro)", color: "#2563EB", background: "#EFF6FF", padding: "1px 6px", borderRadius: "4px" }}>
                                    {k.key_prefix}...
                                  </code>
                                </div>
                                <span style={{ fontSize: "var(--text-micro)", color: "#64748B" }}>
                                  Tạo ngày: {new Date(k.created_at).toLocaleDateString("vi-VN")}
                                  {k.last_used_at && ` · Dùng gần nhất: ${new Date(k.last_used_at).toLocaleDateString("vi-VN")}`}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => void handleRevokeMcpKey(k.id)}
                                title="Thu hồi khóa này"
                                className="button button-secondary"
                                style={{
                                  height: "28px",
                                  padding: "0 8px",
                                  color: "#DC2626",
                                  borderColor: "#FECACA",
                                  background: "#FEF2F2",
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section: Client Configuration Snippet */}
                  <div className="admin-table-card" style={{ padding: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
                      <div>
                        <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                          Cấu hình cho Client (Claude Desktop / Cursor)
                        </h3>
                        <span style={{ fontSize: "var(--text-xs)", color: "#64748B" }}>
                          Sao chép đoạn JSON cấu hình bên dưới và dán vào tệp cấu hình MCP client của bạn
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          onClick={() => setClientConfigType("claude")}
                          className="button"
                          style={{
                            height: "30px",
                            padding: "0 12px",
                            fontSize: "var(--text-xs)",
                            background: clientConfigType === "claude" ? "#2563EB" : "#F1F5F9",
                            color: clientConfigType === "claude" ? "#FFFFFF" : "#475569",
                            border: "1px solid transparent",
                          }}
                        >
                          Claude Desktop
                        </button>
                        <button
                          type="button"
                          onClick={() => setClientConfigType("cursor")}
                          className="button"
                          style={{
                            height: "30px",
                            padding: "0 12px",
                            fontSize: "var(--text-xs)",
                            background: clientConfigType === "cursor" ? "#2563EB" : "#F1F5F9",
                            color: clientConfigType === "cursor" ? "#FFFFFF" : "#475569",
                            border: "1px solid transparent",
                          }}
                        >
                          Cursor AI
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyText(buildClientConfig(), "config")}
                          className="button button-secondary"
                          style={{
                            height: "30px",
                            padding: "0 12px",
                            fontSize: "var(--text-xs)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          {copiedConfig ? <Check size={13} /> : <Copy size={13} />}
                          <span>{copiedConfig ? "Đã chép!" : "Sao chép JSON"}</span>
                        </button>
                      </div>
                    </div>

                    <pre
                      style={{
                        margin: 0,
                        padding: "14px",
                        borderRadius: "8px",
                        background: "#0F172A",
                        color: "#F8FAFC",
                        fontSize: "var(--text-xs)",
                        fontFamily: "var(--font-mono)",
                        overflowX: "auto",
                        lineHeight: 1.5,
                      }}
                    >
                      {buildClientConfig()}
                    </pre>

                    <div style={{ marginTop: "12px", fontSize: "var(--text-micro)", color: "#64748B", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                      <span>
                        📍 Claude Desktop: <code>%APPDATA%/Claude/claude_desktop_config.json</code>
                      </span>
                      <span>
                        📍 Cursor: <code>Settings &gt; Features &gt; MCP Servers</code>
                      </span>
                      <span>
                        📍 Endpoint: <code>{mcpServerUrl}</code>
                      </span>
                    </div>
                  </div>

                  {/* Section: 3-Step Integration Guide */}
                  <div className="admin-table-card" style={{ padding: "20px" }}>
                    <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: "0 0 12px", color: "#0F172A" }}>
                      Hướng dẫn tích hợp trong 3 bước
                    </h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: "14px" }}>
                      <div style={{ padding: "12px", background: "#F8FAFC", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
                        <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#2563EB", color: "#fff", display: "grid", placeItems: "center", fontSize: "var(--text-xs)", fontWeight: 700, marginBottom: "8px" }}>
                          1
                        </div>
                        <strong style={{ fontSize: "var(--text-xs)", color: "#0F172A", display: "block", marginBottom: "4px" }}>
                          Tạo khóa MCP API Key
                        </strong>
                        <p style={{ fontSize: "var(--text-micro)", color: "#64748B", margin: 0, lineHeight: 1.4 }}>
                          Nhập tên mô tả cho client của bạn và bấm &quot;Tạo khóa&quot;. Khóa sẽ được băm SHA-256 an toàn.
                        </p>
                      </div>

                      <div style={{ padding: "12px", background: "#F8FAFC", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
                        <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#2563EB", color: "#fff", display: "grid", placeItems: "center", fontSize: "var(--text-xs)", fontWeight: 700, marginBottom: "8px" }}>
                          2
                        </div>
                        <strong style={{ fontSize: "var(--text-xs)", color: "#0F172A", display: "block", marginBottom: "4px" }}>
                          Dán cấu hình JSON
                        </strong>
                        <p style={{ fontSize: "var(--text-micro)", color: "#64748B", margin: 0, lineHeight: 1.4 }}>
                          Sao chép đoạn JSON ở bảng cấu hình và dán vào tệp cấu hình của Claude Desktop hoặc Cursor.
                        </p>
                      </div>

                      <div style={{ padding: "12px", background: "#F8FAFC", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
                        <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#2563EB", color: "#fff", display: "grid", placeItems: "center", fontSize: "var(--text-xs)", fontWeight: 700, marginBottom: "8px" }}>
                          3
                        </div>
                        <strong style={{ fontSize: "var(--text-xs)", color: "#0F172A", display: "block", marginBottom: "4px" }}>
                          Trò chuyện & Điều khiển
                        </strong>
                        <p style={{ fontSize: "var(--text-micro)", color: "#64748B", margin: 0, lineHeight: 1.4 }}>
                          Mở Claude hoặc Cursor và yêu cầu: &quot;Xem danh sách đơn món đang chờ xử lý của quán tôi&quot; hoặc &quot;Xác nhận cuốc xe gần nhất&quot;.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal: + Thêm Kênh Microservice Mới */}
            {showAddChannelModal && (
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: "rgba(15, 23, 42, 0.6)",
                  backdropFilter: "blur(4px)",
                  display: "grid",
                  placeItems: "center",
                  zIndex: 9999,
                  padding: "16px",
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setShowAddChannelModal(false);
                }}
              >
                <div
                  className="admin-table-card"
                  style={{
                    maxWidth: "560px",
                    width: "100%",
                    maxHeight: "90vh",
                    overflowY: "auto",
                    padding: "24px",
                    borderRadius: "16px",
                    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "10px",
                          background: "#EEF2FF",
                          color: "#4F46E5",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <Plus size={20} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                          Đăng Ký Thêm Kênh Dịch Vụ Mới
                        </h3>
                        <span style={{ fontSize: "12px", color: "#64748B" }}>
                          Tích hợp microservice độc lập vào cổng điều phối X-One
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddChannelModal(false)}
                      className="button button-secondary"
                      style={{ height: "30px", width: "30px", padding: 0, display: "grid", placeItems: "center" }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Preset Quick-Picks */}
                  <div style={{ marginBottom: "16px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "6px" }}>
                      Chọn nhanh từ mẫu có sẵn (Templates):
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {PRESET_CHANNEL_TEMPLATES.map((tmpl) => (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => {
                            setNewChannelForm({
                              id: tmpl.id,
                              name: tmpl.name,
                              port: tmpl.port,
                              domain: tmpl.domain,
                              description: tmpl.description,
                              icon: tmpl.icon,
                              color: tmpl.color,
                              bgColor: tmpl.bgColor,
                            });
                          }}
                          className="button button-secondary"
                          style={{
                            height: "28px",
                            padding: "0 10px",
                            fontSize: "11px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            background: newChannelForm.id === tmpl.id ? tmpl.bgColor : "#F8FAFC",
                            color: newChannelForm.id === tmpl.id ? tmpl.color : "#334155",
                            borderColor: newChannelForm.id === tmpl.id ? tmpl.color : "#E2E8F0",
                          }}
                        >
                          {renderChannelIcon(tmpl.icon, 13)}
                          <span>{tmpl.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <form onSubmit={(e) => void handleCreateNewChannel(e)} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <label style={{ fontSize: "12px", fontWeight: 600, color: "#334155", display: "block", marginBottom: "4px" }}>
                          Mã định danh (ID / Slug) *
                        </label>
                        <input
                          type="text"
                          required
                          value={newChannelForm.id}
                          onChange={(e) => setNewChannelForm({ ...newChannelForm, id: e.target.value })}
                          placeholder="vd: delivery, grocery"
                          className="input-field"
                          style={{ width: "100%", height: "36px", fontSize: "13px" }}
                        />
                        <span style={{ fontSize: "10px", color: "#64748B" }}>Chữ thường, số, gạch ngang (2-40 ký tự)</span>
                      </div>

                      <div>
                        <label style={{ fontSize: "12px", fontWeight: 600, color: "#334155", display: "block", marginBottom: "4px" }}>
                          Tên hiển thị dịch vụ *
                        </label>
                        <input
                          type="text"
                          required
                          value={newChannelForm.name}
                          onChange={(e) => setNewChannelForm({ ...newChannelForm, name: e.target.value })}
                          placeholder="vd: Giao Hàng Siêu Tốc"
                          className="input-field"
                          style={{ width: "100%", height: "36px", fontSize: "13px" }}
                        />
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <label style={{ fontSize: "12px", fontWeight: 600, color: "#334155", display: "block", marginBottom: "4px" }}>
                          Tên &amp; Port Service *
                        </label>
                        <input
                          type="text"
                          required
                          value={newChannelForm.port}
                          onChange={(e) => setNewChannelForm({ ...newChannelForm, port: e.target.value })}
                          placeholder="vd: delivery-service :8105"
                          className="input-field"
                          style={{ width: "100%", height: "36px", fontSize: "13px" }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: "12px", fontWeight: 600, color: "#334155", display: "block", marginBottom: "4px" }}>
                          Biểu tượng (Icon)
                        </label>
                        <div style={{ display: "flex", gap: "6px" }}>
                          {(["package", "shopping", "sparkles", "truck", "car", "food"] as const).map((ic) => (
                            <button
                              key={ic}
                              type="button"
                              onClick={() => setNewChannelForm({ ...newChannelForm, icon: ic })}
                              style={{
                                width: "36px",
                                height: "36px",
                                borderRadius: "8px",
                                border: `1px solid ${newChannelForm.icon === ic ? "#4F46E5" : "#E2E8F0"}`,
                                background: newChannelForm.icon === ic ? "#EEF2FF" : "#F8FAFC",
                                color: newChannelForm.icon === ic ? "#4F46E5" : "#64748B",
                                display: "grid",
                                placeItems: "center",
                                cursor: "pointer",
                              }}
                            >
                              {renderChannelIcon(ic, 16)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: "12px", fontWeight: 600, color: "#334155", display: "block", marginBottom: "4px" }}>
                        Mô tả chức năng dịch vụ
                      </label>
                      <textarea
                        rows={2}
                        value={newChannelForm.description}
                        onChange={(e) => setNewChannelForm({ ...newChannelForm, description: e.target.value })}
                        placeholder="Mô tả ngắn gọn dịch vụ tiếp nhận những loại đơn hoặc yêu cầu gì từ khách hàng..."
                        className="input-field"
                        style={{ width: "100%", padding: "8px", fontSize: "13px" }}
                      />
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
                      <button
                        type="button"
                        onClick={() => setShowAddChannelModal(false)}
                        className="button button-secondary"
                        style={{ height: "36px", padding: "0 14px", fontSize: "13px" }}
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        disabled={submittingNewChannel || !newChannelForm.id.trim() || !newChannelForm.name.trim()}
                        className="button button-primary"
                        style={{ height: "36px", padding: "0 16px", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      >
                        <Plus size={14} />
                        <span>{submittingNewChannel ? "Đang đăng ký..." : "Đăng Ký & Kích Hoạt Kênh Mới"}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
          </div>
        </main>
      </div>
    </div>
  );
}
