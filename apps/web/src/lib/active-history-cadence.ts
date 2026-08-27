import type { HistoryItem } from "@/types";

export function isRealtimeHistoryItem(item: HistoryItem): boolean {
  const status = String(item.status ?? "").toUpperCase();
  const type = item.type;
  if (type === "ride_booking") {
    return ["SEARCHING", "CONFIRMED", "ARRIVING", "IN_TRANSIT", "PENDING", "ACCEPTED"].includes(status);
  }
  if (type === "food_order") {
    return ["CREATED", "CONFIRMED", "PREPARING", "DELIVERING", "DISPATCHED", "PENDING"].includes(status);
  }
  return false;
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
  if (!left || !right || left.length !== right.length) return false;
  return left.every((item, index) => {
    const next = right[index];
    return item.id === next?.id && item.type === next?.type && item.status === next?.status && item.timestamp === next?.timestamp && JSON.stringify(item.resource) === JSON.stringify(next.resource);
  });
}
