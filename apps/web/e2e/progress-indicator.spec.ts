import { expect, test } from "@playwright/test";

import { installAuthenticatedFixture } from "./support/mock-gateway";

test("progress indicator: live stages, expandable timeline, seamless partial-success swap, stable layout, reload restores final state", async ({ context, page }) => {
  const gateway = await installAuthenticatedFixture(context, { email: "progress@example.test" });
  await page.goto("/app");
  await page.getByLabel("Nhập yêu cầu").fill("progress-e2e");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();

  // Progress appears immediately after submission with an honest high-level stage.
  const progress = page.locator(".agent-progress");
  await expect(progress).toBeVisible();
  await expect(progress.getByRole("status")).toHaveText(/Đang hiểu yêu cầu|Đang lấy dữ liệu dịch vụ|Đang đánh giá phương án|Đang chuẩn bị kết quả/);

  // No horizontal overflow while the indicator is live (asserted on every viewport project).
  const before = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(before.scrollWidth).toBeLessThanOrEqual(before.clientWidth);

  // Timeline is a real disclosure: expand, inspect the four generic stages, collapse.
  const toggle = progress.getByRole("button", { name: "Xem hoạt động" });
  await toggle.click();
  await expect(progress.locator(".activity-step")).toHaveCount(4);
  await expect(progress.locator(".activity-step-status.is-running")).toHaveCount(1);
  await progress.getByRole("button", { name: "Thu gọn hoạt động" }).click();
  await expect(toggle).toBeVisible();

  // The final partial-success result replaces the indicator in place.
  await expect(progress).not.toBeVisible();
  const cards = page.locator(".assistant-cards");
  await expect(cards).toBeVisible();
  await expect(page.getByText("Đặt bàn tại Quán E2E").first()).toBeVisible();
  await expect(page.getByText("RIDE_NO_DRIVER")).toBeVisible();
  await expect(page.getByRole("button", { name: "Thử lại bước này" })).toBeVisible();

  const after = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(after.scrollWidth).toBeLessThanOrEqual(after.clientWidth);

  // Reloading the conversation restores the final cards, never a stuck progress panel.
  await page.goto(`/app/conversations/${String(gateway.latestConversationId)}`);
  await expect(page.locator(".agent-progress")).toHaveCount(0);
  await expect(page.getByText("RIDE_NO_DRIVER")).toBeVisible();
  await expect(page.getByRole("button", { name: "Thử lại bước này" })).toBeVisible();
});
test("stop generating aborts the request, shows a neutral stopped state, and re-enables input", async ({ context, page }) => {
  const gateway = await installAuthenticatedFixture(context, { email: "stop@example.test" });
  await page.goto("/app");
  await page.getByLabel("Nhập yêu cầu").fill("progress-e2e");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();

  // The square stop button replaces the send button in the composer while loading,
  // before any long-wait threshold, and is gone from the progress bubble itself.
  const progress = page.locator(".agent-progress");
  await expect(progress).toBeVisible();
  await expect(progress.getByRole("button", { name: "Stop generating" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Gửi yêu cầu" })).toHaveCount(0);
  const stop = page.getByRole("button", { name: "Stop generating" });
  await expect(stop).toBeVisible();
  await stop.click();

  // No red error: the turn settles into a neutral stopped message and the
  // composer becomes usable again for a new prompt.
  await expect(progress).not.toBeVisible();
  await expect(page.getByText("Đã dừng tạo câu trả lời.")).toBeVisible();
  await expect(page.locator(".chat-message.is-stopped")).toBeVisible();
  const composer = page.getByLabel("Nhập yêu cầu");
  await expect(composer).toBeEnabled();
  await composer.fill("tin nhắn mới sau khi dừng");
  await expect(composer).toHaveValue("tin nhắn mới sau khi dừng");
  expect(gateway.latestConversationId).toBeTruthy();
});
