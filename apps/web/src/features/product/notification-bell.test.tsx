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

  it("shows red badge with unread count, marks read and hides badge when opened, and clears viewed notifications on next open", async () => {
    mockGetUnreadNotificationCount
      .mockResolvedValueOnce({ unread_count: 3 })
      .mockResolvedValue({ unread_count: 0 });
    mockListNotifications.mockResolvedValueOnce({
      items: [
        { id: "notif-1", title: "Tài xế đã đến điểm đón", body: "Tài xế đang chờ bạn", status: "UNREAD", created_at: new Date().toISOString() },
        { id: "notif-2", title: "Lịch khám đã được xác nhận", body: "Xem chi tiết trong lịch sử", status: "UNREAD", created_at: new Date().toISOString() },
      ],
      unread_count: 3,
    });
    mockMarkAllNotificationsRead.mockResolvedValue({ updated: 2 });

    render(<AppShell><div>App Content</div></AppShell>);

    // 1. Initially badge shows count 3
    await waitFor(() => {
      expect(screen.getAllByText("3")[0]).toBeInTheDocument();
    });

    const bellBtn = screen.getAllByRole("button", { name: /Thông báo/i })[0];

    // 2. User clicks bell to view notifications
    await act(async () => {
      fireEvent.click(bellBtn);
    });

    // Popover is displayed with the 2 unread notifications
    expect(screen.getByText("Tài xế đã đến điểm đón")).toBeInTheDocument();
    expect(screen.getByText("Lịch khám đã được xác nhận")).toBeInTheDocument();

    // markAllNotificationsRead was called
    expect(mockMarkAllNotificationsRead).toHaveBeenCalledTimes(1);

    // Red badge count on bell disappears (count is 0)
    await waitFor(() => {
      expect(screen.queryAllByText("3")).toHaveLength(0);
    });

    // 3. User closes popover
    const closeBtn = screen.getByRole("button", { name: "Đóng" });
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    // 4. When user re-opens the popover, listNotifications('UNREAD') returns 0 items
    mockListNotifications.mockResolvedValueOnce({
      items: [],
      unread_count: 0,
    });

    await act(async () => {
      fireEvent.click(bellBtn);
    });

    // Viewed notifications have disappeared, showing empty state
    await waitFor(() => {
      expect(screen.getByText("Không có thông báo mới.")).toBeInTheDocument();
    });
  });
});
