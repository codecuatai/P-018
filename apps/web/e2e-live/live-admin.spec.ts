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
  await page.getByRole("button", { name: /Đăng nhập/i }).click();
  await expect(page).toHaveURL(/\/app(?:\/onboarding)?(?:\?|$)/, { timeout: 30_000 });
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
    const adminEmail = process.env.LIVE_E2E_ADMIN_EMAIL;
    const adminPassword = process.env.LIVE_E2E_ADMIN_PASSWORD;
    const normalEmail = process.env.LIVE_E2E_NORMAL_EMAIL;
    const normalPassword = process.env.LIVE_E2E_NORMAL_PASSWORD;
    if (!adminEmail || !adminPassword || !normalEmail || !normalPassword) throw new Error("LIVE_E2E_ADMIN_* and LIVE_E2E_NORMAL_* credentials are required.");

    await login(page, adminEmail, adminPassword, "Local Admin");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /Trung tâm vận hành X-One/i })).toBeVisible({ timeout: 30_000 });
    for (const heading of ["Tổng quan", "Người dùng", "Giao dịch domain", "Thanh toán & hoàn tiền", "Workflow reconciliation", "Sức khỏe hệ thống", "Dataset & độ tươi", "Support queue"]) {
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible({ timeout: 30_000 });
    }
    await expect(page.getByText("gateway-core", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    await page.goto("/app");
    await page.getByRole("button", { name: /Đăng xuất/i }).click();
    await expect(page).toHaveURL(/\/$/);
    await login(page, normalEmail, normalPassword, "Normal User");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /Khu vực này dành cho quản trị viên/i })).toBeVisible({ timeout: 30_000 });
  });
});
