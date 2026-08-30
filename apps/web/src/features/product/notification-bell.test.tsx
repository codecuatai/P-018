import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockGetUnreadNotificationCount = jest.fn();
const mockListNotifications = jest.fn();
const mockMarkAllNotificationsRead = jest.fn();
const mockListConversations = jest.fn();

jest.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: { email: "user@example.com", sub: "user-123" },
    logout: jest.fn(),
  }),
}));

jest.mock("@/lib/api-client", () => ({
  getUnreadNotificationCount: (...args: unknown[]) => mockGetUnreadNotificationCount(...args),
  listNotifications: (...args: unknown[]) => mockListNotifications(...args),
  markAllNotificationsRead: (...args: unknown[]) => mockMarkAllNotificationsRead(...args),
  listConversations: (...args: unknown[]) => mockListConversations(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/app",
}));

import { AppShell } from "./app-shell";

describe("NotificationBell behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListConversations.mockResolvedValue({ items: [] });
  });

  it("shows red badge with unread count and keeps it consistent while rendering notification history", async () => {
    mockGetUnreadNotificationCount
      .mockResolvedValueOnce({ unread_count: 2 })
      .mockResolvedValue({ unread_count: 0 });

    mockListNotifications.mockResolvedValueOnce({
      items: [
        { id: "notif-1", title: "Tài xế đã đến điểm đón", body: "Tài xế đang chờ bạn", status: "UNREAD", created_at: new Date().toISOString() },
        { id: "notif-2", title: "Lịch khám đã được xác nhận", body: "Xem chi tiết trong lịch sử", status: "READ", created_at: new Date().toISOString() },
      ],
      unread_count: 1,
    });
    mockMarkAllNotificationsRead.mockResolvedValue({ updated: 1 });

    render(<AppShell><div>App Content</div></AppShell>);

    // 1. Initially badge shows count 2
    await waitFor(() => {
      expect(screen.getAllByText("2")[0]).toBeInTheDocument();
    });

    const bellBtn = screen.getAllByRole("button", { name: /Thông báo/i })[0];

    // 2. User clicks bell to view notifications
    await act(async () => {
      fireEvent.click(bellBtn);
    });

    // Popover shows both notifications
    const unreadItem = screen.getByText("Tài xế đã đến điểm đón").closest(".notif-item");
    const readItem = screen.getByText("Lịch khám đã được xác nhận").closest(".notif-item");

    expect(unreadItem).toHaveClass("notif-unread"); // Blue background
    expect(readItem).not.toHaveClass("notif-unread"); // White background

    expect(mockMarkAllNotificationsRead).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Thông báo, 1 chưa đọc")).toBeInTheDocument();

    // 3. User closes popover
    const closeBtn = screen.getByRole("button", { name: "Đóng" });
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    // 4. When the source later reports them read, the popup reflects that state.
    mockListNotifications.mockResolvedValueOnce({
      items: [
        { id: "notif-1", title: "Tài xế đã đến điểm đón", body: "Tài xế đang chờ bạn", status: "READ", created_at: new Date().toISOString() },
        { id: "notif-2", title: "Lịch khám đã được xác nhận", body: "Xem chi tiết trong lịch sử", status: "READ", created_at: new Date().toISOString() },
      ],
      unread_count: 0,
    });

    await act(async () => {
      fireEvent.click(bellBtn);
    });

    // Both items are still there and neither has notif-unread class (both are white background)
    await waitFor(() => {
      const item1 = screen.getByText("Tài xế đã đến điểm đón").closest(".notif-item");
      const item2 = screen.getByText("Lịch khám đã được xác nhận").closest(".notif-item");
      expect(item1).not.toHaveClass("notif-unread");
      expect(item2).not.toHaveClass("notif-unread");
    });
  });

  it("shows a loading state instead of an empty notification message while the list is pending", async () => {
    mockGetUnreadNotificationCount.mockResolvedValue({ unread_count: 4 });
    let resolveNotifications: ((value: { items: never[]; unread_count: number }) => void) | undefined;
    mockListNotifications.mockImplementationOnce(() => new Promise((resolve) => { resolveNotifications = resolve; }));

    render(<AppShell><div>App Content</div></AppShell>);
    const bellBtn = screen.getAllByRole("button", { name: /Thông báo/i })[0];
    await act(async () => { fireEvent.click(bellBtn); });

    expect(screen.getByRole("status")).toHaveTextContent("Đang tải thông báo…");
    expect(screen.queryByText("Không có thông báo mới.")).not.toBeInTheDocument();

    await act(async () => { resolveNotifications?.({ items: [], unread_count: 0 }); });
    await waitFor(() => expect(screen.getByText("Không có thông báo mới.")).toBeInTheDocument());
  });
});
