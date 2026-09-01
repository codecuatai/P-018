import { act, render } from "@testing-library/react";
import { useEffect } from "react";

import { getFoodTracking } from "@/lib/api-client";
import type { FoodTracking } from "@/types";
import { resetFoodTrackingCache, useFoodTracking } from "./food-tracking-cache";

jest.mock("@/lib/api-client", () => ({ errorText: (reason: unknown) => String(reason), getFoodTracking: jest.fn() }));

const mockedGetFoodTracking = jest.mocked(getFoodTracking);

function Probe({ orderId = "food-order-1", onSnapshot }: { orderId?: string; onSnapshot: (snapshot: ReturnType<typeof useFoodTracking>) => void }) {
  const snapshot = useFoodTracking(orderId);
  useEffect(() => { onSnapshot(snapshot); }, [onSnapshot, snapshot]);
  return null;
}

function tracking(status: string): FoodTracking { return { order_id: "food-order-1", status }; }

describe("food tracking cache", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedGetFoodTracking.mockReset();
    resetFoodTrackingCache();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  afterEach(() => {
    resetFoodTrackingCache();
    jest.useRealTimers();
  });

  it("shares one request, cleans up on close, and fetches fresh state on reopen", async () => {
    mockedGetFoodTracking.mockResolvedValue(tracking("DELIVERING"));
    const first = render(<Probe onSnapshot={() => undefined} />);
    const second = render(<Probe onSnapshot={() => undefined} />);
    await act(async () => { await Promise.resolve(); });
    expect(mockedGetFoodTracking).toHaveBeenCalledTimes(1);
    first.unmount();
    second.unmount();

    render(<Probe onSnapshot={() => undefined} />);
    await act(async () => { await Promise.resolve(); });
    expect(mockedGetFoodTracking).toHaveBeenCalledTimes(2);
  });

  it("pauses while hidden, resumes with one fresh request, and never overlaps", async () => {
    let resolveFirst: ((value: FoodTracking) => void) | undefined;
    mockedGetFoodTracking.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    const view = render(<Probe onSnapshot={() => undefined} />);
    await act(async () => { await Promise.resolve(); });
    expect(mockedGetFoodTracking).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(10_000); });
    expect(mockedGetFoodTracking).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    mockedGetFoodTracking.mockResolvedValueOnce(tracking("DELIVERING"));
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => { await Promise.resolve(); });
    expect(mockedGetFoodTracking).toHaveBeenCalledTimes(2);

    await act(async () => { resolveFirst?.(tracking("PREPARING")); await Promise.resolve(); });
    await act(async () => { jest.advanceTimersByTime(2999); });
    expect(mockedGetFoodTracking).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it("keeps the newer response and last known state when a background refresh fails", async () => {
    let resolveOld: ((value: FoodTracking) => void) | undefined;
    mockedGetFoodTracking.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const snapshots: Array<ReturnType<typeof useFoodTracking>> = [];
    const view = render(<Probe onSnapshot={(snapshot) => snapshots.push(snapshot)} />);
    await act(async () => { await Promise.resolve(); });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    mockedGetFoodTracking.mockResolvedValueOnce(tracking("DELIVERING"));
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { resolveOld?.(tracking("PREPARING")); await Promise.resolve(); });
    expect(snapshots.at(-1)?.data?.status).toBe("DELIVERING");

    mockedGetFoodTracking.mockRejectedValueOnce(new Error("temporary failure"));
    await act(async () => { jest.advanceTimersByTime(3000); await Promise.resolve(); });
    expect(snapshots.at(-1)?.data?.status).toBe("DELIVERING");
    expect(snapshots.at(-1)?.error).toContain("temporary failure");
    view.unmount();
  });

  it.each(["DELIVERED", "CANCELLED", "PAYMENT_FAILED", "RESTAURANT_REJECTED", "REFUNDED"])("stops polling at %s", async (status) => {
    mockedGetFoodTracking.mockResolvedValue(tracking(status));
    const view = render(<Probe onSnapshot={() => undefined} />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { jest.advanceTimersByTime(15_000); });
    expect(mockedGetFoodTracking).toHaveBeenCalledTimes(1);
    view.unmount();
    resetFoodTrackingCache();
    mockedGetFoodTracking.mockReset();
  });
});
