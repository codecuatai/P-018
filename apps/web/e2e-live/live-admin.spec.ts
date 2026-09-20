import { expect, test, type Page } from "@playwright/test";

async function completeOnboarding(page: Page, name: string): Promise<void> {
  if (!page.url().includes("/app/onboarding")) return;
  await page.getByRole("button", { name: /^Bắt đầu$/i }).click();
  await page.locator("#onboarding-name").fill(name);
  await page.getByRole("button", { name: /^Tiếp tục/i }).click();
  await page.locator("#onboarding-phone").fill("0900000000");
  await page.getByRole("button", { name: /^Tiếp tục/i }).click();
  await page.getByRole("button", { name: /Tiếp tục không dùng vị trí/i }).click();
  await page.getByRole("button", { name: /Bỏ qua địa chỉ/i }).click();
  await expect(page).toHaveURL(/\/app(?:\?|$)/, { timeout: 30_000 });
}

async function login(page: Page, email: string, password: string, name: string): Promise<void> {
  await page.goto("/?auth=login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/app|\/admin/, { timeout: 30_000 });
  await completeOnboarding(page, name);
}

test.describe("live local admin", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => { throw error; });
    page.on("console", (message) => {
      if (message.type() === "error") throw new Error(`Browser console.error: ${message.text()}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400) console.log(`LIVE_HTTP_${response.status()} ${response.url()}`);
    });
    page.on("requestfailed", (request) => {
      const errorText = request.failure()?.errorText ?? "unknown";
      if (errorText.includes("ERR_ABORTED")) return;
      throw new Error(`Failed request: ${request.url()} ${errorText}`);
    });
  });

  test("loads the operational dashboard and denies a normal user", async ({ page }) => {
    const adminEmail = process.env.LIVE_E2E_ADMIN_EMAIL ?? "admin@xone.local";
    const adminPassword = process.env.LIVE_E2E_ADMIN_PASSWORD ?? "Password123!";
    const normalEmail = process.env.LIVE_E2E_NORMAL_EMAIL ?? "user@xone.local";
    const normalPassword = process.env.LIVE_E2E_NORMAL_PASSWORD ?? "Password123!";

    await login(page, adminEmail, adminPassword, "Local Admin");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /Trung tâm vận hành X-One/i })).toBeVisible({ timeout: 30_000 });
    for (const tab of ["Tổng quan & Hạ tầng", "Người dùng & Phân quyền", "Giao dịch & Vận hành", "AI Engine & API Keys", "Hỗ trợ & Đánh giá", "System Logs & Audit"]) {
      await expect(page.getByRole("button", { name: tab, exact: true })).toBeVisible({ timeout: 30_000 });
    }
    await page.getByRole("button", { name: "Giao dịch & Vận hành", exact: true }).click();
    const workflowTab = page.getByRole("tab", { name: "Workflow reconciliation", exact: true });
    await expect(workflowTab).toBeVisible({ timeout: 30_000 });
    await workflowTab.click();
    await expect(page.getByRole("heading", { name: "Workflow reconciliation", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("gateway-core", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    await page.locator("button[aria-label='Đăng xuất']").first().click();
    await expect(page).toHaveURL(/\/$/);
    await login(page, normalEmail, normalPassword, "Normal User");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /Khu vực này dành cho quản trị viên/i })).toBeVisible({ timeout: 30_000 });
  });
});
