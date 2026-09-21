"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  Calendar,
  Car,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  HeartPulse,
  MapPin,
  Navigation,
  Package,
  Pill,
  Search,
  Truck,
  User,
  UtensilsCrossed,
  Zap,
} from "lucide-react";
import {
  formatAppointmentStatus,
  formatDeliveryStatus,
  formatOrderStatus,
  formatPharmacyStatus,
  formatReservationStatus,
  formatRideStatus,
  type ActiveRide,
  type DeliveryOrder,
  type FoodOrder,
  type HealthcareBooking,
  type PharmacyOrder,
  type ProviderTab,
  type RestaurantReservation,
  type ServiceChannelDef,
} from "../provider.types";

export interface OperationsSectionProps {
  activeTab: ProviderTab;
  onSelectTab: (tab: ProviderTab) => void;
  isAllowedTab: (tab: ProviderTab) => boolean;
  allRides: ActiveRide[];
  activeRide: ActiveRide | null;
  onSelectActiveRide: (ride: ActiveRide) => void;
  onProgressRide: (ride: ActiveRide) => Promise<void>;
  orders: FoodOrder[];
  onAcceptOrder: (order: FoodOrder) => Promise<void>;
  onPrepareOrder: (order: FoodOrder) => Promise<void>;
  onReadyOrder: (order: FoodOrder) => Promise<void>;
  onDeliverOrder: (order: FoodOrder) => Promise<void>;
  deliveries: DeliveryOrder[];
  onProgressDelivery: (delivery: DeliveryOrder) => Promise<void>;
  reservations: RestaurantReservation[];
  onProgressReservation: (res: RestaurantReservation) => Promise<void>;
  appointments: HealthcareBooking[];
  onProgressAppointment: (appt: HealthcareBooking) => Promise<void>;
  pharmacyOrders: PharmacyOrder[];
  onProgressPharmacyOrder: (rx: PharmacyOrder) => Promise<void>;
  loadingAction: boolean;
  onSeedSample?: (domain: string, label: string) => Promise<any>;
  seedingDomain?: string | null;
}

