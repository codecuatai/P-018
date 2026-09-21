import React from "react";
import {
  Calendar,
  Car,
  HeartPulse,
  Package,
  ShoppingBag,
  Sparkles,
  Truck,
  UtensilsCrossed,
} from "lucide-react";
import type {
  CreatedMcpKeyResult,
  ProviderAssignment,
  ProviderAvailability,
  ProviderDocument,
  ProviderEarningsSummary,
  ProviderMcpKeyItem,
  ProviderProfile,
  ProviderServiceItem,
  WebhookTestResult,
} from "@/lib/api-client";

export type ProviderWorkspace = "operations" | "business" | "tech";

export type ProviderTab =
  | "ride"
  | "delivery"
  | "food"
  | "restaurant"
  | "health"
  | "pharmacy"
  | "services"
  | "profile"
  | "earnings"
  | "staff"
  | "webhooks"
  | "channels"
  | "mcp";

export interface ActiveRide {
  id: string;
  passengerName: string;
  pickup: string;
  destination: string;
  fare: number;
  currency: string;
  status:
    | "DRIVER_ASSIGNED"
    | "DRIVER_TO_PICKUP"
    | "DRIVER_ARRIVED"
    | "IN_PROGRESS"
    | "ARRIVED_DESTINATION"
    | "COMPLETED"
    | "CANCELLED";
  passengers: number;
  time: string;
}

