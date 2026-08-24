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

  return (
    <section className={`w-full bg-white rounded-2xl md:rounded-[2rem] border border-slate-200/60 overflow-hidden shadow-sm ${className || ""}`} aria-labelledby="ride-tracking-title">
      <div className="flex items-center justify-between p-4 md:p-6 border-b border-slate-200/60 bg-slate-50/50">
        <div>
          <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase mb-1 block">THEO DÕI CHUYẾN</span>
          <h2 id="ride-tracking-title" className="text-lg md:text-xl font-bold text-slate-900 leading-tight">Trạng thái tài xế</h2>
        </div>
      </div>
      <div className="p-4 md:p-6 flex flex-col gap-6">
        {loading && !tracking ? (
          <p className="text-sm font-medium text-slate-500 text-center py-8" aria-live="polite">Đang cập nhật vị trí chuyến…</p>
        ) : error && !tracking ? (
          <div className="bg-red-50 text-red-600 p-4 rounded-2xl border border-red-100 flex flex-col items-center gap-3 text-center" role="alert">
            <p className="text-sm font-semibold">{error}</p>
          </div>
        ) : tracking ? (
          <>
            {!hideMap ? (
              <div className="h-[240px] md:h-[320px] rounded-2xl overflow-hidden border border-slate-200/60 shadow-inner relative">
                <XOneMap origin={origin} destination={destination} current={driver ? undefined : current} driver={driver} density="active" routeGeometry={activeRoute?.geometry} routePolyline={driverPhase ? undefined : tracking.route?.polyline} routeProvider={activeRoute?.provider ?? tracking.route_provider} routeStatus={tracking.status} routeDistanceMeters={activeRoute?.distance_meters} routeDurationSeconds={activeRoute?.duration_seconds} label="Theo dõi chuyến xe" />
              </div>
            ) : null}
            <div className="flex items-center justify-between bg-slate-50 border border-slate-100 p-4 rounded-2xl shadow-sm" aria-live="polite">
              <strong className="text-sm font-bold text-slate-900">{trackingLabel(tracking.status)}</strong>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-sm font-bold text-blue-600">{tracking.eta_seconds > 0 ? `Còn ~${Math.ceil(tracking.eta_seconds / 60)} phút` : "Đã cập nhật"}</span>
                <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">{Math.round(tracking.progress * 100)}% hành trình</span>
              </div>
            </div>
            {tracking.driver ? (
              <div className="flex items-center gap-4 p-4 bg-white border border-slate-200/60 rounded-2xl shadow-sm">
                <span className="w-12 h-12 shrink-0 rounded-full bg-slate-100 border border-slate-200/80 flex items-center justify-center text-lg font-black text-slate-400" aria-hidden="true">{parsedDriver.name.slice(0, 1).toUpperCase()}</span>
                <div className="flex flex-col flex-1 overflow-hidden">
                  <strong className="text-sm font-bold text-slate-900 truncate">{parsedDriver.name}</strong>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <small className="text-xs font-medium text-slate-600 truncate">{parsedDriver.rating ? `${parsedDriver.rating} ★` : "Chưa có rating"}{parsedDriver.phone ? ` · ${parsedDriver.phone}` : ""}</small>
                  </div>
                  <small className="text-[11px] font-medium text-slate-500 mt-1 truncate">{parsedDriver.vehicle}{parsedDriver.color ? ` · ${parsedDriver.color}` : ""}{parsedDriver.licensePlate ? ` · ${parsedDriver.licensePlate}` : ""}</small>
                  <small className="text-[11px] font-bold text-blue-600 mt-1 truncate">{tracking.eta_seconds > 0 ? `Đến trong khoảng ${Math.ceil(tracking.eta_seconds / 60)} phút` : "ETA đang cập nhật"}</small>
                </div>
              </div>
            ) : tracking.status === "SEARCHING_DRIVER" ? (
              <div className="flex items-center gap-4 p-4 bg-blue-50/50 border border-blue-100 rounded-2xl shadow-sm" role="status">
                <span className="w-12 h-12 shrink-0 rounded-full bg-blue-100/50 flex items-center justify-center relative" aria-hidden="true">
                  <span className="w-4 h-4 bg-blue-600 rounded-full animate-ping absolute" />
                  <span className="w-4 h-4 bg-blue-600 rounded-full relative" />
                </span>
                <div className="flex flex-col">
                  <strong className="text-sm font-bold text-blue-900">Đang tìm tài xế phù hợp</strong>
                  <small className="text-xs font-medium text-blue-700/70 mt-0.5">Mình sẽ báo ngay khi có người nhận chuyến.</small>
                </div>
              </div>
            ) : null}
            <ol className="flex justify-between items-center px-2 mt-2" aria-label="Tiến trình chuyến xe">
              {trackingSteps.map((step, index) => {
                const isComplete = index <= trackingStepIndex(tracking.status);
                const isCurrent = index === trackingStepIndex(tracking.status);
                return (
                  <li className="flex flex-col items-center gap-2 flex-1 relative group" key={step.status}>
                    {index > 0 && (
                      <div className={`absolute top-2.5 right-1/2 w-full h-[2px] -z-10 transition-colors ${isComplete ? "bg-blue-600" : "bg-slate-100"}`} />
                    )}
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border-2 transition-all shadow-sm ${isCurrent ? "bg-white border-blue-600 text-blue-600 ring-4 ring-blue-50" : isComplete ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-300"}`} aria-hidden="true">
                      {isComplete && !isCurrent ? "✓" : index + 1}
                    </span>
                    <small className={`text-[10px] font-bold text-center absolute top-7 w-20 leading-tight transition-colors ${isCurrent ? "text-blue-700" : isComplete ? "text-slate-700" : "text-slate-400"}`}>
                      {step.label}
                    </small>
                  </li>
                );
              })}
            </ol>
            <div className="h-6" /> {/* spacer cho timeline text */}
          </>
        ) : (
          <p className="text-sm font-medium text-slate-500 text-center py-8">Chưa có dữ liệu tracking.</p>
        )}
      </div>
    </section>
  );
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
