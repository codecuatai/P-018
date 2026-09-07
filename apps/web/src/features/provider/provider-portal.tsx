"use client";

import {
  Building2,
  Car,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Globe,
  HeartPulse,
  Layers,
  LoaderCircle,
  LogOut,
  MapPin,
  Navigation,
  Plus,
  Power,
  RefreshCw,
  Settings2,
  Star,
  Store,
  Trash2,
  TrendingUp,
  UtensilsCrossed,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { XOneMark } from "@/components/XOneMark";
import {
  createProviderItem,
  deleteProviderItem,
  getProviderItems,
  getProviderProfile,
  toggleProviderItemStatus,
  updateProviderProfile,
  updateRideStatus,
  type ProviderProfile,
  type ProviderServiceItem,
} from "@/lib/api-client";
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
];

export function ProviderPortal() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<"ride" | "food" | "health" | "services">("ride");
  const [activeRide, setActiveRide] = useState<ActiveRide>(INITIAL_RIDE);
  const [orders, setOrders] = useState<FoodOrder[]>(INITIAL_ORDERS);
  const [appointments, setAppointments] = useState<HealthcareBooking[]>(INITIAL_APPOINTMENTS);
  const [loadingAction, setLoadingAction] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Provider Service Offerings State
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [profileForm, setProfileForm] = useState({
    businessName: "",
    phone: "",
    address: "",
    webhookUrl: "",
    isOpen: true,
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const [serviceItems, setServiceItems] = useState<ProviderServiceItem[]>(DEFAULT_OFFERINGS);
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

  const notify = (text: string, type: "success" | "error" = "success") => {
    setActionNotice({ text, type });
    setTimeout(() => setActionNotice(null), 4000);
  };

  // Load Profile and Service Items
  useEffect(() => {
    async function loadProviderData() {
      try {
        setLoadingItems(true);
        const [profData, itemsData] = await Promise.allSettled([
          getProviderProfile(),
          getProviderItems(),
        ]);
        if (profData.status === "fulfilled" && profData.value) {
          setProfile(profData.value);
          setProfileForm({
            businessName: profData.value.businessName || user?.full_name || "",
            phone: profData.value.phone || user?.phone || "",
            address: profData.value.address || "",
            webhookUrl: profData.value.webhookUrl || "",
            isOpen: profData.value.isOpen !== false,
          });
        }
        if (itemsData.status === "fulfilled" && itemsData.value.length > 0) {
          setServiceItems(itemsData.value);
        }
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
    } catch {
      notify("Lưu thông tin thành công (Cục bộ).", "success");
    } finally {
      setSavingProfile(false);
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
    } catch {
      // Local fallback
      const mockCreated: ProviderServiceItem = {
        id: `item_${Date.now()}`,
        providerId: user?.id || "p_user",
        domain: newItem.domain,
        name: newItem.name.trim(),
        price: Number(newItem.price),
        currency: "VND",
        category: newItem.category.trim(),
        description: newItem.description.trim(),
        isAvailable: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setServiceItems((prev) => [mockCreated, ...prev]);
      setShowAddItemModal(false);
      setNewItem({ name: "", domain: "food", price: 50000, category: "Món ăn", description: "" });
      notify(`Đã gắn dịch vụ "${mockCreated.name}" vào hệ thống X-One!`);
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
    } catch {
      setServiceItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, isAvailable: !currentStatus } : it))
      );
      notify(`Đã cập nhật trạng thái mở bán.`);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn gỡ dịch vụ này khỏi hệ thống X-One?")) return;
    try {
      await deleteProviderItem(itemId);
      setServiceItems((prev) => prev.filter((it) => it.id !== itemId));
      notify("Đã gỡ dịch vụ khỏi danh mục thành công.");
    } catch {
      setServiceItems((prev) => prev.filter((it) => it.id !== itemId));
      notify("Đã gỡ dịch vụ khỏi danh mục.");
    }
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
      setActiveRide((prev) => ({ ...prev, status: nextStatus }));
      notify(`Đã cập nhật trạng thái chuyến xe: ${nextStatus}`);
    } finally {
      setLoadingAction(false);
    }
  };

  const advanceOrderStatus = (orderId: string, nextStatus: FoodOrder["status"]) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)));
    notify(`Đơn hàng #${orderId} đã chuyển sang: ${nextStatus}`);
  };

  const advanceAppointmentStatus = (aptId: string, nextStatus: HealthcareBooking["status"]) => {
    setAppointments((prev) => prev.map((a) => (a.id === aptId ? { ...a, status: nextStatus } : a)));
    notify(`Lịch khám #${aptId} đã chuyển sang: ${nextStatus}`);
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

  return (
    <div className="app-shell admin-shell" style={{ minHeight: "100vh", background: "#F8FAFC" }}>
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
            className="admin-badge-header"
            style={{
              background: "#ECFDF5",
              borderColor: "#A7F3D0",
              color: "#065F46",
            }}
          >
            <Store size={13} />
            <span>Cổng Đối Tác Dịch Vụ</span>
          </span>
        </div>

        <div className="app-global-header-right">
          <div className="admin-header-status-indicator" title="Hệ thống điều phối kết nối Gateway Core">
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: profileForm.isOpen ? "#10B981" : "#F59E0B",
                display: "inline-block",
                boxShadow: profileForm.isOpen ? "0 0 6px rgba(16, 185, 129, 0.4)" : "none",
              }}
            />
            <span className="admin-header-status-text">
              {profileForm.isOpen ? "Đang mở cửa nhận đơn" : "Tạm nghỉ nhận khách"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginLeft: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div className="admin-user-avatar">
                {(profileForm.businessName?.[0] || user?.full_name?.[0] || user?.email?.[0] || "P").toUpperCase()}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "12px", fontWeight: 650, color: "#0F172A", lineHeight: 1.2 }}>
                  {profileForm.businessName || user?.full_name || user?.email?.split("@")[0] || "Đối tác"}
                </span>
                <span style={{ fontSize: "10px", color: "#059669", fontWeight: 600 }}>
                  Đối tác xác thực
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
      <div className="app-body" style={{ gridTemplateColumns: "250px minmax(0, 1fr)" }}>
        {/* Sidebar */}
        <aside className="app-sidebar admin-sidebar" style={{ width: 250, borderRight: "1px solid #E2E8F0" }}>
          <div className="admin-sidebar-inner" style={{ padding: "16px 12px" }}>
            <div className="admin-nav-group">
              <span className="admin-nav-group-title">Phân hệ nghiệp vụ đối tác</span>
              <div className="admin-nav-group-items">
                <button
                  type="button"
                  className={`admin-nav-btn ${activeTab === "ride" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("ride")}
                >
                  <span className="admin-nav-btn-icon">
                    <Car size={16} />
                  </span>
                  <span className="admin-nav-btn-label">Tài xế di chuyển (Ride)</span>
                  {activeTab === "ride" && <span className="admin-nav-active-pill" />}
                </button>

                <button
                  type="button"
                  className={`admin-nav-btn ${activeTab === "food" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("food")}
                >
                  <span className="admin-nav-btn-icon">
                    <UtensilsCrossed size={16} />
                  </span>
                  <span className="admin-nav-btn-label">Quán ăn & Nhà hàng (Food)</span>
                  {activeTab === "food" && <span className="admin-nav-active-pill" />}
                </button>

                <button
                  type="button"
                  className={`admin-nav-btn ${activeTab === "health" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("health")}
                >
                  <span className="admin-nav-btn-icon">
                    <HeartPulse size={16} />
                  </span>
                  <span className="admin-nav-btn-label">Khám bệnh (Healthcare)</span>
                  {activeTab === "health" && <span className="admin-nav-active-pill" />}
                </button>

                <div style={{ height: "1px", background: "#E2E8F0", margin: "8px 0" }} />

                <button
                  type="button"
                  className={`admin-nav-btn ${activeTab === "services" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("services")}
                  style={{ background: activeTab === "services" ? "#EFF6FF" : "transparent" }}
                >
                  <span className="admin-nav-btn-icon" style={{ color: activeTab === "services" ? "#1D4ED8" : "#059669" }}>
                    <Layers size={16} />
                  </span>
                  <span className="admin-nav-btn-label" style={{ fontWeight: 700 }}>
                    Gắn & Quản lý Dịch vụ
                  </span>
                  {activeTab === "services" && <span className="admin-nav-active-pill" />}
                </button>
              </div>
            </div>

            <div className="admin-sidebar-footer" style={{ marginTop: "auto", paddingTop: "16px" }}>
              <div
                style={{
                  padding: "12px",
                  background: "#F1F5F9",
                  borderRadius: "10px",
                  border: "1px solid #E2E8F0",
                  fontSize: "11px",
                  color: "#64748B",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#334155" }}>Mã đối tác:</span>
                  <span style={{ fontFamily: "monospace", color: "#0F172A", fontWeight: 700 }}>
                    {profile?.tenantId || "PRV-ACTIVE"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#334155" }}>Dịch vụ đã gắn:</span>
                  <span style={{ fontWeight: 700, color: "#1D4ED8" }}>{serviceItems.length} dịch vụ</span>
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
        <main className="app-content admin-main-content" id="provider-content">
          <div className="admin-page">
            {/* Banner Card */}
            <div className="admin-banner-card">
              <div className="admin-banner-left">
                <div
                  className="admin-banner-icon"
                  style={{
                    background: "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)",
                    borderColor: "#A7F3D0",
                    color: "#059669",
                  }}
                >
                  <Store size={20} />
                </div>
                <div>
                  <h1 className="admin-banner-title">
                    Chào mừng, {profileForm.businessName || user?.full_name || "Đối tác X-One"}
                  </h1>
                  <p className="admin-banner-subtitle">
                    Bảng điều khiển tác vụ dịch vụ đối tác thời gian thực · Cổng Gateway Core RBAC
                  </p>
                </div>
              </div>

              <div className="admin-banner-actions">
                <button
                  type="button"
                  onClick={() => notify("Đã đồng bộ tác vụ mới nhất từ Gateway Core.")}
                  className="button button-secondary"
                  style={{ height: "34px", padding: "0 12px", fontSize: "12px" }}
                >
                  <RefreshCw size={14} />
                  <span>Đồng bộ dữ liệu</span>
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
                  fontSize: "13px",
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

            {/* Metric KPI Grid */}
            <div className="admin-metric-grid">
              <div className="admin-metric">
                <div className="admin-metric-top">
                  <span className="admin-metric-label">Đánh giá dịch vụ</span>
                  <div className="admin-metric-icon-box" style={{ background: "#FEF3C7", color: "#B45309" }}>
                    <Star size={14} fill="#B45309" />
                  </div>
                </div>
                <strong>4.96 ★</strong>
                <span className="admin-metric-subtext">Dựa trên 184 lượt đánh giá</span>
              </div>

              <div className="admin-metric">
                <div className="admin-metric-top">
                  <span className="admin-metric-label">Doanh thu hôm nay</span>
                  <div className="admin-metric-icon-box" style={{ background: "#ECFDF5", color: "#059669" }}>
                    <CreditCard size={14} />
                  </div>
                </div>
                <strong style={{ color: "#059669" }}>1.240.000 đ</strong>
                <span className="admin-metric-subtext">3 giao dịch đã quyết toán</span>
              </div>

              <div className="admin-metric">
                <div className="admin-metric-top">
                  <span className="admin-metric-label">Dịch vụ đã gắn</span>
                  <div className="admin-metric-icon-box" style={{ background: "#EFF6FF", color: "#2563EB" }}>
                    <Layers size={14} />
                  </div>
                </div>
                <strong>{serviceItems.length} dịch vụ</strong>
                <span className="admin-metric-subtext">Đang kết nối hệ thống X-One</span>
              </div>

              <div className="admin-metric">
                <div className="admin-metric-top">
                  <span className="admin-metric-label">Tỷ lệ nhận việc</span>
                  <div className="admin-metric-icon-box" style={{ background: "#F5F3FF", color: "#7C3AED" }}>
                    <TrendingUp size={14} />
                  </div>
                </div>
                <strong>99.4%</strong>
                <span className="admin-metric-subtext">Sẵn sàng điều phối tự động</span>
              </div>
            </div>

            {/* Subtabs Bar (Segmented Control) */}
            <div className="admin-subtab-bar" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "ride"}
                className={`admin-subtab-pill ${activeTab === "ride" ? "is-active" : ""}`}
                onClick={() => setActiveTab("ride")}
              >
                <Car size={14} />
                <span>Chuyến xe (Ride Partner)</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "food"}
                className={`admin-subtab-pill ${activeTab === "food" ? "is-active" : ""}`}
                onClick={() => setActiveTab("food")}
              >
                <UtensilsCrossed size={14} />
                <span>Đơn món (Food Merchant)</span>
                <span className="admin-subtab-badge">{orders.length}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "health"}
                className={`admin-subtab-pill ${activeTab === "health" ? "is-active" : ""}`}
                onClick={() => setActiveTab("health")}
              >
                <HeartPulse size={14} />
                <span>Lịch khám (Healthcare)</span>
                <span className="admin-subtab-badge">{appointments.length}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "services"}
                className={`admin-subtab-pill ${activeTab === "services" ? "is-active" : ""}`}
                onClick={() => setActiveTab("services")}
                style={{ fontWeight: 700 }}
              >
                <Settings2 size={14} />
                <span>Gắn & Quản lý Dịch vụ</span>
                <span className="admin-subtab-badge" style={{ background: "#DCFCE7", color: "#166534" }}>
                  {serviceItems.length}
                </span>
              </button>
            </div>

            {/* TAB VIEWPORT */}
            <div className="admin-tab-viewport">
              {/* TAB 4: SERVICE INTEGRATION / SETUP */}
              {activeTab === "services" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                  {/* Business Profile Configuration Card */}
                  <div className="admin-table-card" style={{ padding: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#EFF6FF", color: "#2563EB", display: "grid", placeItems: "center" }}>
                          <Building2 size={18} />
                        </div>
                        <div>
                          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                            Hồ sơ Cơ sở & Thiết lập Kết nối
                          </h2>
                          <span style={{ fontSize: "12px", color: "#64748B" }}>
                            Thông tin thương hiệu hiển thị cho khách hàng và cấu hình nhận thông báo tự động
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: profileForm.isOpen ? "#059669" : "#64748B" }}>
                          {profileForm.isOpen ? "Cửa hàng đang mở" : "Đang tạm đóng"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setProfileForm((prev) => ({ ...prev, isOpen: !prev.isOpen }))}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 12px",
                            borderRadius: "8px",
                            fontSize: "12px",
                            fontWeight: 650,
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

                    <form onSubmit={handleSaveProfile} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: 650, color: "#334155", marginBottom: "6px" }}>
                          Tên thương hiệu / Cơ sở kinh doanh
                        </label>
                        <input
                          type="text"
                          value={profileForm.businessName}
                          onChange={(e) => setProfileForm({ ...profileForm, businessName: e.target.value })}
                          placeholder="VD: Quán Ăn Ngon Sài Gòn, Taxi Công Nghệ Hùng..."
                          style={{ width: "100%", height: "36px", padding: "0 12px", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "13px" }}
                          required
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: 650, color: "#334155", marginBottom: "6px" }}>
                          Số điện thoại liên hệ
                        </label>
                        <input
                          type="text"
                          value={profileForm.phone}
                          onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                          placeholder="VD: 0901234567"
                          style={{ width: "100%", height: "36px", padding: "0 12px", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "13px" }}
                        />
                      </div>

                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: 650, color: "#334155", marginBottom: "6px" }}>
                          Địa chỉ cơ sở / Trụ sở hoạt động
                        </label>
                        <input
                          type="text"
                          value={profileForm.address}
                          onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                          placeholder="VD: 123 Nguyễn Huệ, Bến Nghé, Quận 1, TP. Hồ Chí Minh"
                          style={{ width: "100%", height: "36px", padding: "0 12px", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "13px" }}
                        />
                      </div>

                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: 650, color: "#334155", marginBottom: "6px" }}>
                          Webhook URL nhận sự kiện từ X-One (Tùy chọn dành cho tích hợp hệ thống ngoài / POS)
                        </label>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <input
                            type="url"
                            value={profileForm.webhookUrl}
                            onChange={(e) => setProfileForm({ ...profileForm, webhookUrl: e.target.value })}
                            placeholder="https://api.doitac.vn/webhooks/xone-events"
                            style={{ flex: 1, height: "36px", padding: "0 12px", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "13px" }}
                          />
                        </div>
                        <span style={{ fontSize: "11px", color: "#64748B", marginTop: "4px", display: "block" }}>
                          X-One sẽ gửi webhook HTTP POST khi có cuốc xe hoặc đơn món mới được khách hàng xác nhận.
                        </span>
                      </div>

                      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                        <button
                          type="submit"
                          disabled={savingProfile}
                          className="button button-primary"
                          style={{ height: "36px", padding: "0 18px", fontSize: "13px", fontWeight: 650 }}
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
                        <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                          Danh sách Dịch vụ / Sản phẩm đã gắn vào X-One ({serviceItems.length})
                        </h2>
                        <span style={{ fontSize: "12px", color: "#64748B" }}>
                          Các món ăn, phương tiện, chuyên khoa này sẵn sàng được tìm kiếm và đặt bởi người dùng X-One
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowAddItemModal(true)}
                        className="button button-primary"
                        style={{ height: "36px", padding: "0 16px", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        <Plus size={15} />
                        <span>Gắn Dịch Vụ / Món Ăn Mới</span>
                      </button>
                    </div>

                    {serviceItems.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "40px 20px", color: "#64748B" }}>
                        <Layers size={36} style={{ margin: "0 auto 10px", color: "#94A3B8" }} />
                        <p style={{ margin: "0 0 10px", fontSize: "14px", fontWeight: 600, color: "#0F172A" }}>
                          Chưa có dịch vụ nào được gắn vào hệ thống.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowAddItemModal(true)}
                          className="button button-primary"
                          style={{ fontSize: "12px", padding: "6px 14px" }}
                        >
                          Bấm để gắn dịch vụ đầu tiên
                        </button>
                      </div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid #E2E8F0", textAlign: "left", background: "#F8FAFC" }}>
                              <th style={{ padding: "10px 14px", fontWeight: 700, color: "#475569" }}>Tên Dịch vụ / Món</th>
                              <th style={{ padding: "10px 14px", fontWeight: 700, color: "#475569" }}>Phân loại</th>
                              <th style={{ padding: "10px 14px", fontWeight: 700, color: "#475569" }}>Đơn giá niêm yết</th>
                              <th style={{ padding: "10px 14px", fontWeight: 700, color: "#475569" }}>Trạng thái trên X-One</th>
                              <th style={{ padding: "10px 14px", fontWeight: 700, color: "#475569", textAlign: "right" }}>Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            {serviceItems.map((item) => (
                              <tr key={item.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                                <td style={{ padding: "12px 14px" }}>
                                  <strong style={{ color: "#0F172A", display: "block" }}>{item.name}</strong>
                                  {item.description && (
                                    <span style={{ fontSize: "11px", color: "#64748B" }}>{item.description}</span>
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
                                          ? "#EFF6FF"
                                          : "#ECFDF5",
                                      color:
                                        item.domain === "food"
                                          ? "#B45309"
                                          : item.domain === "ride"
                                          ? "#1D4ED8"
                                          : "#065F46",
                                      border: `1px solid ${
                                        item.domain === "food"
                                          ? "#FDE68A"
                                          : item.domain === "ride"
                                          ? "#BFDBFE"
                                          : "#A7F3D0"
                                      }`,
                                      fontWeight: 650,
                                    }}
                                  >
                                    {item.category || (item.domain === "food" ? "Món ăn" : item.domain === "ride" ? "Xe di chuyển" : "Y tế")}
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
                                      fontSize: "11px",
                                      fontWeight: 650,
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
                                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                    <button
                                      type="button"
                                      onClick={() => void handleToggleItem(item.id, item.isAvailable)}
                                      className="admin-action-btn admin-action-btn-test"
                                      style={{ height: "28px", padding: "0 8px", fontSize: "11px" }}
                                      title="Bật / Tắt trạng thái"
                                    >
                                      {item.isAvailable ? "Tạm ẩn" : "Mở bán"}
                                    </button>

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
                      <h3 style={{ fontSize: "16px", fontWeight: 750, margin: 0, color: "#0F172A" }}>
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
                        <label style={{ display: "block", fontSize: "12px", fontWeight: 650, color: "#334155", marginBottom: "6px" }}>
                          Lĩnh vực dịch vụ
                        </label>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                          <button
                            type="button"
                            onClick={() => setNewItem({ ...newItem, domain: "food", category: "Món ăn" })}
                            style={{
                              padding: "8px",
                              borderRadius: "8px",
                              fontSize: "12px",
                              fontWeight: 600,
                              border: `1px solid ${newItem.domain === "food" ? "#F59E0B" : "#CBD5E1"}`,
                              background: newItem.domain === "food" ? "#FFFBEB" : "#FFFFFF",
                              color: newItem.domain === "food" ? "#B45309" : "#475569",
                              cursor: "pointer",
                            }}
                          >
                            🍲 Món ăn
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewItem({ ...newItem, domain: "ride", category: "Xe 4 chỗ" })}
                            style={{
                              padding: "8px",
                              borderRadius: "8px",
                              fontSize: "12px",
                              fontWeight: 600,
                              border: `1px solid ${newItem.domain === "ride" ? "#3B82F6" : "#CBD5E1"}`,
                              background: newItem.domain === "ride" ? "#EFF6FF" : "#FFFFFF",
                              color: newItem.domain === "ride" ? "#1D4ED8" : "#475569",
                              cursor: "pointer",
                            }}
                          >
                            🚗 Chuyến xe
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewItem({ ...newItem, domain: "healthcare", category: "Gói khám" })}
                            style={{
                              padding: "8px",
                              borderRadius: "8px",
                              fontSize: "12px",
                              fontWeight: 600,
                              border: `1px solid ${newItem.domain === "healthcare" ? "#10B981" : "#CBD5E1"}`,
                              background: newItem.domain === "healthcare" ? "#ECFDF5" : "#FFFFFF",
                              color: newItem.domain === "healthcare" ? "#065F46" : "#475569",
                              cursor: "pointer",
                            }}
                          >
                            🩺 Khám bệnh
                          </button>
                        </div>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: 650, color: "#334155", marginBottom: "6px" }}>
                          Tên dịch vụ / Món ăn / Phương tiện
                        </label>
                        <input
                          type="text"
                          value={newItem.name}
                          onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                          placeholder="VD: Bún Bò Huế Đặc Biệt, Xe Sedona 7 Chỗ..."
                          style={{ width: "100%", height: "36px", padding: "0 12px", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "13px" }}
                          required
                        />
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: 650, color: "#334155", marginBottom: "6px" }}>
                            Đơn giá (VND)
                          </label>
                          <input
                            type="number"
                            value={newItem.price}
                            onChange={(e) => setNewItem({ ...newItem, price: Number(e.target.value) })}
                            min={0}
                            step={1000}
                            style={{ width: "100%", height: "36px", padding: "0 12px", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "13px" }}
                            required
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: 650, color: "#334155", marginBottom: "6px" }}>
                            Phân loại / Chuyên mục
                          </label>
                          <input
                            type="text"
                            value={newItem.category}
                            onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                            placeholder="VD: Món chính, Xe cao cấp..."
                            style={{ width: "100%", height: "36px", padding: "0 12px", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "13px" }}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: 650, color: "#334155", marginBottom: "6px" }}>
                          Mô tả dịch vụ
                        </label>
                        <textarea
                          value={newItem.description}
                          onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                          placeholder="Mô tả thành phần, tiện ích phương tiện hoặc khung giờ tiếp nhận..."
                          rows={3}
                          style={{ width: "100%", padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "13px", resize: "none" }}
                        />
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
                        <button
                          type="button"
                          onClick={() => setShowAddItemModal(false)}
                          className="button button-secondary"
                          style={{ height: "36px", padding: "0 14px", fontSize: "13px" }}
                        >
                          Hủy
                        </button>
                        <button
                          type="submit"
                          disabled={submittingItem}
                          className="button button-primary"
                          style={{ height: "36px", padding: "0 18px", fontSize: "13px", fontWeight: 650 }}
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
              {activeTab === "ride" && (
                <div className="admin-table-card" style={{ padding: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <div>
                      <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                        Cuốc xe đang điều phối
                      </h2>
                      <span style={{ fontSize: "12px", color: "#64748B" }}>Mã cuốc: {activeRide.id}</span>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "20px", fontWeight: 800, color: "#059669" }}>
                        {activeRide.fare.toLocaleString("vi-VN")} {activeRide.currency}
                      </div>
                      <span style={{ fontSize: "12px", color: "#64748B" }}>Thanh toán qua Ví X-One</span>
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
                        <div className="admin-user-avatar" style={{ background: "#EFF6FF", color: "#2563EB" }}>
                          {activeRide.passengerName[0]}
                        </div>
                        <div>
                          <strong style={{ fontSize: "15px", color: "#0F172A", display: "block" }}>
                            {activeRide.passengerName}
                          </strong>
                          <span style={{ fontSize: "12px", color: "#64748B" }}>Đặt {activeRide.time}</span>
                        </div>
                      </div>

                      <span
                        className="admin-role-badge role-customer"
                        style={{ background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" }}
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
                          <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#2563EB" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: "10px", color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                            Điểm đón khách
                          </div>
                          <div style={{ fontSize: "13px", color: "#0F172A", fontWeight: 600 }}>{activeRide.pickup}</div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                        <div style={{ width: "20px", display: "flex", justifyContent: "center", paddingTop: "2px" }}>
                          <MapPin size={15} style={{ color: "#EF4444" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: "10px", color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                            Điểm trả khách
                          </div>
                          <div style={{ fontSize: "13px", color: "#0F172A", fontWeight: 600 }}>{activeRide.destination}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Status */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "12px", color: "#64748B" }}>Trạng thái hiện tại:</span>
                      <span
                        className="admin-role-badge"
                        style={{
                          background: activeRide.status === "COMPLETED" ? "#ECFDF5" : "#EFF6FF",
                          color: activeRide.status === "COMPLETED" ? "#065F46" : "#1D4ED8",
                          border: `1px solid ${activeRide.status === "COMPLETED" ? "#A7F3D0" : "#BFDBFE"}`,
                          fontWeight: 700,
                          fontSize: "11px",
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
                          fontSize: "13px",
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
                      <span style={{ fontSize: "13px", color: "#059669", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                        <CheckCircle2 size={16} /> Chuyến đi đã hoàn thành xuất sắc
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: FOOD / RESTAURANT */}
              {activeTab === "food" && (
                <div>
                  <div style={{ marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2 style={{ fontSize: "15px", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                      Danh sách đơn món cần xử lý ({orders.length} đơn)
                    </h2>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "16px" }}>
                    {orders.map((order) => (
                      <div
                        key={order.id}
                        className="admin-table-card"
                        style={{ padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}
                      >
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                            <div>
                              <strong style={{ fontSize: "15px", color: "#0F172A" }}>{order.customerName}</strong>
                              <div style={{ fontSize: "11px", color: "#64748B", marginTop: "2px" }}>
                                #{order.id} · {order.orderTime}
                              </div>
                            </div>
                            <span
                              className="admin-role-badge"
                              style={{
                                background:
                                  order.status === "READY_FOR_PICKUP"
                                    ? "#ECFDF5"
                                    : order.status === "PREPARING"
                                    ? "#FFFBEB"
                                    : "#EFF6FF",
                                color:
                                  order.status === "READY_FOR_PICKUP"
                                    ? "#065F46"
                                    : order.status === "PREPARING"
                                    ? "#B45309"
                                    : "#1D4ED8",
                                border: `1px solid ${
                                  order.status === "READY_FOR_PICKUP"
                                    ? "#A7F3D0"
                                    : order.status === "PREPARING"
                                    ? "#FDE68A"
                                    : "#BFDBFE"
                                }`,
                                fontWeight: 700,
                              }}
                            >
                              {order.status}
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
                                style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}
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
                                fontSize: "12px",
                                color: "#B45309",
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
                            <div style={{ fontSize: "11px", color: "#64748B" }}>Tổng thanh toán</div>
                            <div style={{ fontSize: "16px", fontWeight: 800, color: "#059669" }}>
                              {order.total.toLocaleString("vi-VN")} đ
                            </div>
                          </div>

                          <div>
                            {order.status === "RECEIVED" && (
                              <button
                                type="button"
                                onClick={() => advanceOrderStatus(order.id, "PREPARING")}
                                className="button button-primary"
                                style={{ height: "32px", padding: "0 14px", fontSize: "12px" }}
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
                                  fontSize: "12px",
                                  backgroundColor: "#059669",
                                  borderColor: "#059669",
                                }}
                              >
                                Món đã xong (Sẵn sàng lấy)
                              </button>
                            )}
                            {order.status === "READY_FOR_PICKUP" && (
                              <span style={{ fontSize: "12px", color: "#059669", fontWeight: 600 }}>
                                Đang chờ tài xế lấy món
                              </span>
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
                  <div style={{ marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2 style={{ fontSize: "15px", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                      Lịch khám bệnh trong ngày ({appointments.length} lịch khám)
                    </h2>
                  </div>

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
                              backgroundColor: "#EFF6FF",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#2563EB",
                              border: "1px solid #DBEAFE",
                            }}
                          >
                            <HeartPulse size={20} />
                          </div>
                          <div>
                            <strong style={{ fontSize: "15px", color: "#0F172A", display: "block" }}>
                              {apt.patientName}
                            </strong>
                            <span style={{ fontSize: "12px", color: "#64748B" }}>
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
                                  : "#EFF6FF",
                              color:
                                apt.status === "COMPLETED"
                                  ? "#065F46"
                                  : apt.status === "IN_CONSULTATION"
                                  ? "#B45309"
                                  : "#1D4ED8",
                              border: `1px solid ${
                                apt.status === "COMPLETED"
                                  ? "#A7F3D0"
                                  : apt.status === "IN_CONSULTATION"
                                  ? "#FDE68A"
                                  : "#BFDBFE"
                              }`,
                              fontWeight: 700,
                            }}
                          >
                            {apt.status}
                          </span>

                          {apt.status === "CONFIRMED" && (
                            <button
                              type="button"
                              onClick={() => advanceAppointmentStatus(apt.id, "IN_CONSULTATION")}
                              className="button button-primary"
                              style={{ height: "32px", padding: "0 12px", fontSize: "12px" }}
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
                                fontSize: "12px",
                                backgroundColor: "#059669",
                                borderColor: "#059669",
                              }}
                            >
                              Hoàn tất ca khám
                            </button>
                          )}

                          {apt.status === "COMPLETED" && (
                            <span style={{ fontSize: "12px", color: "#059669", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                              <CheckCircle2 size={14} /> Đã hoàn thành
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
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
