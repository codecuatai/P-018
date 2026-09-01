import { expect, test } from "@playwright/test";

import { installAuthenticatedFixture } from "./support/mock-gateway";

// The reported bug: reloading or opening a protected /app URL directly would
// intermittently bounce the user to /?auth=login&next=..., most often on the
// Healthcare route where many requests mount at once. These tests loop hard
// navigations (each page.goto is a full document load that drops the in-memory
// access token and must restore via the refresh cookie) and assert the session
// survives, with a single shared refresh per document rather than a storm.

const PROTECTED_ROUTES = [
  "/app",
  "/app/services/food",
  "/app/services/restaurant",
  "/app/services/healthcare",
  "/app/history",
  "/app/profile",
];

function refreshCallsSince(calls: Array<{ method: string; path: string }>, from: number): number {
  return calls.slice(from).filter((call) => call.method === "POST" && call.path === "/api/v1/auth/refresh").length;
}

test("hard navigation and reload across every /app route keeps the session", async ({ context, page }) => {
  const gateway = await installAuthenticatedFixture(context);

  for (let pass = 0; pass < 2; pass += 1) {
    for (const route of PROTECTED_ROUTES) {
      const before = gateway.calls.length;

      // A hard navigation drops the in-memory token; the app must restore it
      // from the refresh cookie without redirecting to the login surface.
      await page.goto(route);
      await expect(page.locator(".app-shell")).toBeVisible({ timeout: 15_000 });
      expect(page.url()).toContain(route);
      expect(page.url()).not.toContain("auth=login");

      // A reload is the same restore path a second time.
      await page.reload();
      await expect(page.locator(".app-shell")).toBeVisible({ timeout: 15_000 });
      expect(page.url()).not.toContain("auth=login");

      // Two document loads (goto + reload) restore with at most one shared
      // refresh each — never a burst, never zero-then-logout.
      expect(refreshCallsSince(gateway.calls, before)).toBeLessThanOrEqual(2);
    }
  }
});

test("opening Healthcare directly restores with a single shared refresh and no logout", async ({ context, page }) => {
  const gateway = await installAuthenticatedFixture(context);

  const before = gateway.calls.length;
  // Healthcare fans out many mount requests; the single-flight refresh guard
  // must collapse them into one restore instead of racing a family-wide logout.
  await page.goto("/app/services/healthcare");
  await expect(page.locator(".app-shell")).toBeVisible({ timeout: 15_000 });
  expect(page.url()).toContain("/app/services/healthcare");
  expect(page.url()).not.toContain("auth=login");
  expect(refreshCallsSince(gateway.calls, before)).toBe(1);

  // No protected request was denied while the session was being restored.
  expect(gateway.deniedRequests).toHaveLength(0);
});

test("parallel document restores keep a usable rotated cookie", async ({ context, page }) => {
  const gateway = await installAuthenticatedFixture(context, { synchronizeRefresh: true });
  const parallelPages = [page, await context.newPage(), await context.newPage()];

  await Promise.all(parallelPages.map((parallelPage) => parallelPage.goto("/app/services/healthcare")));
  for (const parallelPage of parallelPages) {
    await expect(parallelPage.locator(".app-shell")).toBeVisible({ timeout: 15_000 });
    expect(parallelPage.url()).not.toContain("auth=login");
  }
  expect(refreshCallsSince(gateway.calls, 0)).toBe(3);

  await page.reload();
  await expect(page.locator(".app-shell")).toBeVisible({ timeout: 15_000 });
  expect(page.url()).not.toContain("auth=login");
});
