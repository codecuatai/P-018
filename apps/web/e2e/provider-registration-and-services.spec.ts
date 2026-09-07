import { expect, test } from "@playwright/test";
import { installAuthenticatedFixture } from "./support/mock-gateway";

test.describe("Provider Self-Registration & Service Offerings Management", () => {
  test("allows a new provider to register, redirect to /app/provider, and attach service items", async ({ context, page }) => {
    // Install Mock Gateway without auto-login so we can test registration
    await installAuthenticatedFixture(context, { autoLogin: false });

    // 1. Navigate to home and open register modal
    await page.goto("/");
    await page.getByRole("button", { name: "Bắt đầu với X-One" }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // 2. Select "Đối tác dịch vụ (Provider)"
    const providerToggle = dialog.getByRole("button", { name: /Đối tác dịch vụ/i });
    await expect(providerToggle).toBeVisible();
    await providerToggle.click();

    // Verify provider-specific fields are displayed
    await expect(dialog.getByText(/Lĩnh vực đối tác hoạt động/i)).toBeVisible();
    await expect(dialog.getByLabel(/Tên thương hiệu/i)).toBeVisible();

    // 3. Select category (Quán ăn / Món)
    await dialog.getByRole("button", { name: /Quán ăn \/ Món/i }).click();

    // 4. Fill registration form
    await dialog.getByLabel(/Tên thương hiệu/i).fill("Bếp Cơm Niêu Sài Gòn");
    await dialog.getByLabel(/Số điện thoại liên hệ/i).fill("0912345678");
    await dialog.getByLabel(/Họ tên người đại diện/i).fill("Nguyễn Văn Đối Tác");
    await dialog.getByLabel("Email").fill("bepcomnieu@example.com");
    await dialog.locator("#register-password").fill("e2e-password-123456");
    await dialog.locator("#register-confirm-password").fill("e2e-password-123456");

    // 5. Submit registration
    const submitBtn = dialog.getByRole("button", { name: /Đăng ký làm Đối tác X-One/i });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // 6. Verify redirection to /app/provider
    await expect(page).toHaveURL(/\/app\/provider/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Chào mừng/i })).toBeVisible({ timeout: 15_000 });

    // 7. Navigate to "Gắn & Quản lý Dịch vụ" tab
    const servicesTab = page.getByRole("button", { name: /Gắn & Quản lý Dịch vụ/i }).first();
    await expect(servicesTab).toBeVisible();
    await servicesTab.click();

    // 8. Verify provider service catalog elements
    await expect(page.getByText(/Danh sách Dịch vụ \/ Sản phẩm đã gắn vào X-One/i)).toBeVisible({ timeout: 10_000 });
    const addBtn = page.getByRole("button", { name: /Gắn Dịch Vụ \/ Món Ăn Mới/i });
    await expect(addBtn).toBeVisible();

    // 9. Open modal to attach a new service item
    await addBtn.click();
    await expect(page.getByRole("heading", { name: /Gắn Dịch Vụ \/ Món Ăn Mới/i })).toBeVisible();

    // 10. Fill item details
    await page.getByPlaceholder(/Bún Bò Huế Đặc Biệt/i).fill("Cơm Niêu Cá Kho Tộ");
    await page.locator('input[type="number"]').fill("85000");
    await page.getByPlaceholder(/Món chính, Xe cao cấp/i).fill("Món đặc biệt");
    await page.getByPlaceholder(/Mô tả thành phần/i).fill("Cá bống kho tộ thơm ngon đậm đà, cơm cháy giòn rụm");

    // 11. Submit new offering
    await page.getByRole("button", { name: /Xác nhận gắn dịch vụ/i }).click();

    // 12. Verify item appears in table
    await expect(page.getByText("Cơm Niêu Cá Kho Tộ", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("85.000 VND")).toBeVisible();
    await expect(page.getByText("Món đặc biệt")).toBeVisible();
  });
});
