import { act, fireEvent, render, screen } from "@testing-library/react";

const mockUseReducedMotion = jest.fn(() => false);
let originalMediaPlay: typeof HTMLMediaElement.prototype.play;

jest.mock("motion/react", () => ({
  ...jest.requireActual("motion/react"),
  useReducedMotion: () => mockUseReducedMotion(),
}));

import { HanoiMapMedia, HeroMedia, ProductMediaSlot } from "@/components/marketing/media-slot";

describe("landing media slots", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUseReducedMotion.mockReturnValue(false);
    originalMediaPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      writable: true,
      value: jest.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      writable: true,
      value: originalMediaPlay,
    });
    jest.useRealTimers();
  });

  it("falls back without rendering a fake SVG map when the map asset is absent", () => {
    const { container } = render(<HanoiMapMedia />);
    fireEvent.error(container.querySelector("img")!);

    expect(screen.getByText("Bản đồ khu vực Hà Nội")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("keeps an absent product screenshot as a polished public fallback", () => {
    const { container } = render(<ProductMediaSlot mediaKey="xoneChatExample" title="Ảnh chụp trợ lý X-One" description="Ảnh chụp sản phẩm thật sẽ xuất hiện ở đây khi được cung cấp." caption="Trợ lý X-One" />);
    fireEvent.error(container.querySelector("img")!);

    expect(screen.getByText("TRẢI NGHIỆM X-ONE")).toBeInTheDocument();
    expect(screen.queryByText("MEDIA SLOT")).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("/media/xone-chat-example.webp");
  });

  it("shows the video immediately with its native poster while normal-motion media loads", () => {
    const { container } = render(<HeroMedia />);
    const video = container.querySelector("video")!;

    expect(video).toHaveAttribute("poster", "/media/hero-poster.webp");
    expect(video).toHaveAttribute("data-hero-video-state", "visible");
    expect(container.querySelector("[data-hero-poster-state]"))
      .toHaveAttribute("data-hero-poster-state", "hidden");
  });

  it("requests playback on mount even when the load event was missed during hydration", async () => {
    const originalPlay = HTMLMediaElement.prototype.play;
    const play = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, writable: true, value: play });

    try {
      render(<HeroMedia />);
      await act(async () => { await Promise.resolve(); });

      expect(play).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, writable: true, value: originalPlay });
    }
  });

  it("retries a temporarily blocked autoplay request when the page becomes visible", async () => {
    const { container } = render(<HeroMedia />);
    const video = container.querySelector("video") as HTMLVideoElement;
    const play = jest.fn()
      .mockRejectedValueOnce(new Error("autoplay blocked while inactive"))
      .mockResolvedValueOnce(undefined);
    video.play = play;

    fireEvent.canPlay(video);
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector("[data-hero-poster-state]"))
      .toHaveAttribute("data-hero-poster-state", "visible");

    fireEvent(document, new Event("visibilitychange"));
    await act(async () => { await Promise.resolve(); });

    expect(play).toHaveBeenCalledTimes(2);
  });

  it("shows video immediately when playback starts", () => {
    const { container } = render(<HeroMedia />);
    const video = container.querySelector("video")!;

    fireEvent.playing(video);

    expect(video).toHaveAttribute("data-hero-video-state", "visible");
    expect(container.querySelector("[data-hero-poster-state]"))
      .toHaveAttribute("data-hero-poster-state", "hidden");
  });

  it("crossfades from video to poster, holds, then restarts and fades video back in", () => {
    const { container } = render(<HeroMedia />);
    const video = container.querySelector("video") as HTMLVideoElement;
    video.play = jest.fn().mockResolvedValue(undefined);

    fireEvent.playing(video);
    fireEvent.ended(video);

    expect(container.querySelector("[data-hero-poster-state]"))
      .toHaveAttribute("data-hero-poster-state", "visible");
    expect(video).toHaveAttribute("data-hero-video-state", "waiting");

    act(() => { jest.advanceTimersByTime(1999); });
    expect(video.play).not.toHaveBeenCalled();

    act(() => { jest.advanceTimersByTime(1); });
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toBe(0);
    expect(video).toHaveAttribute("data-hero-video-state", "waiting");
    expect(container.querySelector("[data-hero-poster-state]"))
      .toHaveAttribute("data-hero-poster-state", "visible");

    fireEvent.playing(video);
    expect(video).toHaveAttribute("data-hero-video-state", "visible");
    expect(container.querySelector("[data-hero-poster-state]"))
      .toHaveAttribute("data-hero-poster-state", "hidden");
  });

  it("falls back to the poster when video playback fails", () => {
    const { container } = render(<HeroMedia />);
    const video = container.querySelector("video")!;

    fireEvent.error(video);

    expect(container.querySelector("video")).not.toBeInTheDocument();
    expect(container.querySelector("[data-hero-poster-state]"))
      .toHaveAttribute("data-hero-poster-state", "visible");
  });

  it("keeps the poster visible when autoplay is rejected", async () => {
    const { container } = render(<HeroMedia />);
    const video = container.querySelector("video") as HTMLVideoElement;
    video.play = jest.fn().mockRejectedValue(new Error("autoplay blocked"));

    await act(async () => {
      fireEvent.canPlay(video);
      await Promise.resolve();
    });

    expect(container.querySelector("video")).toBeInTheDocument();
    expect(container.querySelector("[data-hero-poster-state]"))
      .toHaveAttribute("data-hero-poster-state", "visible");
  });

  it("uses the poster without starting video under reduced motion", () => {
    mockUseReducedMotion.mockReturnValue(true);
    const { container } = render(<HeroMedia />);

    expect(container.querySelector("video")).not.toBeInTheDocument();
    expect(container.querySelector("[data-hero-poster-state]"))
      .toHaveAttribute("data-hero-poster-state", "visible");
  });
});
