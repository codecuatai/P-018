import { expect, test } from "@playwright/test";

test("Verify Vietnamese text rendering and form update in Provider Portal", async ({ page }) => {
  // 1. Log in as Provider
  await page.goto("/?auth=login");
  await expect(page.locator("#login-email")).toBeVisible({ timeout: 15_000 });
  await page.locator("#login-email").fill("provider@xone.local");
  await page.locator("#login-password").fill("Password123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();

  await expect(page).toHaveURL(/\/app\/provider/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: /Chào mừng/i })).toBeVisible({ timeout: 15_000 });

  // 2. Navigate to "Gắn & Quản lý Dịch vụ"
  const servicesTab = page.getByRole("tab", { name: /Gắn & Quản lý Dịch vụ/i });
  await servicesTab.click();

  // Check form values
  const nameInput = page.locator("input[placeholder*='Quán Ăn Ngon']");
  await expect(nameInput).toBeVisible();
  const currentName = await nameInput.inputValue();
  console.log("Current input value in form:", currentName);

  // Type full Vietnamese name
  const testVietnameseName = "Nhà Hàng Cơm Niêu Sài Gòn";
  await nameInput.fill(testVietnameseName);

  const addressInput = page.locator("input[placeholder*='Nguyễn Huệ']");
  await addressInput.fill("123 Lê Lợi, Bến Nghé, Quận 1, TP. Hồ Chí Minh");

  // Save profile
  const saveBtn = page.getByRole("button", { name: /Lưu cập nhật hồ sơ/i });
  await saveBtn.click();

  // Wait for notification
  await expect(page.getByText(/Đã cập nhật thông tin đơn vị/i)).toBeVisible({ timeout: 10_000 });

  // Reload page to verify persistence from database
  await page.reload();
  await expect(page.getByRole("heading", { name: /Chào mừng/i })).toBeVisible({ timeout: 15_000 });

  await expect(page.locator(".admin-banner-title")).toContainText("Nhà Hàng Cơm Niêu Sài Gòn", { timeout: 10_000 });
  const bannerHeading = await page.locator(".admin-banner-title").innerText();
  console.log("Banner heading after reload:", bannerHeading);
  expect(bannerHeading).not.toContain("\uFFFD");
  expect(bannerHeading).not.toMatch(/\?[a-z]/i);
});
