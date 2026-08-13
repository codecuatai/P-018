import { expect, test, type Page } from "@playwright/test";

const defaultPassword = "XOne-local-E2E-pass";

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

async function registerThroughLanding(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/");
  await expect(page).toHaveTitle(/X-One/i);
  await page.getByRole("button", { name: /Bắt đầu với X-One/i }).first().click();
  await expect(page.locator("#register-name")).toBeVisible();
  await page.locator("#register-name").fill("Người dùng E2E");
  await page.locator("#register-email").fill(email);
  await page.locator("#register-password").fill(password);
  await page.getByRole("button", { name: /Tạo tài khoản/i }).click();
  await expect(page).toHaveURL(/\/app\/onboarding|\/app(?:\?|$)/, { timeout: 30_000 });
  await completeOnboarding(page, "Người dùng E2E");
}

async function loginThroughDialog(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/?auth=login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: /Đăng nhập/i }).click();
  await expect(page).toHaveURL(/\/app(?:\/onboarding|\/services)?(?:\?|$)/, { timeout: 30_000 });
  await completeOnboarding(page, "Người dùng E2E");
}

test.describe("live local product", () => {
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

  test("registers through the landing dialog, completes onboarding, reloads, and logs out", async ({ page }) => {
    const runId = process.env.LIVE_E2E_RUN_ID ?? `${Date.now()}-${test.info().workerIndex}`;
    const email = process.env.LIVE_E2E_EMAIL ?? `e2e+${runId}@xone.local`;
    const password = process.env.LIVE_E2E_PASSWORD ?? defaultPassword;

    await registerThroughLanding(page, email, password);
    await page.reload();
    await expect(page).toHaveURL(/\/app(?:\?|$)/, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: /Đăng xuất/i })).toBeVisible();
    await page.getByRole("button", { name: /Đăng xuất/i }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("keeps product operations on the real Gateway", async ({ page }) => {
    const configuredEmail = process.env.LIVE_E2E_EXISTING_EMAIL;
    const configuredPassword = process.env.LIVE_E2E_EXISTING_PASSWORD;
    const runId = process.env.LIVE_E2E_RUN_ID ?? `${Date.now()}-${test.info().workerIndex}`;
    const email = configuredEmail ?? `e2e+ops-${runId}@xone.local`;
    const password = configuredPassword ?? defaultPassword;

    if (configuredEmail && configuredPassword) await loginThroughDialog(page, email, password);
    else await registerThroughLanding(page, email, password);

    await page.goto("/app/notifications");
    await expect(page.getByRole("heading", { name: /Thông báo của bạn/i })).toBeVisible();

    await page.goto("/app/services/restaurant");
    const restaurant = page.getByRole("button", { name: /Xem và giữ bàn/i }).first();
    await expect(restaurant).toBeVisible({ timeout: 30_000 });
    await restaurant.click();
    const favorite = page.getByRole("button", { name: /Lưu địa điểm yêu thích/i });
    await expect(favorite).toBeVisible({ timeout: 30_000 });
    await favorite.click();
    await expect(page.getByRole("button", { name: /Bỏ khỏi địa điểm đã lưu/i })).toHaveAttribute("aria-pressed", "true");

    await page.goto("/app/favorites");
    await expect(page.getByRole("heading", { name: /Nơi bạn hay quay lại/i })).toBeVisible();

    await page.goto("/app/support");
    await expect(page.getByRole("heading", { name: /Mình có thể giúp gì/i })).toBeVisible();
    const subject = `E2E hỗ trợ ${runId}`;
    const description = "Kiểm tra ticket hỗ trợ lưu bền vững qua Gateway.";
    await page.getByLabel("Tiêu đề").fill(subject);
    await page.getByLabel("Mô tả").fill(description);
    await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await expect(page.getByRole("status")).toContainText("được ghi nhận", { timeout: 30_000 });
    const message = "Bổ sung thông tin cho lần kiểm tra live.";
    await page.getByPlaceholder("Bổ sung thông tin…").fill(message);
    await page.getByRole("button", { name: "Gửi thêm" }).click();
    await expect(page.getByText(message, { exact: true })).toBeVisible({ timeout: 30_000 });
  });
});
