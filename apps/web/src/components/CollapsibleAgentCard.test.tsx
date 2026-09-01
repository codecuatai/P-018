import { fireEvent, render, screen } from "@testing-library/react";

import { CollapsibleAgentCard } from "./CollapsibleAgentCard";

describe("CollapsibleAgentCard", () => {
  it("expands by default and exposes disclosure attributes", () => {
    render(
      <CollapsibleAgentCard label="Chuyến xe" title="Ước tính chuyến đi">
        <p>Nội dung chuyến xe</p>
      </CollapsibleAgentCard>,
    );

    const toggle = screen.getByRole("button", { name: "Thu gọn" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const contentId = toggle.getAttribute("aria-controls");
    expect(contentId).toBeTruthy();
    const content = document.getElementById(String(contentId));
    expect(content).not.toBeNull();
    expect(content).toHaveTextContent("Nội dung chuyến xe");
    expect(content).not.toHaveAttribute("inert");
  });

  it("collapses visually without unmounting the children", () => {
    const { container } = render(
      <CollapsibleAgentCard label="Đặt bàn" title="Xác nhận đặt bàn">
        <label><input type="checkbox" /> Tôi xác nhận</label>
      </CollapsibleAgentCard>,
    );

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Thu gọn" }));

    const expand = screen.getByRole("button", { name: "Hiện tất cả" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector("input")).not.toBeNull();
    expect(checkbox).toBeChecked();
  });

  it("shows the summary and status while collapsed and returns focus to the toggle", () => {
    render(
      <CollapsibleAgentCard label="Lịch khám" title="Lịch khám phù hợp" status="Đã xác nhận" summary="2 khung giờ khả dụng">
        <button type="button">Chọn lịch</button>
      </CollapsibleAgentCard>,
    );

    expect(screen.queryByText("2 khung giờ khả dụng")).not.toBeInTheDocument();

    screen.getByRole("button", { name: "Chọn lịch" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Thu gọn" }));

    const expand = screen.getByRole("button", { name: "Hiện tất cả" });
    expect(screen.getByText("2 khung giờ khả dụng")).toBeInTheDocument();
    expect(screen.getByText("Đã xác nhận")).toBeInTheDocument();
    expect(document.activeElement).toBe(expand);
  });

  it("keeps each card's collapse state independent", () => {
    render(
      <>
        <CollapsibleAgentCard label="Nhà hàng" title="Quán A"><p>Nội dung A</p></CollapsibleAgentCard>
        <CollapsibleAgentCard label="Chuyến xe" title="Xe B"><p>Nội dung B</p></CollapsibleAgentCard>
      </>,
    );

    const toggles = screen.getAllByRole("button", { name: "Thu gọn" });
    expect(toggles).toHaveLength(2);

    fireEvent.click(toggles[0]!);

    expect(screen.getAllByRole("button", { name: "Thu gọn" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Hiện tất cả" })).toHaveLength(1);
    expect(screen.getByText("Nội dung B")).toBeInTheDocument();
  });

  it("restores the expanded default when a card is freshly mounted again", () => {
    const { rerender } = render(<CollapsibleAgentCard key="first" label="Đồ ăn" title="Món ăn"><p>Nội dung</p></CollapsibleAgentCard>);
    fireEvent.click(screen.getByRole("button", { name: "Thu gọn" }));
    expect(screen.getByRole("button", { name: "Hiện tất cả" })).toBeInTheDocument();

    rerender(<CollapsibleAgentCard key="second" label="Đồ ăn" title="Món ăn"><p>Nội dung</p></CollapsibleAgentCard>);
    expect(screen.getByRole("button", { name: "Thu gọn" })).toBeInTheDocument();
  });
});
