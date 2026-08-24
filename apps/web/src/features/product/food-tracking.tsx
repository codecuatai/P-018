"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { errorText, getFoodTracking } from "@/lib/api-client";
import { statusLabel } from "@/lib/presentation";
import type { FoodTracking } from "@/types";

import { XOneMap } from "./xone-map";

export function FoodTrackingPanel({ orderId }: { orderId: string }) {
  const [tracking, setTracking] = useState<FoodTracking>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deliveredAt, setDeliveredAt] = useState<number>();
  const inFlight = useRef(false);
  const requestRef = useRef<AbortController | undefined>(undefined);
  const requestVersion = useRef(0);

  const load = useCallback(async (background = false): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!background) setLoading(true);
    setError("");
    const version = ++requestVersion.current;
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const next = await getFoodTracking(orderId, controller.signal);
      if (version !== requestVersion.current) return;
      setTracking(next);
      if (next.status === "DELIVERED") setDeliveredAt((value) => value ?? Date.now());
    } catch (reason) {
      if (version === requestVersion.current && !controller.signal.aborted) setError(errorText(reason));
    } finally {
      if (requestRef.current === controller) requestRef.current = undefined;
      inFlight.current = false;
      if (!background && version === requestVersion.current) setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const schedule = (): void => {
      if (!active || document.visibilityState === "hidden" || tracking?.status === "DELIVERED") return;
      timer = window.setTimeout(() => { void poll(); }, 3000);
    };
    const poll = async (): Promise<void> => {
      if (!active || document.visibilityState === "hidden") return;
      await load(true);
      if (active && (!deliveredAt || Date.now() - deliveredAt < 10_000)) schedule();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (timer !== undefined) window.clearTimeout(timer);
        timer = undefined;
      } else {
        void poll();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void load().then(() => { if (active) schedule(); });
    return () => { active = false; if (timer !== undefined) window.clearTimeout(timer); requestVersion.current += 1; requestRef.current?.abort(); document.removeEventListener("visibilitychange", handleVisibilityChange); };
  }, [deliveredAt, load, tracking?.status]);

  const origin = point(tracking?.delivery_route?.origin ?? tracking?.restaurant);
  const destination = point(tracking?.delivery_route?.destination ?? tracking?.address);
  const current = tracking?.courier_location ?? undefined;
  const driverName = text(tracking?.driver, "Người giao hàng");
  const pickupStops = tracking?.pickup_stops?.filter((stop) => text(stop, "").length > 0) ?? [];

  return (
    <section className="w-full bg-white rounded-2xl md:rounded-[2rem] border border-slate-200/60 overflow-hidden shadow-sm" aria-labelledby="food-tracking-title">
      <div className="flex items-center justify-between p-4 md:p-6 border-b border-slate-200/60 bg-slate-50/50">
        <div>
          <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase mb-1 block">THEO DÕI ĐƠN</span>
          <h3 id="food-tracking-title" className="text-lg md:text-xl font-bold text-slate-900 leading-tight">{foodStatus(tracking?.status)}</h3>
        </div>
        <button className="p-2 md:p-3 bg-white border border-slate-200/60 rounded-xl text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all active:scale-95 shadow-sm" type="button" onClick={() => void load()} aria-label="Cập nhật đơn">
          <RefreshCw size={18} />
        </button>
      </div>
      <div className="p-4 md:p-6">
        {loading ? (
          <p className="text-sm font-medium text-slate-500 text-center py-8">Đang tải trạng thái giao hàng…</p>
        ) : error ? (
          <div className="bg-red-50 text-red-600 p-4 rounded-2xl border border-red-100 flex flex-col items-center gap-3 text-center" role="alert">
            <p className="text-sm font-semibold">{error}</p>
            <button className="px-5 py-2.5 bg-white text-red-600 border border-red-200 text-sm font-bold rounded-xl hover:bg-red-50 transition-all active:scale-95 shadow-sm" type="button" onClick={() => void load()}>Thử lại</button>
          </div>
        ) : tracking ? (
          <div className="flex flex-col gap-6">
            <p className="text-sm font-semibold text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              {tracking.driver ? `${driverName} đang xử lý đơn.` : "Nhà hàng đang chuẩn bị đơn của bạn."}
            </p>
            {pickupStops.length ? (
              <ol className="flex flex-col gap-4 relative before:absolute before:inset-y-3 before:left-3 before:w-px before:bg-slate-200" aria-label="Lộ trình lấy món">
                {pickupStops.map((stop, index) => (
                  <li className="relative flex gap-4 items-start z-10" key={`${text(stop, "Điểm lấy hàng")}-${index}`}>
                    <span className="w-6 h-6 shrink-0 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-600 shadow-sm mt-0.5">{index + 1}</span>
                    <div className="flex flex-col">
                      <strong className="text-sm font-bold text-slate-900">{text(stop, "Nhà hàng")}</strong>
                      <span className="text-xs font-medium text-slate-500 mt-0.5 leading-relaxed">{addressText(stop)}</span>
                    </div>
                  </li>
                ))}
                <li className="relative flex gap-4 items-start z-10">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center mt-0.5 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  </span>
                  <div className="flex flex-col">
                    <strong className="text-sm font-bold text-blue-700">Giao đến</strong>
                    <span className="text-xs font-medium text-slate-500 mt-0.5 leading-relaxed">{addressText(tracking.address)}</span>
                  </div>
                </li>
              </ol>
            ) : null}
            <div className="h-[240px] md:h-[320px] rounded-2xl overflow-hidden border border-slate-200/60 shadow-inner relative">
               <XOneMap origin={origin} destination={destination} current={current} driver={current} routeGeometry={tracking.delivery_route?.geometry} routeProvider={tracking.delivery_route?.provider} routeStatus={tracking.status} routeDistanceMeters={tracking.delivery_route?.distance_meters} routeDurationSeconds={tracking.delivery_route?.duration_seconds} label="Theo dõi giao hàng" />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
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
