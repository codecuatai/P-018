import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const listNotifications = jest.fn();
const markNotificationRead = jest.fn();
const markAllNotificationsRead = jest.fn();

jest.mock("@/lib/api-client", () => ({
  errorText: (reason: unknown) => String(reason),
  listNotifications: (...args: unknown[]) => listNotifications(...args),
  markNotificationRead: (...args: unknown[]) => markNotificationRead(...args),
  markAllNotificationsRead: (...args: unknown[]) => markAllNotificationsRead(...args),
}));
jest.mock("@/lib/conversation-events", () => ({ emitNotificationsChanged: jest.fn() }));

import NotificationsPage from "./page";

describe("NotificationsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listNotifications.mockResolvedValue({ items: [{ id: "notification-1", title: "Cập nhật", body: "Nội dung", status: "UNREAD", created_at: "2026-08-30T00:00:00.000Z" }], unread_count: 1, total: 1, page: 1, page_size: 20, has_more: false, partial: false, unavailable: [] });
    markNotificationRead.mockResolvedValue({ id: "notification-1", status: "READ" });
  });

  it("issues exactly one mark-read mutation for one unread item click", async () => {
    render(<NotificationsPage />);
    await screen.findByText("Cập nhật");
    fireEvent.click(screen.getByRole("button", { name: /Cập nhật/ }));
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledTimes(1));
    expect(markNotificationRead).toHaveBeenCalledWith("notification-1");
    expect(await screen.findByText("Đã đọc")).toBeInTheDocument();
  });
});
