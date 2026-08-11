import { render } from "@testing-library/react";

const mockUseReducedMotion = jest.fn(() => false);

jest.mock("motion/react", () => ({
  ...jest.requireActual("motion/react"),
  useReducedMotion: () => mockUseReducedMotion(),
  useInView: () => true,
}));

import { HanoiRouteStory, MAP_DESTINATIONS, MAP_ROUTES } from "@/components/marketing/route-story";

describe("HanoiRouteStory", () => {
  it("draws seven deterministic destinations and seven base/tracer routes from the lower-right origin", () => {
    render(<HanoiRouteStory />);
    const overlay = document.querySelector("[data-route-motion]")!;
    const origin = overlay.querySelector("[data-origin-marker]")!;

    expect(overlay).toHaveAttribute("aria-hidden", "true");
    expect(MAP_DESTINATIONS).toHaveLength(7);
    expect(MAP_ROUTES).toHaveLength(7);
    expect(overlay.querySelectorAll("[data-route-base]")).toHaveLength(7);
    expect(overlay.querySelectorAll("[data-route-tracer]")).toHaveLength(7);
    expect(overlay.querySelectorAll("[data-destination-marker]")).toHaveLength(7);
    expect(origin.querySelector("circle")).toHaveAttribute("cx", "870");
    expect(origin.querySelector("circle")).toHaveAttribute("cy", "520");
    expect(overlay).toHaveAttribute("data-route-repeat", "true");
  });

  it("marks the map as reduced motion without removing the static route scene", () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<HanoiRouteStory />);

    expect(document.querySelector("[data-route-motion]")).toHaveAttribute("data-route-motion", "reduced");
    expect(document.querySelectorAll("[data-route-base]")).toHaveLength(7);
    expect(document.querySelector("[data-route-motion]")).toHaveAttribute("data-route-repeat", "false");
  });
});
