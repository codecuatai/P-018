import { expect, test } from "@playwright/test";

test.describe("Production Live Provider & Isolation E2E Verification", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
      console.error("Page error:", error);
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        console.error(`Browser console.error: ${message.text()}`);
      }
    });
  });

  test("1. Master Provider (provider@xone.local) has access to all 4 domains on production", async ({ page }) => {
    // Navigate to login
    await page.goto("/?auth=login");
    await expect(page.locator("#login-email")).toBeVisible({ timeout: 15_000 });

    await page.locator("#login-email").fill("provider@xone.local");
    await page.locator("#login-password").fill("Password123!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();

    // Verify redirect to provider portal
    await expect(page).toHaveURL(/\/app\/provider/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /Chào mừng/i })).toBeVisible({ timeout: 15_000 });

    // Verify master provider badge and full 4-service access
    await expect(page.locator(".admin-banner-subtitle")).toContainText("Master 4 Dịch Vụ");
    await expect(page.getByRole("button", { name: /Chuyến xe|Ride Partner/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Đơn món|Food Merchant/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Lịch khám|Healthcare/i }).first()).toBeVisible();

    // Open Gắn & Quản lý Dịch vụ tab
    const servicesTab = page.getByRole("tab", { name: /Gắn & Quản lý Dịch vụ/i });
    await expect(servicesTab).toBeVisible({ timeout: 10_000 });
    await servicesTab.click();

    // Verify profile section and items table load
    await expect(page.getByRole("heading", { name: /Hồ sơ Cơ sở & Thiết lập Kết nối/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Danh sách Dịch vụ \/ Sản phẩm đã gắn vào X-One/i)).toBeVisible();
  });

  test("2. Newly registered external provider is isolated strictly to registered domain", async ({ page }) => {
    const timestamp = Date.now();
    const testEmail = `prod.merchant.${timestamp}@xone.local`;

    // Open register modal on landing
    await page.goto("/");
    await page.getByRole("button", { name: "Bắt đầu với X-One" }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // Select Provider role
    await dialog.getByRole("button", { name: /Đối tác dịch vụ/i }).click();

    // Select restaurant_merchant sector
    await dialog.getByRole("button", { name: /Quán ăn \/ Món/i }).click();
    await dialog.getByLabel(/Tên thương hiệu/i).fill(`Nhà Hàng Phố Cổ ${timestamp}`);
    await dialog.getByLabel(/Số điện thoại liên hệ/i).fill("0912345678");
    await dialog.getByLabel(/Họ tên người đại diện/i).fill("Nguyễn Văn Chủ Quán");
    await dialog.getByLabel("Email").fill(testEmail);
    await dialog.locator("#register-password").fill("Password123!");
    await dialog.locator("#register-confirm-password").fill("Password123!");

    // Submit registration
    await dialog.getByRole("button", { name: /Đăng ký làm Đối tác X-One/i }).click();

    // Verify redirection to /app/provider
    await expect(page).toHaveURL(/\/app\/provider/, { timeout: 25_000 });

    // Verify domain isolation:
    // 1. Role badge shows Nhà hàng & Ẩm thực
    await expect(page.locator(".admin-banner-subtitle")).toContainText("Nhà hàng & Ẩm thực");

    // 2. Food domain is visible, but Ride and Healthcare are NOT visible
    await expect(page.getByRole("button", { name: /Chuyến xe|Ride/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Lịch khám|Healthcare/i })).toHaveCount(0);

    // 3. Switch to Gắn & Quản lý Dịch vụ
    const servicesTab = page.getByRole("tab", { name: /Gắn & Quản lý Dịch vụ/i });
    await expect(servicesTab).toBeVisible({ timeout: 10_000 });
    await servicesTab.click();

    // Wait for initial profile data to settle
    await page.waitForTimeout(1000);

    // 4. Test Webhook configuration
    const webhookInput = page.locator("input[type='url']");
    await expect(webhookInput).toBeVisible({ timeout: 10_000 });
    await webhookInput.fill("https://api.nhahangphoco.vn/xone-webhook");
    await expect(webhookInput).toHaveValue("https://api.nhahangphoco.vn/xone-webhook");

    const putPromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/v1/provider/services/profile") && resp.request().method() === "PUT",
      { timeout: 15_000 }
    );
    await page.getByRole("button", { name: /Lưu cập nhật hồ sơ/i }).click();
    const putRes = await putPromise;
    expect(putRes.status()).toBe(200);

    // 5. Test adding an isolated item
    await page.getByRole("button", { name: /Gắn Dịch Vụ \/ Món Ăn Mới|gắn dịch vụ đầu tiên/i }).first().click();
    await expect(page.getByText("Gắn Dịch Vụ / Món Ăn Mới Vào X-One")).toBeVisible({ timeout: 5_000 });

    // Verify domain buttons: only food is available; ride and healthcare are absent
    await expect(page.getByRole("button", { name: /🍲 Món ăn/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /🚗 Chuyến xe/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /🩺 Khám bệnh/i })).toHaveCount(0);

    // Fill item details
    await page.getByPlaceholder(/Bún Bò Huế Đặc Biệt/i).fill("Bún Chả Nem Cua Bể");
    await page.locator("input[type='number']").fill("65000");

    const postPromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/v1/provider/services/items") && resp.request().method() === "POST",
      { timeout: 15_000 }
    );
    await page.getByRole("button", { name: /Xác nhận gắn dịch vụ/i }).click();
    const postRes = await postPromise;
    expect(postRes.status()).toBe(201);

    // Verify item appears in table
    await expect(page.getByText("Bún Chả Nem Cua Bể", { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test("3. Master Provider views real PostgreSQL operational data and transitions", async ({ page }) => {
    // Navigate to login
    await page.goto("/?auth=login");
    await expect(page.locator("#login-email")).toBeVisible({ timeout: 15_000 });

    await page.locator("#login-email").fill("provider@xone.local");
    await page.locator("#login-password").fill("Password123!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();

    await expect(page).toHaveURL(/\/app\/provider/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /Chào mừng/i })).toBeVisible({ timeout: 15_000 });

    // 1. Verify Tab 1 (Ride) - Either active ride or empty state with PostgreSQL connect
    const rideTab = page.getByRole("button", { name: /Chuyến xe|Ride Partner/i }).first();
    await rideTab.click();
    await page.waitForTimeout(1000);
    const hasRide = await page.getByText(/Cuốc xe đang điều phối/i).count();
    const hasEmptyRide = await page.getByText(/Chưa có chuyến xe nào đang điều phối/i).count();
    expect(hasRide + hasEmptyRide).toBeGreaterThan(0);

    // 2. Verify Tab 2 (Food) - PostgreSQL Live Data badge
    const foodTab = page.getByRole("button", { name: /Đơn món|Food Merchant/i }).first();
    await foodTab.click();
    await page.waitForTimeout(1000);
    await expect(page.getByText(/PostgreSQL Live Data/i).first()).toBeVisible({ timeout: 10_000 });

    // 3. Verify Tab 3 (Healthcare) - PostgreSQL Live Data badge
    const healthTab = page.getByRole("button", { name: /Lịch khám|Healthcare/i }).first();
    await healthTab.click();
    await page.waitForTimeout(1000);
    await expect(page.getByText(/PostgreSQL Live Data/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
