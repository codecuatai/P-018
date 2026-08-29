import { act, fireEvent, render, screen } from "@testing-library/react";

import { AgentProgressIndicator } from "./AgentProgressIndicator";
import type { ActivityEntry } from "../types";

describe("AgentProgressIndicator", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders the current high-level step and an elapsed timer", () => {
    render(<AgentProgressIndicator startedAt={Date.now()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Đang hiểu yêu cầu");
    expect(screen.getByText("Đã chờ 0 giây")).toBeInTheDocument();
  });

  it("keeps the ticking timer outside the live region so screen readers are not spammed", () => {
    render(<AgentProgressIndicator startedAt={Date.now()} />);
    const status = screen.getByRole("status");
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(status).toHaveTextContent("Đang hiểu yêu cầu");
    expect(screen.getByText("Đã chờ 1 giây")).toBeInTheDocument();
    expect(status).not.toHaveTextContent("giây");
  });

  it("advances through generic stages as elapsed time grows", () => {
    render(<AgentProgressIndicator startedAt={Date.now()} />);
    act(() => {
      // 2000ms crosses the 1500ms fetching threshold on a 1s tick.
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Đang lấy dữ liệu dịch vụ");
  });

  it("switches to the long-wait state after the threshold", () => {
    render(<AgentProgressIndicator startedAt={Date.now()} />);
    act(() => {
      jest.advanceTimersByTime(15000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Lâu hơn dự kiến");
  });

  it("exposes an expandable activity timeline with disclosure attributes", () => {
    render(<AgentProgressIndicator startedAt={Date.now()} />);
    const toggle = screen.getByRole("button", { name: "Xem hoạt động" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const contentId = toggle.getAttribute("aria-controls");
    const content = document.getElementById(String(contentId));
    expect(content).not.toBeNull();
    expect(content).toHaveAttribute("inert");

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Thu gọn hoạt động" })).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(String(contentId))).not.toHaveAttribute("inert");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("shows which parts completed and which failed for partial success activity", () => {
    const entries: ActivityEntry[] = [
      { id: "c1", service: "restaurant", label: "Nhà hàng", step: "Đặt bàn tại Quán X", status: "completed" },
      { id: "e1", service: "ride", label: "Chuyến xe", step: "Không thể đặt chuyến xe", status: "error", detail: "Chưa có tài xế." },
    ];
    render(<AgentProgressIndicator startedAt={Date.now()} activity={entries} />);
    fireEvent.click(screen.getByRole("button", { name: "Xem hoạt động" }));
    expect(screen.getByText("Đặt bàn tại Quán X")).toBeInTheDocument();
    expect(screen.getByText("Không thể đặt chuyến xe")).toBeInTheDocument();
    expect(screen.getByText("Đã hoàn thành")).toBeInTheDocument();
    expect(screen.getByText("Có lỗi")).toBeInTheDocument();
  });

  it("shows retry and stop only after long wait and only when handlers are supplied", () => {
    const onRetry = jest.fn();
    const onStop = jest.fn();
    render(<AgentProgressIndicator startedAt={Date.now()} onRetry={onRetry} onStop={onStop} />);
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dừng yêu cầu" })).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(15000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    fireEvent.click(screen.getByRole("button", { name: "Dừng yêu cầu" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("never shows retry or stop when no handlers are provided", () => {
    render(<AgentProgressIndicator startedAt={Date.now()} />);
    act(() => {
      jest.advanceTimersByTime(15000);
    });
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dừng yêu cầu" })).not.toBeInTheDocument();
  });

  it("clears its interval when unmounted", () => {
    const { unmount } = render(<AgentProgressIndicator startedAt={Date.now()} />);
    unmount();
    expect(() => {
      act(() => {
        jest.advanceTimersByTime(3000);
      });
    }).not.toThrow();
  });
});
