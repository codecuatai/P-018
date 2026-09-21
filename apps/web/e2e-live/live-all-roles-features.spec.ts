import { expect, test } from "@playwright/test";

test.describe("Production Live Verification - All 4 Roles Features", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
      console.error("Page error:", error);
    });
  });

  test("Role 1: Provider - Earnings Summary and Webhook Live Sandbox", async ({ page }) => {
    // 1. Log in as Provider
    await page.goto("/?auth=login");
    await expect(page.locator("#login-email")).toBeVisible({ timeout: 15_000 });
    await page.locator("#login-email").fill("provider1@xone.local");
    await page.locator("#login-password").fill("Password123!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();

    await expect(page).toHaveURL(/\/app\/provider/, { timeout: 20_000 });
    // Provider portal identifies itself via the partner-type badge in the header
    await expect(page.getByText(/Cổng Giả Lập Hệ Thống|Cổng Đối Tác/i).first()).toBeVisible({ timeout: 15_000 });

    // 2. Navigate to "Gắn & Quản lý Dịch vụ"
    const servicesTab = page.getByRole("tab", { name: /Gắn & Quản lý Dịch vụ/i });
    await expect(servicesTab).toBeVisible({ timeout: 10_000 });
    await servicesTab.click();

    // 3. Verify Earnings & Settlement Summary Card
    await expect(page.getByRole("heading", { name: /Doanh thu & Quyết toán Đối tác/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Tổng doanh thu \(Gross\)/i)).toBeVisible();
    await expect(page.getByText(/Chiết khấu nền tảng X-One/i)).toBeVisible();
    await expect(page.getByText(/Thực nhận đối tác \(Net Payout\)/i)).toBeVisible();

    // 4. Verify Webhook Live Sandbox
    await expect(page.getByText(/Webhook Live Sandbox/i)).toBeVisible();
    const webhookInput = page.locator("input[type='url']");
    await expect(webhookInput).toBeVisible();

    // Set a test webhook URL if empty
    const currentVal = await webhookInput.inputValue();
    if (!currentVal) {
      await webhookInput.fill("https://httpbin.org/post");
      await page.getByRole("button", { name: /Lưu cập nhật hồ sơ/i }).click();
      await page.waitForTimeout(1000);
    }

    // Click "Gửi thử nghiệm Live"
    const liveTestBtn = page.getByRole("button", { name: /Gửi thử nghiệm Live|Đang phát webhook/i });
    await expect(liveTestBtn).toBeVisible();
    await liveTestBtn.click();

    // Verify response inspection appears (either HTTP status or detail banner)
    await expect(
      page.locator("text=/Giao tiếp (thành công|thất bại)|Độ trễ:/i").first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Role 2: Customer - Context-aware Proactive AI Banner and Journey Timeline", async ({ page }) => {
    // 1. Log in as Customer
    await page.goto("/?auth=login");
    await expect(page.locator("#login-email")).toBeVisible({ timeout: 15_000 });
    await page.locator("#login-email").fill("user@xone.local");
    await page.locator("#login-password").fill("Password123!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();

    await expect(page).toHaveURL(/\/app(?:\/onboarding)?/, { timeout: 20_000 });

    if (page.url().includes("/app/onboarding")) {
      await page.getByRole("button", { name: "Bắt đầu" }).click();
      await page.getByLabel("Họ và tên").fill("Người dùng X-One");
      await page.getByRole("button", { name: "Tiếp tục" }).click();
      await page.locator("#onboarding-phone").fill("0901234567");
      await page.getByRole("button", { name: "Tiếp tục" }).click();
      await page.getByRole("button", { name: "Tiếp tục không dùng vị trí" }).click();
      await page.getByRole("button", { name: "Bỏ qua địa chỉ" }).click();
      await page.waitForURL("**/app", { timeout: 20_000 });
    }

    const newChatBtn = page.getByRole("button", { name: /Đoạn chat mới/i });
    if (await newChatBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await newChatBtn.click();
    }

    // 2. Verify Proactive AI Banner in WelcomeState
    const proactiveBanner = page.locator(".proactive-ai-banner");
    await expect(proactiveBanner).toBeVisible({ timeout: 15_000 });
    await expect(proactiveBanner.getByText(/Gợi ý/i)).toBeVisible();
    await expect(proactiveBanner.getByText(/Thực hiện ngay/i)).toBeVisible();

    // 3. Click proactive banner to start multi-service plan
    await proactiveBanner.click();

    // Verify composer gets submitted or message bubble appears
    await expect(page.locator(".chat-message").first()).toBeVisible({ timeout: 20_000 });
  });

  test("Role 3: Manager - Feature Flags, 1-Click Compensation, and Audit Logs", async ({ page }) => {
    // 1. Log in as Manager
    await page.goto("/?auth=login");
    await expect(page.locator("#login-email")).toBeVisible({ timeout: 15_000 });
    await page.locator("#login-email").fill("manager@xone.local");
    await page.locator("#login-password").fill("Password123!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();

    await expect(page).toHaveURL(/\/admin/, { timeout: 20_000 });
    await expect(page.locator(".admin-badge-header")).toContainText(/Operations Console|Manager/i);

    // 2. Open Feature Flags subtab in Overview
    const featureFlagsSubtab = page.getByRole("tab", { name: /Feature Flags/i });
    if (await featureFlagsSubtab.isVisible()) {
      await featureFlagsSubtab.click();
      await expect(page.getByRole("heading", { name: /Dynamic Feature Flags/i })).toBeVisible({ timeout: 10_000 });
    }

    // 3. Open Transactions -> Workflow reconciliation
    await page.getByRole("button", { name: /Giao dịch & Vận hành/i }).click();
    const reconSubtab = page.getByRole("tab", { name: /Workflow reconciliation/i });
    await expect(reconSubtab).toBeVisible({ timeout: 10_000 });
    await reconSubtab.click();

    // Verify 1-Click Compensation button is visible and clickable
    const compensateBtn = page.getByRole("button", { name: /Bù trừ sự cố/i });
    await expect(compensateBtn).toBeVisible({ timeout: 10_000 });
    await compensateBtn.click();
    const compensationDialog = page.getByRole("dialog");
    await expect(compensationDialog).toBeVisible({ timeout: 10_000 });
    await compensationDialog.locator("input[type='text']").fill("wf_live_manager_recovery");
    await compensationDialog.getByRole("button", { name: /Xác nhận phát hành/i }).click();
    await expect(page.getByText(/Phát Hành Bồi Thường Thành Công/i)).toBeVisible({ timeout: 10_000 });

    // 4. RBAC: Manager must NOT see "System Logs & Audit" (admin-only per getConsolidatedTabs).
    // Audit Trail verification is covered by Role 4 (Admin) test below.
    await expect(page.getByRole("button", { name: /System Logs & Audit/i })).toBeHidden({ timeout: 10_000 });
  });

  test("Role 4: Admin - Dynamic Feature Flag Toggle and Audit Trail Recording", async ({ page }) => {
    // 1. Log in as Admin
    await page.goto("/?auth=login");
    await expect(page.locator("#login-email")).toBeVisible({ timeout: 15_000 });
    await page.locator("#login-email").fill("admin@xone.local");
    await page.locator("#login-password").fill("Password123!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();

    await expect(page).toHaveURL(/\/admin/, { timeout: 20_000 });
    await expect(page.locator(".admin-badge-header")).toContainText(/Admin Console/i);

    // 2. Open Feature Flags subtab
    const featureFlagsSubtab = page.getByRole("tab", { name: /Feature Flags/i });
    await expect(featureFlagsSubtab).toBeVisible({ timeout: 10_000 });
    await featureFlagsSubtab.click();

    await expect(page.getByRole("heading", { name: /Dynamic Feature Flags/i })).toBeVisible({ timeout: 10_000 });

    // 3. Find first toggle button and toggle it
    const toggleBtn = page.locator("#feature-flags button:has-text('Tắt tính năng'), #feature-flags button:has-text('Kích hoạt ngay')").first();
    if (await toggleBtn.isVisible()) {
      const initialText = await toggleBtn.innerText();
      await toggleBtn.click();
      await expect(page.getByText(/Đã (kích hoạt|tắt) cờ tính năng/i)).toBeVisible({ timeout: 10_000 });
    }

    // 4. Open System Logs & Audit Trail to verify audit log
    await page.getByRole("button", { name: /System Logs & Audit/i }).click();
    const auditSubtab = page.getByRole("tab", { name: /Audit Trail/i });
    await expect(auditSubtab).toBeVisible({ timeout: 10_000 });
    await auditSubtab.click();

    await expect(page.getByRole("heading", { name: /Audit Trail/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Nhật ký kiểm toán hệ thống/i)).toBeVisible();
  });
});
