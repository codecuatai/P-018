import { expect, test, type Page } from "@playwright/test";

import { installAuthenticatedFixture } from "./support/mock-gateway";

async function expectNoPageOverflow(page: Page, pageName: string) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document, `${pageName} document width: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body, `${pageName} body width: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test("login and both registration modes fit the viewport and remain usable", async ({ page }, testInfo) => {
  await page.goto("/?auth=login");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expectNoPageOverflow(page, "login");
  await expect(dialog.getByRole("button", { name: "Đăng nhập", exact: true }).last()).toBeVisible();
  const loginWidth = (await dialog.boundingBox())?.width ?? 0;

  await dialog.getByRole("tab", { name: "Chuyển sang đăng ký" }).click();
  const registerWidth = (await dialog.boundingBox())?.width ?? 0;
  if ((page.viewportSize()?.width ?? 0) > 600) expect(registerWidth).toBeGreaterThan(loginWidth);
  await expect(dialog.getByLabel("Họ và tên")).toBeVisible();
  await expect(dialog.getByLabel("Email")).toBeVisible();
  const customerSubmit = dialog.getByRole("button", { name: "Tạo tài khoản" });
  await customerSubmit.scrollIntoViewIfNeeded();
  await expect(customerSubmit).toBeVisible();
  await expectNoPageOverflow(page, "customer registration");

  await dialog.getByRole("button", { name: /Đối tác dịch vụ/i }).click();
  await expect(dialog.getByRole("group", { name: "Chọn lĩnh vực đối tác" })).toBeVisible();
  if (testInfo.project.name === "chromium-375") {
    await page.screenshot({ path: testInfo.outputPath("provider-registration-mobile.png") });
  } else if (testInfo.project.name === "chromium-1440") {
    await page.screenshot({ path: testInfo.outputPath("provider-registration-desktop.png") });
  }
  await expect(dialog.getByLabel("Tên thương hiệu / Cơ sở")).toBeVisible();
  const providerSubmit = dialog.getByRole("button", { name: /Đăng ký làm Đối tác X-One/i });
  await providerSubmit.scrollIntoViewIfNeeded();
  await expect(providerSubmit).toBeVisible();
  await expectNoPageOverflow(page, "provider registration");
});

test("customer workspace remains within the viewport", async ({ context, page }, testInfo) => {
  const gateway = await installAuthenticatedFixture(context, { email: "responsive-user@example.test", role: "user" });
  await page.goto("/app");
  await expect(page.locator(".customer-shell")).toBeVisible();
  await expectNoPageOverflow(page, "customer workspace");
  await expect(page.locator(".context-rail")).toBeHidden();
  await expect(page.locator(".chat-empty-sub")).toBeVisible();
  const introOverlapsComposer = await page.evaluate(() => {
    const intro = document.querySelector(".proactive-ai-banner")?.getBoundingClientRect();
    const composer = document.querySelector(".composer-wrap")?.getBoundingClientRect();
    return Boolean(intro && composer && intro.bottom > composer.top && intro.top < composer.bottom);
  });
  expect(introOverlapsComposer, "customer suggestion and composer should not overlap").toBe(false);
  if ((page.viewportSize()?.width ?? Number.POSITIVE_INFINITY) <= 480) {
    const firstQuickActionVisible = await page.evaluate(() => {
      const suggestion = document.querySelector(".chat-empty-suggestion")?.getBoundingClientRect();
      const composer = document.querySelector(".composer-wrap")?.getBoundingClientRect();
      return Boolean(suggestion && composer && suggestion.bottom <= composer.top + 1);
    });
    expect(firstQuickActionVisible, "first customer quick action should remain above the composer").toBe(true);
  }
  if (testInfo.project.name === "chromium-375") await page.screenshot({ path: testInfo.outputPath("customer-mobile.png") });

  gateway.seedConversation();
  await page.goto("/app/conversations/conversation-a");
  const supportButton = page.getByRole("button", { name: "Yêu cầu người hỗ trợ" });
  await expect(supportButton).toBeVisible();
  const composerAlignment = await page.evaluate(() => {
    const hint = document.querySelector(".composer-footer .composer-hint")?.getBoundingClientRect();
    const support = document.querySelector(".composer-support-button")?.getBoundingClientRect();
    const footer = document.querySelector(".composer-footer")?.getBoundingClientRect();
    return {
      centerDifference: hint && support ? Math.abs((hint.top + hint.height / 2) - (support.top + support.height / 2)) : Number.POSITIVE_INFINITY,
      footerHeight: footer?.height ?? Number.POSITIVE_INFINITY,
      width: document.documentElement.clientWidth,
    };
  });
  expect(composerAlignment.centerDifference, "support action should align beside the composer hint").toBeLessThanOrEqual(3);
  expect(composerAlignment.footerHeight, "support footer should remain compact").toBeLessThanOrEqual(composerAlignment.width <= 560 ? 34 : 38);
  if (testInfo.project.name === "chromium-375") await page.screenshot({ path: testInfo.outputPath("customer-composer-mobile.png") });
  if (testInfo.project.name === "chromium-1440") await page.screenshot({ path: testInfo.outputPath("customer-composer-desktop.png") });
});

