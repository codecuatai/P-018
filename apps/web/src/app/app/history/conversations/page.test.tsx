import { render, screen, waitFor } from "@testing-library/react";

const listConversations = jest.fn();

jest.mock("@/lib/api-client", () => ({ errorText: (reason: unknown) => String(reason), listConversations: (...args: unknown[]) => listConversations(...args), updateConversation: jest.fn(), deleteConversation: jest.fn() }));
jest.mock("@/lib/conversation-events", () => ({ emitConversationsChanged: jest.fn() }));

import ConversationHistoryPage from "./page";

describe("ConversationHistoryPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listConversations.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10, has_more: false });
  });

  it("loads one 10-item conversation page without requesting service history", async () => {
    render(<ConversationHistoryPage />);
    await waitFor(() => expect(listConversations).toHaveBeenCalledWith(true, undefined, 1, 10));
    expect(await screen.findByRole("link", { name: "Hoạt động dịch vụ" })).toHaveAttribute("href", "/app/history");
  });
});
