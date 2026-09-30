import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminDashboard } from "@/features/admin/admin-dashboard";
import * as apiClient from "@/lib/api-client";

jest.mock("@/lib/api-client");

describe("AdminDashboard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.location.hash = "";

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
    (apiClient.getOperationsAssignments as jest.Mock).mockResolvedValue({ items: [], count: 0, overdue: 0 });
    (apiClient.getOperationsProviderDocuments as jest.Mock).mockResolvedValue([]);
  });

  it("renders overview metrics and system health indicators", async () => {
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Quản trị hệ thống" })).toBeInTheDocument();
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

  it("renders user list with pagination and supports page switching and page size change", async () => {
    const mockUsers = Array.from({ length: 25 }, (_, i) => ({
      id: `user-${i + 1}`,
      email: `user${i + 1}@example.com`,
      full_name: `User ${i + 1}`,
      role: "customer" as const,
      status: "active" as const,
      created_at: new Date().toISOString(),
    }));
    (apiClient.getAdminUsers as jest.Mock).mockResolvedValue({ items: mockUsers, total: 25, page: 1, page_size: 100 });

    render(<AdminDashboard />);

    // Switch to Users tab
    const usersTabBtn = await screen.findByRole("button", { name: /Người dùng & Phân quyền/i });
    fireEvent.click(usersTabBtn);

    // Default page size is 10, so it shows Page 1 with 10 users (User 1 to User 10)
    await waitFor(() => {
      expect(screen.getByText("User 1")).toBeInTheDocument();
      expect(screen.getByText("User 10")).toBeInTheDocument();
      expect(screen.queryByText("User 11")).not.toBeInTheDocument();
    });

    expect(screen.getByText(/Trang 1\/3/i)).toBeInTheDocument();

    // Click Next button
    const nextBtn = screen.getByRole("button", { name: "Trang sau" });
    fireEvent.click(nextBtn);

    // Should now show User 11 to User 20
    expect(screen.queryByText("User 1")).not.toBeInTheDocument();
    expect(screen.getByText("User 11")).toBeInTheDocument();
    expect(screen.getByText("User 20")).toBeInTheDocument();
    expect(screen.getByText(/Trang 2\/3/i)).toBeInTheDocument();

    // Change page size to 50
    const pageSizeSelect = screen.getByLabelText("Số hàng mỗi trang");
    fireEvent.change(pageSizeSelect, { target: { value: "50" } });

    // Now all 25 users fit on 1 page
    expect(screen.getByText("User 1")).toBeInTheDocument();
    expect(screen.getByText("User 25")).toBeInTheDocument();
    expect(screen.getByText(/Trang 1\/1/i)).toBeInTheDocument();
  });

  it("allows an admin to disband (suspend) and reactivate a user account", async () => {
    const userToSuspend = {
      id: "user-target-1",
      email: "victim@example.com",
      full_name: "Target User",
      role: "customer" as const,
      status: "active" as const,
      created_at: new Date().toISOString(),
    };
    (apiClient.getAdminUsers as jest.Mock).mockResolvedValue({ items: [userToSuspend], total: 1, page: 1, page_size: 20 });
    (apiClient.updateAdminUserStatus as jest.Mock).mockResolvedValue({ ...userToSuspend, status: "suspended" });

    jest.spyOn(window, "confirm").mockReturnValue(true);

    render(<AdminDashboard />);

    const usersTabBtn = await screen.findByRole("button", { name: /Người dùng & Phân quyền/i });
    fireEvent.click(usersTabBtn);

    const suspendBtn = await screen.findByRole("button", { name: /Khóa tài khoản Target User/i });
    fireEvent.click(suspendBtn);

    await waitFor(() => {
      expect(apiClient.updateAdminUserStatus).toHaveBeenCalledWith("user-target-1", "suspended");
    });
  });

  it("hides technical modules from a manager while showing operational tabs", async () => {
    const { AuthProvider } = jest.requireMock("@/providers/auth-provider");
    void AuthProvider;

    const AuthProviderModule = jest.requireActual("@/providers/auth-provider");
    void AuthProviderModule;

    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Quản trị hệ thống" })).toBeInTheDocument();
    });

    const managerTabs = (await import("./admin-tabs")).getConsolidatedTabs("manager");
    const tabs = managerTabs.map((tab) => tab.id);
    expect(tabs).toEqual([
      "overview",
      "domain-orders",
      "dispatch",
      "payments",
      "incident-recovery",
      "support",
      "feedback",
      "provider-verification",
    ]);
    expect(tabs).not.toContain("users");
    expect(tabs).not.toContain("ai-integrations");
    expect(tabs).not.toContain("system-logs");

    // Every flat manager tab has exactly 1 subtab so the horizontal subtab control is cleanly hidden
    for (const tab of managerTabs) {
      expect(tab.subtabs.length).toBe(1);
    }

    const adminTabs = (await import("./admin-tabs")).getConsolidatedTabs("admin").map((tab) => tab.id);
    expect(adminTabs).toEqual(["overview", "users", "transactions", "ai-integrations", "support", "system-logs"]);
  });

  it("supports incident compensation modal workflow", async () => {
    (apiClient.issueAdminCompensation as jest.Mock).mockResolvedValue({
      id: "COMP-ABC123",
      voucher_code: "COMP-ABC123",
      amount: 50000,
      message: "Đã phát hành bồi thường thành công",
    });

    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Quản trị hệ thống" })).toBeInTheDocument();
    });

    // Navigate to Workflows tab
    const transTab = screen.getByRole("button", { name: /Giao dịch & Vận hành/i });
    fireEvent.click(transTab);

    // Switch to Workflow subtab
    const workflowSubtab = screen.getByRole("tab", { name: /Workflow reconciliation/i });
    fireEvent.click(workflowSubtab);

    // Click on "Bồi thường sự cố (Voucher)" button
    const compBtn = await screen.findByRole("button", { name: /Bồi thường sự cố \(Voucher\)/i });
    fireEvent.click(compBtn);

    // Check modal appears
    expect(await screen.findByText("Cấp Bồi Thường Vận Hành Ca Trực")).toBeInTheDocument();

    // Click submit
    const submitBtn = screen.getByRole("button", { name: /Xác nhận phát hành/i });
    fireEvent.submit(submitBtn.closest("form")!);

    // Check API was called and success message displayed
    await waitFor(() => {
      expect(apiClient.issueAdminCompensation).toHaveBeenCalledWith(
        "wf_manual_recovery",
        50000,
        expect.stringContaining("Bồi thường sự cố"),
      );
      expect(screen.getByText(/Phát Hành Bồi Thường Thành Công!/i)).toBeInTheDocument();
      expect(screen.getByText("COMP-ABC123")).toBeInTheDocument();
    });
  });

  it("renders dispatch operations section when dispatch subtab is selected", async () => {
    (apiClient.getOperationsAssignments as jest.Mock).mockResolvedValue({
      items: [
        {
          id: "asg-101",
          provider_id: "prov-rider-9",
          domain: "ride",
          resource_id: "ride-order-888",
          status: "ASSIGNED",
          due_at: new Date(Date.now() + 3600000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      count: 1,
      overdue: 0,
    });

    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Quản trị hệ thống" })).toBeInTheDocument();
    });

    // Navigate to transactions tab
    const transTab = screen.getByRole("button", { name: /Giao dịch & Vận hành/i });
    fireEvent.click(transTab);

    // Switch to dispatch subtab
    const dispatchSubtab = screen.getByRole("tab", { name: /Điều phối & Phân công/i });
    fireEvent.click(dispatchSubtab);

    await waitFor(() => {
      expect(screen.getByText("Tổng phân công")).toBeInTheDocument();
      expect(screen.getByText("prov-rider-9")).toBeInTheDocument();
      expect(screen.getByText("ride-order-888")).toBeInTheDocument();
    });
  });

  it("renders provider verification section when provider-documents subtab is selected", async () => {
    (apiClient.getOperationsProviderDocuments as jest.Mock).mockResolvedValue([
      {
        id: "doc-505",
        provider_id: "prov-food-12",
        document_type: "Giấy phép Vệ sinh ATTP",
        document_url: "https://storage.example.com/docs/vsattp-505.pdf",
        status: "PENDING",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Quản trị hệ thống" })).toBeInTheDocument();
    });

    // Navigate to users tab
    const usersTab = screen.getByRole("button", { name: /Người dùng & Phân quyền/i });
    fireEvent.click(usersTab);

    // Switch to provider-documents subtab
    const docSubtab = screen.getByRole("tab", { name: /Hồ sơ đối tác/i });
    fireEvent.click(docSubtab);

    await waitFor(() => {
      expect(screen.getByText("Chờ thẩm định")).toBeInTheDocument();
      expect(screen.getByText("prov-food-12")).toBeInTheDocument();
      expect(screen.getByText("Giấy phép Vệ sinh ATTP")).toBeInTheDocument();
    });
  });

  it("resolves legacy and cross-tab shortcuts to flat 1-click tabs for manager", async () => {
    const { renderHook, act } = await import("@testing-library/react");
    const { useAdminNavigation } = await import("./hooks/use-admin-navigation");

    const { result } = renderHook(() => useAdminNavigation("manager"));

    expect(result.current.activeMainTab).toBe("overview");

    // 1-Click direct flat tab switch to dispatch
    act(() => {
      result.current.switchMainTab("dispatch");
    });
    expect(result.current.activeMainTab).toBe("dispatch");
    expect(window.location.hash).toBe("#dispatch");

    // Direct switch to provider verification
    act(() => {
      result.current.switchMainTab("provider-verification");
    });
    expect(result.current.activeMainTab).toBe("provider-verification");
    expect(window.location.hash).toBe("#provider-verification");

    // Cross-tab fallback resolution: legacy "transactions" + "payments-list" resolves to flat "payments"
    act(() => {
      result.current.switchMainTab("transactions" as any, "payments-list");
    });
    expect(result.current.activeMainTab).toBe("payments");
    expect(window.location.hash).toBe("#payments");

    // Legacy "transactions" + "dispatch" resolves to flat "dispatch"
    act(() => {
      result.current.switchMainTab("transactions" as any, "dispatch");
    });
    expect(result.current.activeMainTab).toBe("dispatch");
    expect(window.location.hash).toBe("#dispatch");

    // Legacy "users" + "provider-documents" resolves to flat "provider-verification"
    act(() => {
      result.current.switchMainTab("users" as any, "provider-documents");
    });
    expect(result.current.activeMainTab).toBe("provider-verification");
    expect(window.location.hash).toBe("#provider-verification");
  });
});