export interface FoodOrder {
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

export interface HealthcareBooking {
  id: string;
  patientName: string;
  specialty: string;
  timeSlot: string;
  status: "DRAFT" | "CONFIRMED" | "IN_CONSULTATION" | "COMPLETED" | "CANCELLED";
  type: "online" | "clinic";
}

export interface RestaurantReservation {
  id: string;
  guestName: string;
  guestPhone: string;
  partySize: number;
  reservationTime: string;
  status: "CONFIRMED" | "SEATED" | "COMPLETED" | "CANCELLED";
  seatingArea?: string;
  specialRequests?: string;
}

export interface DeliveryOrder {
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

export interface PharmacyOrder {
  id: string;
  customerName: string;
  customerPhone?: string;
  deliveryAddress: string;
  items: { name: string; quantity: number; price: number; unit?: string }[];
  total: number;
  status:
    | "PRESCRIPTION_PENDING"
    | "CONFIRMED"
    | "PACKING"
    | "READY_FOR_PICKUP"
    | "DELIVERING"
    | "COMPLETED"
    | "CANCELLED";
  prescriptionRequired: boolean;
  orderTime: string;
  note?: string;
  providerChain?: "longchau" | "pharmacity" | "internal";
}

export function formatRideStatus(status: string): string {
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

export function formatOrderStatus(status: string): string {
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

export function formatAppointmentStatus(status: string): string {
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

export function formatReservationStatus(status: string): string {
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

export function formatDeliveryStatus(status: string): string {
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

export function formatPharmacyStatus(status: string): string {
  switch (status) {
    case "PRESCRIPTION_PENDING":
      return "Chờ dược sĩ duyệt đơn";
    case "CONFIRMED":
      return "Đã tiếp nhận đơn thuốc";
    case "PACKING":
      return "Đang soạn thuốc & đóng gói";
    case "READY_FOR_PICKUP":
      return "Sẵn sàng bàn giao shipper";
    case "DELIVERING":
      return "Đang giao thuốc tận nơi";
    case "COMPLETED":
      return "Đã giao thành công";
    case "CANCELLED":
      return "Đã hủy đơn";
    default:
      return status;
  }
}

export function mapRawRide(raw: any): ActiveRide {
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
    time: raw.created_at
      ? new Date(raw.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
      : "Vừa xong",
  };
}

export function mapRawOrder(raw: any): FoodOrder {
  const items =
    Array.isArray(raw.items) && raw.items.length > 0
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
    orderTime: raw.created_at
      ? new Date(raw.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
      : "Mới đặt",
    note: raw.note || undefined,
  };
}

export function mapRawAppointment(raw: any): HealthcareBooking {
  const slot = typeof raw.slot === "object" && raw.slot !== null ? raw.slot : {};
  return {
    id: String(raw.id || raw.appointment_id || "apt_01"),
    patientName:
      raw.patient_name ||
      (raw.actor_id
        ? `Bệnh nhân #${String(raw.actor_id).slice(-4)}`
        : raw.patient_id
          ? `Bệnh nhân #${raw.patient_id}`
          : "Bệnh nhân X-One"),
    specialty:
      raw.department ||
      raw.doctor_name ||
      (raw.doctor_id ? `Bác sĩ #${raw.doctor_id}` : "Khoa Khám Bệnh"),
    timeSlot: slot.start_at
      ? new Date(slot.start_at).toLocaleString("vi-VN")
      : raw.created_at
        ? new Date(raw.created_at).toLocaleString("vi-VN")
        : "Hôm nay",
    status: (raw.status as HealthcareBooking["status"]) || "CONFIRMED",
    type: raw.type || "clinic",
  };
}

export function mapRawReservation(raw: any): RestaurantReservation {
  return {
    id: String(raw.id || raw.reservation_id || "res_01"),
    guestName:
      raw.guest_name ||
      (raw.actor_id ? `Khách hàng #${String(raw.actor_id).slice(-4)}` : "Khách đặt bàn X-One"),
    guestPhone: raw.guest_phone || raw.phone || "090***9999",
    partySize: Number(raw.party_size || raw.partySize || 2),
    reservationTime: raw.reservation_time ? new Date(raw.reservation_time).toLocaleString("vi-VN") : "Hôm nay",
    status: (raw.status as RestaurantReservation["status"]) || "CONFIRMED",
    seatingArea: raw.seating_area || raw.seatingArea || "Bàn tiêu chuẩn trong nhà",
    specialRequests: raw.special_requests || raw.specialRequests || undefined,
  };
}

export function mapRawDelivery(raw: any): DeliveryOrder {
  const courier =
    raw.courier_snapshot ||
    raw.courier ||
    (raw.courier_name
      ? {
          name: raw.courier_name,
          phone: raw.courier_phone || "0912***",
          vehiclePlate: raw.courier_vehicle_plate || "29A-***.**",
          vehicleModel: raw.courier_vehicle_model || "Xe máy",
        }
      : undefined);

  return {
    id: String(raw.id || raw.order_id || "del_ord_01"),
    orderId: String(raw.order_id || raw.id || "del_ord_01"),
    trackingCode: String(
      raw.tracking_code || raw.trackingCode || `XONE-DEL-${String(raw.id || "1001").slice(-4)}`
    ),
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
    courier: courier
      ? {
          name: courier.name || "Tài xế giao hàng",
          phone: courier.phone || "0912***",
          vehiclePlate: courier.vehiclePlate || courier.vehicle_plate || "29A-***.**",
          vehicleModel: courier.vehicleModel || courier.vehicle_model || "Xe máy",
        }
      : undefined,
    time: raw.created_at
      ? new Date(raw.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
      : "Vừa xong",
  };
}

export function mapRawPharmacyOrder(raw: any): PharmacyOrder {
  const items =
    Array.isArray(raw.items) && raw.items.length > 0
      ? raw.items.map((it: any) => ({
          name: String(it.name || it.medicine_name || "Thuốc đặc trị"),
          quantity: Number(it.quantity || 1),
          price: Number(it.price || it.unit_price || 0),
          unit: it.unit || "hộp",
        }))
      : [{ name: "Panadol Extra 500mg", quantity: 1, price: 95000, unit: "hộp" }];

  return {
    id: String(raw.id || raw.order_id || "rx_ord_01"),
    customerName: raw.customer_name || (raw.user_id ? `Khách hàng #${String(raw.user_id).slice(-4)}` : "Khách hàng mua thuốc"),
    customerPhone: raw.customer_phone || "098***1122",
    deliveryAddress: raw.delivery_address || raw.address || "Địa chỉ giao thuốc tận nơi",
    items,
    total: Number(raw.total || raw.total_amount || 95000),
    status: (raw.status as PharmacyOrder["status"]) || "CONFIRMED",
    prescriptionRequired: Boolean(raw.prescription_required ?? false),
    orderTime: raw.created_at
      ? new Date(raw.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
      : "Vừa xong",
    note: raw.note || undefined,
    providerChain: raw.provider_chain || "longchau",
  };
}

export const DEFAULT_OFFERINGS: ProviderServiceItem[] = [
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
  {
    id: "item_init_06",
    providerId: "init",
    domain: "pharmacy",
    name: "Panadol Extra Đỏ Giảm Đau Hạ Sốt (Hộp 180 viên)",
    description: "Paracetamol 500mg + Caffeine 65mg, chính hãng Long Châu",
    price: 195000,
    currency: "VND",
    category: "Thuốc giảm đau",
    isAvailable: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export function sanitizeDisplayText(val?: string | null, fallback = ""): string {
  if (!val) return fallback;
  const cleaned = val.replace(/�/g, "").trim();
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
    description: "Nhận cuốc xe máy và ô tô 4-7 chỗ điều phối trực tiếp bởi AI Agent (Grab, Be, Xanh SM)",
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
    description: "Nhận đơn món ăn từ khách hàng, đồng bộ đơn ShopeeFood & GrabFood",
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
  {
    id: "pharmacy",
    name: "Dược Phẩm & Thuốc",
    port: "healthcare-service :8103",
    domain: "pharmacy",
    description: "Tiếp nhận đơn mua thuốc kê đơn và OTC, đồng bộ Long Châu & Pharmacity",
    icon: "health",
    color: "#0D9488",
    bgColor: "#CCFBF1",
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
    id: "pharmacy",
    name: "Nhà Thuốc Tiện Lợi",
    port: "healthcare-service :8103",
    domain: "pharmacy",
    description: "Giao thuốc nhanh 1 giờ từ các chi nhánh Long Châu hoặc Pharmacity gần nhất",
    icon: "health",
    color: "#0D9488",
    bgColor: "#CCFBF1",
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

export function renderChannelIcon(icon: string, size = 20): React.ReactElement {
  switch (icon) {
    case "car":
      return React.createElement(Car, { size });
    case "food":
      return React.createElement(UtensilsCrossed, { size });
    case "restaurant":
      return React.createElement(Calendar, { size });
    case "health":
      return React.createElement(HeartPulse, { size });
    case "package":
      return React.createElement(Package, { size });
    case "shopping":
      return React.createElement(ShoppingBag, { size });
    case "truck":
      return React.createElement(Truck, { size });
    case "sparkles":
    default:
      return React.createElement(Sparkles, { size });
  }
}

export interface McpApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

export type {
  CreatedMcpKeyResult,
  ProviderAssignment,
  ProviderAvailability,
  ProviderDocument,
  ProviderEarningsSummary,
  ProviderMcpKeyItem,
  ProviderProfile,
  ProviderServiceItem,
  WebhookTestResult,
};
