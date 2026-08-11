import { fireEvent, render, screen } from "@testing-library/react";

const mockUseReducedMotion = jest.fn(() => false);

jest.mock("motion/react", () => ({
  ...jest.requireActual("motion/react"),
  useReducedMotion: () => mockUseReducedMotion(),
}));

import { HanoiMapMedia, HeroMedia, ProductMediaSlot } from "@/components/marketing/media-slot";

describe("landing media slots", () => {
  beforeEach(() => mockUseReducedMotion.mockReturnValue(false));

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

  it("uses the poster without starting video under reduced motion", () => {
    mockUseReducedMotion.mockReturnValue(true);
    const { container } = render(<HeroMedia />);

    expect(container.querySelector("video")).not.toBeInTheDocument();
    expect(container.querySelector("img")).toBeInTheDocument();
  });

  it("handles the poster-crossfade loop boundary without native looping", () => {
    const { container } = render(<HeroMedia />);
    const video = container.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { configurable: true, value: 10 });
    Object.defineProperty(video, "currentTime", { configurable: true, writable: true, value: 1 });
    video.play = jest.fn().mockResolvedValue(undefined);

    fireEvent.playing(video);
    Object.defineProperty(video, "currentTime", { configurable: true, writable: true, value: 9.5 });
    fireEvent.timeUpdate(video);
    fireEvent.ended(video);
    fireEvent.playing(video);

    expect(video.loop).toBe(false);
    expect(video.play).toHaveBeenCalled();
  });
});
