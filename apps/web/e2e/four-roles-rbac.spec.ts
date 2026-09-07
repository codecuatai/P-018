import { expect, test, type Page } from "@playwright/test";

import { installAuthenticatedFixture } from "./support/mock-gateway";

async function openAdminMenuIfMobile(page: Page): Promise<void> {
  const mobileMenuBtn = page.getByRole("button", { name: /Mở menu quản trị/i });
  if (await mobileMenuBtn.isVisible()) {
    await mobileMenuBtn.click();
  }
}

test.describe("4-Role RBAC E2E Test Suite", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => console.log("PAGEERROR:", err.message, err.stack));
    page.on("console", (msg) => console.log("BROWSER_CONSOLE:", msg.text()));
  });

  test("1. Admin: full access to /admin with 6 tabs, role management modal, denied /app/provider", async ({ context, page }) => {
    await installAuthenticatedFixture(context, {
      email: "admin@xone.local",
      role: "admin",
      onboardingComplete: true,
    });

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /Trung tâm vận hành X-One/i })).toBeVisible({ timeout: 15_000 });

    await openAdminMenuIfMobile(page);

    // Verify all 6 consolidated primary tabs are visible for admin
    await expect(page.getByRole("button", { name: /Tổng quan & Sức khỏe/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Người dùng & Phân quyền/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Giao dịch & Vận hành/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /AI Engine & API Keys/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Hỗ trợ & Đánh giá/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /System Logs & Audit/i }).first()).toBeVisible();

    // Open Người dùng & Phân quyền tab and verify user list
    await page.getByRole("button", { name: /Người dùng & Phân quyền/i }).first().click();
    await expect(page.getByText("admin@xone.local").first()).toBeVisible();
    await expect(page.getByText("manager@xone.local").first()).toBeVisible();

    // Verify role select dropdown can open role change confirmation modal
    const roleSelect = page.getByLabel("Thay đổi vai trò cho manager@xone.local");
    await expect(roleSelect).toBeVisible();
    await roleSelect.selectOption("admin");
    await expect(page.getByText(/Xác nhận thay đổi vai trò người dùng/i)).toBeVisible();
    await page.getByRole("button", { name: /Hủy/i }).click();
    await expect(page.getByText(/Xác nhận thay đổi vai trò người dùng/i)).not.toBeVisible();

    // Verify admin cannot access partner provider portal (strict role boundary)
    await page.goto("/app/provider");
    await expect(page.getByText(/403 · KHÔNG CÓ QUYỀN TRUY CẬP/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Khu vực dành riêng cho Đối tác dịch vụ/i)).toBeVisible();
  });

  test("2. Manager: operational access to /admin with 4 tabs, sensitive tabs hidden, denied /app/provider", async ({ context, page }) => {
    await installAuthenticatedFixture(context, {
      email: "manager@xone.local",
      role: "manager",
      onboardingComplete: true,
    });

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /Trung tâm vận hành X-One/i })).toBeVisible({ timeout: 15_000 });

    await openAdminMenuIfMobile(page);

    // Verify 4 operational tabs are present
    await expect(page.getByRole("button", { name: /Tổng quan & Sức khỏe/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Người dùng & Phân quyền/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Giao dịch & Vận hành/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Hỗ trợ & Đánh giá/i }).first()).toBeVisible();

    // Verify 2 sensitive tabs are hidden for manager
    await expect(page.getByRole("button", { name: /AI Engine & API Keys/i })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /System Logs & Audit/i })).not.toBeVisible();

    // Verify manager cannot access partner provider portal (strict role boundary)
    await page.goto("/app/provider");
    await expect(page.getByText(/403 · KHÔNG CÓ QUYỀN TRUY CẬP/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Khu vực dành riêng cho Đối tác dịch vụ/i)).toBeVisible();
  });

  test("3. Provider: full access to /app/provider portal, denied /admin, redirected from /app", async ({ context, page }) => {
    await installAuthenticatedFixture(context, {
      email: "provider@xone.local",
      role: "provider",
      onboardingComplete: true,
    });

    await page.goto("/app/provider");
    await expect(page.getByRole("heading", { name: /Chào mừng/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Bảng điều khiển tác vụ dịch vụ đối tác/i)).toBeVisible();

    // Verify domain tabs (sidebar and subtabs)
    await expect(page.getByRole("button", { name: /Tài xế di chuyển|Ride Partner/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Quán ăn & Nhà hàng|Food Merchant/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Khám bệnh|Healthcare/i }).first()).toBeVisible();

    // Verify task workflow progression buttons
    const progressBtn = page.getByRole("button", { name: /Bắt đầu chuyến đi|Đã đến điểm đón|Đã tới đích|Hoàn thành chuyến/i });
    await expect(progressBtn).toBeVisible();
    await progressBtn.click();

    // Verify provider is denied from /admin
    await page.goto("/admin");
    await expect(page.getByText(/403 · KHÔNG CÓ QUYỀN TRUY CẬP/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Tài khoản hiện tại không có quyền mở trang quản trị/i)).toBeVisible();

    // Verify provider accessing consumer chat /app is automatically routed to /app/provider
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app\/provider/, { timeout: 15_000 });
  });

  test("4. User: access to /app assistant, denied /admin and /app/provider", async ({ context, page }) => {
    await installAuthenticatedFixture(context, {
      email: "user@xone.local",
      role: "user",
      onboardingComplete: true,
    });

    await page.goto("/app");
    await expect(page.locator(".app-shell")).toBeVisible({ timeout: 15_000 });

    // Verify user is denied from /admin
    await page.goto("/admin");
    await expect(page.getByText(/403 · KHÔNG CÓ QUYỀN TRUY CẬP/i)).toBeVisible({ timeout: 15_000 });

    // Verify user is denied from /app/provider
    await page.goto("/app/provider");
    await expect(page.getByText(/403 · KHÔNG CÓ QUYỀN TRUY CẬP/i)).toBeVisible({ timeout: 15_000 });
  });
});
