"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { errorText, getRideTracking } from "@/lib/api-client";
import type { RideTracking } from "@/types";

import { XOneMap } from "./xone-map";

export function RideTrackingPanel({ bookingId }: { bookingId: string }) {
  const [tracking, setTracking] = useState<RideTracking>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError("");
    try {
      setTracking(await getRideTracking(bookingId));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      if (!background) setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 3000);
    return () => window.clearInterval(timer);
  }, [load]);

  const origin = pointFrom(tracking?.route?.origin);
  const destination = pointFrom(tracking?.route?.destination);
  const current = tracking?.current_location ?? tracking?.driver_location ?? undefined;

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
      <XOneMap origin={origin} destination={destination} current={current} label="Theo dõi chuyến xe" />
      <p className="tracking-footnote">Snapshot mô phỏng được làm mới mỗi 3 giây. Tọa độ chỉ hiển thị khi Ride Service có dữ liệu hợp lệ.</p>
    </> : <p className="inline-note">Chưa có dữ liệu tracking.</p>}
  </section>;
}

function pointFrom(value: unknown): { latitude: number; longitude: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.latitude === "number" && typeof candidate.longitude === "number" ? { latitude: candidate.latitude, longitude: candidate.longitude } : undefined;
}

function trackingLabel(status: string): string {
  return ({ DRIVER_ASSIGNED: "Tài xế đang đến điểm đón", DRIVER_ARRIVED: "Tài xế đã đến", IN_PROGRESS: "Đang di chuyển", COMPLETED: "Đã hoàn tất", CANCELLED: "Đã hủy" } as Record<string, string>)[status] ?? status;
}
