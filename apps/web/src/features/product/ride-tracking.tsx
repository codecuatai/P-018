"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { errorText, getRideTracking } from "@/lib/api-client";
import type { RideTracking } from "@/types";

import { XOneMap } from "./xone-map";

export function RideTrackingPanel({ bookingId }: { bookingId: string }) {
  const [tracking, setTracking] = useState<RideTracking>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const trackingRef = useRef<RideTracking | undefined>(undefined);
  const inFlightRef = useRef(false);

  const load = useCallback(async (background = false) => {
    if (inFlightRef.current || (background && document.visibilityState === "hidden")) return;
    inFlightRef.current = true;
    if (!background) setLoading(true);
    setError("");
    try {
      const next = await getRideTracking(bookingId);
      trackingRef.current = next;
      setTracking(next);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      inFlightRef.current = false;
      if (!background) setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const schedule = () => {
      if (!active || document.visibilityState === "hidden" || isTerminalStatus(trackingRef.current?.status)) return;
      timer = window.setTimeout(() => { void poll(); }, 2000);
    };
    const poll = async () => {
      if (!active || document.visibilityState === "hidden" || isTerminalStatus(trackingRef.current?.status)) return;
      await load(true);
      schedule();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (timer !== undefined) window.clearTimeout(timer);
        timer = undefined;
        return;
      }
      void poll();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void load().then(schedule);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [load]);

  const origin = pointFrom(tracking?.route?.origin);
  const destination = pointFrom(tracking?.route?.destination);
  const current = tracking?.current_location ?? undefined;
  const driver = tracking?.driver_location ?? undefined;
  const driverPhase = tracking?.status === "DRIVER_ASSIGNED" || tracking?.status === "DRIVER_TO_PICKUP";
  const activeRoute = driverPhase ? tracking?.driver_route : tracking?.route;
  const driverName = recordText(tracking?.driver, ["name", "full_name", "display_name"], "Tài xế X-One");
  const driverVehicle = recordText(tracking?.driver, ["vehicle", "vehicle_type", "license_plate"], "Thông tin xe sẽ hiển thị khi được xác nhận");

  return <section className="ride-tracking" aria-labelledby="ride-tracking-title">
    <div className="tracking-heading">
      <div>
        <span className="eyebrow">THEO DÕI CHUYẾN</span>
        <h2 id="ride-tracking-title">Trạng thái tài xế</h2>
      </div>
      <button className="icon-button" type="button" onClick={() => void load()} aria-label="Cập nhật trạng thái chuyến xe">
        <RefreshCw size={17} />
      </button>
    </div>
    {loading ? <p className="inline-note" aria-live="polite">Đang lấy snapshot tracking…</p> : error ? <div className="error-panel" role="alert"><p>{error}</p><button className="button button-secondary" type="button" onClick={() => void load()}>Thử lại</button></div> : tracking ? <>
      <div className="tracking-summary" aria-live="polite">
        <strong>{trackingLabel(tracking.status)}</strong>
        <span>{tracking.eta_seconds > 0 ? `Còn khoảng ${Math.ceil(tracking.eta_seconds / 60)} phút` : "Đã cập nhật"}</span>
        <span>{Math.round(tracking.progress * 100)}% hành trình</span>
      </div>
      {tracking.driver ? <div className="tracking-driver-card"><span className="driver-avatar" aria-hidden="true">{driverName.slice(0, 1).toUpperCase()}</span><span><strong>{driverName}</strong><small>{driverVehicle}</small></span><span className="status-badge">Đã xác minh</span></div> : tracking.status === "SEARCHING_DRIVER" ? <div className="driver-search-card" role="status"><span className="driver-search-pulse" aria-hidden="true" /><span><strong>Đang tìm tài xế phù hợp</strong><small>Ride Service sẽ cập nhật khi có phân công.</small></span></div> : null}
      <ol className="tracking-timeline" aria-label="Tiến trình chuyến xe">{trackingSteps.map((step, index) => <li className={index <= trackingStepIndex(tracking.status) ? "is-complete" : ""} key={step.status}><span aria-hidden="true">{index + 1}</span><small>{step.label}</small></li>)}</ol>
      <XOneMap origin={origin} destination={destination} current={current} driver={driver} density="active" routeGeometry={activeRoute?.geometry} routePolyline={driverPhase ? undefined : tracking.route?.polyline} routeProvider={activeRoute?.provider ?? tracking.route_provider} routeStatus={tracking.status} routeDistanceMeters={activeRoute?.distance_meters} routeDurationSeconds={activeRoute?.duration_seconds} label="Theo dõi chuyến xe" />
      <p className="tracking-footnote">Cập nhật nền mỗi 3 giây khi trang đang mở. Polling dừng ở trạng thái kết thúc và tạm dừng khi tab bị ẩn.</p>
    </> : <p className="inline-note">Chưa có dữ liệu tracking.</p>}
  </section>;
}

function pointFrom(value: unknown): { latitude: number; longitude: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.latitude === "number" && typeof candidate.longitude === "number" ? { latitude: candidate.latitude, longitude: candidate.longitude } : undefined;
}

function trackingLabel(status: string): string {
  return ({ AWAITING_CONFIRMATION: "Đang chờ xác nhận", SEARCHING_DRIVER: "Đang tìm tài xế", DRIVER_ASSIGNED: "Tài xế đã được gán", DRIVER_TO_PICKUP: "Tài xế đang đến điểm đón", DRIVER_ARRIVED: "Tài xế đã đến", IN_PROGRESS: "Đang di chuyển", ARRIVED_DESTINATION: "Đã đến nơi · đang hoàn tất", COMPLETED: "Đã hoàn tất", NO_DRIVER: "Chưa tìm thấy tài xế", FAILED: "Chuyến thất bại", PAYMENT_FAILED: "Thanh toán thất bại", CANCELLED: "Đã hủy" } as Record<string, string>)[status] ?? status;
}

const trackingSteps = [
  { status: "SEARCHING_DRIVER", label: "Tìm tài xế" },
  { status: "DRIVER_TO_PICKUP", label: "Đang đến" },
  { status: "DRIVER_ARRIVED", label: "Đã đến" },
  { status: "IN_PROGRESS", label: "Đang đi" },
  { status: "ARRIVED_DESTINATION", label: "Đã đến nơi" },
  { status: "COMPLETED", label: "Hoàn tất" },
] as const;

function trackingStepIndex(status: string): number {
  if (status === "AWAITING_CONFIRMATION" || status === "SEARCHING_DRIVER") return 0;
  if (status === "DRIVER_ASSIGNED" || status === "DRIVER_TO_PICKUP") return 1;
  if (status === "DRIVER_ARRIVED") return 2;
  if (status === "IN_PROGRESS") return 3;
  if (status === "ARRIVED_DESTINATION") return 4;
  return status === "COMPLETED" ? 5 : -1;
}

function isTerminalStatus(status?: string): boolean {
  return status === "COMPLETED" || status === "NO_DRIVER" || status === "FAILED" || status === "PAYMENT_FAILED" || status === "CANCELLED";
}

function recordText(value: Record<string, unknown> | null | undefined, keys: string[], fallback: string): string {
  if (!value) return fallback;
  for (const key of keys) if (typeof value[key] === "string" && value[key].trim()) return value[key] as string;
  return fallback;
}
