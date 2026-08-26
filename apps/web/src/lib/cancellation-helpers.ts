import { cancelHealthcareAppointment, cancelRestaurantReservation, cancelRideBooking, executeCancellation, prepareFoodCancellation } from "@/lib/api-client";
import type { HistoryType } from "@/types";

export function isCancellableStatus(type: HistoryType, status: string): boolean {
  const s = String(status || "").toUpperCase();
  if (["CANCELLED", "COMPLETED", "EXPIRED", "FULFILLED", "SEATED", "NO_SHOW", "DELIVERED", "REJECTED"].includes(s)) {
    return false;
  }
  if (type === "restaurant_reservation") {
    return ["CONFIRMED", "HELD", "SCHEDULED", "RESERVED", "BOOKED", "PENDING"].includes(s);
  }
  if (type === "healthcare_appointment") {
    return ["CONFIRMED", "HELD", "SCHEDULED", "BOOKED", "PAYMENT_CONFIRMED", "PENDING"].includes(s);
  }
  if (type === "ride_booking") {
    return ["SEARCHING", "CONFIRMED", "ACCEPTED", "ARRIVING", "PENDING"].includes(s);
  }
  if (type === "food_order") {
    return ["CREATED", "CONFIRMED", "PREPARING", "PENDING"].includes(s);
  }
  return false;
}

export function canRateStatus(status: string, type: HistoryType, resource?: Record<string, unknown>): boolean {
  const value = String(status || "").toUpperCase();
  if (type === "ride_booking") {
    return value === "COMPLETED" || value === "FULFILLED";
  }
  if (type === "food_order") {
    return ["DELIVERED", "COMPLETED", "FULFILLED"].includes(value);
  }
  if (type === "restaurant_reservation") {
    if (value === "COMPLETED" || value === "FULFILLED") return true;
    if (value === "SEATED") {
      const startTimeStr = String(resource?.start_at ?? resource?.reservation_time ?? "");
      if (startTimeStr) {
        const startTime = new Date(startTimeStr).getTime();
        return !Number.isNaN(startTime) && Date.now() >= startTime;
      }
      return true;
    }
    return false;
  }
  if (type === "healthcare_appointment") {
    return value === "COMPLETED" || value === "FULFILLED";
  }
  return false;
}

export async function executeServiceCancellation(
  type: HistoryType,
  resourceOrId: Record<string, unknown> | string
): Promise<Record<string, unknown>> {
  const resource = typeof resourceOrId === "object" && resourceOrId !== null ? resourceOrId : {};
  const rawId = typeof resourceOrId === "string" ? resourceOrId : String(resource.id ?? resource.reservation_id ?? resource.appointment_id ?? resource.booking_id ?? resource.order_id ?? resource.resource_id ?? "");

  if (type === "restaurant_reservation") {
    return await cancelRestaurantReservation(rawId);
  }
  if (type === "healthcare_appointment") {
    const numId = Number(rawId);
    return await cancelHealthcareAppointment(Number.isNaN(numId) ? 0 : numId);
  }
  if (type === "ride_booking") {
    return await cancelRideBooking(rawId);
  }
  if (type === "food_order") {
    const prep = await prepareFoodCancellation(rawId);
    const confirmationId = String(prep.confirmation_id ?? prep.id ?? "");
    if (confirmationId) {
      return await executeCancellation(confirmationId);
    }
    return prep;
  }
  throw new Error("Loại dịch vụ không hỗ trợ hủy.");
}
