import { act, fireEvent, render, screen } from "@testing-library/react";

const mockUseReducedMotion = jest.fn(() => false);

jest.mock("motion/react", () => ({
  ...jest.requireActual("motion/react"),
  useReducedMotion: () => mockUseReducedMotion(),
}));

import { HowItWorksCarousel } from "@/components/marketing/how-it-works/how-it-works-carousel";

describe("HowItWorksCarousel", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUseReducedMotion.mockReturnValue(false);
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

    fireEvent.click(screen.getByRole("tab", { name: "Kiểm tra và xác nhận" }));

    expect(screen.getByRole("heading", { name: "Kiểm tra và xác nhận" })).toBeInTheDocument();
    expect(screen.getByText("Chờ bạn xác nhận")).toBeInTheDocument();
  });

  it("auto-advances in order and pauses while hovered", () => {
    const { container } = render(<HowItWorksCarousel />);
    const carousel = container.querySelector("[data-how-it-works-carousel]")!;

    act(() => { jest.advanceTimersByTime(4500); });
    expect(screen.getByRole("heading", { name: "Kết nối các bước" })).toBeInTheDocument();

    fireEvent.mouseEnter(carousel);
    act(() => { jest.advanceTimersByTime(9000); });
    expect(screen.getByRole("heading", { name: "Kết nối các bước" })).toBeInTheDocument();
  });

  it("disables automatic progression for reduced motion", () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<HowItWorksCarousel />);

    act(() => { jest.advanceTimersByTime(9000); });

    expect(screen.getByRole("heading", { name: "Nói điều bạn cần" })).toBeInTheDocument();
  });
});
