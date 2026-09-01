import { fetchActiveHistoryShared, resetActiveHistoryPollerCache, subscribeActiveHistoryShared } from "./active-history-poller";
import * as apiClient from "@/lib/api-client";
import type { HistoryItem } from "@/types";

jest.mock("@/lib/api-client", () => ({
  getActiveHistory: jest.fn(),
}));

describe("Active History Shared Poller (Multi-tab & Multi-component)", () => {
  const mockItem: HistoryItem = {
    id: "test-item-01",
    type: "restaurant_reservation",
    title: "Dịch vụ thử nghiệm",
    status: "CONFIRMED",
    detail: "Thông tin mẫu",
    timestamp: new Date().toISOString(),
    source: "restaurant_reservation",
    resource: { id: "test-res-01" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetActiveHistoryPollerCache();
    (apiClient.getActiveHistory as jest.Mock).mockResolvedValue({ items: [mockItem] });
  });

  test("deduplicates network requests across multiple tabs/components within min fetch gap", async () => {
    // Tab 1 / Component 1 calls fetchActiveHistoryShared
    const res1 = await fetchActiveHistoryShared("user-101");
    expect(apiClient.getActiveHistory).toHaveBeenCalledTimes(1);
    expect(res1.items).toHaveLength(1);

    // Tab 2 / Component 2 calls fetchActiveHistoryShared 100ms later
    const res2 = await fetchActiveHistoryShared("user-101");

    // Network request count must STILL be 1 (deduplicated across tabs/components)
    expect(apiClient.getActiveHistory).toHaveBeenCalledTimes(1);
    expect(res2.items).toEqual(res1.items);
  });

  test("notifies all subscribers across tabs/components when fresh active history is fetched", async () => {
    const callbackTabA = jest.fn();
    const callbackTabB = jest.fn();

    const unsubscribeA = subscribeActiveHistoryShared("user-101", callbackTabA);
    const unsubscribeB = subscribeActiveHistoryShared("user-101", callbackTabB);

    await fetchActiveHistoryShared("user-101", { force: true });

    expect(callbackTabA).toHaveBeenCalledWith([mockItem]);
    expect(callbackTabB).toHaveBeenCalledWith([mockItem]);

    unsubscribeA();
    unsubscribeB();
  });

  test("bypasses cache and makes network request when force is true", async () => {
    await fetchActiveHistoryShared("user-101");
    expect(apiClient.getActiveHistory).toHaveBeenCalledTimes(1);

    await fetchActiveHistoryShared("user-101", { force: true });
    expect(apiClient.getActiveHistory).toHaveBeenCalledTimes(2);
  });

  test("coalesces overlapping forced refreshes for one user", async () => {
    let resolveRequest: ((value: { items: HistoryItem[] }) => void) | undefined;
    (apiClient.getActiveHistory as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const first = fetchActiveHistoryShared("user-101", { force: true });
    const second = fetchActiveHistoryShared("user-101", { force: true });

    expect(apiClient.getActiveHistory).toHaveBeenCalledTimes(1);
    resolveRequest?.({ items: [mockItem] });
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });
});
