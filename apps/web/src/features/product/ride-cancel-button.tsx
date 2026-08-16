"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { cancelRideBooking, errorText } from "@/lib/api-client";

import { markRideTrackingCancelled } from "./ride-tracking-cache";

const terminalStatuses = new Set(["COMPLETED", "NO_DRIVER", "FAILED", "PAYMENT_FAILED", "CANCELLED"]);

export function RideCancelButton({ bookingId, status, onCancelled, className = "" }: { bookingId?: string; status?: string; onCancelled?: (result: Record<string, unknown>) => void; className?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const normalizedStatus = status?.trim().toUpperCase();
  if (!bookingId || (normalizedStatus && terminalStatuses.has(normalizedStatus))) return null;
  const activeBookingId = bookingId;

  async function cancel(): Promise<void> {
    if (loading || !window.confirm("Bạn có chắc muốn hủy chuyến xe này không?")) return;
    setLoading(true);
    setError("");
    try {
      const result = await cancelRideBooking(activeBookingId);
      markRideTrackingCancelled(activeBookingId);
      onCancelled?.(result);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoading(false);
    }
  }

  return <div className={`ride-cancel-actions ${className}`.trim()}>
    <button className="button button-secondary ride-cancel-button" type="button" onClick={() => void cancel()} disabled={loading}>
      <X size={15} /> {loading ? "Đang hủy…" : "Hủy chuyến"}
    </button>
    {error ? <p className="ride-cancel-error" role="alert">{error}</p> : null}
  </div>;
}
