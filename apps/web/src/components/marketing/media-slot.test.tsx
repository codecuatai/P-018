import { fireEvent, render, screen } from "@testing-library/react";

import { HanoiMapMedia, ProductMediaSlot } from "@/components/marketing/media-slot";

describe("landing media slots", () => {
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
});
