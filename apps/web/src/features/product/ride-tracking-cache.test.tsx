import { act, render } from "@testing-library/react";
import { useEffect } from "react";

import { getRideTracking } from "@/lib/api-client";
import type { RideTracking } from "@/types";
import { markRideTrackingCancelled, resetRideTrackingCache, useRideTracking } from "./ride-tracking-cache";

jest.mock("@/lib/api-client", () => ({
  errorText: (reason: unknown) => String(reason),
  getRideTracking: jest.fn(),
}));

const mockedGetRideTracking = jest.mocked(getRideTracking);

function Probe({ onSnapshot }: { onSnapshot: (snapshot: ReturnType<typeof useRideTracking>) => void }) {
  const snapshot = useRideTracking("booking-1");
  useEffect(() => { onSnapshot(snapshot); }, [onSnapshot, snapshot]);
  return null;
}

describe("ride tracking cache", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedGetRideTracking.mockReset();
    resetRideTrackingCache();
  });

  afterEach(() => {
    resetRideTrackingCache();
    jest.useRealTimers();
  });

  it("polls at one second and ignores a response after its subscription is gone", async () => {
    let resolveFirst: ((value: RideTracking) => void) | undefined;
    mockedGetRideTracking.mockImplementation(() => new Promise((resolve) => { resolveFirst = resolve; }));
    const snapshots: Array<ReturnType<typeof useRideTracking>> = [];
    const view = render(<Probe onSnapshot={(snapshot) => snapshots.push(snapshot)} />);

    await act(async () => Promise.resolve());
    expect(mockedGetRideTracking).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => {
      resolveFirst?.({ booking_id: "booking-1", status: "IN_PROGRESS", progress: 0.2, eta_seconds: 600 } as RideTracking);
      await Promise.resolve();
    });
    expect(snapshots.at(-1)?.data).toBeUndefined();

    resetRideTrackingCache();
    mockedGetRideTracking.mockResolvedValueOnce({ status: "IN_PROGRESS" } as never).mockResolvedValueOnce({ status: "IN_PROGRESS" } as never);
    const nextView = render(<Probe onSnapshot={() => undefined} />);
    await act(async () => Promise.resolve());
    const callsBeforePoll = mockedGetRideTracking.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(999);
    });
    expect(mockedGetRideTracking).toHaveBeenCalledTimes(callsBeforePoll);
    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(mockedGetRideTracking).toHaveBeenCalledTimes(callsBeforePoll + 1);
    nextView.unmount();
  });

  it("stops polling immediately after a ride is cancelled", async () => {
    mockedGetRideTracking.mockResolvedValue({ booking_id: "booking-1", status: "IN_PROGRESS", progress: 0.2, eta_seconds: 600 } as RideTracking);
    const snapshots: Array<ReturnType<typeof useRideTracking>> = [];
    const view = render(<Probe onSnapshot={(snapshot) => snapshots.push(snapshot)} />);
    await act(async () => Promise.resolve());
    const callsAfterLoad = mockedGetRideTracking.mock.calls.length;

    act(() => markRideTrackingCancelled("booking-1"));

    expect(snapshots.at(-1)?.data?.status).toBe("CANCELLED");
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(mockedGetRideTracking).toHaveBeenCalledTimes(callsAfterLoad);
    view.unmount();
  });
});
