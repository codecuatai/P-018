"use client";

import {
  Activity,
  AlertCircle,
  Bot,
  Calendar,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  HeartPulse,
  LoaderCircle,
  LogOut,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  User,
  UtensilsCrossed,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { XOneMark } from "@/components/XOneMark";
import { updateRideStatus } from "@/lib/api-client";
import { useAuth } from "@/providers/auth-provider";

interface ActiveRide {
  id: string;
  passengerName: string;
  pickup: string;
  destination: string;
  fare: number;
  currency: string;
  status: "DRIVER_ASSIGNED" | "DRIVER_TO_PICKUP" | "DRIVER_ARRIVED" | "IN_PROGRESS" | "ARRIVED_DESTINATION" | "COMPLETED";
  passengers: number;
  time: string;
}

interface FoodOrder {
  id: string;
  customerName: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  status: "RECEIVED" | "PREPARING" | "READY_FOR_PICKUP" | "COMPLETED";
  orderTime: string;
  note?: string;
}

interface HealthcareBooking {
  id: string;
  patientName: string;
  specialty: string;
  timeSlot: string;
  status: "CONFIRMED" | "IN_CONSULTATION" | "COMPLETED";
  type: "online" | "clinic";
}

const INITIAL_RIDE: ActiveRide = {
  id: "ride_bk_89201a",
  passengerName: "Nguyễn Văn Tuấn",
  pickup: "72 Lê Thánh Tôn, Bến Nghé, Quận 1, TP. Hồ Chí Minh",
  destination: "Sân bay Quốc tế Tân Sơn Nhất, Ga T2, Tân Bình",
  fare: 185000,
  currency: "VND",
  status: "DRIVER_TO_PICKUP",
  passengers: 2,
  time: "Vừa xong",
};

const INITIAL_ORDERS: FoodOrder[] = [
  {
    id: "food_ord_4102",
    customerName: "Trần Thị Mai",
    items: [
      { name: "Phở Bò Tái Nạm Đặc Biệt", quantity: 2, price: 85000 },
      { name: "Quẩy Giòn Hải Phòng", quantity: 2, price: 15000 },
      { name: "Trà Tắc Mật Ong", quantity: 2, price: 25000 },
    ],
    total: 250000,
    status: "PREPARING",
    orderTime: "10 phút trước",
    note: "Cho nhiều tương đen và ớt tươi riêng",
  },
  {
    id: "food_ord_4103",
    customerName: "Lê Hoàng Nam",
    items: [
      { name: "Cơm Tấm Sườn Bì Chả", quantity: 1, price: 75000 },
      { name: "Canh Khổ Qua Nhồi Thịt", quantity: 1, price: 30000 },
    ],
    total: 105000,
    status: "RECEIVED",
    orderTime: "2 phút trước",
    note: "Sườn chín kỹ, thêm mỡ hành",
  },
];

const INITIAL_APPOINTMENTS: HealthcareBooking[] = [
  {
    id: "med_apt_7719",
    patientName: "Phạm Minh Đức (38 tuổi)",
    specialty: "Khám Tổng Quát & Tim Mạch",
    timeSlot: "16:30 - 17:15 Hôm nay",
    status: "CONFIRMED",
    type: "clinic",
  },
  {
    id: "med_apt_7720",
    patientName: "Đỗ Bích Ngọc (29 tuổi)",
    specialty: "Tư vấn Dinh dưỡng & Miễn dịch",
    timeSlot: "17:30 - 18:00 Hôm nay",
    status: "CONFIRMED",
    type: "online",
  },
];

export function ProviderPortal() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<"ride" | "food" | "health">("ride");
  const [activeRide, setActiveRide] = useState<ActiveRide>(INITIAL_RIDE);
  const [orders, setOrders] = useState<FoodOrder[]>(INITIAL_ORDERS);
  const [appointments, setAppointments] = useState<HealthcareBooking[]>(INITIAL_APPOINTMENTS);
  const [loadingAction, setLoadingAction] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const notify = (text: string, type: "success" | "error" = "success") => {
    setActionNotice({ text, type });
    setTimeout(() => setActionNotice(null), 4000);
  };

  const advanceRideStatus = async () => {
    setLoadingAction(true);
    let nextStatus: ActiveRide["status"] = "COMPLETED";
    if (activeRide.status === "DRIVER_TO_PICKUP") nextStatus = "DRIVER_ARRIVED";
    else if (activeRide.status === "DRIVER_ARRIVED") nextStatus = "IN_PROGRESS";
    else if (activeRide.status === "IN_PROGRESS") nextStatus = "ARRIVED_DESTINATION";
    else if (activeRide.status === "ARRIVED_DESTINATION") nextStatus = "COMPLETED";

    try {
      await updateRideStatus(activeRide.id, nextStatus);
      setActiveRide((prev) => ({ ...prev, status: nextStatus }));
      notify(`Đã cập nhật trạng thái chuyến xe: ${nextStatus}`);
    } catch {
      // Local fallback for test or mock booking IDs
      setActiveRide((prev) => ({ ...prev, status: nextStatus }));
      notify(`Đã cập nhật trạng thái chuyến xe (Cục bộ): ${nextStatus}`);
    } finally {
      setLoadingAction(false);
    }
  };

  const advanceOrderStatus = (orderId: string, nextStatus: FoodOrder["status"]) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)));
    notify(`Đơn hàng #${orderId} đã chuyển sang trạng thái: ${nextStatus}`);
  };

  const advanceAppointmentStatus = (aptId: string, nextStatus: HealthcareBooking["status"]) => {
    setAppointments((prev) => prev.map((a) => (a.id === aptId ? { ...a, status: nextStatus } : a)));
    notify(`Lịch khám #${aptId} đã chuyển sang trạng thái: ${nextStatus}`);
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0B1120", color: "#F8FAFC", fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      {/* Top Partner Navbar */}
      <header
        style={{
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          backgroundColor: "rgba(15, 23, 42, 0.85)",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 40,
          padding: "0 24px",
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link href="/app" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", color: "inherit" }}>
            <XOneMark size={28} />
            <span style={{ fontWeight: 700, fontSize: "17px", letterSpacing: "-0.02em" }}>X-One</span>
          </Link>
          <span
            style={{
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              padding: "4px 10px",
              borderRadius: "9999px",
              backgroundColor: "rgba(59, 130, 246, 0.15)",
              color: "#60A5FA",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Store size={13} />
            Cổng Đối Tác (Provider Portal)
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#34D399" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#10B981", boxShadow: "0 0 10px #10B981" }} />
            <span>Sẵn sàng nhận cuốc & đơn</span>
          </div>

          <Link
            href="/app"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              fontSize: "12px",
              borderRadius: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.06)",
              color: "#E2E8F0",
              textDecoration: "none",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              transition: "all 0.2s ease",
            }}
          >
            <Bot size={14} />
            <span>Không gian User</span>
          </Link>

          {user?.role === "admin" && (
            <Link
              href="/app/admin"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                fontSize: "12px",
                borderRadius: "8px",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                color: "#F87171",
                textDecoration: "none",
                border: "1px solid rgba(239, 68, 68, 0.2)",
              }}
            >
              <ShieldAlert size={14} />
              <span>Quản trị viên</span>
            </Link>
          )}

          <button
            type="button"
            onClick={() => void logout()}
            style={{
              background: "none",
              border: "none",
              color: "#94A3B8",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
            }}
            title="Đăng xuất"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 24px" }}>
        {/* Toast Alert */}
        {actionNotice && (
          <div
            style={{
              marginBottom: "20px",
              padding: "12px 18px",
              borderRadius: "10px",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              backgroundColor: actionNotice.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
              color: actionNotice.type === "success" ? "#34D399" : "#F87171",
              border: `1px solid ${actionNotice.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
            }}
          >
            <CheckCircle2 size={16} />
            <span>{actionNotice.text}</span>
          </div>
        )}

        {/* Hero Section */}
        <div
          style={{
            background: "linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "16px",
            padding: "24px 28px",
            marginBottom: "28px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "20px",
          }}
        >
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px 0", color: "#FFFFFF" }}>
              Chào mừng, {user?.full_name || user?.email || "Đối tác X-One"}
            </h1>
            <p style={{ margin: 0, fontSize: "14px", color: "#94A3B8" }}>
              Bảng điều khiển tác vụ dịch vụ đối tác thời gian thực · Cổng Gateway Core RBAC
            </p>
          </div>

          <div style={{ display: "flex", gap: "24px" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "11px", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Đánh giá dịch vụ</div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#FBBF24", display: "flex", alignItems: "center", gap: "4px", justifyContent: "flex-end" }}>
                <Star size={18} fill="#FBBF24" /> 4.96
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "11px", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Doanh thu hôm nay</div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#34D399" }}>1.240.000 đ</div>
            </div>
          </div>
        </div>

        {/* Service Domain Tabs */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "24px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "12px" }}>
          <button
            type="button"
            onClick={() => setActiveTab("ride")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              borderRadius: "10px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              backgroundColor: activeTab === "ride" ? "#2563EB" : "rgba(255, 255, 255, 0.04)",
              color: activeTab === "ride" ? "#FFFFFF" : "#94A3B8",
              transition: "all 0.2s ease",
            }}
          >
            <Car size={16} />
            <span>Tài xế di chuyển (Ride Partner)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("food")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              borderRadius: "10px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              backgroundColor: activeTab === "food" ? "#2563EB" : "rgba(255, 255, 255, 0.04)",
              color: activeTab === "food" ? "#FFFFFF" : "#94A3B8",
              transition: "all 0.2s ease",
            }}
          >
            <UtensilsCrossed size={16} />
            <span>Quán ăn & Nhà hàng (Food Merchant)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("health")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              borderRadius: "10px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              backgroundColor: activeTab === "health" ? "#2563EB" : "rgba(255, 255, 255, 0.04)",
              color: activeTab === "health" ? "#FFFFFF" : "#94A3B8",
              transition: "all 0.2s ease",
            }}
          >
            <HeartPulse size={16} />
            <span>Phòng khám & Bác sĩ (Healthcare)</span>
          </button>
        </div>

        {/* TAB 1: RIDE PARTNER */}
        {activeTab === "ride" && (
          <div>
            <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0, color: "#F1F5F9" }}>Cuốc xe đang điều phối</h2>
              <span style={{ fontSize: "12px", color: "#94A3B8" }}>Mã cuốc: {activeRide.id}</span>
            </div>

            <div
              style={{
                backgroundColor: "rgba(30, 41, 59, 0.5)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "14px",
                padding: "24px",
                marginBottom: "24px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "20px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                    <h3 style={{ fontSize: "18px", fontWeight: 700, margin: 0, color: "#FFFFFF" }}>{activeRide.passengerName}</h3>
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "6px",
                        backgroundColor: "rgba(59, 130, 246, 0.2)",
                        color: "#93C5FD",
                        fontWeight: 600,
                      }}
                    >
                      {activeRide.passengers} Hành khách
                    </span>
                  </div>
                  <span style={{ fontSize: "12px", color: "#94A3B8" }}>Thời gian đặt: {activeRide.time}</span>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "#34D399" }}>
                    {activeRide.fare.toLocaleString("vi-VN")} {activeRide.currency}
                  </div>
                  <span style={{ fontSize: "12px", color: "#94A3B8" }}>Thanh toán qua ví X-One</span>
                </div>
              </div>

              {/* Route Path */}
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "24px", padding: "16px", backgroundColor: "rgba(15, 23, 42, 0.6)", borderRadius: "10px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ width: "20px", display: "flex", justifyContent: "center", paddingTop: "2px" }}>
                    <span style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "#3B82F6", border: "2px solid #FFFFFF" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#94A3B8", textTransform: "uppercase", fontWeight: 600 }}>Điểm đón</div>
                    <div style={{ fontSize: "14px", color: "#E2E8F0", fontWeight: 500 }}>{activeRide.pickup}</div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ width: "20px", display: "flex", justifyContent: "center", paddingTop: "2px" }}>
                    <MapPin size={16} style={{ color: "#EF4444" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#94A3B8", textTransform: "uppercase", fontWeight: 600 }}>Điểm đến</div>
                    <div style={{ fontSize: "14px", color: "#E2E8F0", fontWeight: 500 }}>{activeRide.destination}</div>
                  </div>
                </div>
              </div>

              {/* Current Status Pill & Action */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: "#94A3B8" }}>Trạng thái hiện tại:</span>
                  <span
                    style={{
                      fontSize: "12px",
                      padding: "4px 12px",
                      borderRadius: "6px",
                      fontWeight: 700,
                      backgroundColor: activeRide.status === "COMPLETED" ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                      color: activeRide.status === "COMPLETED" ? "#34D399" : "#FBBF24",
                    }}
                  >
                    {activeRide.status}
                  </span>
                </div>

                {activeRide.status !== "COMPLETED" && (
                  <button
                    type="button"
                    disabled={loadingAction}
                    onClick={() => void advanceRideStatus()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px 20px",
                      borderRadius: "10px",
                      fontSize: "13px",
                      fontWeight: 600,
                      backgroundColor: "#2563EB",
                      color: "#FFFFFF",
                      border: "none",
                      cursor: "pointer",
                      boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {loadingAction ? <LoaderCircle className="spinner" size={15} /> : <Navigation size={15} />}
                    <span>
                      {activeRide.status === "DRIVER_TO_PICKUP" && "Đã đến điểm đón (DRIVER_ARRIVED)"}
                      {activeRide.status === "DRIVER_ARRIVED" && "Bắt đầu chuyến đi (IN_PROGRESS)"}
                      {activeRide.status === "IN_PROGRESS" && "Đã tới đích (ARRIVED_DESTINATION)"}
                      {activeRide.status === "ARRIVED_DESTINATION" && "Hoàn thành chuyến (COMPLETED)"}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: FOOD / RESTAURANT */}
        {activeTab === "food" && (
          <div>
            <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0, color: "#F1F5F9" }}>Danh sách đơn món cần xử lý</h2>
              <span style={{ fontSize: "12px", color: "#94A3B8" }}>{orders.length} đơn đang chờ</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "20px" }}>
              {orders.map((order) => (
                <div
                  key={order.id}
                  style={{
                    backgroundColor: "rgba(30, 41, 59, 0.5)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "14px",
                    padding: "20px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <div>
                        <strong style={{ fontSize: "15px", color: "#FFFFFF" }}>{order.customerName}</strong>
                        <div style={{ fontSize: "11px", color: "#94A3B8" }}>Mã: {order.id} · {order.orderTime}</div>
                      </div>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: "6px",
                          backgroundColor:
                            order.status === "READY_FOR_PICKUP"
                              ? "rgba(16, 185, 129, 0.2)"
                              : order.status === "PREPARING"
                              ? "rgba(245, 158, 11, 0.2)"
                              : "rgba(59, 130, 246, 0.2)",
                          color:
                            order.status === "READY_FOR_PICKUP"
                              ? "#34D399"
                              : order.status === "PREPARING"
                              ? "#FBBF24"
                              : "#93C5FD",
                        }}
                      >
                        {order.status}
                      </span>
                    </div>

                    <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", padding: "12px 0", margin: "12px 0" }}>
                      {order.items.map((item, idx) => (
                        <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}>
                          <span>{item.quantity}x {item.name}</span>
                          <span style={{ color: "#94A3B8" }}>{(item.price * item.quantity).toLocaleString("vi-VN")} đ</span>
                        </div>
                      ))}
                    </div>

                    {order.note && (
                      <div style={{ fontSize: "12px", color: "#FBBF24", backgroundColor: "rgba(245, 158, 11, 0.1)", padding: "8px 12px", borderRadius: "6px", marginBottom: "16px" }}>
                        💬 Ghi chú: {order.note}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px" }}>
                    <div>
                      <div style={{ fontSize: "11px", color: "#94A3B8" }}>Tổng thanh toán</div>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "#34D399" }}>{order.total.toLocaleString("vi-VN")} đ</div>
                    </div>

                    <div style={{ display: "flex", gap: "8px" }}>
                      {order.status === "RECEIVED" && (
                        <button
                          type="button"
                          onClick={() => advanceOrderStatus(order.id, "PREPARING")}
                          style={{
                            padding: "8px 14px",
                            borderRadius: "8px",
                            fontSize: "12px",
                            fontWeight: 600,
                            backgroundColor: "#2563EB",
                            color: "#FFFFFF",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          Bắt đầu chế biến
                        </button>
                      )}
                      {order.status === "PREPARING" && (
                        <button
                          type="button"
                          onClick={() => advanceOrderStatus(order.id, "READY_FOR_PICKUP")}
                          style={{
                            padding: "8px 14px",
                            borderRadius: "8px",
                            fontSize: "12px",
                            fontWeight: 600,
                            backgroundColor: "#059669",
                            color: "#FFFFFF",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          Món đã xong (Sẵn sàng lấy)
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: HEALTHCARE */}
        {activeTab === "health" && (
          <div>
            <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0, color: "#F1F5F9" }}>Ca khám bệnh nhân trong ngày</h2>
              <span style={{ fontSize: "12px", color: "#94A3B8" }}>{appointments.length} lịch khám</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {appointments.map((apt) => (
                <div
                  key={apt.id}
                  style={{
                    backgroundColor: "rgba(30, 41, 59, 0.5)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "14px",
                    padding: "18px 24px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <div style={{ width: "42px", height: "42px", borderRadius: "10px", backgroundColor: "rgba(14, 165, 233, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "#38BDF8" }}>
                      <HeartPulse size={22} />
                    </div>
                    <div>
                      <strong style={{ fontSize: "15px", color: "#FFFFFF", display: "block" }}>{apt.patientName}</strong>
                      <span style={{ fontSize: "12px", color: "#94A3B8" }}>{apt.specialty} · {apt.timeSlot}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        fontWeight: 600,
                        backgroundColor: apt.type === "online" ? "rgba(168, 85, 247, 0.15)" : "rgba(34, 197, 94, 0.15)",
                        color: apt.type === "online" ? "#C084FC" : "#4ADE80",
                      }}
                    >
                      {apt.type === "online" ? "Tư vấn từ xa" : "Tại phòng khám"}
                    </span>

                    <span
                      style={{
                        fontSize: "11px",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        fontWeight: 700,
                        backgroundColor:
                          apt.status === "COMPLETED"
                            ? "rgba(16, 185, 129, 0.2)"
                            : apt.status === "IN_CONSULTATION"
                            ? "rgba(245, 158, 11, 0.2)"
                            : "rgba(59, 130, 246, 0.2)",
                        color:
                          apt.status === "COMPLETED"
                            ? "#34D399"
                            : apt.status === "IN_CONSULTATION"
                            ? "#FBBF24"
                            : "#93C5FD",
                      }}
                    >
                      {apt.status}
                    </span>

                    {apt.status === "CONFIRMED" && (
                      <button
                        type="button"
                        onClick={() => advanceAppointmentStatus(apt.id, "IN_CONSULTATION")}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "8px",
                          fontSize: "12px",
                          fontWeight: 600,
                          backgroundColor: "#2563EB",
                          color: "#FFFFFF",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        Bắt đầu khám
                      </button>
                    )}

                    {apt.status === "IN_CONSULTATION" && (
                      <button
                        type="button"
                        onClick={() => advanceAppointmentStatus(apt.id, "COMPLETED")}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "8px",
                          fontSize: "12px",
                          fontWeight: 600,
                          backgroundColor: "#059669",
                          color: "#FFFFFF",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        Hoàn tất ca khám
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
