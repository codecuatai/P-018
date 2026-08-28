import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminDashboard } from "@/features/admin/admin-dashboard";
import * as apiClient from "@/lib/api-client";

jest.mock("@/lib/api-client");

describe("AdminDashboard", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (apiClient.getAdminSummary as jest.Mock).mockResolvedValue({
      counts: { total_users: 10, payments: 5, refunds: 1, open_support_tickets: 2, failed_workflows: 0, partial_success_workflows: 0 },
      domains: [
        { domain: "ride", status: "healthy", data: { counts: { active_rides: 3 } } },
        { domain: "food", status: "degraded", error: "DB_DOWN" },
      ],
      health: {
        items: [
          { service: "api-gateway", status: "healthy", latency_ms: 12, checked_at: new Date().toISOString(), detail: { database: "connected", workflow_worker: "healthy" } },
          { service: "food-service", status: "degraded", latency_ms: 45, checked_at: new Date().toISOString(), detail: { database: "unhealthy" } },
          { service: "ride-service", status: "unavailable", latency_ms: 500, checked_at: new Date().toISOString(), error: "HTTP_500" },
        ],
      },
    });

    (apiClient.getAdminUsers as jest.Mock).mockResolvedValue({ items: [], total: 0 });
    (apiClient.getAdminTransactions as jest.Mock).mockResolvedValue({ items: [], partial: false, unavailable: [] });
    (apiClient.getAdminPayments as jest.Mock).mockResolvedValue({ payments: { items: [], total: 0 }, refunds: { items: [], total: 0 } });
    (apiClient.getAdminWorkflows as jest.Mock).mockResolvedValue({ items: [], total: 0 });
    (apiClient.getAdminDatasets as jest.Mock).mockResolvedValue({ items: [] });
    (apiClient.getAdminSystemHealth as jest.Mock).mockResolvedValue({
      items: [
        { service: "api-gateway", status: "healthy", latency_ms: 12, checked_at: new Date().toISOString(), detail: { database: "connected", workflow_worker: "healthy" } },
        { service: "food-service", status: "degraded", latency_ms: 45, checked_at: new Date().toISOString(), detail: { database: "unhealthy" } },
        { service: "ride-service", status: "unavailable", latency_ms: 500, checked_at: new Date().toISOString(), error: "HTTP_500" },
      ],
    });
    (apiClient.getAdminSupportTickets as jest.Mock).mockResolvedValue({ items: [], total: 0 });
    (apiClient.getAdminAllFeedback as jest.Mock).mockResolvedValue({ items: [], total: 0, stats: { average_rating: 5, by_domain: {} } });
    (apiClient.getAdminApiKeys as jest.Mock).mockResolvedValue({ items: [] });
    (apiClient.getAdminTokenUsage as jest.Mock).mockResolvedValue({ total_prompt_tokens: 0, total_completion_tokens: 0, total_tokens: 0, total_estimated_cost_usd: 0, by_feature: {}, by_model: {}, daily_trends: [], top_consumers: [] });
    (apiClient.getAdminLogs as jest.Mock).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
    (apiClient.getAdminUserFeedback as jest.Mock).mockResolvedValue({ items: [], total: 0 });
    (apiClient.getAdminUserServices as jest.Mock).mockResolvedValue({ user_id: "u1", ride_count: 0, food_count: 0, restaurant_count: 0, healthcare_count: 0, feedback_count: 0 });
  });

  it("renders overview metrics and system health indicators", async () => {
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Trung tâm vận hành X-One")).toBeInTheDocument();
      expect(screen.getAllByText("api-gateway").length).toBeGreaterThan(0);
      expect(screen.getAllByText("food-service").length).toBeGreaterThan(0);
      expect(screen.getAllByText("ride-service").length).toBeGreaterThan(0);
    });

    // Check status badges
    expect(screen.getAllByText("Tốt").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Suy giảm").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Lỗi").length).toBeGreaterThan(0);
  });

  it("triggers health refresh when probe button is clicked", async () => {
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getAllByText("api-gateway").length).toBeGreaterThan(0);
    });

    const probeBtn = screen.getByRole("button", { name: /Probe ngay/i });
    fireEvent.click(probeBtn);

    await waitFor(() => {
      expect(apiClient.getAdminSystemHealth).toHaveBeenCalled();
    });
  });

  it("toggles auto-refresh state without crashing", async () => {
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Auto-refresh/i)).toBeInTheDocument();
    });

    const checkbox = screen.getByLabelText(/Auto-refresh/i) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
  });

  it("allows an admin to send a customer-facing ticket reply", async () => {
    const ticket = {
      id: "ticket-admin-reply-1",
      actor_id: "user-1",
      subject: "Cần hỗ trợ",
      description: "Tôi cần kiểm tra giao dịch.",
      status: "RESOLVED" as const,
      priority: "NORMAL" as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    (apiClient.getAdminSupportTickets as jest.Mock).mockResolvedValue({ items: [ticket], total: 1 });
    (apiClient.addAdminSupportMessage as jest.Mock).mockResolvedValue({ ...ticket, events: [] });
    window.history.replaceState(null, "", "#support");

    render(<AdminDashboard />);

    const reply = await screen.findByRole("textbox", { name: "Phản hồi ticket ticket-admin-reply-1" });
    fireEvent.change(reply, { target: { value: "Cảm ơn bạn đã liên hệ với X-One." } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi phản hồi" }));

    await waitFor(() => expect(apiClient.addAdminSupportMessage).toHaveBeenCalledWith("ticket-admin-reply-1", "Cảm ơn bạn đã liên hệ với X-One."));
    window.history.replaceState(null, "", "");
  });
});
