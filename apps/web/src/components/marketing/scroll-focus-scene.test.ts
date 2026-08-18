import { resolveDelayedReplayActive } from "@/components/marketing/scroll-focus-scene";

describe("delayed replay visibility state", () => {
  it("keeps a replay presentation visible until it leaves the reset zone", () => {
    let active = false;

    active = resolveDelayedReplayActive(active, false, true);
    expect(active).toBe(false);

    active = resolveDelayedReplayActive(active, true, true);
    expect(active).toBe(true);

    active = resolveDelayedReplayActive(active, false, true);
    expect(active).toBe(true);

    active = resolveDelayedReplayActive(active, false, false);
    expect(active).toBe(false);

    active = resolveDelayedReplayActive(active, false, true);
    expect(active).toBe(false);

    active = resolveDelayedReplayActive(active, true, true);
    expect(active).toBe(true);
  });

  it("always keeps reduced-motion presentations visible", () => {
    expect(resolveDelayedReplayActive(false, false, false, true)).toBe(true);
  });
});
