import { act, fireEvent, render, screen } from "@testing-library/react";

const mockUseReducedMotion = jest.fn(() => false);
const mockUseInView = jest.fn(() => true);

jest.mock("motion/react", () => ({
  ...jest.requireActual("motion/react"),
  useReducedMotion: () => mockUseReducedMotion(),
  useInView: () => mockUseInView(),
}));

import { HowItWorksCarousel } from "@/components/marketing/how-it-works/how-it-works-carousel";

describe("HowItWorksCarousel", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUseReducedMotion.mockReturnValue(false);
    mockUseInView.mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("starts with the ask stage and exposes exactly three semantic stages", () => {
    render(<HowItWorksCarousel />);

    expect(screen.getByRole("heading", { name: "Nói điều bạn cần" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("switches immediately when a labeled stage is selected", () => {
    render(<HowItWorksCarousel />);

    fireEvent.click(screen.getByRole("tab", { name: "Xác nhận" }));

    expect(screen.getByRole("heading", { name: "Xác nhận" })).toBeInTheDocument();
    expect(screen.getByText("Chờ bạn xác nhận")).toBeInTheDocument();
  });

  it("auto-advances in order and pauses while hovered", () => {
    const { container } = render(<HowItWorksCarousel />);
    const carousel = container.querySelector("[data-how-it-works-carousel]")!;

    act(() => { jest.advanceTimersByTime(2200); });
    expect(screen.getByRole("heading", { name: "Kết nối các bước" })).toBeInTheDocument();

    fireEvent.mouseEnter(carousel);
    act(() => { jest.advanceTimersByTime(6000); });
    expect(screen.getByRole("heading", { name: "Kết nối các bước" })).toBeInTheDocument();

    fireEvent.mouseLeave(carousel);
    act(() => { jest.advanceTimersByTime(2200); });
    expect(screen.getByRole("heading", { name: "Xác nhận" })).toBeInTheDocument();
  });

  it("pauses for keyboard focus and when outside the viewport", () => {
    const { container, rerender } = render(<HowItWorksCarousel />);
    const carousel = container.querySelector("[data-how-it-works-carousel]")!;

    fireEvent.focus(carousel);
    act(() => { jest.advanceTimersByTime(4400); });
    expect(screen.getByRole("heading", { name: "Nói điều bạn cần" })).toBeInTheDocument();

    fireEvent.blur(carousel);
    act(() => { jest.advanceTimersByTime(2200); });
    expect(screen.getByRole("heading", { name: "Kết nối các bước" })).toBeInTheDocument();

    mockUseInView.mockReturnValue(false);
    rerender(<HowItWorksCarousel />);
    act(() => { jest.advanceTimersByTime(6600); });
    expect(screen.getByRole("heading", { name: "Kết nối các bước" })).toBeInTheDocument();

    mockUseInView.mockReturnValue(true);
    rerender(<HowItWorksCarousel />);
    act(() => { jest.advanceTimersByTime(2200); });
    expect(screen.getByRole("heading", { name: "Xác nhận" })).toBeInTheDocument();
  });

  it("moves with accessible previous and next controls and wraps", () => {
    render(<HowItWorksCarousel />);

    fireEvent.click(screen.getByRole("button", { name: "Bước trước" }));
    expect(screen.getByRole("heading", { name: "Xác nhận" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Bước tiếp theo" }));
    expect(screen.getByRole("heading", { name: "Nói điều bạn cần" })).toBeInTheDocument();
  });

  it("disables automatic progression for reduced motion", () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<HowItWorksCarousel />);

    act(() => { jest.advanceTimersByTime(9000); });

    expect(screen.getByRole("heading", { name: "Nói điều bạn cần" })).toBeInTheDocument();
  });
});
