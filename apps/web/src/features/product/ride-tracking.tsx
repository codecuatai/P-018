"use client";

import { useRideTracking } from "@/features/product/ride-tracking-cache";
import { statusLabel } from "@/lib/presentation";
import type { RideTracking } from "@/types";

import { XOneMap } from "./xone-map";
import { RideCancelButton } from "./ride-cancel-button";

export type ParsedRideDriver = {
  name: string;
  rating: string;
  phone: string;
  vehicle: string;
  color: string;
  licensePlate: string;
};

export function RideTrackingPanel(props: { bookingId: string; hideMap?: boolean; className?: string }) {
  const { data: tracking } = useRideTracking(props.bookingId);
  return <><RideTrackingPanelContent {...props} /><RideCancelButton bookingId={props.bookingId} status={tracking?.status} /></>;
}

function RideTrackingPanelContent({ bookingId, hideMap = false, className }: { bookingId: string; hideMap?: boolean; className?: string }) {
  const { data: tracking, loading, error } = useRideTracking(bookingId);
  const origin = pointFrom(tracking?.route?.origin);
  const destination = pointFrom(tracking?.route?.destination);
  const current = tracking?.current_location ?? undefined;
  const driver = tracking?.driver_location ?? undefined;
  const driverPhase = tracking?.status === "DRIVER_ASSIGNED" || tracking?.status === "DRIVER_TO_PICKUP";
  const activeRoute = driverPhase ? tracking?.driver_route : tracking?.route;
  const parsedDriver = parseRideDriver(tracking?.driver);

  return <section className={`ride-tracking${className ? ` ${className}` : ""}`} aria-labelledby="ride-tracking-title">
    <div className="tracking-heading"><div><span className="eyebrow">THEO DÕI CHUYẾN</span><h2 id="ride-tracking-title">Trạng thái tài xế</h2></div></div>
    {loading && !tracking ? <p className="inline-note" aria-live="polite">Đang cập nhật vị trí chuyến…</p> : error && !tracking ? <div className="error-panel" role="alert"><p>{error}</p></div> : tracking ? <>
      {!hideMap ? <XOneMap origin={origin} destination={destination} current={driver ? undefined : current} driver={driver} density="active" routeGeometry={activeRoute?.geometry} routePolyline={driverPhase ? undefined : tracking.route?.polyline} routeProvider={activeRoute?.provider ?? tracking.route_provider} routeStatus={tracking.status} routeDistanceMeters={activeRoute?.distance_meters} routeDurationSeconds={activeRoute?.duration_seconds} label="Theo dõi chuyến xe" /> : null}
      <div className="tracking-summary" aria-live="polite"><strong>{trackingLabel(tracking.status)}</strong><span>{tracking.eta_seconds > 0 ? `Còn khoảng ${Math.ceil(tracking.eta_seconds / 60)} phút` : "Đã cập nhật"}</span><span>{Math.round(tracking.progress * 100)}% hành trình</span></div>
      {tracking.driver ? <div className="tracking-driver-card"><span className="driver-avatar" aria-hidden="true">{parsedDriver.name.slice(0, 1).toUpperCase()}</span><span><strong>{parsedDriver.name}</strong><small>{parsedDriver.rating ? `${parsedDriver.rating} ★` : "Rating đang cập nhật"}{parsedDriver.phone ? ` · ${parsedDriver.phone}` : ""}</small><small>{parsedDriver.vehicle}{parsedDriver.color ? ` · ${parsedDriver.color}` : ""}{parsedDriver.licensePlate ? ` · ${parsedDriver.licensePlate}` : ""}</small><small>{tracking.eta_seconds > 0 ? `Đến trong khoảng ${Math.ceil(tracking.eta_seconds / 60)} phút` : "ETA đang cập nhật"}</small></span></div> : tracking.status === "SEARCHING_DRIVER" ? <div className="driver-search-card" role="status"><span className="driver-search-pulse" aria-hidden="true" /><span><strong>Đang tìm tài xế phù hợp</strong><small>Mình sẽ báo ngay khi có người nhận chuyến.</small></span></div> : null}
      <ol className="tracking-timeline" aria-label="Tiến trình chuyến xe">{trackingSteps.map((step, index) => <li className={index <= trackingStepIndex(tracking.status) ? "is-complete" : ""} key={step.status}><span aria-hidden="true">{index + 1}</span><small>{step.label}</small></li>)}</ol>
    </> : <p className="inline-note">Chưa có dữ liệu tracking.</p>}
  </section>;
}

function pointFrom(value: unknown): { latitude: number; longitude: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.latitude === "number" && typeof candidate.longitude === "number" ? { latitude: candidate.latitude, longitude: candidate.longitude } : undefined;
}

function trackingLabel(status: string): string { return statusLabel(status); }

const trackingSteps = [
  { status: "AWAITING_CONFIRMATION", label: "Chờ xác nhận" },
  { status: "SEARCHING_DRIVER", label: "Đang tìm tài xế" },
  { status: "DRIVER_TO_PICKUP", label: "Tài xế đang đến" },
  { status: "DRIVER_ARRIVED", label: "Tài xế đã đến" },
  { status: "IN_PROGRESS", label: "Đang di chuyển" },
  { status: "ARRIVED_DESTINATION", label: "Đã đến nơi" },
  { status: "COMPLETED", label: "Hoàn tất" },
] as const;

function trackingStepIndex(status: string): number {
  if (status === "AWAITING_CONFIRMATION") return 0;
  if (status === "SEARCHING_DRIVER") return 1;
  if (status === "DRIVER_ASSIGNED" || status === "DRIVER_TO_PICKUP") return 2;
  if (status === "DRIVER_ARRIVED") return 3;
  if (status === "IN_PROGRESS") return 4;
  if (status === "ARRIVED_DESTINATION") return 5;
  return status === "COMPLETED" ? 6 : -1;
}

export function parseRideDriver(value: Record<string, unknown> | null | undefined): ParsedRideDriver {
  const record = value ?? {};
  const vehicle = isRecord(record.vehicle) ? record.vehicle : {};
  return {
    name: firstText(record, ["name", "full_name", "display_name"], "Tài xế của bạn"),
    rating: firstNumberText(record, ["rating_average", "rating"]),
    phone: firstText(record, ["phone_masked", "phone", "phone_number"], ""),
    vehicle: firstText(record, ["vehicle_model", "vehicle_type"], firstText(vehicle, ["model", "name", "type"], "Thông tin xe đang cập nhật")),
    color: firstText(record, ["vehicle_color", "color"], firstText(vehicle, ["color"], "")),
    licensePlate: firstText(record, ["license_plate", "plate_number"], firstText(vehicle, ["license_plate", "plate_number"], "")),
  };
}

function firstText(record: Record<string, unknown>, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() && !isRawIdentifier(value)) return value.trim();
  }
  return fallback;
}

function firstNumberText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(number)) return number.toFixed(1);
  }
  return "";
}

function isRawIdentifier(value: string): boolean { return /^([a-f0-9]{8,}|driver[-_][\w-]+)$/i.test(value.trim()); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
