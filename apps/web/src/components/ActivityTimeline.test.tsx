import { fireEvent, render, screen } from "@testing-library/react";

import { ActivityTimeline } from "./ActivityTimeline";
import type { ActivityEntry } from "../types";

const entries: ActivityEntry[] = [
  { id: "a", service: "restaurant", label: "Nhà hàng", step: "Đặt bàn", status: "completed" },
  { id: "b", service: "ride", label: "Chuyến xe", step: "Đang tìm tài xế", status: "retrying" },
];

describe("ActivityTimeline", () => {
  it("renders per-service rows with their status labels and disclosure attributes", () => {
    const onToggle = jest.fn();
    render(<ActivityTimeline entries={entries} open onToggle={onToggle} />);
    const toggle = screen.getByRole("button", { name: "Thu gọn hoạt động" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const contentId = toggle.getAttribute("aria-controls");
    const content = document.getElementById(String(contentId));
    expect(content).not.toBeNull();
    expect(screen.getByText("Đã hoàn thành")).toBeInTheDocument();
    expect(screen.getByText("Đang thử lại")).toBeInTheDocument();
    expect(screen.getByText("Nhà hàng")).toBeInTheDocument();
    expect(screen.getByText("Chuyến xe")).toBeInTheDocument();
  });

  it("returns keyboard focus to the toggle when collapsing with focus inside", () => {
    const onToggle = jest.fn();
    render(<ActivityTimeline entries={entries} open onToggle={onToggle} />);
    const toggle = screen.getByRole("button", { name: "Thu gọn hoạt động" });
    const contentId = toggle.getAttribute("aria-controls");
    const content = document.getElementById(String(contentId));

    const li = content!.querySelector("li") as HTMLElement;
    li.setAttribute("tabindex", "-1");
    li.focus();
    expect(document.activeElement).toBe(li);
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(toggle);
  });

  it("renders nothing when there are no entries", () => {
    const { container } = render(<ActivityTimeline entries={[]} open onToggle={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
