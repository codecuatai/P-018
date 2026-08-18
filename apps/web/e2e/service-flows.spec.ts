import { expect, test } from "@playwright/test";

import { installAuthenticatedFixture } from "./support/mock-gateway";

test("saved address can be updated manually without reusing stale coordinates", async ({ context, page }) => {
  const gateway = await installAuthenticatedFixture(context, { email: "address-edit@example.test" });
  gateway.seedAddress();

  await page.goto("/app/addresses");
  await expect(page.getByText("12 Nguyễn Huệ, Quận 1")).toBeVisible();

  await page.getByRole("button", { name: "Sửa Nhà" }).click();
  await page.getByRole("textbox", { name: "Địa chỉ" }).fill("181 Đường Nguyễn Trãi, Thanh Xuân, Hà Nội");

  await expect(page.getByText(/tọa độ cũ sẽ không được giữ lại/i)).toBeVisible();
  const update = page.getByRole("button", { name: "Cập nhật địa chỉ" });
  await expect(update).toBeEnabled();
  await update.click();

  await expect(page.getByText("181 Đường Nguyễn Trãi, Thanh Xuân, Hà Nội")).toBeVisible();
  expect(gateway.calls.filter((call) => call.path === "/api/v1/addresses/address-a" && call.method === "PATCH")).toHaveLength(1);
});

test("Food browse → menu → cart → preview → explicit order → receipt/history", async ({ context, page }) => {
  const gateway = await installAuthenticatedFixture(context, { email: "food@example.test" });
  const mock = gateway.seedAddress();
  await page.goto("/app/services/food");
  await page.getByRole("button", { name: "Xem thực đơn" }).click();
  await page.getByRole("button", { name: "Thêm" }).click();
  await expect(page.getByRole("status")).toContainText("Phở bò X-One đã được thêm vào giỏ.");
  await page.getByRole("button", { name: "Xem preview xác nhận" }).click();
  await page.getByRole("checkbox", { name: /Xác nhận đặt món/ }).check();
  await page.getByRole("button", { name: "Xác nhận" }).last().click();
  await expect(page.getByText("Đơn đã được tiếp nhận")).toBeVisible();
  await page.goto("/app/history");
  await expect(page.getByText("Đơn đồ ăn")).toBeVisible();
  expect(mock.id).toBe("address-a");
});

test("Ride quote → two confirmations → persisted tracking lifecycle", async ({ context, page }) => {
  const gateway = await installAuthenticatedFixture(context, { email: "ride@example.test" });
  await page.goto("/app/services/ride");
  await page.getByLabel("Điểm đi").fill("12 Nguyễn Huệ");
  await page.getByLabel("Điểm đến").fill("Hồ Gươm");
  await page.getByRole("button", { name: "Nhận báo giá" }).click();
  await expect(page.getByText("db-tariff-e2e")).toBeVisible();
  await page.getByRole("checkbox", { name: /xác nhận điểm đi/i }).check();
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await page.getByRole("checkbox", { name: /xác nhận thanh toán/i }).check();
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Chuyến của bạn đã được ghi nhận")).toBeVisible();
  await expect(page.locator(".tracking-summary strong").getByText("Đã hoàn tất")).toBeVisible({ timeout: 10_000 });
  expect(gateway.calls.filter((call) => call.path.endsWith("/tracking")).length).toBeGreaterThanOrEqual(1);
});

test("Restaurant hold → confirmation → reservation history", async ({ context, page }) => {
  await installAuthenticatedFixture(context, { email: "restaurant@example.test" });
  await page.goto("/app/services/restaurant");
  await page.getByRole("button", { name: "Xem và giữ bàn" }).click();
  await page.getByRole("button", { name: "Kiểm tra bàn trống" }).click();
  await page.getByRole("button", { name: "Giữ bàn tạm thời" }).click();
  await page.getByRole("button", { name: "Xem xác nhận" }).click();
  await page.getByRole("checkbox", { name: /Xác nhận đặt bàn/ }).check();
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByText("Đặt bàn đã hoàn tất")).toBeVisible();
});

test("Healthcare facility → doctor → patient → slot → payment → confirmation", async ({ context, page }) => {
  await installAuthenticatedFixture(context, { email: "healthcare@example.test" });
  await page.goto("/app/services/healthcare");
  await page.getByRole("button", { name: "Bác sĩ E2E" }).click();
  await page.getByLabel("Nhu cầu khám").fill("Khám định kỳ trong fixture E2E");
  await page.getByRole("button", { name: "Giữ khung giờ" }).click();
  await page.getByRole("button", { name: "Xác nhận thanh toán" }).click();
  await page.getByRole("button", { name: "Xem xác nhận cuối" }).click();
  await page.getByRole("checkbox", { name: /Xác nhận hoàn tất lịch khám/ }).check();
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Lịch khám: Đã xác nhận")).toBeVisible();
});

