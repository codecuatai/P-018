import { render } from "@testing-library/react";

import { HeroNetwork } from "@/components/marketing/hero-network";

describe("HeroNetwork", () => {
  it("removes decorative travelling signals when the user requests reduced motion", () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
      }),
    });

    const { container } = render(<HeroNetwork />);

    expect(container.querySelectorAll(".signal")).toHaveLength(0);
  });
});
