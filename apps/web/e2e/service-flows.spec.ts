import { expect, test } from "@playwright/test";

import { installAuthenticatedFixture } from "./support/mock-gateway";

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
  await page.getByRole("link", { name: "Lịch sử" }).click();
  await expect(page.getByText("food order")).toBeVisible();
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
  await expect(page.getByText("Đang tìm tài xế")).toBeVisible();
  for (let index = 0; index < 5; index += 1) await page.getByRole("button", { name: "Cập nhật trạng thái chuyến xe" }).click();
  await expect(page.getByText("Đã hoàn tất")).toBeVisible();
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
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Đặt bàn đã hoàn tất")).toBeVisible();
});

test("Healthcare facility → doctor → patient → slot → payment → confirmation", async ({ context, page }) => {
  await installAuthenticatedFixture(context, { email: "healthcare@example.test" });
  await page.goto("/app/services/healthcare");
  await page.getByRole("button", { name: "Bác sĩ E2E" }).click();
  await page.getByLabel("Nhu cầu khám").fill("Khám định kỳ trong fixture E2E");
  await page.getByRole("button", { name: "Giữ khung giờ" }).click();
  await page.getByRole("button", { name: "Xác nhận thanh toán demo" }).click();
  await page.getByRole("button", { name: "Xem xác nhận cuối" }).click();
  await page.getByRole("checkbox", { name: /Xác nhận hoàn tất lịch khám/ }).check();
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Lịch khám: CONFIRMED")).toBeVisible();
});

test("Healthcare confirmed + Ride NO_DRIVER keeps partial success explicit", async ({ context, page }) => {
  await installAuthenticatedFixture(context, { email: "partial@example.test", noDriver: true });
  await page.goto("/app/services/healthcare");
  await page.getByRole("button", { name: "Bác sĩ E2E" }).click();
  await page.getByLabel("Nhu cầu khám").fill("Lịch khám vẫn phải giữ nguyên");
  await page.getByRole("button", { name: "Giữ khung giờ" }).click();
  await page.getByRole("button", { name: "Xác nhận thanh toán demo" }).click();
  await page.getByRole("button", { name: "Xem xác nhận cuối" }).click();
  await page.getByRole("checkbox", { name: /Xác nhận hoàn tất lịch khám/ }).check();
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Lịch khám: CONFIRMED")).toBeVisible();
  await page.goto("/app/services/ride");
  await page.getByLabel("Điểm đi").fill("Cơ sở X-One");
  await page.getByLabel("Điểm đến").fill("Nhà");
  await page.getByRole("button", { name: "Nhận báo giá" }).click();
  await page.getByRole("checkbox", { name: /xác nhận điểm đi/i }).check();
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await page.getByRole("checkbox", { name: /xác nhận thanh toán/i }).check();
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Chưa tìm thấy tài xế phù hợp")).toBeVisible();
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
  await expect(otherPage.getByRole("alert")).toBeVisible();
  await otherPage.goto("/app/conversations/conversation-a");
  await expect(otherPage.getByRole("alert")).toBeVisible();
  await otherPage.goto("/app/addresses");
  await expect(otherPage.getByText("Chưa có địa chỉ")).toBeVisible();
  expect(otherGateway.deniedRequests.length).toBeGreaterThan(0);
  await otherContext.close();
});
