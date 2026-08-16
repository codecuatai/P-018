import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("contains exactly four selectable services in the floating composition", () => {
    render(<LandingPage />);
    const services = screen.getByRole("region", { name: "Những việc bạn cần mỗi ngày, bắt đầu từ một chỗ." });

    const serviceButtons = within(services).getAllByRole("button", { name: /Chọn dịch vụ/ });
    expect(serviceButtons).toHaveLength(4);
    expect(within(services).getByRole("button", { name: "Chọn dịch vụ Đồ ăn" })).toBeInTheDocument();
    expect(within(services).getByRole("button", { name: "Chọn dịch vụ Chuyến xe" })).toBeInTheDocument();
    expect(within(services).getByRole("button", { name: "Chọn dịch vụ Nhà hàng" })).toBeInTheDocument();
    expect(within(services).getByRole("button", { name: "Chọn dịch vụ Lịch khám" })).toBeInTheDocument();
  });

  it("updates the selected service copy without autoplay", () => {
    render(<LandingPage />);
    const services = screen.getByRole("region", { name: "Những việc bạn cần mỗi ngày, bắt đầu từ một chỗ." });
    const restaurant = within(services).getByRole("button", { name: "Chọn dịch vụ Nhà hàng" });
    const composition = services.querySelector("[data-service-composition]")!;

    expect(composition).toHaveAttribute("data-service-autoplay", "false");
    expect(composition).toHaveAttribute("data-service-orbit", "false");
    expect(screen.queryByText("Đang xem")).not.toBeInTheDocument();
    expect(screen.queryByText("Chọn một thẻ để xem X-One giữ mạch việc của bạn.")).not.toBeInTheDocument();

    fireEvent.click(restaurant);

    expect(restaurant).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Tìm nhà hàng, chọn thời gian và giữ bàn trước khi xác nhận.")).toBeInTheDocument();
  });

  it("uses the multi-service conversation framing and final editorial scene", () => {
    render(<LandingPage />);

    expect(screen.getByRole("heading", { name: "Một yêu cầu có thể gồm nhiều việc." })).toBeInTheDocument();
    expect(screen.getByText("Tối nay đặt bàn cho 2 người gần Hồ Gươm, rồi gọi xe đưa tôi tới đó.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Một nơi để bắt đầu/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đăng nhập" })).not.toBeInTheDocument();
  });

  it("removes the hero kicker, keeps the desktop title as two semantic lines, and gives the service visual its own replay owner", () => {
    render(<LandingPage />);

    expect(screen.queryByText("X-ONE / TRỢ LÝ DỊCH VỤ HẰNG NGÀY")).not.toBeInTheDocument();
    const title = screen.getByRole("heading", { name: "Một yêu cầu. Nhiều việc được kết nối." });
    expect(title.querySelectorAll("span")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Những việc bạn cần mỗi ngày, bắt đầu từ một chỗ." }).querySelector("[data-service-composition]"))
      .toHaveAttribute("data-service-visible", "true");
  });

  it("keeps public landing copy consumer-facing", () => {
    render(<LandingPage />);
    const publicCopy = screen.getByRole("main").textContent?.toLowerCase() ?? "";

    expect(publicCopy).not.toContain("phase");
    expect(publicCopy).not.toContain("lớp minh hoạ marketing");
    expect(publicCopy).not.toContain("chi tiết kỹ thuật");
  });

  it("renders four safety rows with equal structure and no emphasized first row", () => {
    render(<LandingPage />);
    const safetyHeading = screen.getByRole("heading", { name: "Việc quan trọng luôn chờ bạn xác nhận." });
    const safetySection = safetyHeading.closest("section")!;
    const rows = safetySection.querySelectorAll(".safetyChecklistItem");

    expect(rows).toHaveLength(4);
    expect(safetySection.querySelector(".safetyWipe")).not.toBeInTheDocument();
    rows.forEach((row) => {
      expect(row.querySelector(".safetyIcon")).toBeInTheDocument();
      expect(row.querySelector("strong")).not.toBeInTheDocument();
    });
  });

  it("keeps scene content immediately accessible when reduced motion is enabled", async () => {
    setReducedMotion(true);
    render(<RevealScene><p>Thông tin vẫn hiển thị</p></RevealScene>);

    await waitFor(() => expect(screen.getByText("Thông tin vẫn hiển thị")).toBeVisible());
    expect(screen.getByText("Thông tin vẫn hiển thị").closest("[data-motion-scene]")).toBeInTheDocument();
  });

  it("keeps the replay opt-in explicit while the primitive default stays safe", () => {
    render(<RevealScene><p>One shot</p></RevealScene>);
    expect(screen.getByText("One shot").closest("[data-motion-scene]")).toHaveAttribute("data-replay-on-reenter", "false");
  });
});