export function OperationsSection({
  activeTab,
  onSelectTab,
  isAllowedTab,
  allRides,
  activeRide,
  onSelectActiveRide,
  onProgressRide,
  orders,
  onAcceptOrder,
  onPrepareOrder,
  onReadyOrder,
  onDeliverOrder,
  deliveries,
  onProgressDelivery,
  reservations,
  onProgressReservation,
  appointments,
  onProgressAppointment,
  pharmacyOrders,
  onProgressPharmacyOrder,
  loadingAction,
  onSeedSample,
  seedingDomain,
}: OperationsSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "in_progress" | "completed">("all");

  return (
    <div className="provider-operations-workspace">
      {/* Operational Domain Tab Switcher */}
      <div
        className="provider-tabs-bar"
        aria-label="Phân hệ vận hành trực tiếp"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "16px",
          borderBottom: "2px solid #E2E8F0",
          paddingBottom: "10px",
          overflowX: "auto",
        }}
      >
        {isAllowedTab("ride") && (
          <button
            type="button"
            aria-pressed={activeTab === "ride"}
            className={`provider-tab${activeTab === "ride" ? " is-active" : ""}`}
            onClick={() => onSelectTab("ride")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              borderRadius: "10px",
              border: activeTab === "ride" ? "2px solid #4F46E5" : "1px solid #E2E8F0",
              background: activeTab === "ride" ? "#EEF2FF" : "#FFFFFF",
              color: activeTab === "ride" ? "#4338CA" : "#475569",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Car size={16} />
            <span>Chuyến xe · Cuốc xe Ride Partner</span>
            {allRides.filter((r) => r.status !== "COMPLETED" && r.status !== "CANCELLED").length > 0 && (
              <span
                style={{
                  padding: "2px 7px",
                  borderRadius: "10px",
                  background: "#4F46E5",
                  color: "#FFFFFF",
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                {allRides.filter((r) => r.status !== "COMPLETED" && r.status !== "CANCELLED").length}
              </span>
            )}
          </button>
        )}

        {isAllowedTab("food") && (
          <button
            type="button"
            aria-pressed={activeTab === "food"}
            className={`provider-tab${activeTab === "food" ? " is-active" : ""}`}
            onClick={() => onSelectTab("food")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              borderRadius: "10px",
              border: activeTab === "food" ? "2px solid #EA580C" : "1px solid #E2E8F0",
              background: activeTab === "food" ? "#FFF7ED" : "#FFFFFF",
              color: activeTab === "food" ? "#C2410C" : "#475569",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <UtensilsCrossed size={16} />
            <span>Đơn món · Món ăn Food Merchant</span>
            {orders.filter((o) => o.status !== "COMPLETED" && o.status !== "CANCELLED").length > 0 && (
              <span
                style={{
                  padding: "2px 7px",
                  borderRadius: "10px",
                  background: "#EA580C",
                  color: "#FFFFFF",
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                {orders.filter((o) => o.status !== "COMPLETED" && o.status !== "CANCELLED").length}
              </span>
            )}
          </button>
        )}

        {isAllowedTab("delivery") && (
          <button
            type="button"
            aria-pressed={activeTab === "delivery"}
            className={`provider-tab${activeTab === "delivery" ? " is-active" : ""}`}
            onClick={() => onSelectTab("delivery")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              borderRadius: "10px",
              border: activeTab === "delivery" ? "2px solid #2563EB" : "1px solid #E2E8F0",
              background: activeTab === "delivery" ? "#EFF6FF" : "#FFFFFF",
              color: activeTab === "delivery" ? "#1D4ED8" : "#475569",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Package size={16} />
            <span>Giao hàng · Chuyển phát Delivery Courier</span>
            {deliveries.filter((d) => d.status !== "DELIVERED" && d.status !== "CANCELLED").length > 0 && (
              <span
                style={{
                  padding: "2px 7px",
                  borderRadius: "10px",
                  background: "#2563EB",
                  color: "#FFFFFF",
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                {deliveries.filter((d) => d.status !== "DELIVERED" && d.status !== "CANCELLED").length}
              </span>
            )}
          </button>
        )}

        {isAllowedTab("restaurant") && (
          <button
            type="button"
            aria-pressed={activeTab === "restaurant"}
            className={`provider-tab${activeTab === "restaurant" ? " is-active" : ""}`}
            onClick={() => onSelectTab("restaurant")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              borderRadius: "10px",
              border: activeTab === "restaurant" ? "2px solid #DB2777" : "1px solid #E2E8F0",
              background: activeTab === "restaurant" ? "#FDF2F8" : "#FFFFFF",
              color: activeTab === "restaurant" ? "#BE185D" : "#475569",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Calendar size={16} />
            <span>Đặt bàn · Nhà hàng Reservation</span>
            {reservations.filter((r) => r.status !== "COMPLETED" && r.status !== "CANCELLED").length > 0 && (
              <span
                style={{
                  padding: "2px 7px",
                  borderRadius: "10px",
                  background: "#DB2777",
                  color: "#FFFFFF",
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                {reservations.filter((r) => r.status !== "COMPLETED" && r.status !== "CANCELLED").length}
              </span>
            )}
          </button>
        )}

        {isAllowedTab("health") && (
          <button
            type="button"
            aria-pressed={activeTab === "health"}
            className={`provider-tab${activeTab === "health" ? " is-active" : ""}`}
            onClick={() => onSelectTab("health")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              borderRadius: "10px",
              border: activeTab === "health" ? "2px solid #059669" : "1px solid #E2E8F0",
              background: activeTab === "health" ? "#ECFDF5" : "#FFFFFF",
              color: activeTab === "health" ? "#047857" : "#475569",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <HeartPulse size={16} />
            <span>Lịch khám · Y tế Healthcare Doctor</span>
            {appointments.filter((a) => a.status !== "COMPLETED" && a.status !== "CANCELLED").length > 0 && (
              <span
                style={{
                  padding: "2px 7px",
                  borderRadius: "10px",
                  background: "#059669",
                  color: "#FFFFFF",
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                {appointments.filter((a) => a.status !== "COMPLETED" && a.status !== "CANCELLED").length}
              </span>
            )}
          </button>
        )}

        <button
          type="button"
          aria-pressed={activeTab === "pharmacy"}
          className={`provider-tab${activeTab === "pharmacy" ? " is-active" : ""}`}
          onClick={() => onSelectTab("pharmacy")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 16px",
            borderRadius: "10px",
            border: activeTab === "pharmacy" ? "2px solid #0D9488" : "1px solid #E2E8F0",
            background: activeTab === "pharmacy" ? "#CCFBF1" : "#FFFFFF",
            color: activeTab === "pharmacy" ? "#0F766E" : "#475569",
            fontWeight: 700,
            fontSize: "13px",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Pill size={16} />
          <span>Hiệu thuốc · Đơn thuốc Pharmacy</span>
          {pharmacyOrders.filter((rx) => rx.status !== "COMPLETED" && rx.status !== "CANCELLED").length > 0 && (
            <span
              style={{
                padding: "2px 7px",
                borderRadius: "10px",
                background: "#0D9488",
                color: "#FFFFFF",
                fontSize: "11px",
                fontWeight: 700,
              }}
            >
              {pharmacyOrders.filter((rx) => rx.status !== "COMPLETED" && rx.status !== "CANCELLED").length}
            </span>
          )}
        </button>
      </div>

      {/* 4. Filter & Search Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "16px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative", minWidth: "260px", flex: 1 }}>
          <Search
            size={16}
            style={{
              position: "absolute",
              left: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "#94A3B8",
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo mã đơn, tên khách, số điện thoại, địa chỉ..."
            style={{
              width: "100%",
              padding: "9px 12px 9px 36px",
              borderRadius: "8px",
              border: "1px solid #CBD5E1",
              fontSize: "13px",
              color: "#0F172A",
              background: "#FFFFFF",
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#64748B" }}>Bộ lọc:</span>
          {(["all", "pending", "in_progress", "completed"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                border: statusFilter === filter ? "1px solid #4F46E5" : "1px solid #E2E8F0",
                background: statusFilter === filter ? "#EEF2FF" : "#FFFFFF",
                color: statusFilter === filter ? "#4338CA" : "#64748B",
                cursor: "pointer",
              }}
            >
              {filter === "all"
                ? "Tất cả"
                : filter === "pending"
                  ? "Chờ xử lý"
                  : filter === "in_progress"
                    ? "Đang thực hiện"
                    : "Đã hoàn thành"}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Domain Content Rendering */}

      {/* DOMAIN: FOOD (Đơn món ăn) */}
      {activeTab === "food" && (
        <div className="provider-food-section">
          {orders.length === 0 ? (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                background: "#FFFFFF",
                borderRadius: "14px",
                border: "1px dashed #CBD5E1",
              }}
            >
              <UtensilsCrossed size={40} color="#CBD5E1" style={{ margin: "0 auto 12px" }} />
              <div style={{ fontSize: "16px", fontWeight: 600, color: "#0F172A" }}>
                Chưa có đơn món ăn nào trong ca trực
              </div>
              <p style={{ fontSize: "13px", color: "#64748B", maxWidth: "420px", margin: "6px auto 16px" }}>
                Đơn hàng mới từ khách hàng và AI Agent sẽ tự động xuất hiện tại đây kèm chuông báo động.
              </p>
              <button
                type="button"
                disabled={Boolean(seedingDomain)}
                onClick={() => onSeedSample?.("food", "đơn món ăn mẫu")}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  background: "#EA580C",
                  color: "#FFFFFF",
                  border: "none",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                {seedingDomain === "food" ? "Đang tạo dữ liệu..." : "Tạo đơn món mẫu vào PostgreSQL"}
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {orders.map((order) => {
                const isUrgent = order.status === "RESTAURANT_CONFIRMING" || order.status === "RECEIVED";
                const isPreparing = order.status === "RESTAURANT_ACCEPTED" || order.status === "PREPARING";
                const isReady = order.status === "READY_FOR_PICKUP";
                const isDone = order.status === "DELIVERED" || order.status === "COMPLETED";

                return (
                  <div
                    key={order.id}
                    style={{
                      background: "#FFFFFF",
                      borderRadius: "12px",
                      border: isUrgent ? "2px solid #EA580C" : "1px solid #E2E8F0",
                      padding: "16px 20px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span
                          style={{
                            fontSize: "14px",
                            fontWeight: 700,
                            fontFamily: "var(--font-mono, monospace)",
                            color: "#0F172A",
                          }}
                        >
                          #{order.id}
                        </span>
                        <span
                          style={{
                            fontSize: "12px",
                            fontWeight: 700,
                            padding: "3px 10px",
                            borderRadius: "12px",
                            background: isUrgent ? "#FFF7ED" : isPreparing ? "#EFF6FF" : isReady ? "#F5F3FF" : "#ECFDF5",
                            color: isUrgent ? "#EA580C" : isPreparing ? "#2563EB" : isReady ? "#7C3AED" : "#059669",
                            border: `1px solid ${isUrgent ? "#FFEDD5" : isPreparing ? "#DBEAFE" : isReady ? "#DDD6FE" : "#A7F3D0"}`,
                          }}
                        >
                          {formatOrderStatus(order.status)}
                        </span>
                        {order.note && (
                          <span style={{ fontSize: "12px", color: "#64748B", fontStyle: "italic" }}>
                            Ghi chú: {order.note}
                          </span>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                        <span style={{ fontSize: "12px", color: "#64748B", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <Clock size={13} /> {order.orderTime}
                        </span>
                        <span style={{ fontSize: "15px", fontWeight: 700, color: "#EA580C" }}>
                          {order.total.toLocaleString("vi-VN")} VND
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                          Khách hàng: {order.customerName}
                        </div>
                        <div style={{ fontSize: "13px", color: "#475569" }}>
                          {order.items.map((it, idx) => (
                            <span key={idx} style={{ marginRight: "12px" }}>
                              <strong>{it.quantity}x</strong> {it.name} ({it.price.toLocaleString("vi-VN")} đ)
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* 1-Click Action Flow for Food Merchant */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {isUrgent && (
                          <button
                            type="button"
                            disabled={loadingAction}
                            onClick={() => void onAcceptOrder(order)}
                            style={{
                              padding: "10px 18px",
                              borderRadius: "8px",
                              background: "#EA580C",
                              color: "#FFFFFF",
                              border: "none",
                              fontSize: "13px",
                              fontWeight: 700,
                              cursor: "pointer",
                              boxShadow: "0 2px 4px rgba(234, 88, 12, 0.3)",
                            }}
                          >
                            Nhận đơn ngay
                          </button>
                        )}

                        {isPreparing && (
                          <button
                            type="button"
                            disabled={loadingAction}
                            onClick={() => void onPrepareOrder(order)}
                            style={{
                              padding: "10px 18px",
                              borderRadius: "8px",
                              background: "#2563EB",
                              color: "#FFFFFF",
                              border: "none",
                              fontSize: "13px",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Bắt đầu chế biến
                          </button>
                        )}

                        {order.status === "PREPARING" && (
                          <button
                            type="button"
                            disabled={loadingAction}
                            onClick={() => void onReadyOrder(order)}
                            style={{
                              padding: "10px 18px",
                              borderRadius: "8px",
                              background: "#7C3AED",
                              color: "#FFFFFF",
                              border: "none",
                              fontSize: "13px",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Món đã xong (Sẵn sàng lấy)
                          </button>
                        )}

                        {isReady && (
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "8px 14px",
                              borderRadius: "8px",
                              background: "#F5F3FF",
                              color: "#7C3AED",
                              fontWeight: 600,
                              fontSize: "13px",
                              border: "1px solid #DDD6FE",
                            }}
                          >
                            <Truck size={15} />
                            <span>Đang chờ tài xế lấy món</span>
                            <button
                              type="button"
                              onClick={() => void onDeliverOrder(order)}
                              style={{
                                marginLeft: "8px",
                                padding: "4px 8px",
                                borderRadius: "6px",
                                background: "#7C3AED",
                                color: "#FFFFFF",
                                border: "none",
                                fontSize: "11px",
                                cursor: "pointer",
                              }}
                            >
                              Xác nhận đã giao
                            </button>
                          </div>
                        )}

                        {isDone && (
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "6px 12px",
                              borderRadius: "8px",
                              background: "#ECFDF5",
                              color: "#059669",
                              fontWeight: 600,
                              fontSize: "12px",
                            }}
                          >
                            <CheckCircle2 size={15} />
                            <span>Đã hoàn tất đơn</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* DOMAIN: RIDE (Chuyến xe) */}
      {activeTab === "ride" && (
        <div className="provider-ride-section">
          {allRides.length === 0 ? (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                background: "#FFFFFF",
                borderRadius: "14px",
                border: "1px dashed #CBD5E1",
              }}
            >
              <Car size={40} color="#CBD5E1" style={{ margin: "0 auto 12px" }} />
              <div style={{ fontSize: "16px", fontWeight: 600, color: "#0F172A" }}>
                Chưa có chuyến xe nào đang điều phối
              </div>
              <p style={{ fontSize: "13px", color: "#64748B", maxWidth: "420px", margin: "6px auto 16px" }}>
                Hệ thống AI Agent tự động phân bổ cuốc xe từ khách hàng trực tiếp đến tài xế đối tác.
              </p>
              <button
                type="button"
                disabled={Boolean(seedingDomain)}
                onClick={() => onSeedSample?.("ride", "chuyến đi mẫu")}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  background: "#4F46E5",
                  color: "#FFFFFF",
                  border: "none",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                {seedingDomain === "ride" ? "Đang tạo dữ liệu..." : "Tạo chuyến đi mẫu vào PostgreSQL"}
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#475569" }}>
                Cuốc xe đang điều phối ({allRides.length}):
              </div>

              {allRides.map((ride) => {
                const isSelected = activeRide?.id === ride.id;
                return (
                  <div
                    key={ride.id}
                    onClick={() => onSelectActiveRide(ride)}
                    style={{
                      background: "#FFFFFF",
                      borderRadius: "12px",
                      border: isSelected ? "2px solid #4F46E5" : "1px solid #E2E8F0",
                      padding: "16px 20px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "#0F172A" }}>
                          #{ride.id}
                        </span>
                        <span
                          style={{
                            fontSize: "12px",
                            fontWeight: 700,
                            padding: "3px 10px",
                            borderRadius: "12px",
                            background: "#EEF2FF",
                            color: "#4338CA",
                            border: "1px solid #C7D2FE",
                          }}
                        >
                          {formatRideStatus(ride.status)}
                        </span>
                        <span style={{ fontSize: "12px", color: "#64748B" }}>
                          Hành khách: {ride.passengerName} ({ride.passengers} người)
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "12px", color: "#64748B" }}>{ride.time}</span>
                        <span style={{ fontSize: "16px", fontWeight: 700, color: "#4338CA" }}>
                          {ride.fare.toLocaleString("vi-VN")} {ride.currency}
                        </span>
                      </div>
                    </div>

                    {/* Route Display */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "#F8FAFC", padding: "12px 14px", borderRadius: "8px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                        <MapPin size={16} color="#10B981" style={{ marginTop: "2px", flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748B" }}>ĐIỂM ĐÓN</div>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A" }}>{ride.pickup}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                        <Navigation size={16} color="#EF4444" style={{ marginTop: "2px", flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748B" }}>ĐIỂM ĐẾN</div>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A" }}>{ride.destination}</div>
                        </div>
                      </div>
                    </div>

                    {/* Action progression buttons */}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                      {ride.status !== "COMPLETED" && ride.status !== "CANCELLED" && (
                        <button
                          type="button"
                          disabled={loadingAction}
                          onClick={(e) => {
                            e.stopPropagation();
                            void onProgressRide(ride);
                          }}
                          style={{
                            padding: "9px 18px",
                            borderRadius: "8px",
                            background: "#4F46E5",
                            color: "#FFFFFF",
                            border: "none",
                            fontSize: "13px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {ride.status === "DRIVER_ASSIGNED"
                            ? "Bắt đầu chuyến đi"
                            : ride.status === "DRIVER_TO_PICKUP"
                              ? "Đã đến điểm đón"
                              : ride.status === "DRIVER_ARRIVED"
                                ? "Bắt đầu chở khách"
                                : ride.status === "IN_PROGRESS"
                                  ? "Đã tới đích"
                                  : "Hoàn thành chuyến"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* DOMAIN: DELIVERY (Giao hàng) */}
      {activeTab === "delivery" && (
        <div className="provider-delivery-section">
          {deliveries.length === 0 ? (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                background: "#FFFFFF",
                borderRadius: "14px",
                border: "1px dashed #CBD5E1",
              }}
            >
              <Package size={40} color="#CBD5E1" style={{ margin: "0 auto 12px" }} />
              <div style={{ fontSize: "16px", fontWeight: 600, color: "#0F172A" }}>
                Chưa có đơn giao hàng chuyển phát
              </div>
              <p style={{ fontSize: "13px", color: "#64748B", maxWidth: "420px", margin: "6px auto 16px" }}>
                Bưu kiện giao nhanh nội thành sẽ được điều phối tức thời qua kênh delivery-service :8106.
              </p>
              <button
                type="button"
                disabled={Boolean(seedingDomain)}
                onClick={() => onSeedSample?.("delivery", "đơn bưu kiện mẫu")}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  background: "#2563EB",
                  color: "#FFFFFF",
                  border: "none",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                {seedingDomain === "delivery" ? "Đang tạo dữ liệu..." : "Tạo đơn giao hàng mẫu"}
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {deliveries.map((deliv) => (
                <div
                  key={deliv.id}
                  style={{
                    background: "#FFFFFF",
                    borderRadius: "12px",
                    border: "1px solid #E2E8F0",
                    padding: "16px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "#0F172A" }}>
                        {deliv.trackingCode}
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: "12px",
                          background: "#EFF6FF",
                          color: "#1D4ED8",
                          border: "1px solid #BFDBFE",
                        }}
                      >
                        {formatDeliveryStatus(deliv.status)}
                      </span>
                      <span style={{ fontSize: "12px", color: "#64748B" }}>
                        Loại hàng: {deliv.packageType} {deliv.weightKg ? `(${deliv.weightKg} kg)` : ""}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "12px", color: "#64748B" }}>{deliv.time}</span>
                      <span style={{ fontSize: "15px", fontWeight: 700, color: "#2563EB" }}>
                        {deliv.amount.toLocaleString("vi-VN")} {deliv.currency}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "#F8FAFC", padding: "12px 14px", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748B" }}>NGƯỜI GỬI</div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A" }}>{deliv.senderName} ({deliv.senderPhone || "0912***"})</div>
                      <div style={{ fontSize: "12px", color: "#475569" }}>{deliv.pickup}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748B" }}>NGƯỜI NHẬN</div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A" }}>{deliv.receiverName} ({deliv.receiverPhone})</div>
                      <div style={{ fontSize: "12px", color: "#475569" }}>{deliv.destination}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    {deliv.status !== "DELIVERED" && deliv.status !== "CANCELLED" && (
                      <button
                        type="button"
                        onClick={() => void onProgressDelivery(deliv)}
                        style={{
                          padding: "9px 18px",
                          borderRadius: "8px",
                          background: "#2563EB",
                          color: "#FFFFFF",
                          border: "none",
                          fontSize: "13px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {deliv.status === "CREATED"
                          ? "Nhận đơn giao"
                          : deliv.status === "COURIER_ASSIGNED"
                            ? "Đã lấy hàng"
                            : deliv.status === "PICKING_UP"
                              ? "Đang giao hàng"
                              : "Đã giao thành công"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DOMAIN: RESTAURANT (Đặt bàn) */}
      {activeTab === "restaurant" && (
        <div className="provider-restaurant-section">
          {reservations.length === 0 ? (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                background: "#FFFFFF",
                borderRadius: "14px",
                border: "1px dashed #CBD5E1",
              }}
            >
              <Calendar size={40} color="#CBD5E1" style={{ margin: "0 auto 12px" }} />
              <div style={{ fontSize: "16px", fontWeight: 600, color: "#0F172A" }}>
                Chưa có yêu cầu đặt bàn nào
              </div>
              <p style={{ fontSize: "13px", color: "#64748B", maxWidth: "420px", margin: "6px auto 16px" }}>
                Hỗ trợ kết nối chuẩn đặt chỗ mạng lưới nhà hàng & ẩm thực PasGo.
              </p>
              <button
                type="button"
                disabled={Boolean(seedingDomain)}
                onClick={() => onSeedSample?.("restaurant", "đặt bàn nhà hàng mẫu")}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  background: "#DB2777",
                  color: "#FFFFFF",
                  border: "none",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                {seedingDomain === "restaurant" ? "Đang tạo dữ liệu..." : "Tạo lịch đặt bàn mẫu"}
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {reservations.map((res) => (
                <div
                  key={res.id}
                  style={{
                    background: "#FFFFFF",
                    borderRadius: "12px",
                    border: "1px solid #E2E8F0",
                    padding: "16px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A" }}>
                        Khách: {res.guestName}
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: "12px",
                          background: "#FDF2F8",
                          color: "#DB2777",
                          border: "1px solid #FBCFE8",
                        }}
                      >
                        {formatReservationStatus(res.status)}
                      </span>
                      <span style={{ fontSize: "12px", color: "#64748B" }}>
                        Số khách: <strong>{res.partySize} người</strong> · {res.seatingArea}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Clock size={14} color="#64748B" />
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A" }}>
                        {res.reservationTime}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    {res.status !== "COMPLETED" && res.status !== "CANCELLED" && (
                      <button
                        type="button"
                        onClick={() => void onProgressReservation(res)}
                        style={{
                          padding: "9px 18px",
                          borderRadius: "8px",
                          background: "#DB2777",
                          color: "#FFFFFF",
                          border: "none",
                          fontSize: "13px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {res.status === "CONFIRMED"
                          ? "Xác nhận giữ bàn"
                          : res.status === "SEATED"
                            ? "Khách đã nhận bàn"
                            : "Hoàn tất bữa ăn"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DOMAIN: HEALTHCARE (Lịch khám) */}
      {activeTab === "health" && (
        <div className="provider-health-section">
          {appointments.length === 0 ? (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                background: "#FFFFFF",
                borderRadius: "14px",
                border: "1px dashed #CBD5E1",
              }}
            >
              <HeartPulse size={40} color="#CBD5E1" style={{ margin: "0 auto 12px" }} />
              <div style={{ fontSize: "16px", fontWeight: 600, color: "#0F172A" }}>
                Chưa có lịch khám bệnh trong ngày
              </div>
              <p style={{ fontSize: "13px", color: "#64748B", maxWidth: "420px", margin: "6px auto 16px" }}>
                Hồ sơ đặt hẹn bác sĩ và khám bệnh chuyên khoa từ bệnh viện phòng khám đối tác.
              </p>
              <button
                type="button"
                disabled={Boolean(seedingDomain)}
                onClick={() => onSeedSample?.("healthcare", "lịch khám mẫu")}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  background: "#059669",
                  color: "#FFFFFF",
                  border: "none",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                {seedingDomain === "healthcare" ? "Đang tạo dữ liệu..." : "Tạo lịch khám mẫu"}
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {appointments.map((appt) => (
                <div
                  key={appt.id}
                  style={{
                    background: "#FFFFFF",
                    borderRadius: "12px",
                    border: "1px solid #E2E8F0",
                    padding: "16px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A" }}>
                        {appt.patientName}
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: "12px",
                          background: "#ECFDF5",
                          color: "#059669",
                          border: "1px solid #A7F3D0",
                        }}
                      >
                        {formatAppointmentStatus(appt.status)}
                      </span>
                      <span style={{ fontSize: "12px", color: "#64748B" }}>
                        Chuyên khoa: {appt.specialty} ({appt.type === "online" ? "Khám từ xa" : "Tại phòng khám"})
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Clock size={14} color="#64748B" />
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A" }}>
                        {appt.timeSlot}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    {appt.status !== "COMPLETED" && appt.status !== "CANCELLED" && (
                      <button
                        type="button"
                        onClick={() => void onProgressAppointment(appt)}
                        style={{
                          padding: "9px 18px",
                          borderRadius: "8px",
                          background: "#059669",
                          color: "#FFFFFF",
                          border: "none",
                          fontSize: "13px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {appt.status === "DRAFT"
                          ? "Xác nhận lịch khám"
                          : appt.status === "CONFIRMED"
                            ? "Bắt đầu khám"
                            : "Hoàn thành khám"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DOMAIN: PHARMACY (Hiệu thuốc & Đơn thuốc) */}
      {activeTab === "pharmacy" && (
        <div className="provider-pharmacy-section">
          {pharmacyOrders.length === 0 ? (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                background: "#FFFFFF",
                borderRadius: "14px",
                border: "1px dashed #CBD5E1",
              }}
            >
              <Pill size={40} color="#CBD5E1" style={{ margin: "0 auto 12px" }} />
              <div style={{ fontSize: "16px", fontWeight: 600, color: "#0F172A" }}>
                Chưa có đơn đặt thuốc nào
              </div>
              <p style={{ fontSize: "13px", color: "#64748B", maxWidth: "420px", margin: "6px auto 16px" }}>
                Kết nối trực tiếp hệ thống đối tác chuỗi nhà thuốc <strong>FPT Long Châu</strong> và <strong>Pharmacity</strong>.
              </p>
              <button
                type="button"
                disabled={Boolean(seedingDomain)}
                onClick={() => onSeedSample?.("pharmacy", "đơn thuốc mẫu")}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  background: "#0D9488",
                  color: "#FFFFFF",
                  border: "none",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                {seedingDomain === "pharmacy" ? "Đang tạo dữ liệu..." : "Tạo đơn thuốc mẫu (Long Châu)"}
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {pharmacyOrders.map((rx) => (
                <div
                  key={rx.id}
                  style={{
                    background: "#FFFFFF",
                    borderRadius: "12px",
                    border: "1px solid #E2E8F0",
                    padding: "16px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "#0F172A" }}>
                        #{rx.id}
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: "12px",
                          background: "#CCFBF1",
                          color: "#0F766E",
                          border: "1px solid #99F6E4",
                        }}
                      >
                        {formatPharmacyStatus(rx.status)}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "6px",
                          background: rx.providerChain === "longchau" ? "#EFF6FF" : "#ECFDF5",
                          color: rx.providerChain === "longchau" ? "#1D4ED8" : "#047857",
                        }}
                      >
                        {rx.providerChain === "longchau" ? "FPT Long Châu" : rx.providerChain === "pharmacity" ? "Pharmacity" : "Nội bộ"}
                      </span>
                      {rx.prescriptionRequired && (
                        <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "6px", background: "#FEF2F2", color: "#DC2626" }}>
                          Đơn thuốc có kê toa
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "12px", color: "#64748B" }}>{rx.orderTime}</span>
                      <span style={{ fontSize: "15px", fontWeight: 700, color: "#0D9488" }}>
                        {rx.total.toLocaleString("vi-VN")} VND
                      </span>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                      Bệnh nhân/Khách mua: {rx.customerName} ({rx.customerPhone || "098***"}) · {rx.deliveryAddress}
                    </div>
                    <div style={{ fontSize: "13px", color: "#475569" }}>
                      {rx.items.map((it, idx) => (
                        <span key={idx} style={{ marginRight: "12px" }}>
                          <strong>{it.quantity}x</strong> {it.name} ({it.price.toLocaleString("vi-VN")} đ / {it.unit || "hộp"})
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    {rx.status !== "COMPLETED" && rx.status !== "CANCELLED" && (
                      <button
                        type="button"
                        onClick={() => void onProgressPharmacyOrder(rx)}
                        style={{
                          padding: "9px 18px",
                          borderRadius: "8px",
                          background: "#0D9488",
                          color: "#FFFFFF",
                          border: "none",
                          fontSize: "13px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {rx.status === "PRESCRIPTION_PENDING"
                          ? "Duyệt đơn thuốc & Nhận"
                          : rx.status === "CONFIRMED"
                            ? "Đang soạn thuốc & Đóng gói"
                            : rx.status === "PACKING"
                              ? "Sẵn sàng bàn giao shipper"
                              : rx.status === "READY_FOR_PICKUP"
                                ? "Bắt đầu giao thuốc"
                                : "Hoàn thành giao thuốc"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
