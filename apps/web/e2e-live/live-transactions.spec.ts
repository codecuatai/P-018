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
  await page.goto("/?auth=login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: /Đăng nhập/i }).click();
  await expect(page).toHaveURL(/\/app(?:\/onboarding)?(?:\?.*)?$/, { timeout: 30_000 });
  await completeOnboarding(page, "Người dùng giao dịch E2E");
}

async function openAppRoute(page: Page, href: string): Promise<void> {
  await page.locator(`a[href="${href}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`${href.replaceAll("/", "\\/")}(?:\\?.*)?$`), { timeout: 30_000 });
}

async function openService(page: Page, service: "food" | "ride" | "restaurant" | "healthcare"): Promise<void> {
  await page.getByRole("link", { name: "Dịch vụ", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Bốn cách để tiếp tục một việc đang dang dở" })).toBeVisible({ timeout: 30_000 });
  await page.locator(`a[href="/app/services/${service}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/app/services/${service}$`), { timeout: 30_000 });
}

test("real Gateway transaction flows: Food, Ride tracking, Restaurant, Healthcare, ops", async ({ page }) => {
  test.setTimeout(240_000);
  const email = process.env.LIVE_E2E_TRANSACTIONS_EMAIL;
  const password = process.env.LIVE_E2E_TRANSACTIONS_PASSWORD;
  if (!email || !password) throw new Error("Set LIVE_E2E_TRANSACTIONS_EMAIL and LIVE_E2E_TRANSACTIONS_PASSWORD for the live transaction test.");

  page.on("pageerror", (error) => { throw error; });
  page.on("console", (message) => {
    if (message.type() === "error") throw new Error(`Browser console.error: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      console.log(`LIVE_HTTP_${response.status()} ${response.url()}`);
      if (response.status() === 409) void response.text().then((body) => console.log(`LIVE_HTTP_409_BODY ${body}`)).catch(() => undefined);
    }
  });
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "unknown";
    if (errorText.includes("ERR_ABORTED")) return;
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
  await page.locator(".menu-item").nth(1).getByRole("button", { name: "Thêm" }).click();
  await expect(page.getByRole("status")).toContainText("đã được thêm vào giỏ", { timeout: 30_000 });
  await page.getByRole("button", { name: "Xem preview xác nhận" }).click();
  await page.getByRole("checkbox", { name: /Xác nhận đặt món và thanh toán sandbox/i }).check();
  await page.locator(".confirmation-box").getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Đơn đã được tiếp nhận")).toBeVisible({ timeout: 30_000 });

  await openAppRoute(page, "/app/addresses");
  await expect(page.getByRole("heading", { name: "Địa chỉ đã lưu" })).toBeVisible({ timeout: 30_000 });
  await page.locator(".address-form input").nth(0).fill("Công ty");
  await page.locator(".address-form input").nth(1).fill("20 Đinh Tiên Hoàng, Hoàn Kiếm, Hà Nội");
  await page.getByRole("button", { name: "Xác nhận vị trí" }).click();
  await expect(page.locator(".location-candidates .location-candidate").first()).toBeVisible({ timeout: 30_000 });
  await page.locator(".location-candidates .location-candidate").first().click();
  await page.getByRole("button", { name: "Lưu địa chỉ" }).click();
  await expect(page.getByText("20 Đinh Tiên Hoàng, Hoàn Kiếm, Hà Nội", { exact: true })).toBeVisible({ timeout: 30_000 });

  await openService(page, "ride");
  await page.locator(".address-shortcuts select").nth(0).selectOption({ label: "Nhà" });
  await page.locator(".address-shortcuts select").nth(1).selectOption({ label: "Công ty" });
  await page.selectOption("#ride-vehicle", "CAR_4");
  await page.getByRole("button", { name: "Nhận báo giá" }).click();
  await expect(page.getByText(/Nguồn route:/)).toBeVisible({ timeout: 30_000 });
  await page.locator(".confirmation-box").getByRole("checkbox").check();
  await page.locator(".confirmation-box").getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Thông tin chuyến đã được ghi nhận")).toBeVisible({ timeout: 30_000 });
  await page.locator(".confirmation-box").getByRole("checkbox").check();
  await page.locator(".confirmation-box").getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText(/Booking đã ghi nhận|Tài xế đã được gán|Chuyến đã hoàn tất/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Trạng thái tài xế" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Đã hoàn tất", { exact: true })).toBeVisible({ timeout: 60_000 });

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

  await openAppRoute(page, "/app/patients");
  await expect(page.getByRole("heading", { name: "Hồ sơ người bệnh" })).toBeVisible({ timeout: 30_000 });
  await page.getByText("Thêm người bệnh").scrollIntoViewIfNeeded();
  await page.locator(".patient-form input").nth(0).fill("Người bệnh E2E");
  await page.locator(".patient-form input").nth(1).fill("0900000001");
  await page.getByRole("button", { name: "Liên kết hồ sơ" }).click();
  await expect(page.getByRole("status")).toContainText("đã được liên kết", { timeout: 30_000 });

  await openService(page, "healthcare");
  await expect(page.getByRole("heading", { name: "Chọn điểm bắt đầu" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Nội Tim mạch", exact: true }).click();
  await expect(page.locator(".slot-option").last()).toBeVisible({ timeout: 30_000 });
  await page.locator(".slot-option").first().click();
  await page.getByPlaceholder("Mô tả ngắn để cơ sở chuẩn bị tiếp nhận").fill("Khám tổng quát trong luồng E2E.");
  await page.getByRole("button", { name: "Giữ khung giờ" }).click();
  await page.getByRole("button", { name: "Xác nhận thanh toán demo" }).click();
  await page.getByRole("button", { name: "Xem xác nhận cuối" }).click();
  await page.getByRole("checkbox", { name: /Xác nhận hoàn tất lịch khám/i }).check();
  await page.locator(".confirmation-box").getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Lịch khám: CONFIRMED")).toBeVisible({ timeout: 30_000 });

  await openAppRoute(page, "/app/history");
  await expect(page.getByRole("heading", { name: "Những việc bạn đã làm" })).toBeVisible({ timeout: 30_000 });
  await page.locator(".history-filters select").first().selectOption("restaurant_reservation");
  const reservationLink = page.locator('a[href*="/app/history/restaurant_reservation/"]').first();
  await expect(reservationLink).toBeVisible({ timeout: 30_000 });
  await reservationLink.click();
  await expect(page.getByRole("heading", { name: "Đặt bàn" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Đặt bàn lại" }).click();
  await expect(page.getByRole("status")).toContainText("Khung giờ mới", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Đánh giá trải nghiệm" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("radio", { name: "5 sao" }).click();
  await page.getByPlaceholder("Điều gì hữu ích hoặc cần cải thiện?").fill("Luồng giao dịch và xác nhận rõ ràng.");
  await page.getByRole("button", { name: "Lưu đánh giá" }).click();
  await expect(page.getByRole("status")).toContainText("Đánh giá đã được lưu", { timeout: 30_000 });

  await openAppRoute(page, "/app/notifications");
  await expect(page.getByRole("heading", { name: "Thông báo của bạn" })).toBeVisible({ timeout: 30_000 });
  const readAll = page.getByRole("button", { name: "Đọc tất cả" });
  await expect(readAll).toBeEnabled({ timeout: 30_000 });
  await readAll.click();
  await expect(readAll).toBeDisabled({ timeout: 30_000 });
});