test("Healthcare confirmed + Ride NO_DRIVER keeps partial success explicit", async ({ context, page }) => {
  await installAuthenticatedFixture(context, { email: "partial@example.test", noDriver: true });
  await page.goto("/app/services/healthcare");
  await page.getByRole("button", { name: "Bác sĩ E2E" }).click();
  await page.getByLabel("Nhu cầu khám").fill("Lịch khám vẫn phải giữ nguyên");
  await page.getByRole("button", { name: "Giữ khung giờ" }).click();
  await page.getByRole("button", { name: "Xác nhận thanh toán" }).click();
  await page.getByRole("button", { name: "Xem xác nhận cuối" }).click();
  await page.getByRole("checkbox", { name: /Xác nhận hoàn tất lịch khám/ }).check();
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Lịch khám: Đã xác nhận")).toBeVisible();
  await page.goto("/app/services/ride");
  await page.getByLabel("Điểm đi").fill("Cơ sở X-One");
  await page.getByLabel("Điểm đến").fill("Nhà");
  await page.getByRole("button", { name: "Nhận báo giá" }).click();
  await page.getByRole("checkbox", { name: /xác nhận điểm đi/i }).check();
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await page.getByRole("checkbox", { name: /xác nhận thanh toán/i }).check();
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Chưa tìm được tài xế phù hợp")).toBeVisible();
});

test("cross-user resource access is denied by the Gateway boundary", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const ownerGateway = await installAuthenticatedFixture(ownerContext, { email: "owner@example.test" });
  ownerGateway.seedAddress();
  ownerGateway.seedConversation();
  await ownerContext.close();

  const otherContext = await browser.newContext();
  const otherGateway = await installAuthenticatedFixture(otherContext, { email: "other@example.test", foreignIds: ["address-a", "conversation-a", "food-order-1", "ride-booking-1", "reservation-1", "91"] });
  const otherPage = await otherContext.newPage();
  await otherPage.goto("/app/history/ride_booking/ride-booking-1");
  await expect(otherPage.locator(".error-panel").first()).toBeVisible();
  await otherPage.goto("/app/conversations/conversation-a");
  await expect(otherPage.locator(".error-panel").first()).toBeVisible();
  await otherPage.goto("/app/addresses");
  await expect(otherPage.getByText("Chưa có địa chỉ")).toBeVisible();
  expect(otherGateway.deniedRequests.length).toBeGreaterThan(0);
  await otherContext.close();
});

test("Ride detail modal keeps the shared map-first layout and the info layer above Leaflet", async ({ context, page }) => {
  await installAuthenticatedFixture(context, { email: "ride-modal@example.test" });
  await page.goto("/app/services/ride");
  await page.locator("#ride-pickup").fill("12 Nguyen Hue");
  await page.locator("#ride-dropoff").fill("Ho Guom");
  await page.locator(".ride-form button[type=submit]").click();
  await expect(page.locator(".quote-result")).toBeVisible();
  await page.locator(".quote-result .ride-detail-action").click();

  const modal = page.locator(".service-detail-dialog-ride");
  await expect(modal).toBeVisible();
  await expect(modal.locator(".ride-map-stage")).toBeVisible();
  await expect(modal.locator(".xone-map-toolbar small")).toHaveText("Lộ trình đã được cập nhật");
  const modalBox = await modal.boundingBox();
  const mapBox = await modal.locator(".ride-map-stage").boundingBox();
  expect(modalBox).not.toBeNull();
  expect(mapBox).not.toBeNull();
  expect(mapBox?.height ?? 0).toBeGreaterThan((modalBox?.height ?? 0) * 0.65);

  await modal.locator(".detail-info-button").click();
  const info = modal.locator(".ride-map-info-panel");
  await expect(info).toBeVisible();
  await expect(info).toHaveCSS("z-index", "1100");
  const infoButtonBox = await modal.locator(".ride-map-info-button").boundingBox();
  const closeButtonBox = await modal.locator(".auth-dialog-close").boundingBox();
  expect(infoButtonBox).not.toBeNull();
  expect(closeButtonBox).not.toBeNull();
  expect(infoButtonBox?.x ?? 0).toBeLessThan(closeButtonBox?.x ?? Number.POSITIVE_INFINITY);
});

test("Ride form keeps the shared detail modal after both confirmations", async ({ context, page }) => {
  await installAuthenticatedFixture(context, { email: "ride-form-confirmed@example.test" });
  await page.goto("/app/services/ride");
  await page.locator("#ride-pickup").fill("12 Nguyen Hue");
  await page.locator("#ride-dropoff").fill("Ho Guom");
  await page.locator(".ride-form button[type=submit]").click();
  await expect(page.locator(".quote-result")).toBeVisible();
  await page.getByRole("checkbox", { name: /xác nhận điểm đi/i }).check();
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await page.getByRole("checkbox", { name: /xác nhận thanh toán/i }).check();
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Chuyến của bạn đã được ghi nhận")).toBeVisible();
  await page.locator(".quote-result .ride-detail-action").click();

  const modal = page.locator(".service-detail-dialog-ride");
  await expect(modal.locator(".ride-map-stage")).toBeVisible();
  await expect(modal.locator(".ride-map-status-panel")).toBeVisible();
  await expect(modal.locator(".ride-map-status-panel .xone-map")).toHaveCount(0);
  expect(await modal.locator(".ride-map-detail").evaluate((element) => element.scrollHeight > element.clientHeight)).toBeTruthy();
});

