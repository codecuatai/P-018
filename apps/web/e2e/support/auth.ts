import type { Page } from "@playwright/test";

export async function completeOnboarding(page: Page, name = "Vũ Văn Phong", phone = "0901234567"): Promise<void> {
  await page.getByRole("button", { name: "Bắt đầu" }).click();
  await page.getByLabel("Họ và tên").fill(name);
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await page.locator("#onboarding-phone").fill(phone);
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await page.getByRole("button", { name: "Tiếp tục không dùng vị trí" }).click();
  await page.getByRole("button", { name: "Bỏ qua địa chỉ" }).click();
  await page.waitForURL("**/app");
}

export async function login(page: Page, email: string, password = "e2e-password-123456"): Promise<void> {
  await page.goto("/");
  const desktopLogin = page.getByRole("button", { name: "Đăng nhập" }).first();
  if (await desktopLogin.isVisible().catch(() => false)) {
    await desktopLogin.click();
  } else {
    await page.getByRole("button", { name: "Mở menu" }).click();
    await page.getByRole("button", { name: "Đăng nhập" }).click();
  }
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill(email);
  await dialog.locator("#login-password").fill(password);
  await dialog.getByRole("button", { name: "Đăng nhập" }).click();
  await page.waitForURL(/\/app(?:\/onboarding)?(?:\?.*)?$/, { timeout: 30_000 });
  if (page.url().includes("/app/onboarding")) await completeOnboarding(page);
}
