import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockReplace = jest.fn();
const mockGetHistoryDetail = jest.fn();
const mockListSupportTickets = jest.fn();
const mockCreateSupportTicket = jest.fn();
const mockGetSupportTicket = jest.fn();
const mockAddSupportMessage = jest.fn();

let searchParams = new URLSearchParams("?resource_type=ride_booking&resource_id=booking-123456789");

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => searchParams,
}));

jest.mock("@/lib/api-client", () => ({
  addSupportMessage: (...args: unknown[]) => mockAddSupportMessage(...args),
  createSupportTicket: (...args: unknown[]) => mockCreateSupportTicket(...args),
  errorText: (reason: unknown) => reason instanceof Error ? reason.message : String(reason),
  getHistoryDetail: (...args: unknown[]) => mockGetHistoryDetail(...args),
  getSupportTicket: (...args: unknown[]) => mockGetSupportTicket(...args),
  listSupportTickets: (...args: unknown[]) => mockListSupportTickets(...args),
}));

import SupportPage from "./page";

const booking = {
  id: "booking-123456789",
  status: "COMPLETED",
  start_at: "2026-08-28T09:30:00Z",
  pickup_address: "12 Trần Hưng Đạo",
  dropoff_address: "Sân bay Nội Bài",
};

describe("SupportPage linked transaction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParams = new URLSearchParams("?resource_type=ride_booking&resource_id=booking-123456789");
    mockListSupportTickets.mockResolvedValue({ items: [] });
    mockGetHistoryDetail.mockResolvedValue(booking);
    mockCreateSupportTicket.mockResolvedValue({
      id: "ticket-1",
      actor_id: "actor-1",
      resource_type: "ride_booking",
      resource_id: "booking-123456789",
      subject: "Cần hỗ trợ về giao dịch",
      description: "Mình cần hỗ trợ về giao dịch này.",
      status: "OPEN",
      priority: "NORMAL",
      created_at: "2026-08-28T09:35:00Z",
      updated_at: "2026-08-28T09:35:00Z",
      events: [],
    });
  });

  it("loads and shows a transaction summary before sending", async () => {
    render(<SupportPage />);

    await waitFor(() => expect(screen.getByText("12 Trần Hưng Đạo → Sân bay Nội Bài")).toBeInTheDocument());

    expect(screen.getAllByText("Chuyến xe")).toHaveLength(2);
    expect(screen.getByText("Mã giao dịch")).toBeInTheDocument();
    expect(screen.getByText("booking-…6789")).toBeInTheDocument();
    expect(mockGetHistoryDetail).toHaveBeenCalledWith("ride_booking", "booking-123456789");
  });

  it("can remove the link and sends the link only while it is selected", async () => {
    const { rerender } = render(<SupportPage />);
    await waitFor(() => expect(screen.getByText("12 Trần Hưng Đạo → Sân bay Nội Bài")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Bỏ liên kết/ }));
    expect(mockReplace).toHaveBeenCalledWith("/app/support");

    searchParams = new URLSearchParams();
    rerender(<SupportPage />);
    fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Câu hỏi chung" } });
    fireEvent.change(screen.getByLabelText("Mô tả"), { target: { value: "Tôi cần được hướng dẫn." } });
    fireEvent.click(screen.getByRole("button", { name: /Gửi yêu cầu/ }));

    await waitFor(() => expect(mockCreateSupportTicket).toHaveBeenCalledWith({ subject: "Câu hỏi chung", description: "Tôi cần được hướng dẫn." }));
  });

  it("renders the linked transaction again in the created ticket detail", async () => {
    render(<SupportPage />);
    await waitFor(() => expect(screen.getByText("12 Trần Hưng Đạo → Sân bay Nội Bài")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Gửi yêu cầu/ }));

    await waitFor(() => expect(screen.getByText("GIAO DỊCH ĐÃ LIÊN KẾT")).toBeInTheDocument());
    expect(screen.getAllByText("booking-…6789")).toHaveLength(2);

    const ticketButton = screen.getByRole("button", { name: /Cần hỗ trợ về giao dịch/ });
    expect(ticketButton).toHaveAttribute("aria-expanded", "true");
    expect(ticketButton.parentElement?.querySelector("article")).toBeInTheDocument();
    fireEvent.click(ticketButton);
    expect(ticketButton).toHaveAttribute("aria-expanded", "false");
  });

  it("renders the opened ticket detail directly below the clicked ticket", async () => {
    searchParams = new URLSearchParams();
    const firstTicket = {
      id: "ticket-first",
      actor_id: "actor-1",
      subject: "Yêu cầu đầu tiên",
      description: "Mô tả yêu cầu đầu tiên.",
      status: "OPEN" as const,
      priority: "NORMAL" as const,
      created_at: "2026-08-28T09:35:00Z",
      updated_at: "2026-08-28T09:35:00Z",
      events: [],
    };
    mockListSupportTickets.mockResolvedValue({ items: [firstTicket, { ...firstTicket, id: "ticket-second", subject: "Yêu cầu thứ hai" }] });
    mockGetSupportTicket.mockResolvedValue(firstTicket);

    render(<SupportPage />);

    const firstButton = await screen.findByRole("button", { name: /Yêu cầu đầu tiên/ });
    fireEvent.click(firstButton);

    await waitFor(() => expect(firstButton).toHaveAttribute("aria-expanded", "true"));
    expect(firstButton.parentElement?.querySelector("article")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Yêu cầu thứ hai/ }).parentElement?.querySelector("article")).toBeNull();
  });
});
