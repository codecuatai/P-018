"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { errorText, getRideTracking } from "@/lib/api-client";
import { statusLabel } from "@/lib/presentation";
import type { RideTracking } from "@/types";

import { XOneMap } from "./xone-map";

export function RideTrackingPanel({ bookingId }: { bookingId: string }) {
  const [tracking, setTracking] = useState<RideTracking>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const trackingRef = useRef<RideTracking | undefined>(undefined);
  const inFlightRef = useRef(false);
  const requestRef = useRef<AbortController | undefined>(undefined);
  const requestVersion = useRef(0);

  const load = useCallback(async (background = false) => {
    if (inFlightRef.current || (background && document.visibilityState === "hidden")) return;
    inFlightRef.current = true;
    if (!background) setLoading(true);
    setError("");
    const version = ++requestVersion.current;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    try {
      const next = await getRideTracking(bookingId, controller.signal);
      if (version !== requestVersion.current) return;
      trackingRef.current = next;
      setTracking(next);
    } catch (reason) {
      if (version === requestVersion.current && !controller.signal.aborted) setError(errorText(reason));
    } finally {
      if (requestRef.current === controller) requestRef.current = undefined;
      inFlightRef.current = false;
      if (!background && version === requestVersion.current) setLoading(false);
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
      requestVersion.current += 1;
      requestRef.current?.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [load]);

  const origin = pointFrom(tracking?.route?.origin);
  const destination = pointFrom(tracking?.route?.destination);
  const current = tracking?.current_location ?? undefined;
  const driver = tracking?.driver_location ?? undefined;
  const driverPhase = tracking?.status === "DRIVER_ASSIGNED" || tracking?.status === "DRIVER_TO_PICKUP";
  const activeRoute = driverPhase ? tracking?.driver_route : tracking?.route;
  const driverName = recordText(tracking?.driver, ["name", "full_name", "display_name"], "Tài xế của bạn");
  const driverRating = recordText(tracking?.driver, ["rating", "rating_average"], "");
  const driverPhone = maskPhone(recordText(tracking?.driver, ["phone", "phone_number"], ""));
  const driverVehicle = recordText(tracking?.driver, ["vehicle_model", "vehicle", "vehicle_type"], "Thông tin xe đang cập nhật");
  const driverColor = recordText(tracking?.driver, ["vehicle_color", "color"], "");
  const licensePlate = recordText(tracking?.driver, ["license_plate", "plate_number"], "");

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
    {loading ? <p className="inline-note" aria-live="polite">Đang cập nhật vị trí chuyến…</p> : error ? <div className="error-panel" role="alert"><p>{error}</p><button className="button button-secondary" type="button" onClick={() => void load()}>Thử lại</button></div> : tracking ? <>
      <div className="tracking-summary" aria-live="polite">
        <strong>{trackingLabel(tracking.status)}</strong>
        <span>{tracking.eta_seconds > 0 ? `Còn khoảng ${Math.ceil(tracking.eta_seconds / 60)} phút` : "Đã cập nhật"}</span>
        <span>{Math.round(tracking.progress * 100)}% hành trình</span>
      </div>
      {tracking.driver ? <div className="tracking-driver-card"><span className="driver-avatar" aria-hidden="true">{driverName.slice(0, 1).toUpperCase()}</span><span><strong>{driverName}</strong><small>{driverRating ? `${driverRating} ★` : "Rating đang cập nhật"}{driverPhone ? ` · ${driverPhone}` : ""}</small><small>{driverVehicle}{driverColor ? ` · ${driverColor}` : ""}{licensePlate ? ` · ${licensePlate}` : ""}</small><small>{tracking.eta_seconds > 0 ? `Đến trong khoảng ${Math.ceil(tracking.eta_seconds / 60)} phút` : "ETA đang cập nhật"}</small></span></div> : tracking.status === "SEARCHING_DRIVER" ? <div className="driver-search-card" role="status"><span className="driver-search-pulse" aria-hidden="true" /><span><strong>Đang tìm tài xế phù hợp</strong><small>Mình sẽ báo ngay khi có người nhận chuyến.</small></span></div> : null}
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

function isTerminalStatus(status?: string): boolean {
  return status === "COMPLETED" || status === "NO_DRIVER" || status === "FAILED" || status === "PAYMENT_FAILED" || status === "CANCELLED";
}

function recordText(value: Record<string, unknown> | null | undefined, keys: string[], fallback: string): string {
  if (!value) return fallback;
  for (const key of keys) if (typeof value[key] === "string" && value[key].trim()) return value[key] as string;
  return fallback;
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 ? `${digits.slice(0, 3)} *** ${digits.slice(-2)}` : value;
}
