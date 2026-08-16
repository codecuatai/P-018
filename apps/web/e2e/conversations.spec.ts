import { expect, test } from "@playwright/test";

import { installAuthenticatedFixture } from "./support/mock-gateway";

test("conversation new → send → rename → archive → unarchive → reload → delete", async ({ context, page }) => {
  const gateway = await installAuthenticatedFixture(context, { email: "conversation@example.test" });
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Mình có thể giúp gì hôm nay?" })).toBeVisible();

  await page.getByLabel("Nhập yêu cầu").fill("Tìm một lựa chọn deterministic");
  await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.getByText("Mình đã ghi nhận yêu cầu trong chế độ deterministic E2E.")).toBeVisible();

  await page.goto("/app/history");
  await expect(page.getByText("Cuộc trò chuyện E2E")).toBeVisible();
  const conversation = page.locator("article.history-row").first();
  await conversation.getByRole("button", { name: /Đổi tên/ }).click();
  await conversation.getByRole("textbox").fill("Cuộc trò chuyện đã đổi tên");
  await conversation.getByRole("button", { name: "Lưu tên" }).click();
  await expect(page.getByText("Cuộc trò chuyện đã đổi tên")).toBeVisible();

  await conversation.getByRole("button", { name: /Lưu trữ/ }).click();
  await expect(page.getByRole("heading", { name: "Đã lưu trữ" })).toBeVisible();
  await page.getByRole("button", { name: /Bỏ lưu trữ/ }).click();
  await page.reload();
  await expect(page.getByText("Cuộc trò chuyện đã đổi tên")).toBeVisible();

  const deleteButton = conversation.locator(".history-row-actions button").last();
  await deleteButton.click();
  await deleteButton.click();
  await expect(page.getByText("Cuộc trò chuyện đã đổi tên")).not.toBeVisible();
  expect(gateway.calls.some((call) => call.path === "/api/v1/assistant/chat")).toBe(true);
});
