"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  Calendar,
  Car,
  CheckCircle2,
  Code,
  HeartPulse,
  Layers,
  Package,
  Plug2,
  Radio,
  UserRound,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";

import { useAuth } from "@/providers/auth-provider";
import { audioChime } from "@/lib/audio-chime";
import {
  createProviderItem,
  createProviderMcpKey,
  deleteProviderChannel,
  deleteProviderItem,
  getProviderAssignments,
  getProviderAvailability,
  getProviderDocuments,
  getProviderEarningsSummary,
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
  updateProviderAssignmentStatus,
  updateProviderAvailability,
  updateProviderOperationAppointmentStatus,
  updateProviderOperationDeliveryStatus,
  updateProviderOperationOrderStatus,
  updateProviderOperationReservationStatus,
  updateProviderOperationRideStatus,
  updateProviderProfile,
} from "@/lib/api-client";

import type {
  ActiveRide,
  DeliveryOrder,
  FoodOrder,
  HealthcareBooking,
  McpApiKey,
  PharmacyOrder,
  ProviderAssignment,
  ProviderAvailability,
  ProviderDocument,
  ProviderEarningsSummary,
  ProviderProfile,
  ProviderServiceItem,
  ProviderTab,
  ProviderWorkspace,
  RestaurantReservation,
  ServiceChannelDef,
  WebhookTestResult,
} from "./provider.types";
import {
  DEFAULT_CHANNELS,
  DEFAULT_OFFERINGS,
  mapRawAppointment,
  mapRawDelivery,
  mapRawOrder,
  mapRawReservation,
  mapRawRide,
  sanitizeDisplayText,
} from "./provider.types";

import { ProviderHeader } from "./components/provider-header";
import { WorkspaceSwitcher } from "./components/workspace-switcher";
import { KpiRibbon } from "./components/kpi-ribbon";
import { MicroservicesStatusBar } from "./components/microservices-status-bar";
import { AddServiceModal } from "./components/modals/add-service-modal";
import { AddChannelModal } from "./components/modals/add-channel-modal";
import { OperationsSection } from "./sections/operations-section";
import { BusinessSection } from "./sections/business-section";
import { TechSection } from "./sections/tech-section";

