import { calculatePollingInterval, isRealtimeHistoryItem, sameHistoryItems } from "./active-history-cadence";
import type { HistoryItem } from "@/types";

describe("active history cadence & backoff rate limiter", () => {
  const itemFor = (type: HistoryItem["type"], status: string): HistoryItem => ({
    id: `${type}-${status}`,
    type,
    title: status,
    status,
    detail: status,
    timestamp: "2026-08-27T19:00:00Z",
    source: type,
    resource: { id: `${type}-${status}`, status },
  });

  const rideActiveStatuses = [
    "AWAITING_CONFIRMATION", "AWAITING_PAYMENT_CONFIRMATION", "SEARCHING_DRIVER", "DRIVER_ASSIGNED", "DRIVER_TO_PICKUP",
    "DRIVER_ARRIVED", "IN_PROGRESS", "ARRIVED_DESTINATION",
  ];
  const rideTerminalStatuses = ["COMPLETED", "NO_DRIVER", "FAILED", "PAYMENT_FAILED", "CANCELLED"];
  const foodActiveStatuses = [
    "DRAFT", "AWAITING_CONFIRMATION", "PAYMENT_PENDING", "PAID", "RESTAURANT_CONFIRMING",
    "RESTAURANT_ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "DRIVER_ASSIGNED", "PICKED_UP", "DELIVERING", "REFUND_PENDING",
  ];
  const foodTerminalStatuses = ["DELIVERED", "PAYMENT_FAILED", "RESTAURANT_REJECTED", "CANCELLED", "REFUNDED"];

  const futureReservation: HistoryItem = {
    id: "rest_res_01",
    type: "restaurant_reservation",
    title: "Nhà Hàng Chả Cá Văn Miếu",
    status: "CONFIRMED",
    detail: "Đặt bàn 2 người ngày mai",
    timestamp: "2026-08-27T19:00:00Z",
    source: "restaurant_reservation",
    resource: { id: "rest_01" },
  };

  const rideInTransit: HistoryItem = {
    id: "ride_01",
    type: "ride_booking",
    title: "Chuyến xe VinUni",
    status: "IN_TRANSIT",
    detail: "Đang di chuyển",
    timestamp: "2026-08-26T17:00:00Z",
    source: "ride_booking",
    resource: { id: "ride_01" },
  };

  test("correctly identifies realtime vs scheduled items", () => {
    expect(isRealtimeHistoryItem(rideInTransit)).toBe(true);
    expect(isRealtimeHistoryItem(futureReservation)).toBe(false);
  });

  test.each(rideActiveStatuses)("polls every active Ride status: %s", (status) => {
    expect(isRealtimeHistoryItem(itemFor("ride_booking", status))).toBe(true);
  });

  test.each(rideTerminalStatuses)("does not fast-poll terminal Ride status: %s", (status) => {
    expect(isRealtimeHistoryItem(itemFor("ride_booking", status))).toBe(false);
  });

  test.each(foodActiveStatuses)("polls every active Food status: %s", (status) => {
    expect(isRealtimeHistoryItem(itemFor("food_order", status))).toBe(true);
  });

  test.each(foodTerminalStatuses)("does not fast-poll terminal Food status: %s", (status) => {
    expect(isRealtimeHistoryItem(itemFor("food_order", status))).toBe(false);
  });

  test("compares history snapshots including resource changes", () => {
    const left = [itemFor("ride_booking", "DRIVER_ASSIGNED")];
    const equivalent = left.map((item) => ({ ...item, resource: { ...item.resource } }));
    expect(sameHistoryItems(left, equivalent)).toBe(true);
    expect(sameHistoryItems(left, [{ ...left[0], resource: { ...left[0].resource, current_location: { latitude: 21, longitude: 105 } } }])).toBe(false);
  });

  test("calculates initial polling interval based on item types", () => {
    // Scheduled items start at 60s base interval
    expect(calculatePollingInterval([futureReservation], 0)).toBe(60_000);

    // Realtime items start at 15s base interval
    expect(calculatePollingInterval([rideInTransit], 0)).toBe(15_000);

    // Empty list starts at 120s base interval
    expect(calculatePollingInterval([], 0)).toBe(120_000);
  });

  test("applies exponential backoff when payload is unchanged", () => {
    // Scheduled items backoff: 60s -> 120s -> 180s -> 240s max
    expect(calculatePollingInterval([futureReservation], 0)).toBe(60_000);
    expect(calculatePollingInterval([futureReservation], 1)).toBe(120_000);
    expect(calculatePollingInterval([futureReservation], 2)).toBe(180_000);
    expect(calculatePollingInterval([futureReservation], 3)).toBe(240_000);
    expect(calculatePollingInterval([futureReservation], 10)).toBe(240_000);

    // Realtime items backoff: 15s -> 23s -> 30s -> 38s -> max 60s
    expect(calculatePollingInterval([rideInTransit], 0)).toBe(15_000);
    expect(calculatePollingInterval([rideInTransit], 1)).toBe(22_500);
    expect(calculatePollingInterval([rideInTransit], 2)).toBe(30_000);
    expect(calculatePollingInterval([rideInTransit], 10)).toBe(60_000);
  });

  test("caps 1-hour total request count for a static future reservation to <= 20 requests", () => {
    let elapsedTimeMs = 0;
    let consecutiveUnchanged = 0;
    let requestCount = 0;
    const items = [futureReservation];

    // Simulate 1 hour (3600 seconds) of polling with unchanged static reservation
    while (elapsedTimeMs < 3_600_000) {
      requestCount++;
      const nextInterval = calculatePollingInterval(items, consecutiveUnchanged);
      elapsedTimeMs += nextInterval;
      consecutiveUnchanged++;
    }

    // 1-hour request count should be <= 20 (compared to 720 previously)
    expect(requestCount).toBeLessThanOrEqual(20);
    expect(requestCount).toBe(17);
  });
});
