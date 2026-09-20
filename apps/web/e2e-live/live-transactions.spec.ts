import { expect, test, type Page } from "@playwright/test";

async function completeOnboarding(page: Page, name: string): Promise<void> {
  if (!page.url().includes("/app/onboarding")) return;
  await page.getByRole("button", { name: /^Bắt đầu$/i }).click();
  await page.locator("#onboarding-name").fill(name);
  await page.getByRole("button", { name: /^Tiếp tục/i }).click();
  await page.locator("#onboarding-phone").fill("0900000000");
  await page.getByRole("button", { name: /^Tiếp tục/i }).click();
  await page.getByRole("button", { name: /Tiếp tục không dùng vị trí/i }).click();
  await page.locator("#onboarding-address").fill("34 Ngọc Hà, Ba Đình, Hà Nội");
  await page.getByRole("button", { name: "Tìm địa chỉ" }).click();
  await expect(page.locator(".candidate-list .candidate-option").first()).toBeVisible({ timeout: 30_000 });
  await page.locator(".candidate-list .candidate-option").first().click();
  await page.getByRole("button", { name: "Hoàn tất thiết lập" }).click();
  await expect(page).toHaveURL(/\/app(?:\?.*)?$/, { timeout: 30_000 });
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.goto("/?auth=login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/app(?:\/onboarding)?(?:\?.*)?$/, { timeout: 30_000 });
  await completeOnboarding(page, "Người dùng giao dịch E2E");
}

async function openAppRoute(page: Page, href: string): Promise<void> {
  const [path, query] = href.split("?", 2);
  if (path === "/app/profile" && query) {
    await page.goto(href);
    await expect(page).toHaveURL(new RegExp(`/app/profile\\?${query.replaceAll("=", "\\=")}$`), { timeout: 30_000 });
    return;
  }
  const link = page.locator(`a[href="${href}"]`).first();
  if (await link.isVisible().catch(() => false)) {
    await link.click();
  } else {
    await page.goto(href);
  }
  await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}(?:\\?.*)?$`), { timeout: 30_000 });
  if (query) await expect(page).toHaveURL(new RegExp(`[?&]${query.replaceAll("=", "\\=")}$`), { timeout: 30_000 });
}

async function openService(page: Page, service: "food" | "ride" | "restaurant" | "healthcare"): Promise<void> {
  const serviceLink = page.getByRole("link", { name: "Dịch vụ", exact: true }).first();
  if (await serviceLink.isVisible().catch(() => false)) {
    await serviceLink.click();
  } else {
    await page.getByRole("button", { name: "Cài đặt và tài khoản", exact: true }).click();
    await page.getByRole("menuitem", { name: "Dịch vụ", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Bốn cách để tiếp tục một việc đang dang dở" })).toBeVisible({ timeout: 30_000 });
  await page.locator(`a[href="/app/services/${service}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/app/services/${service}$`), { timeout: 30_000 });
}

test("real Gateway transaction flows: Food, Ride tracking, Restaurant, Healthcare, ops", async ({ page }) => {
  test.setTimeout(240_000);
  const email = process.env.LIVE_E2E_TRANSACTIONS_EMAIL ?? "user@xone.local";
  const password = process.env.LIVE_E2E_TRANSACTIONS_PASSWORD ?? "Password123!";

  page.on("pageerror", (error) => { throw error; });
  page.on("console", (message) => {
    if (message.type() === "error") throw new Error(`Browser console.error: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      console.log(`LIVE_HTTP_${response.status()} ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "unknown";
    if (errorText.includes("ERR_ABORTED") || errorText.includes("ERR_BLOCKED_BY_ORB")) return;
    throw new Error(`Failed request: ${request.url()} ${errorText}`);
  });

  await login(page, email, password);

  await openService(page, "food");
  await expect(page.getByRole("heading", { name: "Đồ ăn" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Xem thực đơn" }).first().click();
  await expect(page.getByRole("heading", { name: "Món đang phục vụ" })).toBeVisible({ timeout: 30_000 });
  // The first seeded item may expose a required modifier group; choose the
  // next demo item so this direct browse flow stays within the normal UI
  // contract instead of bypassing Food option validation.
  const menuItem = page.locator(".menu-item").nth(1);
  await menuItem.getByRole("button", { name: /Tùy chỉnh & Thêm/i }).click();
  await page.getByRole("button", { name: /Thêm vào giỏ/i }).click();
  await expect(page.getByRole("status")).toContainText("đã được thêm vào giỏ", { timeout: 30_000 });
  await page.getByRole("button", { name: "Xem preview xác nhận" }).click();
  await page.getByRole("checkbox", { name: /Xác nhận đặt món và thanh toán/i }).check();
  await page.locator(".confirmation-box").getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Đơn đã được tiếp nhận")).toBeVisible({ timeout: 30_000 });

  await openAppRoute(page, "/app/profile?section=addresses");
  await expect(page.locator("#addresses-title")).toBeVisible({ timeout: 30_000 });
  await page.locator(".address-form input").nth(0).fill("Công ty");
  await page.locator(".address-form input").nth(1).fill("20 Đinh Tiên Hoàng, Hoàn Kiếm, Hà Nội");
  await page.getByRole("button", { name: "Xác nhận vị trí" }).click();
  await expect(page.locator(".location-candidates .location-candidate").first()).toBeVisible({ timeout: 30_000 });
  await page.locator(".location-candidates .location-candidate").first().click();
  await page.getByRole("button", { name: "Lưu địa chỉ" }).click();
  await expect(page.locator(".address-row").filter({ hasText: "Công ty" }).filter({ hasText: "Đinh Tiên Hoàng" }).first()).toBeVisible({ timeout: 30_000 });

  await openService(page, "ride");
  const addressShortcuts = page.locator(".address-shortcuts select");
  await expect(addressShortcuts).toHaveCount(2, { timeout: 30_000 });
  await expect(addressShortcuts.nth(0).locator("option").nth(1)).toBeAttached({ timeout: 30_000 });
  const companyPickup = addressShortcuts.nth(0).locator("option").filter({ hasText: "Công ty" });
  if (await companyPickup.count()) {
    await addressShortcuts.nth(0).selectOption({ label: "Công ty" });
  } else {
    await addressShortcuts.nth(0).selectOption({ index: 1 });
  }
  const companyShortcut = addressShortcuts.nth(1).locator("option").filter({ hasText: "Công ty" });
  if (await companyShortcut.count()) {
    await addressShortcuts.nth(1).selectOption({ label: "Công ty" });
  } else {
    await expect(addressShortcuts.nth(1).locator("option").nth(1)).toBeAttached({ timeout: 30_000 });
    await addressShortcuts.nth(1).selectOption({ index: 1 });
  }
  const dropoffSuggestion = page.locator("#ride-dropoff-suggestions [role='option']").first();
  if (await dropoffSuggestion.isVisible().catch(() => false)) await dropoffSuggestion.click();
  await page.locator("#ride-pickup").fill("Hồ Hoàn Kiếm");
  await expect(page.locator("#ride-pickup-suggestions [role='option']").first()).toBeVisible({ timeout: 30_000 });
  await page.locator("#ride-pickup-suggestions [role='option']").first().click();
  await page.locator("#ride-dropoff").fill("Nguyễn Trãi");
  await expect(page.locator("#ride-dropoff-suggestions [role='option']").first()).toBeVisible({ timeout: 30_000 });
  await page.locator("#ride-dropoff-suggestions [role='option']").first().click();
  await page.getByRole("button", { name: /X-One Car 4/i }).click();
  await page.getByRole("button", { name: "Nhận báo giá" }).click();
  await expect(page.getByText("Xác nhận thông tin chuyến")).toBeVisible({ timeout: 30_000 });
  await page.locator(".confirmation-box").getByRole("checkbox").check();
  await page.locator(".confirmation-box").getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Thông tin chuyến đã được ghi nhận")).toBeVisible({ timeout: 30_000 });
  await page.locator(".confirmation-box").getByRole("checkbox").check();
  await page.locator(".confirmation-box").getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Thông tin chuyến đã được ghi nhận")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Trạng thái tài xế" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Tài xế đang đến|Đã đến điểm đón|Đang di chuyển|Đã đến nơi|Đã hoàn tất/i).first()).toBeVisible({ timeout: 30_000 });

  await openService(page, "restaurant");
  await page.getByRole("button", { name: "Xem và giữ bàn" }).first().click();
  await expect(page.getByRole("heading", { name: "Chọn thời gian" })).toBeVisible({ timeout: 30_000 });
  const reservationDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  reservationDate.setHours(12, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  const reservationDateTime = `${reservationDate.getFullYear()}-${pad(reservationDate.getMonth() + 1)}-${pad(reservationDate.getDate())}T${pad(reservationDate.getHours())}:${pad(reservationDate.getMinutes())}`;
  await page.locator('input[type="datetime-local"]').fill(reservationDateTime);
  await page.locator('input[type="number"]').fill("1");
  await page.getByRole("button", { name: "Kiểm tra bàn trống" }).click();
  await expect(page.getByText("Có bàn phù hợp")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Giữ bàn tạm thời" }).click();
  await page.getByRole("button", { name: "Xem xác nhận" }).click();
  await page.getByRole("checkbox", { name: /Xác nhận đặt bàn/i }).check();
  await page.locator(".confirmation-box").getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Đặt bàn đã hoàn tất")).toBeVisible({ timeout: 30_000 });

  await openAppRoute(page, "/app/profile?section=patients");
  await expect(page.locator("#patients-title")).toBeVisible({ timeout: 30_000 });
  await page.locator(".patient-form").scrollIntoViewIfNeeded();
  await page.locator(".patient-form input").nth(0).fill("Người bệnh E2E");
  await page.locator(".patient-form input").nth(1).fill("0900000001");
  await page.locator(".patient-form-actions").getByRole("button").first().click();
  await expect(page.getByRole("status")).toContainText(/đã được liên kết|Đã cập nhật thông tin hồ sơ bản thân/i, { timeout: 30_000 });

  await openService(page, "healthcare");
  await expect(page.getByRole("heading", { name: "Chọn chuyên khoa khám" })).toBeVisible({ timeout: 30_000 });
  const department = page.locator('input[placeholder="Tìm hoặc chọn chuyên khoa"]');
  await department.click();
  await page.getByRole("option").first().click();
  await expect(page.locator(".slot-option").last()).toBeVisible({ timeout: 30_000 });
  await page.locator(".slot-option").first().click();
  await page.getByLabel("Hồ sơ bệnh nhân").selectOption({ index: 1 });
  await page.getByPlaceholder("Mô tả ngắn để cơ sở chuẩn bị tiếp nhận").fill("Khám tổng quát trong luồng E2E.");
  await page.getByRole("button", { name: "Xác nhận đặt lịch" }).click();
  await expect(page.getByText("Đã giữ khung giờ")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Xác nhận thanh toán" }).click();
  await page.getByRole("button", { name: "Xem xác nhận cuối" }).click();
  await page.getByRole("checkbox", { name: /Xác nhận hoàn tất lịch khám/i }).check();
  await page.locator(".confirmation-box").getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Lịch khám: Đã xác nhận")).toBeVisible({ timeout: 30_000 });

  await openAppRoute(page, "/app/history");
  await expect(page.getByRole("heading", { name: "Hoạt động gần đây" })).toBeVisible({ timeout: 30_000 });
  await page.locator(".history-filters select").first().selectOption("restaurant_reservation");
  const reservationLink = page.locator('a[href*="/app/history/restaurant_reservation/"]').first();
  await expect(reservationLink).toBeVisible({ timeout: 30_000 });
  await reservationLink.click();
  await expect(page.getByRole("heading", { name: "Đặt bàn", exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Đặt bàn lại" }).click();
  await expect(page.getByRole("status")).toContainText("Khung giờ mới", { timeout: 30_000 });

  await openAppRoute(page, "/app/notifications");
  await expect(page.getByRole("heading", { name: "Thông báo của bạn" })).toBeVisible({ timeout: 30_000 });
  const readAll = page.getByRole("button", { name: "Đọc tất cả" });
  if (await readAll.isEnabled().catch(() => false)) {
    await readAll.click();
  }
  await expect(readAll).toBeDisabled({ timeout: 30_000 });
});