export function ProviderPortal() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<ProviderProfile | null>(null);

  const isDisconnected =
    user?.email === "provider@xone.local" ||
    profile?.status === "suspended" ||
    profile?.tenantId === "partner-disconnected";

  const isMaster =
    (user?.email === "provider1@xone.local" ||
      profile?.tenantId === "partner-xone-01" ||
      user?.tenant_id === "partner-xone-01") &&
    !isDisconnected;

  const rawProviderType = isDisconnected
    ? "disconnected"
    : profile?.providerType || user?.provider_type || (isMaster ? "all" : "unknown");

  const isAllowedTab = (tab: ProviderTab): boolean => {
    if (isDisconnected) {
      return tab === "profile" || tab === "services";
    }
    if (
      tab === "services" ||
      tab === "profile" ||
      tab === "earnings" ||
      tab === "webhooks" ||
      tab === "staff" ||
      tab === "channels" ||
      tab === "mcp"
    ) {
      return true;
    }
    if (tab === "ride" && connectedServices.ride === false) return false;
    if (tab === "delivery" && connectedServices.delivery === false) return false;
    if (tab === "food" && connectedServices.food === false) return false;
    if (tab === "restaurant" && connectedServices.restaurant === false) return false;
    if (tab === "health" && connectedServices.healthcare === false) return false;
    if (isMaster) return true;
    if (rawProviderType === "restaurant_merchant" || rawProviderType === "food") {
      return tab === "food" || tab === "restaurant";
    }
    if (rawProviderType === "ride_driver" || rawProviderType === "ride") {
      return tab === "ride" || tab === "delivery";
    }
    if (rawProviderType === "delivery_courier" || rawProviderType === "delivery") {
      return tab === "delivery";
    }
    if (rawProviderType === "healthcare_doctor" || rawProviderType === "healthcare") {
      return tab === "health";
    }
    return false;
  };

  const getPartnerTypeLabel = (): string => {
    if (isDisconnected) return "X-One Partner Portal — Tài Khoản Đã Ngắt Kết Nối";
    if (isMaster) return "X-One Partner Portal — Master 4 Dịch Vụ";
    if (rawProviderType === "restaurant_merchant" || rawProviderType === "food")
      return "X-One Partner Portal — Nhà hàng & Ẩm thực";
    if (rawProviderType === "ride_driver" || rawProviderType === "ride")
      return "X-One Partner Portal — Vận chuyển & Tài xế";
    if (rawProviderType === "delivery_courier" || rawProviderType === "delivery")
      return "X-One Partner Portal — Giao hàng & Chuyển phát";
    if (rawProviderType === "healthcare_doctor" || rawProviderType === "healthcare")
      return "X-One Partner Portal — Y tế & Khám bệnh";
    return "X-One Partner Portal — Cổng Đối Tác Dịch Vụ";
  };

  const getDefaultTab = (pType?: string, master?: boolean): ProviderTab => {
    if (isDisconnected) return "profile";
    if (master) return "ride";
    if (pType === "restaurant_merchant" || pType === "food") return "food";
    if (pType === "ride_driver" || pType === "ride") return "ride";
    if (pType === "delivery_courier" || pType === "delivery") return "delivery";
    if (pType === "healthcare_doctor" || pType === "healthcare") return "health";
    return "services";
  };

  // State: Tab & Workspace Selection
  const [activeTab, setActiveTab] = useState<ProviderTab>(() =>
    getDefaultTab(rawProviderType, isMaster)
  );

  const getWorkspaceForTab = (tab: ProviderTab): ProviderWorkspace => {
    if (["ride", "delivery", "food", "restaurant", "health", "pharmacy"].includes(tab)) {
      return "operations";
    }
    if (["services", "profile", "earnings", "staff"].includes(tab)) {
      return "business";
    }
    return "tech";
  };

  const [currentWorkspace, setCurrentWorkspace] = useState<ProviderWorkspace>(() =>
    getWorkspaceForTab(activeTab)
  );

  const handleSelectTab = (tab: ProviderTab) => {
    setActiveTab(tab);
    setCurrentWorkspace(getWorkspaceForTab(tab));
  };

  const handleSelectWorkspace = (ws: ProviderWorkspace) => {
    setCurrentWorkspace(ws);
    if (ws === "operations") {
      setActiveTab(getDefaultTab(rawProviderType, isMaster));
    } else if (ws === "business") {
      setActiveTab("services");
    } else {
      setActiveTab("mcp");
    }
  };

  const initializedTabRef = useRef(false);

  // Operational State
  const [activeRide, setActiveRide] = useState<ActiveRide | null>(null);
  const [allRides, setAllRides] = useState<ActiveRide[]>([]);
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [appointments, setAppointments] = useState<HealthcareBooking[]>([]);
  const [reservations, setReservations] = useState<RestaurantReservation[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [pharmacyOrders, setPharmacyOrders] = useState<PharmacyOrder[]>([
    {
      id: "pharm_ord_01",
      customerName: "Nguyễn Văn An",
      customerPhone: "0912345678",
      deliveryAddress: "Landmark 81, P. 22, Bình Thạnh, TP.HCM",
      items: [
        { name: "Panadol Extra Đỏ (Hộp 15 vỉ x 12 viên)", quantity: 2, price: 145000, unit: "Hộp" },
        { name: "Vitamin C 1000mg Blackmores (Hũ 150 viên)", quantity: 1, price: 395000, unit: "Hũ" },
      ],
      total: 685000,
      status: "PRESCRIPTION_PENDING",
      prescriptionRequired: true,
      orderTime: "10:15",
      providerChain: "longchau",
      note: "Giao trước 12h trưa kèm hóa đơn đỏ",
    },
    {
      id: "pharm_ord_02",
      customerName: "Trần Thị Mai",
      customerPhone: "0987654321",
      deliveryAddress: "45 Lê Duẩn, P. Bến Nghé, Quận 1, TP.HCM",
      items: [
        { name: "Nước muối sinh lý Natri Clorid 0.9% (500ml)", quantity: 5, price: 8000, unit: "Chai" },
        { name: "Khẩu trang y tế 4 lớp kháng khuẩn KF94", quantity: 3, price: 35000, unit: "Hộp" },
      ],
      total: 145000,
      status: "CONFIRMED",
      prescriptionRequired: false,
      orderTime: "10:42",
      providerChain: "pharmacity",
    },
  ]);

  // Settings & Status
  const [soundEnabled, setSoundEnabled] = useState(() =>
    typeof window !== "undefined" ? audioChime.isEnabled() : true
  );
  const prevCountsRef = useRef<{
    rides: number;
    orders: number;
    reservations: number;
    appts: number;
    deliveries: number;
  } | null>(null);

  const [loadingAction, setLoadingAction] = useState(false);
  const [loadingOperations, setLoadingOperations] = useState(false);
  const [seedingDomain, setSeedingDomain] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ text: string; type: "success" | "error" } | null>(
    null
  );

  // MCP Keys State
  const [mcpKeys, setMcpKeys] = useState<McpApiKey[]>([]);
  const [mcpKeyName, setMcpKeyName] = useState("");
  const [creatingMcpKey, setCreatingMcpKey] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  // Business & Profile State
  const [profileForm, setProfileForm] = useState({
    businessName: "",
    phone: "",
    address: "",
    webhookUrl: "",
    isOpen: true,
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [availability, setAvailability] = useState<ProviderAvailability>({
    providerId: "",
    isOnline: true,
    serviceAreas: ["Toàn khu vực nội thành TP.HCM"],
    schedule: {},
    updatedAt: new Date().toISOString(),
  });
  const [providerDocuments, setProviderDocuments] = useState<ProviderDocument[]>([]);
  const [providerAssignments, setProviderAssignments] = useState<ProviderAssignment[]>([]);
  const [serviceItems, setServiceItems] = useState<ProviderServiceItem[]>(() =>
    user?.email === "provider1@xone.local" ? DEFAULT_OFFERINGS : []
  );
  const [earnings, setEarnings] = useState<ProviderEarningsSummary | null>(null);

  // Modals State
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [submittingService, setSubmittingService] = useState(false);
  const [showAddChannelModal, setShowAddChannelModal] = useState(false);
  const [submittingChannel, setSubmittingChannel] = useState(false);

  // Channels Registry
  const [connectedServices, setConnectedServices] = useState<Record<string, boolean>>(() =>
    isDisconnected
      ? { ride: false, food: false, restaurant: false, healthcare: false, delivery: false }
      : { ride: true, food: true, restaurant: true, healthcare: true, delivery: true }
  );

  const [customChannels, setCustomChannels] = useState<ServiceChannelDef[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("xone_provider_custom_channels");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

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

  // Webhooks State
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookEvent, setWebhookEvent] = useState("order.created");
  const [webhookSecret, setWebhookSecret] = useState("whsec_xone_live_9f83a8b27c6d1e4a");
  const [webhookTestResult, setWebhookTestResult] = useState<WebhookTestResult | null>(null);

  const notify = (text: string, type: "success" | "error" = "success") => {
    setActionNotice({ text, type });
    setTimeout(() => setActionNotice(null), 4000);
  };

  // ---------------- OPERATIONS DATA FETCHING ----------------
  const reloadOperations = async (silent: boolean = false) => {
    if (isDisconnected) {
      setAllRides([]);
      setActiveRide(null);
      setOrders([]);
      setAppointments([]);
      setReservations([]);
      setDeliveries([]);
      return;
    }
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
        setActiveRide((prev) =>
          prev ? mapped.find((r) => r.id === prev.id) || mapped[0] || null : mapped[0] || null
        );
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

      // Play audio chime on incoming new orders/trips
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

  // 3-Second Auto-Polling Loop with visibility optimization
  useEffect(() => {
    if (user?.role !== "provider") return;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      void reloadOperations(true);
    }, 3000);

    return () => clearInterval(interval);
  }, [user]);

  // Load initial data
  useEffect(() => {
    async function loadProviderData() {
      try {
        const [profData, itemsData, availabilityData, documentsData, assignmentsData, earningsData, mcpData] =
          await Promise.allSettled([
            getProviderProfile(),
            getProviderItems(),
            getProviderAvailability(),
            getProviderDocuments(),
            getProviderAssignments(),
            getProviderEarningsSummary(),
            getProviderMcpKeys(),
          ]);

        if (profData.status === "fulfilled" && profData.value) {
          const rawBiz = profData.value.businessName;
          const cleanBiz = sanitizeDisplayText(rawBiz, "");
          setProfile(profData.value);
          setProfileForm({
            businessName:
              cleanBiz ||
              user?.full_name ||
              (isDisconnected
                ? "Tài Khoản Đã Ngắt Kết Nối"
                : isMaster
                ? "Đối Tác Dịch Vụ X-One (Chính)"
                : ""),
            phone: sanitizeDisplayText(profData.value.phone, user?.phone || ""),
            address: sanitizeDisplayText(profData.value.address, ""),
            webhookUrl: profData.value.webhookUrl || "",
            isOpen: profData.value.isOpen !== false && !isDisconnected,
          });
          if (profData.value.connectedServices) {
            setConnectedServices(profData.value.connectedServices);
          }
        }

        if (itemsData.status === "fulfilled") {
          if (itemsData.value.length > 0) {
            setServiceItems(itemsData.value);
          } else if (user?.email === "provider1@xone.local") {
            setServiceItems(DEFAULT_OFFERINGS);
          } else {
            setServiceItems([]);
          }
        }

        if (availabilityData.status === "fulfilled" && availabilityData.value) {
          setAvailability(availabilityData.value);
        }
        if (documentsData.status === "fulfilled") setProviderDocuments(documentsData.value);
        if (assignmentsData.status === "fulfilled") setProviderAssignments(assignmentsData.value);
        if (earningsData.status === "fulfilled") setEarnings(earningsData.value);
        if (mcpData.status === "fulfilled") {
          setMcpKeys(
            mcpData.value.map((k: any) => ({
              id: k.id || `mcp_${Date.now()}`,
              name: k.name || "Claude Desktop",
              prefix: k.prefix || "xone_mcp_",
              createdAt: k.created_at || k.createdAt || new Date().toISOString(),
              lastUsedAt: k.last_used_at || k.lastUsedAt,
            }))
          );
        }

        await reloadOperations();
      } catch {
        // fallback
      }
    }

    if (user?.role === "provider") {
      void loadProviderData();
    }
  }, [user]);

  // Synchronize Tab & Workspace when rawProviderType changes
  useEffect(() => {
    if (!initializedTabRef.current && (rawProviderType || isMaster)) {
      initializedTabRef.current = true;
      const def = getDefaultTab(rawProviderType, isMaster);
      setActiveTab(def);
      setCurrentWorkspace(getWorkspaceForTab(def));
    } else if (!isAllowedTab(activeTab)) {
      const def = getDefaultTab(rawProviderType, isMaster);
      setActiveTab(def);
      setCurrentWorkspace(getWorkspaceForTab(def));
    }
  }, [rawProviderType, isMaster, activeTab]);

  // ---------------- EVENT HANDLERS ----------------
  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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

  const handleSetStoreStatus = async (status: "online" | "busy" | "offline") => {
    const isOpen = status === "online";
    setProfileForm((prev) => ({ ...prev, isOpen }));
    try {
      const updated = await updateProviderProfile({ is_open: isOpen });
      setProfile(updated);
      if (status === "online") {
        notify("🟢 Cửa hàng đang MỞ CỬA! Toàn bộ dịch vụ sẵn sàng tiếp nhận khách hàng.", "success");
      } else if (status === "busy") {
        notify("🟡 Cửa hàng chuyển sang chế độ TẠM NGHỈ. Tạm dừng tiếp nhận đơn mới.", "success");
      } else {
        notify("🔴 Cửa hàng đã ĐÓNG CỬA. Tạm ngắt nhận khách trên toàn bộ hệ thống.", "success");
      }
    } catch (err: any) {
      setProfileForm((prev) => ({ ...prev, isOpen: !isOpen }));
      notify(`Không thể đổi trạng thái: ${err?.message || "Lỗi kết nối backend."}`, "error");
    }
  };

  const handleToggleOpenStatus = async () => {
    const nextOpen = !profileForm.isOpen;
    await handleSetStoreStatus(nextOpen ? "online" : "busy");
  };

  const handleToggleSound = () => {
    const nextState = audioChime.toggle();
    setSoundEnabled(nextState);
    notify(nextState ? "Đã bật chuông báo đơn hàng mới" : "Đã tắt chuông báo", "success");
  };

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

  // Operations Status Progression
  const handleAdvanceRideStatus = async () => {
    if (!activeRide) return;
    setLoadingAction(true);
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
      notify(`Đã cập nhật chuyến xe sang: ${nextStatus}`);
    } catch (err: any) {
      notify(`Không thể cập nhật chuyến xe: ${err?.message || "Lỗi backend."}`, "error");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleAdvanceOrderStatus = async (orderId: string, nextStatus: FoodOrder["status"]) => {
    try {
      await updateProviderOperationOrderStatus(orderId, nextStatus);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)));
      notify(`Đơn hàng #${orderId} đã chuyển trạng thái thành công!`);
    } catch (err: any) {
      notify(`Không thể chuyển đơn #${orderId}: ${err?.message || "Lỗi backend."}`, "error");
    }
  };

  const handleAdvanceDeliveryStatus = async (deliveryId: string, nextStatus: DeliveryOrder["status"]) => {
    try {
      await updateProviderOperationDeliveryStatus(deliveryId, nextStatus);
      setDeliveries((prev) => prev.map((d) => (d.id === deliveryId ? { ...d, status: nextStatus } : d)));
      notify(`Đơn giao hàng #${deliveryId} đã chuyển trạng thái thành công!`);
    } catch (err: any) {
      notify(`Không thể chuyển đơn giao #${deliveryId}: ${err?.message || "Lỗi backend."}`, "error");
    }
  };

  const handleAdvanceReservationStatus = async (
    reservationId: string,
    nextStatus: RestaurantReservation["status"]
  ) => {
    try {
      await updateProviderOperationReservationStatus(reservationId, nextStatus);
      setReservations((prev) => prev.map((r) => (r.id === reservationId ? { ...r, status: nextStatus } : r)));
      notify(`Bàn #${reservationId} đã cập nhật trạng thái thành công!`);
    } catch (err: any) {
      notify(`Không thể cập nhật bàn #${reservationId}: ${err?.message || "Lỗi backend."}`, "error");
    }
  };

  const handleAdvanceAppointmentStatus = async (
    aptId: string,
    nextStatus: HealthcareBooking["status"]
  ) => {
    try {
      await updateProviderOperationAppointmentStatus(aptId, nextStatus);
      setAppointments((prev) => prev.map((a) => (a.id === aptId ? { ...a, status: nextStatus } : a)));
      notify(`Lịch khám #${aptId} đã cập nhật trạng thái thành công!`);
    } catch (err: any) {
      notify(`Không thể cập nhật lịch #${aptId}: ${err?.message || "Lỗi backend."}`, "error");
    }
  };

  const handleAdvancePharmacyStatus = async (
    orderId: string,
    nextStatus: PharmacyOrder["status"]
  ) => {
    setPharmacyOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
    );
    notify(`Đơn thuốc #${orderId} đã chuyển trạng thái thành công!`);
  };

  // Service Items & Offerings
  const handleToggleItem = async (itemId: string) => {
    const item = serviceItems.find((i) => i.id === itemId);
    if (!item) return;
    const nextStatus = !item.isAvailable;
    try {
      await toggleProviderItemStatus(itemId, nextStatus);
      setServiceItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, isAvailable: nextStatus } : it))
      );
      notify("Đã cập nhật trạng thái mở bán dịch vụ.");
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

  const handleCreateServiceItem = async (itemData: {
    domain: ProviderServiceItem["domain"];
    name: string;
    price: number;
    category: string;
    description: string;
  }) => {
    setSubmittingService(true);
    try {
      const created = await createProviderItem({
        domain: itemData.domain,
        name: itemData.name.trim(),
        price: Number(itemData.price),
        category: itemData.category.trim(),
        description: itemData.description.trim(),
      });
      setServiceItems((prev) => [created, ...prev]);
      setShowAddServiceModal(false);
      notify(`Đã gắn dịch vụ "${created.name}" vào hệ thống X-One thành công!`);
    } catch (err: any) {
      notify(`Không thể tạo dịch vụ: ${err?.message || "Lỗi kết nối backend."}`, "error");
    } finally {
      setSubmittingService(false);
    }
  };

  // Channels
  const handleToggleChannel = async (channelId: string) => {
    const targetChannelDef = allChannels.find((c) => c.id === channelId);
    const channelDisplayName = targetChannelDef ? targetChannelDef.name : `Kênh ${channelId}`;
    const nextEnabled = connectedServices[channelId] === false;
    setConnectedServices((curr) => ({ ...curr, [channelId]: nextEnabled }));
    try {
      await toggleProviderChannel(channelId, nextEnabled);
      notify(
        nextEnabled
          ? `🟢 Đã kích hoạt kênh ${channelDisplayName}!`
          : `🔴 Đã ngắt kết nối kênh ${channelDisplayName}.`,
        "success"
      );
    } catch (err: any) {
      setConnectedServices((curr) => ({ ...curr, [channelId]: !nextEnabled }));
      notify(`Không thể đổi trạng thái kênh: ${err?.message || "Lỗi giao tiếp backend."}`, "error");
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
          ? `🟢 Đã kích hoạt toàn bộ ${channelIds.length} kênh microservices!`
          : `🔴 Đã ngắt kết nối toàn bộ ${channelIds.length} kênh dịch vụ.`,
        "success"
      );
    } catch (err: any) {
      setConnectedServices(prev);
      notify(`Lỗi khi đổi trạng thái hàng loạt: ${err?.message || "Lỗi backend."}`, "error");
    }
  };

  const handleCreateNewChannel = async (channelData: any) => {
    setSubmittingChannel(true);
    try {
      const updated = [...customChannels.filter((c) => c.id !== channelData.id), channelData];
      setCustomChannels(updated);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("xone_provider_custom_channels", JSON.stringify(updated));
        } catch {
          // ignore
        }
      }
      setConnectedServices((curr) => ({ ...curr, [channelData.id]: true }));
      await toggleProviderChannel(channelData.id, true);
      notify(`🟢 Đã thêm và kích hoạt thành công kênh mới: "${channelData.name}"!`, "success");
      setShowAddChannelModal(false);
    } catch (err: any) {
      notify(`Lỗi khi kích hoạt kênh mới: ${err?.message || "Lỗi backend."}`, "error");
    } finally {
      setSubmittingChannel(false);
    }
  };

  // Staff & KYC
  const handleToggleAvailability = async () => {
    const nextOnline = !availability.isOnline;
    setAvailability((prev) => ({ ...prev, isOnline: nextOnline }));
    try {
      await updateProviderAvailability({ is_online: nextOnline });
      notify(nextOnline ? "Đã bật trạng thái nhận phân công." : "Đã tạm dừng nhận phân công.");
    } catch (err: any) {
      setAvailability((prev) => ({ ...prev, isOnline: !nextOnline }));
      notify(`Không thể cập nhật khả dụng: ${err?.message || "Lỗi backend."}`, "error");
    }
  };

  const handleAcceptAssignment = async (id: string) => {
    try {
      await updateProviderAssignmentStatus(id, "ACCEPTED");
      setProviderAssignments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: "ACCEPTED" } : a))
      );
      notify("Đã nhận phân công thành công.");
    } catch (err: any) {
      notify(`Không thể nhận phân công: ${err?.message || "Lỗi backend."}`, "error");
    }
  };

  const handleUploadDocument = async (type: string, file: File) => {
    try {
      const created = await submitProviderDocument({
        document_type: type,
        document_url: URL.createObjectURL(file),
      });
      setProviderDocuments((prev) => [created, ...prev]);
      notify("Đã tải tài liệu lên để xét duyệt.");
    } catch (err: any) {
      notify(`Không thể nộp hồ sơ: ${err?.message || "Lỗi backend."}`, "error");
    }
  };

  // MCP Keys
  const handleCreateMcpKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!mcpKeyName.trim()) {
      notify("Vui lòng nhập tên cho API Key.", "error");
      return;
    }
    setCreatingMcpKey(true);
    try {
      const res = await createProviderMcpKey(mcpKeyName.trim());
      setNewlyCreatedKey(res.key);
      setMcpKeys((prev) => [
        {
          id: res.id,
          name: res.label || mcpKeyName.trim(),
          prefix: res.key_prefix || "xone_mcp_",
          createdAt: res.created_at || new Date().toISOString(),
        },
        ...prev,
      ]);
      setMcpKeyName("");
      notify("Đã tạo API Key mới. Hãy sao chép ngay!");
    } catch (err: any) {
      notify(`Không thể tạo API Key: ${err?.message || "Lỗi mạng"}`, "error");
    } finally {
      setCreatingMcpKey(false);
    }
  };

  const handleRevokeMcpKey = async (id: string) => {
    try {
      await revokeProviderMcpKey(id);
      setMcpKeys((prev) => prev.filter((k) => k.id !== id));
      notify("Đã thu hồi API Key.");
    } catch (err: any) {
      notify(`Không thể thu hồi key: ${err?.message || "Lỗi mạng"}`, "error");
    }
  };

  // Webhooks
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
        notify(
          `Webhook thất bại (${res.status_code || "Error"}): ${res.error_message || "Lỗi giao tiếp"}`,
          "error"
        );
      }
    } catch (err: any) {
      notify(`Lỗi gửi webhook: ${err.message || "Lỗi mạng"}`, "error");
    } finally {
      setTestingWebhook(false);
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

  // Derived Summary Figures
  const todayRevenue = isDisconnected ? 0 : (earnings?.net_payout ?? (earnings as any)?.netPayout ?? 12500000);
  const todayNewOrders = isDisconnected
    ? 0
    : orders.filter((o) => o.status === "RESTAURANT_CONFIRMING" || o.status === "RECEIVED").length +
      allRides.filter((r) => r.status === "DRIVER_TO_PICKUP" || r.status === "DRIVER_ASSIGNED").length +
      deliveries.filter((d) => d.status === "CREATED" || d.status === "COURIER_ASSIGNED").length +
      pharmacyOrders.filter((p) => p.status === "PRESCRIPTION_PENDING").length;

  const todayNeedsAction = isDisconnected
    ? 0
    : orders.filter((o) => o.status !== "COMPLETED" && o.status !== "CANCELLED").length +
      allRides.filter((r) => r.status !== "COMPLETED" && r.status !== "CANCELLED").length +
      appointments.filter((a) => a.status !== "COMPLETED" && a.status !== "CANCELLED").length +
      reservations.filter((res) => res.status !== "COMPLETED" && res.status !== "CANCELLED").length +
      deliveries.filter((d) => d.status !== "DELIVERED" && d.status !== "CANCELLED").length +
      pharmacyOrders.filter((p) => p.status !== "COMPLETED" && p.status !== "CANCELLED").length;

  const todayCompletedCount =
    orders.filter((o) => o.status === "COMPLETED" || o.status === "DELIVERED").length +
    allRides.filter((r) => r.status === "COMPLETED").length;

  const domainCta = (): { label: string; tab: ProviderTab } => {
    if (isDisconnected) return { label: "Tài khoản đã ngắt kết nối", tab: "profile" };
    if (rawProviderType === "ride_driver" || rawProviderType === "ride") return { label: "Nhận cuốc", tab: "ride" };
    if (rawProviderType === "delivery_courier" || rawProviderType === "delivery")
      return { label: "Nhận đơn giao", tab: "delivery" };
    if (rawProviderType === "healthcare_doctor" || rawProviderType === "healthcare")
      return { label: "Mở lịch khám", tab: "health" };
    return { label: profileForm.isOpen ? "Bếp bận — tạm dừng" : "Mở nhận đơn", tab: "food" };
  };
  const cta = domainCta();

  const tabLabel = (tab: "ride" | "food" | "restaurant" | "health" | "delivery"): string => {
    if (tab === "ride") return "Chuyến xe · Cuốc xe Ride Partner";
    if (tab === "food") return "Đơn món · Món ăn Food Merchant";
    if (tab === "restaurant") return "Đặt bàn · Nhà hàng Reservation";
    if (tab === "health") return "Lịch khám · Y tế Healthcare Doctor";
    return "Giao hàng · Chuyển phát Delivery Courier";
  };

  return (
    <div
      className="app-shell provider-shell"
      style={{ minHeight: "100vh", background: "var(--color-bg, #F6F7F9)" }}
    >
      <a className="skip-link" href="#provider-content">
        Bỏ qua điều hướng
      </a>

      {/* Accessible Title for E2E */}
      <h1
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: 0,
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        Chào mừng đến Cổng Đối tác X-One
      </h1>

      {/* Global Header */}
      <ProviderHeader
        partnerTypeLabel={getPartnerTypeLabel()}
        businessName={
          sanitizeDisplayText(
            profileForm.businessName || user?.full_name || user?.email?.split("@")[0],
            isDisconnected
              ? "Tài Khoản Đã Ngắt Kết Nối"
              : isMaster
              ? "Đối Tác Dịch Vụ X-One (Chính)"
              : "Đối tác"
          )
        }
        partnerStatus={
          isDisconnected ? "Đã ngắt kết nối" : isMaster ? "Đối tác Master Hệ thống" : "Đối tác dịch vụ xác thực"
        }
        isOpen={profileForm.isOpen}
        isDisconnected={isDisconnected}
        isMaster={isMaster}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onSetStoreStatus={handleSetStoreStatus}
        onLogout={handleLogout}
      />

      {/* Main Body */}
      <div className="app-body provider-body">
        {/* Left Sidebar Navigation */}
        <aside className="app-sidebar provider-sidebar">
          <div className="provider-sidebar-inner" style={{ padding: "16px 12px" }}>
            <div className="provider-nav-group">
              <span className="provider-nav-group-title">
                {isDisconnected
                  ? "Trạng thái tài khoản"
                  : isMaster
                  ? "Quản lý 5 phân hệ dịch vụ"
                  : "Phân hệ nghiệp vụ đối tác"}
              </span>

              <div className="provider-nav-group-items" role="tablist" aria-label="Phân hệ đối tác">
                {isAllowedTab("ride") && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "ride"}
                    className={`provider-nav-btn${activeTab === "ride" ? " is-active" : ""}`}
                    onClick={() => handleSelectTab("ride")}
                  >
                    <span className="provider-nav-btn-icon">
                      <Car size={16} />
                    </span>
                    <span className="provider-nav-btn-label">{tabLabel("ride")}</span>
                    {allRides.filter((r) => r.status !== "COMPLETED").length > 0 && (
                      <span className="provider-nav-count">
                        {allRides.filter((r) => r.status !== "COMPLETED").length}
                      </span>
                    )}
                  </button>
                )}

                {isAllowedTab("delivery") && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "delivery"}
                    className={`provider-nav-btn${activeTab === "delivery" ? " is-active" : ""}`}
                    onClick={() => handleSelectTab("delivery")}
                  >
                    <span className="provider-nav-btn-icon">
                      <Package size={16} />
                    </span>
                    <span className="provider-nav-btn-label">{tabLabel("delivery")}</span>
                    {deliveries.filter((d) => d.status !== "DELIVERED" && d.status !== "CANCELLED").length > 0 && (
                      <span className="provider-nav-count">
                        {deliveries.filter((d) => d.status !== "DELIVERED" && d.status !== "CANCELLED").length}
                      </span>
                    )}
                  </button>
                )}

                {isAllowedTab("food") && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "food"}
                    className={`provider-nav-btn${activeTab === "food" ? " is-active" : ""}`}
                    onClick={() => handleSelectTab("food")}
                  >
                    <span className="provider-nav-btn-icon">
                      <UtensilsCrossed size={16} />
                    </span>
                    <span className="provider-nav-btn-label">{tabLabel("food")}</span>
                    {orders.filter((o) => o.status !== "COMPLETED" && o.status !== "CANCELLED").length > 0 && (
                      <span className="provider-nav-count">
                        {orders.filter((o) => o.status !== "COMPLETED" && o.status !== "CANCELLED").length}
                      </span>
                    )}
                  </button>
                )}

                {isAllowedTab("restaurant") && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "restaurant"}
                    className={`provider-nav-btn${activeTab === "restaurant" ? " is-active" : ""}`}
                    onClick={() => handleSelectTab("restaurant")}
                  >
                    <span className="provider-nav-btn-icon">
                      <Calendar size={16} />
                    </span>
                    <span className="provider-nav-btn-label">{tabLabel("restaurant")}</span>
                    {reservations.filter((r) => r.status !== "COMPLETED" && r.status !== "CANCELLED").length > 0 && (
                      <span className="provider-nav-count">
                        {reservations.filter((r) => r.status !== "COMPLETED" && r.status !== "CANCELLED").length}
                      </span>
                    )}
                  </button>
                )}

                {isAllowedTab("health") && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "health"}
                    className={`provider-nav-btn${activeTab === "health" ? " is-active" : ""}`}
                    onClick={() => handleSelectTab("health")}
                  >
                    <span className="provider-nav-btn-icon">
                      <HeartPulse size={16} />
                    </span>
                    <span className="provider-nav-btn-label">{tabLabel("health")}</span>
                    {appointments.filter((a) => a.status !== "COMPLETED" && a.status !== "CANCELLED").length > 0 && (
                      <span className="provider-nav-count">
                        {appointments.filter((a) => a.status !== "COMPLETED" && a.status !== "CANCELLED").length}
                      </span>
                    )}
                  </button>
                )}

                <div className="provider-nav-divider" />
                <span className="provider-nav-group-title provider-nav-group-title-sub">
                  Quản lý kinh doanh
                </span>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "services"}
                  className={`provider-nav-btn${activeTab === "services" ? " is-active" : ""}`}
                  onClick={() => handleSelectTab("services")}
                >
                  <span className="provider-nav-btn-icon">
                    <Layers size={16} />
                  </span>
                  <span className="provider-nav-btn-label">Gắn & Quản lý Dịch vụ</span>
                  <span className="provider-nav-count">{serviceItems.length}</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "profile"}
                  className={`provider-nav-btn${activeTab === "profile" ? " is-active" : ""}`}
                  onClick={() => handleSelectTab("profile")}
                >
                  <span className="provider-nav-btn-icon">
                    <Building2 size={16} />
                  </span>
                  <span className="provider-nav-btn-label">Hồ sơ Cơ sở</span>
                  <span
                    style={{
                      marginLeft: "auto",
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: profileForm.isOpen ? "#10B981" : "#94A3B8",
                    }}
                    title={profileForm.isOpen ? "Đang mở cửa" : "Tạm đóng"}
                  />
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "earnings"}
                  className={`provider-nav-btn${activeTab === "earnings" ? " is-active" : ""}`}
                  onClick={() => handleSelectTab("earnings")}
                >
                  <span className="provider-nav-btn-icon">
                    <Wallet size={16} />
                  </span>
                  <span className="provider-nav-btn-label">Doanh thu & Đối soát</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "staff"}
                  className={`provider-nav-btn${activeTab === "staff" ? " is-active" : ""}`}
                  onClick={() => handleSelectTab("staff")}
                >
                  <span className="provider-nav-btn-icon">
                    <UserRound size={16} />
                  </span>
                  <span className="provider-nav-btn-label">Phân công & Giấy tờ</span>
                  {providerAssignments.filter((a) => a.status === "OFFERED" || a.status === "ACCEPTED").length > 0 && (
                    <span className="provider-nav-count">
                      {providerAssignments.filter((a) => a.status === "OFFERED" || a.status === "ACCEPTED").length}
                    </span>
                  )}
                </button>

                <div className="provider-nav-divider" />
                <span className="provider-nav-group-title provider-nav-group-title-sub">
                  Kỹ thuật & Hệ thống
                </span>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "mcp"}
                  className={`provider-nav-btn${activeTab === "mcp" ? " is-active" : ""}`}
                  onClick={() => handleSelectTab("mcp")}
                >
                  <span className="provider-nav-btn-icon">
                    <Plug2 size={16} />
                  </span>
                  <span className="provider-nav-btn-label">Cổng kết nối MCP</span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: "10px",
                      background: "#F5F3FF",
                      color: "#7C3AED",
                    }}
                  >
                    AI
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "channels"}
                  className={`provider-nav-btn${activeTab === "channels" ? " is-active" : ""}`}
                  onClick={() => handleSelectTab("channels")}
                >
                  <span className="provider-nav-btn-icon">
                    <Radio size={16} />
                  </span>
                  <span className="provider-nav-btn-label">Kênh Microservices</span>
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
                  aria-selected={activeTab === "webhooks"}
                  className={`provider-nav-btn${activeTab === "webhooks" ? " is-active" : ""}`}
                  onClick={() => handleSelectTab("webhooks")}
                >
                  <span className="provider-nav-btn-icon">
                    <Code size={16} />
                  </span>
                  <span className="provider-nav-btn-label">Tích hợp Webhook</span>
                </button>
              </div>
            </div>

            {/* Sidebar Footer */}
            <div className="provider-sidebar-footer" style={{ marginTop: "auto", paddingTop: "16px" }}>
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
                  <span style={{ fontWeight: 700, color: "#4338CA" }}>{serviceItems.length} dịch vụ</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#334155" }}>Trạng thái:</span>
                  <span style={{ color: isDisconnected ? "#DC2626" : "#059669", fontWeight: 700 }}>
                    {isDisconnected ? "Đã ngắt kết nối" : "Đã kích hoạt"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Pane */}
        <main className="app-content provider-main" id="provider-content">
          <div className="provider-page">
            {/* Disconnected Notice Banner */}
            {isDisconnected && (
              <div
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: "12px",
                  padding: "16px 20px",
                  marginBottom: "20px",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  color: "#991B1B",
                }}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    background: "#FEE2E2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <AlertTriangle size={22} color="#DC2626" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "4px" }}>
                    Tài khoản đã ngắt kết nối dịch vụ
                  </div>
                  <div style={{ fontSize: "13px", color: "#7F1D1D", lineHeight: 1.5 }}>
                    Tài khoản đối tác <strong>{user?.email}</strong> đã bị ngắt kết nối toàn bộ khỏi 5 phân hệ
                    (Ride, Delivery, Food, Restaurant, Healthcare). Mọi chức năng Master Provider đã được bàn giao
                    cho tài khoản chính: <strong>provider1@xone.local</strong>.
                  </div>
                </div>
              </div>
            )}

            {/* Notification Toast Alert */}
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

            {/* Microservices Status Bar */}
            <MicroservicesStatusBar
              channels={allChannels}
              connectedServices={connectedServices}
              onSeedSample={handleSeedSample}
              seedingDomain={seedingDomain}
              allowedDomain={isMaster ? "all" : rawProviderType}
            />

            {/* Real-Time KPI Ribbon with 3s Polling pulse */}
            <KpiRibbon
              todayRevenue={todayRevenue}
              todayNewOrders={todayNewOrders}
              todayNeedsAction={todayNeedsAction}
              todayCompletedCount={todayCompletedCount}
              ctaLabel={cta.label}
              onCtaClick={() => {
                if (cta.tab === "food") {
                  void handleToggleOpenStatus();
                } else {
                  handleSelectTab(cta.tab);
                }
              }}
              loadingOperations={loadingOperations}
              onRefresh={() => void reloadOperations()}
            />

            {/* 3-WORKSPACE HIGH LEVEL SWITCHER */}
            <WorkspaceSwitcher
              currentWorkspace={currentWorkspace}
              onSelectWorkspace={handleSelectWorkspace}
              activeOrdersCount={todayNeedsAction}
              catalogItemsCount={serviceItems.length}
              activeChannelsCount={Object.values(connectedServices).filter((v) => v !== false).length}
              totalChannelsCount={allChannels.length}
            />

            {/* WORKSPACE 1: LIVE OPERATIONS COMMAND CENTER */}
            {currentWorkspace === "operations" && (
              <OperationsSection
                activeTab={activeTab}
                onSelectTab={handleSelectTab}
                isAllowedTab={isAllowedTab}
                allRides={allRides}
                activeRide={activeRide}
                onSelectActiveRide={(r: ActiveRide) => setActiveRide(r)}
                onProgressRide={async () => {
                  await handleAdvanceRideStatus();
                }}
                orders={orders}
                onAcceptOrder={async (order: FoodOrder) => handleAdvanceOrderStatus(order.id, "RESTAURANT_ACCEPTED")}
                onPrepareOrder={async (order: FoodOrder) => handleAdvanceOrderStatus(order.id, "PREPARING")}
                onReadyOrder={async (order: FoodOrder) => handleAdvanceOrderStatus(order.id, "READY_FOR_PICKUP")}
                onDeliverOrder={async (order: FoodOrder) => handleAdvanceOrderStatus(order.id, "COMPLETED")}
                deliveries={deliveries}
                onProgressDelivery={async (delivery: DeliveryOrder) => {
                  let nextStatus: DeliveryOrder["status"] = "COURIER_ASSIGNED";
                  if (delivery.status === "CREATED") nextStatus = "COURIER_ASSIGNED";
                  else if (delivery.status === "COURIER_ASSIGNED") nextStatus = "PICKING_UP";
                  else if (delivery.status === "PICKING_UP") nextStatus = "DELIVERING";
                  else if (delivery.status === "DELIVERING") nextStatus = "DELIVERED";
                  await handleAdvanceDeliveryStatus(delivery.id, nextStatus);
                }}
                reservations={reservations}
                onProgressReservation={async (res: RestaurantReservation) => {
                  let nextStatus: RestaurantReservation["status"] = "SEATED";
                  if (res.status === "CONFIRMED") nextStatus = "SEATED";
                  else if (res.status === "SEATED") nextStatus = "COMPLETED";
                  await handleAdvanceReservationStatus(res.id, nextStatus);
                }}
                appointments={appointments}
                onProgressAppointment={async (appt: HealthcareBooking) => {
                  let nextStatus: HealthcareBooking["status"] = "CONFIRMED";
                  if (appt.status === "DRAFT") nextStatus = "CONFIRMED";
                  else if (appt.status === "CONFIRMED") nextStatus = "IN_CONSULTATION";
                  else if (appt.status === "IN_CONSULTATION") nextStatus = "COMPLETED";
                  await handleAdvanceAppointmentStatus(appt.id, nextStatus);
                }}
                pharmacyOrders={pharmacyOrders}
                onProgressPharmacyOrder={async (rx: PharmacyOrder) => {
                  let nextStatus: PharmacyOrder["status"] = "CONFIRMED";
                  if (rx.status === "PRESCRIPTION_PENDING") nextStatus = "CONFIRMED";
                  else if (rx.status === "CONFIRMED") nextStatus = "PACKING";
                  else if (rx.status === "PACKING") nextStatus = "READY_FOR_PICKUP";
                  else if (rx.status === "READY_FOR_PICKUP") nextStatus = "DELIVERING";
                  else if (rx.status === "DELIVERING") nextStatus = "COMPLETED";
                  await handleAdvancePharmacyStatus(rx.id, nextStatus);
                }}
                loadingAction={loadingAction}
                onSeedSample={handleSeedSample}
                seedingDomain={seedingDomain}
              />
            )}

            {/* WORKSPACE 2: STORE & BUSINESS HUB */}
            {currentWorkspace === "business" && (
              <BusinessSection
                activeTab={activeTab}
                onSelectTab={handleSelectTab}
                serviceItems={serviceItems}
                onToggleItem={handleToggleItem}
                onDeleteItem={handleDeleteItem}
                onOpenAddServiceModal={() => setShowAddServiceModal(true)}
                profile={profile}
                profileForm={profileForm}
                onChangeProfileForm={(f, v) => setProfileForm((prev) => ({ ...prev, [f]: v }))}
                onSaveProfile={handleSaveProfile}
                savingProfile={savingProfile}
                earnings={earnings}
                availability={availability}
                onToggleAvailability={handleToggleAvailability}
                providerAssignments={providerAssignments}
                onAcceptAssignment={handleAcceptAssignment}
                providerDocuments={providerDocuments}
                onUploadDocument={handleUploadDocument}
                testingWebhook={testingWebhook}
                onTestWebhook={handleTestWebhook}
                webhookTestResult={webhookTestResult}
                webhookEvent={webhookEvent}
                onChangeWebhookEvent={setWebhookEvent}
              />
            )}

            {/* WORKSPACE 3: TECH & AI MCP INTEGRATIONS HUB */}
            {currentWorkspace === "tech" && (
              <TechSection
                activeTab={activeTab}
                onSelectTab={handleSelectTab}
                channels={allChannels}
                connectedServices={connectedServices}
                onToggleChannel={handleToggleChannel}
                onToggleAllChannels={handleToggleAllChannels}
                onOpenAddChannelModal={() => setShowAddChannelModal(true)}
                mcpKeys={mcpKeys}
                mcpKeyName={mcpKeyName}
                onChangeMcpKeyName={setMcpKeyName}
                onCreateMcpKey={handleCreateMcpKey}
                creatingMcpKey={creatingMcpKey}
                onRevokeMcpKey={handleRevokeMcpKey}
                newlyCreatedKey={newlyCreatedKey}
                webhookUrl={profileForm.webhookUrl}
                onChangeWebhookUrl={(u) => setProfileForm((prev) => ({ ...prev, webhookUrl: u }))}
                webhookSecret={webhookSecret}
                onChangeWebhookSecret={setWebhookSecret}
                webhookEvent={webhookEvent}
                onChangeWebhookEvent={setWebhookEvent}
                testingWebhook={testingWebhook}
                onTestWebhook={handleTestWebhook}
                webhookTestResult={webhookTestResult}
              />
            )}
          </div>
        </main>
      </div>

      {/* MODAL: ADD SERVICE ITEM / OFFERING */}
      <AddServiceModal
        isOpen={showAddServiceModal}
        onClose={() => setShowAddServiceModal(false)}
        onSubmit={handleCreateServiceItem}
        allowedDomain={isMaster ? "all" : rawProviderType}
      />

      {/* MODAL: ADD MICROSERVICE CHANNEL */}
      <AddChannelModal
        isOpen={showAddChannelModal}
        onClose={() => setShowAddChannelModal(false)}
        onAddChannel={handleCreateNewChannel}
      />
    </div>
  );
}