test("provider portal remains within the viewport", async ({ context, page }, testInfo) => {
  await installAuthenticatedFixture(context, { email: "responsive-provider@example.test", role: "provider" });
  await page.goto("/app/provider");
  await expect(page.locator(".provider-shell")).toBeVisible();
  if (testInfo.project.name === "chromium-375") await page.screenshot({ path: testInfo.outputPath("provider-mobile.png") });
  await expect(page.getByText(/X-One Partner Portal/i).first()).toBeVisible();
  await expectNoPageOverflow(page, "provider portal");
  if ((page.viewportSize()?.width ?? Number.POSITIVE_INFINITY) <= 680) {
    await expect(page.locator(".provider-today-metrics")).toHaveCSS("display", "grid");
    await expect(page.locator(".provider-connectivity-list")).toHaveCSS("overflow-x", "auto");
  }
  const providerLayout = await page.evaluate(() => {
    const navigation = document.querySelector(".provider-sidebar")?.getBoundingClientRect();
    const content = document.querySelector(".provider-main")?.getBoundingClientRect();
    return {
      navigation: navigation?.toJSON(),
      content: content?.toJSON(),
      bodyOverflow: getComputedStyle(document.querySelector(".provider-body")!).overflow,
      sidebarPosition: getComputedStyle(document.querySelector(".provider-sidebar")!).position,
      sidebarTop: getComputedStyle(document.querySelector(".provider-sidebar")!).top,
    };
  });
  if ((page.viewportSize()?.width ?? Number.POSITIVE_INFINITY) <= 820) {
    const navigationOverlapsContent = Boolean(providerLayout.navigation && providerLayout.content && providerLayout.navigation.bottom > providerLayout.content.top + 1);
    expect(navigationOverlapsContent, "provider navigation should not cover portal content").toBe(false);
  }
  if ((page.viewportSize()?.width ?? Number.POSITIVE_INFINITY) <= 560) {
    await expect(page.locator(".provider-status-button")).toBeVisible();
    await expect(page.getByRole("button", { name: /bật chuông báo đơn mới|tắt chuông báo đơn mới/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mở giao diện khách hàng" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Đăng xuất khỏi tài khoản" })).toBeVisible();
    const headerOverflows = await page.locator(".provider-shell .app-global-header").evaluate((header) => header.scrollWidth > header.clientWidth + 1);
    expect(headerOverflows, "provider header actions should fit without horizontal scrolling").toBe(false);
  }
});

for (const role of ["manager", "admin"] as const) {
  test(`${role} workspace remains within the viewport`, async ({ context, page }, testInfo) => {
    await installAuthenticatedFixture(context, { email: `responsive-${role}@example.test`, role });
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: role === "manager" ? /Trung tâm vận hành/i : /Quản trị hệ thống/i })).toBeVisible();
    await expect(page.locator(role === "manager" ? ".admin-shell-manager" : ".admin-shell-admin")).toBeVisible();
    await expectNoPageOverflow(page, `${role} workspace`);
    if ((page.viewportSize()?.width ?? Number.POSITIVE_INFINITY) <= 480) {
      const metricColumns = await page.locator(".admin-metric-grid").first().evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length);
      expect(metricColumns, `${role} mobile metric grid should use two columns`).toBe(2);
      if (role === "admin") await expect(page.locator(".admin-subtab-bar")).toHaveCSS("overflow-x", "auto");
    }
    if (testInfo.project.name === "chromium-375") await page.screenshot({ path: testInfo.outputPath(`${role}-mobile.png`) });
  });
}
