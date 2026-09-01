import { expect, test } from "@playwright/test";

import { installAuthenticatedFixture } from "./support/mock-gateway";

test("collapsible agent cards: collapse keeps layout stable and reload restores the default", async ({ context, page }) => {
  const gateway = await installAuthenticatedFixture(context, { email: "collapsible@example.test" });
  await page.goto("/app");
  await page.getByLabel("Nhập yêu cầu").fill("collapsible-e2e");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();

  const restaurantCard = page.locator(".collapsible-agent-card").first();
  const rideCard = page.locator(".collapsible-agent-card").nth(1);
  await expect(restaurantCard.getByRole("button", { name: "Thu gọn" })).toBeVisible();
  await expect(restaurantCard.locator(".collapsible-card-summary")).toHaveCount(0);
  await expect(rideCard.getByRole("button", { name: "Thu gọn" })).toBeVisible();

  const before = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(before.scrollWidth).toBeLessThanOrEqual(before.clientWidth);

  await restaurantCard.getByRole("button", { name: "Thu gọn" }).click();
  await expect(restaurantCard.getByRole("button", { name: "Hiện tất cả" })).toBeVisible();
  await expect(restaurantCard.locator(".collapsible-card-summary")).toHaveText("3 quán phù hợp");
  await expect(restaurantCard.locator(".collapsible-card-content")).toHaveAttribute("inert");
  await expect(rideCard.getByRole("button", { name: "Thu gọn" })).toBeVisible();

  const after = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(after.scrollWidth).toBeLessThanOrEqual(after.clientWidth);

  await restaurantCard.getByRole("button", { name: "Hiện tất cả" }).click();
  await expect(restaurantCard.getByRole("button", { name: "Thu gọn" })).toBeVisible();

  await page.goto(`/app/conversations/${String(gateway.latestConversationId)}`);
  const restoredCard = page.locator(".collapsible-agent-card").first();
  await expect(restoredCard.getByRole("button", { name: "Thu gọn" })).toBeVisible();
  await expect(restoredCard.getByText("Quán E2E 1")).toBeVisible();
});
