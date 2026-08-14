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

  return <section className="food-tracking" aria-labelledby="food-tracking-title">
    <div className="tracking-heading"><div><span className="eyebrow">THEO DÕI ĐƠN</span><h3 id="food-tracking-title">{foodStatus(tracking?.status)}</h3></div><button className="icon-button" type="button" onClick={() => void load()} aria-label="Cập nhật đơn"><RefreshCw size={16} /></button></div>
    {loading ? <p className="inline-note">Đang tải trạng thái giao hàng…</p> : error ? <div className="error-panel" role="alert"><p>{error}</p><button className="button button-secondary" type="button" onClick={() => void load()}>Thử lại</button></div> : tracking ? <><p className="inline-note">{tracking.driver ? `${driverName} đang xử lý đơn.` : "Nhà hàng đang chuẩn bị đơn của bạn."}</p><XOneMap origin={origin} destination={destination} current={current} driver={current} routeGeometry={tracking.delivery_route?.geometry} routeProvider={tracking.delivery_route?.provider} routeStatus={tracking.status} routeDistanceMeters={tracking.delivery_route?.distance_meters} routeDurationSeconds={tracking.delivery_route?.duration_seconds} label="Theo dõi giao hàng" /></> : null}
  </section>;
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

function foodStatus(status?: string): string { return status ? statusLabel(status) : "Đang cập nhật"; }
