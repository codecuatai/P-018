"use client";

import { Clock3, MapPin, RefreshCw, Truck } from "lucide-react";
import { useState } from "react";

import { statusLabel } from "@/lib/presentation";
import { XOneMap } from "./xone-map";
import { useFoodTracking } from "./food-tracking-cache";

type FoodTrackingPanelProps = {
  orderId: string;
  hideMap?: boolean;
  polling?: boolean;
  className?: string;
  variant?: "inline" | "detail";
};

export function FoodTrackingPanel({ orderId, hideMap = false, polling = true, className, variant = "inline" }: FoodTrackingPanelProps) {
  const { data: tracking, loading, error, refresh } = useFoodTracking(orderId, polling);
  const [showInfo, setShowInfo] = useState(false);

  const origin = point(tracking?.delivery_route?.origin) ?? point(tracking?.restaurant);
  const destination = point(tracking?.delivery_route?.destination) ?? point(tracking?.address);
  const current = tracking?.courier_location ?? undefined;
  const driverName = text(tracking?.driver, "Người giao hàng");
  const pickupStops = tracking?.pickup_stops?.filter((stop) => text(stop, "").length > 0) ?? [];
  const stopovers = pickupStops.map(point).filter((stop): stop is { latitude: number; longitude: number } => stop !== undefined);
  const eta = tracking?.eta_minutes && tracking.eta_minutes > 0 ? `Khoảng ${tracking.eta_minutes} phút` : "ETA đang cập nhật";
  const distance = tracking?.delivery_route?.distance_meters && tracking.delivery_route.distance_meters > 0
    ? `${(tracking.delivery_route.distance_meters / 1000).toFixed(1)} km`
    : "Lộ trình đang cập nhật";
  const map = <XOneMap origin={origin} destination={destination} stopovers={stopovers} current={current} driver={current} density="active" routeGeometry={tracking?.delivery_route?.geometry} routeProvider={tracking?.delivery_route?.provider} routeStatus={tracking?.status} routeDistanceMeters={tracking?.delivery_route?.distance_meters} routeDurationSeconds={tracking?.delivery_route?.duration_seconds} label="Bản đồ hành trình giao hàng" />;
  const state = loading && !tracking
    ? <p className="inline-note" aria-live="polite">Đang cập nhật trạng thái giao hàng…</p>
    : error && !tracking
      ? <div className="error-panel" role="alert"><p>{error}</p><button className="button button-secondary" type="button" onClick={refresh}>Thử lại</button></div>
      : null;
  const facts = [
    { label: "Điểm lấy hàng", value: pickupStops.map(addressText).join(" → ") || addressText(tracking?.restaurant) },
    { label: "Địa chỉ giao", value: addressText(tracking?.address) },
    { label: "Trạng thái", value: foodStatus(tracking?.status) },
    { label: "Thời gian dự kiến", value: eta },
    { label: "Khoảng cách", value: distance },
    { label: "Người giao", value: tracking?.driver ? driverName : foodDriverStatus(tracking?.status ?? "") },
  ];
  const trackingBody = tracking ? <>
    {!hideMap ? map : null}
    <div className="tracking-summary" aria-live="polite"><strong>{foodStatus(tracking.status)}</strong><span><Clock3 size={14} aria-hidden="true" /> {eta}</span><span><MapPin size={14} aria-hidden="true" /> {distance}</span></div>
    {tracking.driver ? <div className="tracking-driver-card"><span className="driver-avatar" aria-hidden="true">{driverName.slice(0, 1).toUpperCase()}</span><span><strong>{driverName}</strong><small>{driverDetail(tracking.driver)}</small><small>{foodDriverStatus(tracking.status)}</small></span></div> : <div className="driver-search-card" role="status"><Truck size={18} aria-hidden="true" /><span><strong>{foodDriverStatus(tracking.status)}</strong><small>{foodStatusNote(tracking.status)}</small></span></div>}
    <ol className="tracking-timeline food-tracking-timeline" aria-label="Tiến trình đơn giao hàng">{foodTrackingSteps.map((step, index) => <li className={index <= foodTrackingStepIndex(tracking.status) ? "is-complete" : ""} key={step.status}><span aria-hidden="true">{index + 1}</span><small>{step.label}</small></li>)}</ol>
    <div className="food-tracking-stops" aria-label="Điểm lấy và giao hàng">{pickupStops.map((stop, index) => <div key={`${text(stop, "Điểm lấy hàng")}-${index}`}><strong>Điểm lấy {index + 1}</strong><span>{addressText(stop)}</span></div>)}<div><strong>Giao đến</strong><span>{addressText(tracking.address)}</span></div></div>
  </> : state;
  const heading = <div className="tracking-heading"><div><span className="eyebrow">THEO DÕI ĐƠN</span><h2 id="food-tracking-title">Trạng thái giao hàng</h2></div><button className="icon-button" type="button" onClick={refresh} aria-label="Cập nhật đơn"><RefreshCw className={loading ? "spin" : undefined} size={16} /></button></div>;

  if (variant === "detail") return <div className="ride-map-detail food-map-detail">
    <section className="ride-map-stage" aria-label="Bản đồ hành trình giao hàng">
      <div className="ride-map-canvas">
        {tracking ? map : <div className="food-tracking-map-state">{state}</div>}
        <button className="detail-info-button ride-map-info-button" type="button" aria-expanded={showInfo} onClick={() => setShowInfo((value) => !value)}>Thông tin đơn</button>
        {showInfo && tracking ? <aside className="ride-map-info-panel" aria-label="Thông tin đơn giao hàng"><div className="consumer-detail-grid">{facts.map((fact) => <div className="consumer-detail-fact" key={fact.label}><span>{fact.label}</span><strong>{fact.value}</strong></div>)}</div></aside> : null}
      </div>
    </section>
    <section className={`ride-tracking food-tracking ride-map-status-panel${className ? ` ${className}` : ""}`} aria-labelledby="food-tracking-title">{heading}{trackingBody}</section>
  </div>;

  return <section className={`ride-tracking food-tracking${className ? ` ${className}` : ""}`} aria-labelledby="food-tracking-title">{heading}{trackingBody}</section>;
}

