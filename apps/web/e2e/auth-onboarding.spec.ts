import { expect, test } from "@playwright/test";

import { completeOnboarding, login } from "./support/auth";
import { MockGateway } from "./support/mock-gateway";

test("landing → register → onboarding denial → saved Nhà address → logout/login persistence", async ({ context, page }) => {
  const gateway = new MockGateway({ email: "auth-flow@example.test", onboardingComplete: false });
  await gateway.install(context);

  await page.goto("/");
  await page.getByRole("button", { name: "Bắt đầu với X-One" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Họ và tên").fill("Người dùng Auth E2E");
  await dialog.getByLabel("Email").fill("auth-flow@example.test");
  await dialog.locator("#register-password").fill("e2e-password-123456");
  await dialog.locator("#register-confirm-password").fill("e2e-password-123456");
  await dialog.getByRole("button", { name: "Tạo tài khoản" }).click();
  await page.waitForURL("**/app/onboarding");

  await page.getByRole("button", { name: "Bắt đầu" }).click();
  await page.getByLabel("Họ và tên").fill("Người dùng Auth E2E");
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await page.locator("#onboarding-phone").fill("0901234567");
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await page.getByRole("button", { name: "Tiếp tục không dùng vị trí" }).click();
  await page.locator("#onboarding-address").fill("12 Nguyễn Huệ, Quận 1");
  await page.getByRole("button", { name: "Tìm địa chỉ" }).click();
  await page.getByRole("button", { name: /12 Nguyễn Huệ/ }).click();
  await page.getByRole("button", { name: "Hoàn tất thiết lập" }).click();
  await page.waitForURL("**/app");

  await page.goto("/app/profile?section=settings");
  await page.getByRole("button", { name: "Đăng xuất" }).first().click();
  await page.goto("/");
  await login(page, "auth-flow@example.test");
  await expect(page.locator(".app-shell")).toBeVisible({ timeout: 15_000 });
  await page.goto("/app/addresses");
  await expect(page.getByText("12 Nguyễn Huệ, Quận 1").first()).toBeVisible();
  expect(gateway.calls.filter((call) => call.path === "/api/v1/addresses" && call.method === "POST")).toHaveLength(1);
});

test("location denial remains explicit and does not create a guessed marker", async ({ context, page }) => {
  const gateway = new MockGateway({ email: "deny-flow@example.test", onboardingComplete: false });
  await gateway.install(context);
  await page.goto("/");
  await page.getByRole("button", { name: "Bắt đầu với X-One" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Họ và tên").fill("Người dùng Deny E2E");
  await dialog.getByLabel("Email").fill("deny-flow@example.test");
  await dialog.locator("#register-password").fill("e2e-password-123456");
  await dialog.locator("#register-confirm-password").fill("e2e-password-123456");
  await dialog.getByRole("button", { name: "Tạo tài khoản" }).click();
  await page.waitForURL("**/app/onboarding");
  await completeOnboarding(page, "Người dùng Deny E2E");
  await expect(page).toHaveURL(/\/app$/);
});
