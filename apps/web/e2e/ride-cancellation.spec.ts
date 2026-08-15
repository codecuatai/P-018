import { expect, test } from "@playwright/test";

import { installAuthenticatedFixture } from "./support/mock-gateway";

test("cancelling an active Ride removes it from the active-work rail", async ({ context, page }) => {
  await installAuthenticatedFixture(context, { email: "ride-cancel@example.test" });
  let cancelCalled = false;
  await context.route("**/api/v1/history/active", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { items: [{ id: "ride-active-cancel", type: "ride_booking", title: "Chuyến xe", status: "AWAITING_CONFIRMATION", detail: "VinUni → Hồ Gươm · 139.000 đ", timestamp: new Date().toISOString(), source: "ride_booking", resource: { booking_id: "ride-active-cancel", pickup: "VinUni", dropoff: "Hồ Gươm" } }] } }),
    });
  });
  await context.route("**/api/v1/rides/ride-active-cancel/tracking", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { booking_id: "ride-active-cancel", status: "AWAITING_CONFIRMATION", progress: 0, eta_seconds: 0 } }),
    });
  });
  await context.route("**/api/v1/service-actions/ride/ride-active-cancel/cancel", async (route) => {
    cancelCalled = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { id: "ride-active-cancel", status: "CANCELLED" } }),
    });
  });

  await page.goto("/app");
  const card = page.locator(".active-ride-rail-card");
  const cancelButton = card.locator(".ride-cancel-button");
  await expect(card).toBeVisible();
  await expect(cancelButton).toBeVisible();
  const [cardBox, buttonBox] = await Promise.all([card.boundingBox(), cancelButton.boundingBox()]);
  expect(buttonBox?.x ?? 0).toBeGreaterThanOrEqual(cardBox?.x ?? 0);
  expect((buttonBox?.x ?? 0) + (buttonBox?.width ?? 0)).toBeLessThanOrEqual((cardBox?.x ?? 0) + (cardBox?.width ?? 0));
  expect((buttonBox?.y ?? 0) + (buttonBox?.height ?? 0)).toBeLessThanOrEqual((cardBox?.y ?? 0) + (cardBox?.height ?? 0));
  page.once("dialog", (dialog) => void dialog.accept());
  await cancelButton.click();
  await expect(page.locator(".active-ride-rail-card")).toHaveCount(0);
  expect(cancelCalled).toBeTruthy();
});