test("Active service rail keeps its content compact on mobile", async ({ context, page }) => {
  await installAuthenticatedFixture(context, { email: "active-rail@example.test" });
  await context.route("**/api/v1/history/active", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { items: [{ id: "ride-active-1", type: "ride_booking", title: "Chuyến xe", status: "AWAITING_CONFIRMATION", detail: "Lộ trình đang được cập nhật · 139.000 VND", timestamp: new Date().toISOString(), source: "ride_booking", resource: { booking_id: "ride-active-1", pickup: "12 Nguyễn Huệ", dropoff: "Hồ Gươm" } }] } }),
    });
  });
  await page.goto("/app");

  const rail = page.locator(".context-rail-active");
  const card = rail.locator(".active-ride-rail-card");
  await expect(rail).toBeVisible();
  await expect(card).toBeVisible();
  const railBox = await rail.boundingBox();
  const cardBox = await card.boundingBox();
  expect(railBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  expect(cardBox?.height ?? 0).toBeLessThan(260);
  if ((page.viewportSize()?.width ?? Number.POSITIVE_INFINITY) <= 768) {
    expect(railBox?.height ?? 0).toBeLessThan(430);
  }
});

test("Active Ride detail puts the map first and keeps confirmed trip data behind a button", async ({ context, page }) => {
  await installAuthenticatedFixture(context, { email: "active-ride-detail@example.test" });
  await context.route("**/api/v1/history/active", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { items: [{ id: "ride-active-detail", type: "ride_booking", title: "Chuyến xe VinUni → Ho Guom", status: "AWAITING_CONFIRMATION", detail: "VinUni → Ho Guom · CAR_4 · 139.000 VND", timestamp: new Date().toISOString(), source: "ride_booking", resource: { booking_id: "ride-active-detail", pickup_address: "VinUni", dropoff_address: "Ho Guom", vehicle_type: "CAR_4", amount: 139000, currency: "VND", distance_km: 16.4, duration_minutes: 17, pickup_latitude: 21.0102, pickup_longitude: 105.8048, dropoff_latitude: 21.0285, dropoff_longitude: 105.8542, route: { origin: { latitude: 21.0102, longitude: 105.8048 }, destination: { latitude: 21.0285, longitude: 105.8542 }, distance_meters: 16400, duration_seconds: 1020, geometry: [{ latitude: 21.0102, longitude: 105.8048 }, { latitude: 21.0201, longitude: 105.83 }, { latitude: 21.0285, longitude: 105.8542 }] } } }] } }),
    });
  });
  await context.route("**/api/v1/rides/ride-active-detail/tracking", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { booking_id: "ride-active-detail", status: "AWAITING_CONFIRMATION", progress: 0, eta_seconds: 0, route: { provider: "fixture", origin: { latitude: 21.0102, longitude: 105.8048 }, destination: { latitude: 21.0285, longitude: 105.8542 }, distance_meters: 16400, duration_seconds: 1020, geometry: [{ latitude: 21.0102, longitude: 105.8048 }, { latitude: 21.0201, longitude: 105.83 }, { latitude: 21.0285, longitude: 105.8542 }] } } }),
    });
  });
  await page.goto("/app");
  await page.locator(".active-ride-rail-card .text-link").click();

  const modal = page.locator(".active-ride-detail-dialog");
  await expect(modal).toBeVisible();
  await expect(modal.locator(".ride-map-stage")).toBeVisible();
  await expect(modal.locator(".ride-map-status-panel")).toBeVisible();
  await expect(modal.locator(".ride-map-status-panel .xone-map")).toHaveCount(0);
  await expect(modal.locator(".tracking-timeline")).toBeVisible();
  expect(await modal.locator(".ride-map-detail").evaluate((element) => element.scrollHeight > element.clientHeight)).toBeTruthy();
  await expect(modal.locator(".tracking-footnote")).toHaveCount(0);

  await modal.locator(".detail-info-button").click();
  const info = modal.locator(".ride-map-info-panel");
  await expect(info).toContainText("VinUni");
  await expect(info).toContainText("Ho Guom");
  await expect(info).toContainText("CAR_4");
  await expect(info).toContainText("16.4 km");
  await expect(info).toContainText("17 phút");
  await expect(info).toContainText("139.000 đ");
});
