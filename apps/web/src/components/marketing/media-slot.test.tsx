import { fireEvent, render, screen } from "@testing-library/react";

import { HanoiMapMedia, ProductMediaSlot } from "@/components/marketing/media-slot";

describe("landing media slots", () => {
  it("falls back without rendering a fake SVG map when the map asset is absent", () => {
    const { container } = render(<HanoiMapMedia />);
    fireEvent.error(container.querySelector("img")!);

    expect(screen.getByText("Bản đồ khu vực Hà Nội")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("keeps an absent product screenshot an explicit media slot", () => {
    const { container } = render(<ProductMediaSlot mediaKey="xoneChatExample" title="Ảnh chụp trợ lý X-One" description="Ảnh chụp sản phẩm thật sẽ xuất hiện ở đây khi được cung cấp." caption="Trợ lý X-One" />);
    fireEvent.error(container.querySelector("img")!);

    expect(screen.getByText("MEDIA SLOT")).toBeInTheDocument();
    expect(screen.getByText("/media/xone-chat-example.webp")).toBeInTheDocument();
  });
});