function point(value: unknown): { latitude: number; longitude: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.latitude === "number" && typeof candidate.longitude === "number" ? { latitude: candidate.latitude, longitude: candidate.longitude } : undefined;
}

function text(value: Record<string, unknown> | null | undefined, fallback: string): string {
  if (!value) return fallback;
  for (const key of ["name", "display_name", "full_name"]) if (typeof value[key] === "string" && value[key].trim()) return value[key] as string;
  return fallback;
}

function addressText(value: Record<string, unknown> | null | undefined): string {
  if (!value) return "Địa chỉ đang cập nhật";
  for (const key of ["address", "address_text", "location"]) if (typeof value[key] === "string" && value[key].trim()) return value[key] as string;
  return "Địa chỉ đang cập nhật";
}

function foodStatus(status?: string): string { return status ? statusLabel(status) : "Đang cập nhật"; }

function driverDetail(driver: Record<string, unknown> | null | undefined): string {
  if (!driver) return "Thông tin tài xế đang cập nhật";
  const vehicle = typeof driver.vehicle_type === "string" ? driver.vehicle_type : "Phương tiện đang cập nhật";
  const plate = typeof driver.license_plate === "string" ? ` · ${driver.license_plate}` : "";
  return `${vehicle}${plate}`;
}

function foodDriverStatus(status: string): string {
  if (status === "READY_FOR_PICKUP") return "Đang tìm tài xế lấy món";
  if (status === "DRIVER_ASSIGNED") return "Tài xế đang đến điểm lấy món";
  if (status === "PICKED_UP") return "Tài xế đã lấy món";
  if (status === "DELIVERING") return "Tài xế đang giao đến bạn";
  if (status === "DELIVERED") return "Đơn đã giao thành công";
  return "Nhà hàng đang xử lý đơn";
}

function foodStatusNote(status: string): string {
  if (status === "RESTAURANT_CONFIRMING") return "Nhà hàng đang xác nhận đơn của bạn.";
  if (status === "PREPARING") return "Nhà hàng đang chuẩn bị món.";
  if (status === "READY_FOR_PICKUP") return "Mình sẽ báo ngay khi có tài xế nhận đơn.";
  return "Tiến trình sẽ tự động cập nhật khi có thay đổi.";
}

const foodTrackingSteps = [
  { status: "PAYMENT_PENDING", label: "Chờ thanh toán" },
  { status: "RESTAURANT_CONFIRMING", label: "Quán xác nhận" },
  { status: "RESTAURANT_ACCEPTED", label: "Đã tiếp nhận" },
  { status: "PREPARING", label: "Đang chuẩn bị" },
  { status: "READY_FOR_PICKUP", label: "Chờ tài xế" },
  { status: "DRIVER_ASSIGNED", label: "Tài xế đến" },
  { status: "PICKED_UP", label: "Đã lấy món" },
  { status: "DELIVERING", label: "Đang giao" },
  { status: "DELIVERED", label: "Đã giao" },
] as const;

function foodTrackingStepIndex(status: string): number {
  const exact = foodTrackingSteps.findIndex((step) => step.status === status);
  return exact >= 0 ? exact : status === "PAID" ? 0 : -1;
}
