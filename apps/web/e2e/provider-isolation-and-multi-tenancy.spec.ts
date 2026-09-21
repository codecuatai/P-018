import { expect, test } from "@playwright/test";

import { installAuthenticatedFixture } from "./support/mock-gateway";

test.describe("Provider Multi-Tenancy Isolation & Webhook Integration E2E", () => {
  test("1. Seeded primary master provider1@xone.local accesses /app/provider and views all 4 domains", async ({ context, page }) => {
    await installAuthenticatedFixture(context, {
      email: "provider1@xone.local",
      role: "provider",
      onboardingComplete: true,
    });

    await page.goto("/app/provider");
    await expect(page.getByRole("heading", { name: /Chào mừng/i })).toBeVisible({ timeout: 15_000 });

    // Verify master provider sees all service domain tabs
    await expect(page.getByRole("button", { name: /Chuyến xe|Ride Partner/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Đơn món|Food Merchant/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Lịch khám|Healthcare/i }).first()).toBeVisible();
    await expect(page.locator(".admin-banner-subtitle")).toContainText("Master 4 Dịch Vụ");

    // Open Hồ sơ Cơ sở tab (dedicated profile management)
    const profileTab = page.getByRole("tab", { name: /Hồ sơ Cơ sở/i });
    await expect(profileTab).toBeVisible({ timeout: 10_000 });
    await profileTab.click();
    await expect(page.getByRole("heading", { name: /Hồ sơ Cơ sở & Thiết lập Kết nối/i })).toBeVisible({ timeout: 10_000 });

    // Open Gắn & Quản lý Dịch vụ subtab (dedicated service catalog management)
    const servicesTab = page.getByRole("tab", { name: /Gắn & Quản lý Dịch vụ/i });
    await expect(servicesTab).toBeVisible({ timeout: 10_000 });
    await servicesTab.click();
    await expect(page.getByText(/Danh sách Dịch vụ \/ Sản phẩm đã gắn vào X-One/i)).toBeVisible();
  });

  test("1b. Disconnected provider@xone.local has all microservice tabs stripped and shows disconnected notice", async ({ context, page }) => {
    await installAuthenticatedFixture(context, {
      email: "provider@xone.local",
      role: "provider",
      onboardingComplete: true,
    });

    await page.goto("/app/provider");
    await expect(page.getByRole("heading", { name: /Chào mừng/i })).toBeVisible({ timeout: 15_000 });

    // Disconnected notice should be visible
    await expect(page.getByText(/Tài khoản đã ngắt kết nối dịch vụ/i)).toBeVisible();

    // Verify none of the 5 operational domain tabs are available
    await expect(page.getByRole("button", { name: /Chuyến xe · Cuốc xe Ride Partner/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Đơn món · Món ăn Food Merchant/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Đặt bàn · Nhà hàng Reservation/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Lịch khám · Y tế Healthcare Doctor/i })).toHaveCount(0);
  });

  test("2. Newly registered provider attaches custom Webhook API URL and manages isolated services", async ({ context, page }) => {
    // Install Mock Gateway without autoLogin to test registration & login of new provider
    await installAuthenticatedFixture(context, { autoLogin: false });

    // Step 1: Open registration form on home page
    await page.goto("/");
    await page.getByRole("button", { name: "Bắt đầu với X-One" }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // Select Provider role
    await dialog.getByRole("button", { name: /Đối tác dịch vụ/i }).click();

    // Fill provider registration
    await dialog.getByRole("button", { name: /Quán ăn \/ Món/i }).click();
    await dialog.getByLabel(/Tên thương hiệu/i).fill("Nhà Hàng Cơm Niêu Sài Gòn");
    await dialog.getByLabel(/Số điện thoại liên hệ/i).fill("0988776655");
    await dialog.getByLabel(/Họ tên người đại diện/i).fill("Trần Cơm Niêu");
    await dialog.getByLabel("Email").fill("comnieu.new@xone.local");
    await dialog.locator("#register-password").fill("Password123!");
    await dialog.locator("#register-confirm-password").fill("Password123!");

    // Submit registration
    await dialog.getByRole("button", { name: /Đăng ký làm Đối tác X-One/i }).click();

    // Verify redirection to /app/provider
    await expect(page).toHaveURL(/\/app\/provider/, { timeout: 15_000 });

    // Verify Scoped isolation: Food merchant only sees Food and Services tabs; Ride & Healthcare are hidden
    await expect(page.locator(".admin-banner-subtitle")).toContainText("Nhà hàng & Ẩm thực");
    await expect(page.getByRole("button", { name: /Đơn món|Food Merchant/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Chuyến xe|Ride Partner/i })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /Lịch khám|Healthcare/i })).not.toBeVisible();

    // Step 2: Configure custom Webhook URL in dedicated Hồ sơ Cơ sở tab
    const profileTab = page.getByRole("tab", { name: /Hồ sơ Cơ sở/i });
    await expect(profileTab).toBeVisible({ timeout: 10_000 });
    await profileTab.click();

    const webhookInput = page.getByPlaceholder(/https:\/\/api\.doitac\.vn\/webhooks/i);
    await expect(webhookInput).toBeVisible({ timeout: 10_000 });
    await webhookInput.fill("https://api.comnieusaigon.com/v1/webhook");

    // Save profile changes
    await page.getByRole("button", { name: /Lưu cập nhật hồ sơ/i }).click();
    await expect(page.getByText(/Đã cập nhật thông tin đơn vị|Đã lưu/i)).toBeVisible({ timeout: 10_000 });

    // Step 3: Add custom service item in dedicated Gắn & Quản lý Dịch vụ tab
    const servicesTab = page.getByRole("tab", { name: /Gắn & Quản lý Dịch vụ/i });
    await expect(servicesTab).toBeVisible({ timeout: 10_000 });
    await servicesTab.click();

    await page.getByRole("button", { name: /Gắn Dịch Vụ \/ Món Ăn Mới/i }).click();
    await expect(page.getByRole("heading", { name: /Gắn Dịch Vụ \/ Món Ăn Mới/i })).toBeVisible();

    await page.getByPlaceholder(/Bún Bò Huế Đặc Biệt/i).fill("Lẩu Đầu Cá Hồi Sài Gòn");
    await page.locator('input[type="number"]').fill("185000");
    await page.getByPlaceholder(/Món chính, Xe cao cấp/i).fill("Lẩu hải sản");
    await page.getByPlaceholder(/Mô tả thành phần/i).fill("Đầu cá hồi nauy tươi ngon kèm rau nhúng lẩu");

    await page.getByRole("button", { name: /Xác nhận gắn dịch vụ/i }).click();

    // Verify new item appears in provider's catalog
    await expect(page.getByText("Lẩu Đầu Cá Hồi Sài Gòn", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("185.000 VND")).toBeVisible();
  });
});
