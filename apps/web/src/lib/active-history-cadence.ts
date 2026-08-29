import type { HistoryItem } from "@/types";

const RIDE_REALTIME_STATUSES = new Set([
  "AWAITING_CONFIRMATION",
  "AWAITING_PAYMENT_CONFIRMATION",
  "SEARCHING_DRIVER",
  "DRIVER_ASSIGNED",
  "DRIVER_TO_PICKUP",
  "DRIVER_ARRIVED",
  "IN_PROGRESS",
  "ARRIVED_DESTINATION",
  // Compatibility statuses from older history rows.
  "SEARCHING",
  "CONFIRMED",
  "ARRIVING",
  "IN_TRANSIT",
  "PENDING",
  "ACCEPTED",
]);

const FOOD_REALTIME_STATUSES = new Set([
  "DRAFT",
  "AWAITING_CONFIRMATION",
  "PAYMENT_PENDING",
  "PAID",
  "RESTAURANT_CONFIRMING",
  "RESTAURANT_ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "DRIVER_ASSIGNED",
  "PICKED_UP",
  "DELIVERING",
  "REFUND_PENDING",
  // Compatibility statuses from older history rows.
  "CREATED",
  "CONFIRMED",
  "DISPATCHED",
  "PENDING",
]);

export function isRealtimeHistoryItem(item: HistoryItem): boolean {
  const status = String(item.status ?? "").toUpperCase();
  const type = item.type;
  return type === "ride_booking"
    ? RIDE_REALTIME_STATUSES.has(status)
    : type === "food_order" && FOOD_REALTIME_STATUSES.has(status);
}

export function calculatePollingInterval(
  items: HistoryItem[],
  consecutiveUnchanged: number
): number {
  if (!items || items.length === 0) {
    const base = 120_000; // 2 minutes
    const multiplier = Math.min(Math.pow(2, Math.max(0, consecutiveUnchanged)), 4);
    return Math.min(base * multiplier, 300_000); // Max 5 minutes when empty
  }

  const hasRealtime = items.some(isRealtimeHistoryItem);

  if (hasRealtime) {
    const base = 15_000; // 15s base interval for active tracking (moving ride/food delivery)
    const multiplier = Math.min(1 + Math.max(0, consecutiveUnchanged) * 0.5, 4); // 15s, 22.5s, 30s, 37.5s, max 60s
    return Math.min(Math.round(base * multiplier), 60_000);
  } else {
    // Scheduled / Future items (restaurant_reservation, healthcare_appointment, etc.)
    const base = 60_000; // 60s base interval for static / scheduled bookings
    const multiplier = Math.min(1 + Math.max(0, consecutiveUnchanged) * 1, 4); // 60s, 120s, 180s, max 240s (4 mins)
    return Math.min(Math.round(base * multiplier), 240_000);
  }
}

export function sameHistoryItems(left: HistoryItem[], right: HistoryItem[]): boolean {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((item, index) => {
    const next = right[index];
    return item.id === next?.id
      && item.type === next?.type
      && item.status === next?.status
      && item.timestamp === next?.timestamp
      && JSON.stringify(item.resource) === JSON.stringify(next.resource);
  });
}
