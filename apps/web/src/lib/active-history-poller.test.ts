import { fetchActiveHistoryShared, resetActiveHistoryPollerCache, subscribeActiveHistoryShared } from "./active-history-poller";
import * as apiClient from "@/lib/api-client";
import type { HistoryItem } from "@/types";

jest.mock("@/lib/api-client", () => ({
  getActiveHistory: jest.fn(),
}));

describe("active history shared poller", () => {
  const mockItem: HistoryItem = {
    id: "active-1",
    type: "ride_booking",
    title: "Chuyến xe",
    status: "DRIVER_ASSIGNED",
    detail: "Đang đón bạn",
    timestamp: "2026-08-29T10:00:00Z",
    source: "ride_booking",
    resource: { id: "active-1", status: "DRIVER_ASSIGNED" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetActiveHistoryPollerCache();
    localStorage.clear();
    (apiClient.getActiveHistory as jest.Mock).mockResolvedValue({ items: [mockItem] });
  });

  test("deduplicates same-user requests within the shared fetch gap", async () => {
    const first = await fetchActiveHistoryShared("user-101");
    const second = await fetchActiveHistoryShared("user-101");

    expect(apiClient.getActiveHistory).toHaveBeenCalledTimes(1);
    expect(second.items).toEqual(first.items);
  });

  test("keeps cache and in-flight requests isolated by user", async () => {
    const [first, second] = await Promise.all([
      fetchActiveHistoryShared("user-a"),
      fetchActiveHistoryShared("user-b"),
    ]);

    expect(apiClient.getActiveHistory).toHaveBeenCalledTimes(2);
    expect(first.items).toEqual([mockItem]);
    expect(second.items).toEqual([mockItem]);
  });

  test("notifies subscribers when a fresh payload is written", async () => {
    const subscriberA = jest.fn();
    const subscriberB = jest.fn();
    const unsubscribeA = subscribeActiveHistoryShared("user-101", subscriberA);
    const unsubscribeB = subscribeActiveHistoryShared("user-101", subscriberB);

    await fetchActiveHistoryShared("user-101", { force: true });

    expect(subscriberA).toHaveBeenCalledWith([mockItem]);
    expect(subscriberB).toHaveBeenCalledWith([mockItem]);
    unsubscribeA();
    unsubscribeB();
  });

  test("bypasses a recent cache when force is true", async () => {
    await fetchActiveHistoryShared("user-101");
    await fetchActiveHistoryShared("user-101", { force: true });

    expect(apiClient.getActiveHistory).toHaveBeenCalledTimes(2);
  });
});
