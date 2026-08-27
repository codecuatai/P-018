import { calculatePollingInterval, isRealtimeHistoryItem } from "./active-history-cadence";
import type { HistoryItem } from "@/types";

describe("active history cadence & backoff rate limiter", () => {
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
