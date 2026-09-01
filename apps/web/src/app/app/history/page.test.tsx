import { render, screen, waitFor } from "@testing-library/react";

const listHistory = jest.fn();

jest.mock("@/lib/api-client", () => ({ errorText: (reason: unknown) => String(reason), listHistory: (...args: unknown[]) => listHistory(...args) }));

import HistoryPage from "./page";

describe("HistoryPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listHistory.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10, has_more: false, partial: false, unavailable: [] });
  });

  it("loads one 10-item service-history page without requesting conversations", async () => {
    render(<HistoryPage />);
    await waitFor(() => expect(listHistory).toHaveBeenCalledWith(expect.objectContaining({ page: 1, page_size: 10 })));
    expect(await screen.findByRole("link", { name: "Lịch sử trò chuyện" })).toHaveAttribute("href", "/app/history/conversations");
  });
});
