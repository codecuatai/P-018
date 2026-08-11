import { render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock("motion/react", () => ({
  ...jest.requireActual("motion/react"),
  useReducedMotion: () => true,
}));

jest.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ status: "unauthenticated" }),
}));

jest.mock("@/components/marketing/marketing-auth", () => ({
  useMarketingAuth: () => ({ openAuth: jest.fn() }),
  MarketingAuthTrigger: ({ children, className }: { children: ReactNode; className?: string }) => <button className={className} type="button">{children}</button>,
}));

import { LandingPage } from "@/components/marketing/landing-page";
import { RevealScene } from "@/components/marketing/scroll-focus-scene";

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? matches : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }),
  });
}

describe("landing visual contract", () => {
  beforeEach(() => setReducedMotion(false));

  it("contains exactly the four supported service cards", () => {
    render(<LandingPage />);
    const services = screen.getByRole("region", { name: "Mọi nhu cầu hằng ngày, bắt đầu từ một nơi." });

    expect(within(services).getAllByRole("article")).toHaveLength(4);
    expect(within(services).getByRole("heading", { name: "Đồ ăn" })).toBeInTheDocument();
    expect(within(services).getByRole("heading", { name: "Chuyến xe" })).toBeInTheDocument();
    expect(within(services).getByRole("heading", { name: "Nhà hàng" })).toBeInTheDocument();
    expect(within(services).getByRole("heading", { name: "Lịch khám" })).toBeInTheDocument();
  });

  it("keeps scene content immediately accessible when reduced motion is enabled", async () => {
    setReducedMotion(true);
    render(<RevealScene><p>Thông tin vẫn hiển thị</p></RevealScene>);

    await waitFor(() => expect(screen.getByText("Thông tin vẫn hiển thị")).toBeVisible());
    expect(screen.getByText("Thông tin vẫn hiển thị").closest("[data-motion-scene]")).toBeInTheDocument();
  });
});
