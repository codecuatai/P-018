import { expect, test, type Page } from "@playwright/test";

import { installAuthenticatedFixture } from "./support/mock-gateway";

test.describe("Comprehensive Micro-Features E2E Suite", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => console.log("PAGEERROR:", err.message, err.stack));
  });

  test("1. Red notification badge pill & unread indicator updates dynamically", async ({ context, page }) => {
    // Seed 2 unread notifications
    const gateway = await installAuthenticatedFixture(context, { email: "badge-micro@example.test" });
    gateway.seedNotifications(2);

    await page.goto("/app");
    await expect(page.locator(".app-shell")).toBeVisible({ timeout: 15_000 });

    // Locate visible bell button across mobile/tablet/desktop headers
    const bellBtn = page.locator(".notification-bell-btn:visible").first();
    await expect(bellBtn).toBeVisible({ timeout: 10_000 });

    // Assert dynamic aria-label containing exact unread count
    await expect(bellBtn).toHaveAttribute("aria-label", "Thông báo, 2 chưa đọc");

    // Assert red badge pill presence and count text
    const badgePill = bellBtn.locator(".notification-badge-pill");
    await expect(badgePill).toBeVisible();
    await expect(badgePill).toHaveText("2");

    // Verify badge styling: red background (#ef4444)
    const bgColor = await badgePill.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(bgColor).toMatch(/rgb\(239,\s*68,\s*68\)/);
  });

  test("2. Notification dropdown popover opens, displays unread items, and navigates", async ({ context, page }) => {
    const gateway = await installAuthenticatedFixture(context, { email: "popover-micro@example.test" });
    gateway.seedNotifications(2);

    await page.goto("/app");
    const bellBtn = page.locator(".notification-bell-btn:visible").first();
    await expect(bellBtn).toBeVisible({ timeout: 10_000 });

    // Click bell to open popover
    await bellBtn.click();

    // Assert dialog popover visibility
    const popover = page.locator(".notification-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toHaveAttribute("role", "dialog");

    // Header unread counter
    const headerCount = popover.locator(".notif-unread-count");
    await expect(headerCount).toBeVisible();
    await expect(headerCount).toHaveText("2 chưa đọc");

    // Verify unread items have .notif-unread class
    const unreadItems = popover.locator(".notif-item.notif-unread");
    await expect(unreadItems).toHaveCount(2);
    await expect(unreadItems.first()).toContainText("Tài xế đã đến điểm đón");
    await expect(unreadItems.last()).toContainText("Nhận voucher giảm 20K");

    // Verify read item exists and does not have .notif-unread
    const readItem = popover.locator(".notif-item:not(.notif-unread)");
    await expect(readItem).toHaveCount(1);
    await expect(readItem).toContainText("Đăng nhập từ thiết bị mới");

    // Close button dismisses popover
    const closeBtn = popover.locator(".notif-close-btn");
    await closeBtn.click();
    await expect(popover).not.toBeVisible();

    // Badge pill remains intact after closing without reading
    const badgePill = bellBtn.locator(".notification-badge-pill");
    await expect(badgePill).toBeVisible();
    await expect(badgePill).toHaveText("2");
  });

  test("3. Notification Center (/app/notifications) categories, status filters, read-all & preferences", async ({ context, page }) => {
    const gateway = await installAuthenticatedFixture(context, { email: "center-micro@example.test" });
    gateway.seedNotifications(2);

    await page.goto("/app/notifications");
    await expect(page.getByRole("heading", { name: "Thông báo của bạn" })).toBeVisible({ timeout: 15_000 });

    // 1. Verify 4 category tabs
    const categoryTabs = page.locator(".notification-tabs button[role='tab']");
    await expect(categoryTabs).toHaveCount(4);
    await expect(categoryTabs.nth(0)).toHaveText("Tất cả");
    await expect(categoryTabs.nth(1)).toHaveText("Lịch hẹn");
    await expect(categoryTabs.nth(2)).toHaveText("Ưu đãi");
    await expect(categoryTabs.nth(3)).toHaveText("Hệ thống");

    // Filter by Ưu đãi (Promotions)
    await categoryTabs.nth(2).click();
    await expect(page.locator(".activity-list .activity-row")).toHaveCount(1);
    await expect(page.locator(".activity-list .activity-row")).toContainText("Nhận voucher giảm 20K");

    // Filter by Lịch hẹn (Bookings)
    await categoryTabs.nth(1).click();
    await expect(page.locator(".activity-list .activity-row")).toHaveCount(1);
    await expect(page.locator(".activity-list .activity-row")).toContainText("Tài xế đã đến điểm đón");

    // Back to Tất cả (All categories)
    await categoryTabs.nth(0).click();
    await expect(page.locator(".activity-list .activity-row")).toHaveCount(3);

    // 2. Status sub-filter tabs
    const statusTabs = page.locator(".notification-filters button[role='tab']");
    await expect(statusTabs.nth(1)).toContainText("Chưa đọc ·");

    // Filter by Chưa đọc
    await statusTabs.nth(1).click();
    await expect(page.locator(".activity-list .activity-row")).toHaveCount(2);

    // Filter by Đã đọc
    await statusTabs.nth(2).click();
    await expect(page.locator(".activity-list .activity-row")).toHaveCount(1);
    await expect(page.locator(".activity-list .activity-row")).toContainText("Đăng nhập từ thiết bị mới");

    // Return to Tất cả
    await statusTabs.nth(0).click();

    // 3. Mark all as read
    const readAllBtn = page.getByRole("button", { name: /Đọc tất cả/i });
    await expect(readAllBtn).toBeEnabled();
    await readAllBtn.click();

    // After read-all, button is disabled and unread count shows 0
    await expect(readAllBtn).toBeDisabled();
    await expect(statusTabs.nth(1)).toContainText("Chưa đọc · 0");

    // 4. Notification Preferences toggles — inputs are visually hidden (CSS opacity:0),
    //    so we click the slider span via force, which triggers the onChange handler.
    const prefSection = page.locator(".notification-pref-toggles");
    await expect(prefSection).toBeVisible();

    const bookingRow = prefSection.locator(".pref-toggle-row").filter({ hasText: "Cập nhật lịch hẹn" });
    const bookingInput = bookingRow.locator("input[type='checkbox']");
    await expect(bookingInput).toBeChecked();
    // Toggle off by clicking slider (visible) instead of hidden input
    await bookingRow.locator(".switch-slider").click();
    await expect(page.locator(".inline-note")).toContainText("Đã lưu cài đặt");

    const promoRow = prefSection.locator(".pref-toggle-row").filter({ hasText: "Ưu đãi" });
    const promoInput = promoRow.locator("input[type='checkbox']");
    await expect(promoInput).toBeChecked();
    await promoRow.locator(".switch-slider").click();
    await expect(page.locator(".inline-note")).toContainText("Đã lưu cài đặt");
  });

  test("4. Address Book management (/app/addresses) - Add, edit without coordinate reuse, default, delete", async ({ context, page }) => {
    const gateway = await installAuthenticatedFixture(context, { email: "address-micro@example.test" });

    await page.goto("/app/addresses");
    await expect(page.getByRole("heading", { name: "Địa chỉ đã lưu" })).toBeVisible({ timeout: 15_000 });

    // Add a new address
    const labelInput = page.getByPlaceholder("Nhà, Công ty…");
    const addressInput = page.getByPlaceholder("Số nhà, đường, quận, thành phố");

    await labelInput.fill("Văn phòng E2E");
    await addressInput.fill("72 Lê Thánh Tôn, Quận 1");

    // Click "Xác nhận vị trí" to trigger geocode
    const resolveBtn = page.getByRole("button", { name: /Xác nhận vị trí/i });
    await resolveBtn.click();
    await expect(page.locator(".location-candidates")).toBeVisible();
    await page.locator(".location-candidate").first().click();

    // Save address
    await page.getByRole("button", { name: "Lưu địa chỉ" }).click();
    await expect(page.getByText("Văn phòng E2E").first()).toBeVisible();

    // Edit address: change text and verify coordinate purge warning
    await page.getByRole("button", { name: "Sửa Văn phòng E2E" }).click();
    await addressInput.fill("88 Đồng Khởi, Quận 1");
    await expect(page.getByText(/tọa độ cũ sẽ không được giữ lại/i)).toBeVisible();

    // Update address
    await page.getByRole("button", { name: "Cập nhật địa chỉ" }).click();
    await expect(page.getByText("88 Đồng Khởi, Quận 1").first()).toBeVisible();

    // Set default
    const makeDefaultBtn = page.getByRole("button", { name: "Đặt mặc định" }).first();
    if (await makeDefaultBtn.isVisible()) {
      await makeDefaultBtn.click();
      await expect(page.locator(".status-badge:has-text('Mặc định')")).toBeVisible();
    }

    // Delete address
    await page.getByRole("button", { name: "Xóa Văn phòng E2E" }).click();
    await expect(page.getByText("Văn phòng E2E")).not.toBeVisible();
    await expect(page.getByText("Chưa có địa chỉ")).toBeVisible();
  });

  test("5. Favorites list (/app/favorites) - Domain grouping, removal, and empty state", async ({ context, page }) => {
    const gateway = await installAuthenticatedFixture(context, { email: "favorites-micro@example.test" });
    gateway.seedFavorites();

    await page.goto("/app/favorites");
    await expect(page.getByRole("heading", { name: "Nơi bạn hay quay lại" })).toBeVisible({ timeout: 15_000 });

    // Verify favorite domain groups
    await expect(page.getByText("Đồ ăn đã lưu")).toBeVisible();
    await expect(page.getByText("Nhà hàng đã lưu")).toBeVisible();
    const rows = page.locator(".favorite-row");
    await expect(rows).toHaveCount(2);

    // Remove first favorite
    const removeFirstBtn = rows.first().locator("button.danger");
    await removeFirstBtn.click();
    await expect(page.locator(".favorite-row")).toHaveCount(1);

    // Remove second favorite
    const removeSecondBtn = page.locator(".favorite-row button.danger").first();
    await removeSecondBtn.click();

    // Assert empty state
    await expect(page.getByText("Chưa có địa điểm nào")).toBeVisible();
    await expect(page.getByRole("link", { name: "Khám phá dịch vụ" })).toBeVisible();
  });

  test("6. Profile & Security settings (/app/profile, /app/profile?section=settings) - Profile update, password policy, 2FA, sessions", async ({ context, page }) => {
    await installAuthenticatedFixture(context, { email: "profile-micro@example.test" });

    // 1. Profile information update
    await page.goto("/app/profile");
    // The actual h1 heading text is "Thông tin tài khoản" (from profile-page.tsx)
    await expect(page.getByRole("heading", { name: "Thông tin tài khoản" })).toBeVisible({ timeout: 15_000 });

    // Name input is a plain <input> without placeholder inside label:has(span:has-text("Họ và tên"))
    const nameInput = page.locator(".profile-details .profile-form label").filter({ hasText: "Họ và tên" }).locator("input");
    await nameInput.fill("Người Dùng E2E Đổi Tên");
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(page.locator(".form-success")).toContainText("Hồ sơ đã được cập nhật.");

    // 2. Security settings: navigate to settings section
    // /app/settings redirects to /app/profile?section=settings
    await page.goto("/app/profile?section=settings");
    // h1 in settings-page.tsx is "Bảo mật tài khoản"
    await expect(page.getByRole("heading", { name: "Bảo mật tài khoản" })).toBeVisible({ timeout: 15_000 });

    const currentPwdInput = page.locator("#current-password");
    const newPwdInput = page.locator("#new-password");
    const changePwdBtn = page.getByRole("button", { name: "Đổi mật khẩu" });

    // Test invalid policy — "Password1" is 8 chars but has no special char → fails JS policy
    await currentPwdInput.fill("OldPassword123!");
    await newPwdInput.fill("Password1");
    await changePwdBtn.click();
    await expect(page.locator(".form-error").first()).toBeVisible();

    // Test valid password change (mock accepts any password)
    await newPwdInput.fill("NewValidPass999!");
    await changePwdBtn.click();
    // After successful change, mock re-authenticates and the error disappears
    await expect(page.locator(".form-error").first()).not.toBeVisible({ timeout: 10_000 });

    // Re-navigate to settings since password change may redirect
    await page.goto("/app/profile?section=settings");
    await expect(page.getByRole("heading", { name: "Bảo mật tài khoản" })).toBeVisible({ timeout: 15_000 });

    // 3. Two-Factor Authentication (2FA) setup preview
    // Button label from settings-page.tsx: "Bật xác thực 2 bước"
    const start2faBtn = page.getByRole("button", { name: /Bật xác thực 2 bước/i });
    await expect(start2faBtn).toBeVisible();
    await start2faBtn.click();

    // Verify secret code display (from mock: secret = "JBSWY3DPEHPK3PXP")
    await expect(page.getByText("JBSWY3DPEHPK3PXP")).toBeVisible();

    // Enter 6-digit TOTP code — input has id="two-factor-code"
    const totpInput = page.locator("#two-factor-code");
    await expect(totpInput).toBeVisible();
    await totpInput.fill("123456");

    // Submit via "Kích hoạt 2FA" button
    const verifyBtn = page.getByRole("button", { name: /Kích hoạt 2FA/i });
    await verifyBtn.click();

    // Verify 2FA enabled success
    await expect(page.getByText("Xác thực 2 bước đang hoạt động")).toBeVisible();
    await expect(page.getByText("Mã dự phòng (Backup Codes)")).toBeVisible();

    // 4. Active sessions — session list rendered as <ul class="session-list"> with <li> items
    await expect(page.locator("h2", { hasText: /Phiên đang hoạt động/i })).toBeVisible();
    const sessionItems = page.locator(".session-list li");
    await expect(sessionItems.first()).toBeVisible();
    // session user_agent from mock: "Mozilla/5.0 ... Chrome/120 ..."
    await expect(sessionItems.first()).toContainText("Chrome");
  });

  test("7. Healthcare patient management (/app/patients) - Full CRUD, relationship, default, delete dialog", async ({ context, page }) => {
    await installAuthenticatedFixture(context, { email: "patients-micro@example.test" });

    await page.goto("/app/patients");
    await expect(page.getByRole("heading", { name: "Hồ sơ người bệnh" })).toBeVisible({ timeout: 15_000 });

    // Add new dependent patient
    // Form fields are <label><span>Họ và tên</span><input></label> (no placeholder on input)
    const form = page.locator(".patient-form");
    await form.locator("label").filter({ hasText: "Họ và tên" }).locator("input").fill("Bé Gia Bảo E2E");
    await form.locator("label").filter({ hasText: "Số điện thoại" }).locator("input").fill("0912345678");
    await form.locator("label").filter({ hasText: "Quan hệ" }).locator("select").selectOption("child");

    // "Liên kết hồ sơ" button — exact: true to avoid colliding with delete button aria-labels
    await page.getByRole("button", { name: "Liên kết hồ sơ", exact: true }).click();
    // Success feedback is in <p class="success-note" role="status">
    await expect(page.locator(".success-note")).toContainText("Hồ sơ đã được liên kết với tài khoản.");
    await expect(page.getByText("Bé Gia Bảo E2E").first()).toBeVisible();

    // Set as default — appears as <button class="text-button" type="button">Chọn mặc định</button>
    const makeDefaultBtn = page.getByRole("button", { name: "Chọn mặc định" }).first();
    await makeDefaultBtn.click();
    await expect(page.locator(".success-note")).toContainText("Đã chọn người bệnh mặc định.");

    // Edit patient via Dialog — button has aria-label="Sửa hồ sơ Bé Gia Bảo E2E"
    const editBtn = page.getByRole("button", { name: /Sửa hồ sơ Bé Gia Bảo E2E/i });
    await editBtn.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator("label").filter({ hasText: "Họ và tên" }).locator("input").fill("Bé Gia Hưng E2E");
    await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("Bé Gia Hưng E2E").first()).toBeVisible();

    // Delete via AlertDialog — button has aria-label="Gỡ liên kết hồ sơ Bé Gia Hưng E2E"
    const deleteBtn = page.getByRole("button", { name: /Gỡ liên kết hồ sơ Bé Gia Hưng E2E/i });
    await deleteBtn.click();

    const alertModal = page.getByRole("alertdialog");
    await expect(alertModal).toBeVisible();
    // AlertDialogTitle text is "Gỡ liên kết hồ sơ này?"
    await expect(alertModal).toContainText("Gỡ liên kết hồ sơ này?");
    await alertModal.getByRole("button", { name: "Xóa" }).click();
    await expect(alertModal).not.toBeVisible();
    await expect(page.getByText("Bé Gia Hưng E2E")).not.toBeVisible();
  });

  test("8. Bookings & History central overview (/app/bookings) - Tabs, service filters", async ({ context, page }) => {
    await installAuthenticatedFixture(context, { email: "bookings-micro@example.test" });

    await page.goto("/app/bookings");
    await expect(page.getByRole("heading", { name: "Lịch hẹn & Đơn hàng" })).toBeVisible({ timeout: 15_000 });

    // Verify main status tabs
    const upcomingTab = page.getByRole("tab", { name: /Sắp tới/i });
    const pastTab = page.getByRole("tab", { name: /Lịch sử/i });
    const cancelledTab = page.getByRole("tab", { name: /Đã hủy/i });

    await expect(upcomingTab).toBeVisible();
    await expect(pastTab).toBeVisible();
    await expect(cancelledTab).toBeVisible();

    // Switch tabs — the active class is "active" or "is-active", and aria-selected is set to "true"
    await pastTab.click();
    await expect(pastTab).toHaveAttribute("aria-selected", "true");

    await cancelledTab.click();
    await expect(cancelledTab).toHaveAttribute("aria-selected", "true");

    await upcomingTab.click();
    await expect(upcomingTab).toHaveAttribute("aria-selected", "true");

    // Filter by service chips: rendered with class .booking-filter-chip
    const serviceFilterChips = page.locator(".booking-filter-chip");
    if (await serviceFilterChips.count() > 0) {
      await serviceFilterChips.filter({ hasText: "Chuyến xe" }).click();
      await serviceFilterChips.filter({ hasText: "Đồ ăn" }).click();
      await serviceFilterChips.filter({ hasText: "Tất cả dịch vụ" }).click();
    }
  });

  test("9. Rewards & Loyalty program (/app/rewards) - Points, tier hero, vouchers, ledger, referral", async ({ context, page }) => {
    await installAuthenticatedFixture(context, { email: "rewards-micro@example.test" });

    await page.goto("/app/rewards");
    await expect(page.getByRole("heading", { name: "Điểm thưởng của bạn" })).toBeVisible({ timeout: 15_000 });

    // 1. Overview Tab — tier badge and points from mock
    await expect(page.getByText("Hạng Vàng").first()).toBeVisible();
    await expect(page.getByText(/2[.,]450/).first()).toBeVisible();

    // 2. Voucher Tab
    const voucherTab = page.getByRole("tab", { name: /Voucher/i });
    await voucherTab.click();
    await expect(page.getByText("GOLD10")).toBeVisible();
    await expect(page.getByText("RIDE20K")).toBeVisible();
    await expect(page.getByText(/Giảm 10%/).first()).toBeVisible();
    await expect(page.getByText(/Giảm 20\.000/).first()).toBeVisible();

    // 3. Points Ledger Tab
    const ledgerTab = page.getByRole("tab", { name: /Lịch sử điểm/i });
    await ledgerTab.click();
    await expect(page.getByText("Hoàn tất chuyến xe #ride-booking-1")).toBeVisible();
    await expect(page.getByText("Đổi voucher RIDE20K")).toBeVisible();

    // 4. Referral Tab
    const referralTab = page.getByRole("tab", { name: /Giới thiệu/i });
    await referralTab.click();
    await expect(page.getByText("XONE2026")).toBeVisible();
  });

  test("10. Operations Manager compensation voucher workflow (/admin) - Presets, issuance, copy code", async ({ context, page }) => {
    await installAuthenticatedFixture(context, {
      email: "manager@xone.local",
      role: "manager",
      onboardingComplete: true,
    });

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /Trung tâm vận hành X-One/i })).toBeVisible({ timeout: 15_000 });

    // Open Admin Menu if on small viewport, then close it so main content is visible
    const mobileMenuBtn = page.getByRole("button", { name: /Mở menu quản trị/i });
    if (await mobileMenuBtn.isVisible()) {
      await mobileMenuBtn.click();
      // Close the nav overlay so main content (with quick action buttons) is accessible
      const closeNavBtn = page.getByRole("button", { name: "Đóng điều hướng" });
      if (await closeNavBtn.isVisible()) {
        await closeNavBtn.click();
      }
    }

    // Click Quick Action button for compensation voucher
    // Button text is "Bồi thường sự cố (Voucher)" — use getByRole to avoid CSS selector issues with parens
    const compBtn = page.getByRole("button", { name: /Bồi thường sự cố/i }).first();
    await expect(compBtn).toBeVisible({ timeout: 10_000 });
    await compBtn.click();

    // Assert compensation modal opens
    const modal = page.locator("[role='dialog'][aria-labelledby='compensation-modal-title']");
    await expect(modal).toBeVisible();
    await expect(modal.locator("#compensation-modal-title")).toHaveText("Cấp Bồi Thường Vận Hành Ca Trực");

    // The workflowId input is pre-filled with "wf_manual_recovery" from initialWorkflowId
    // Verify it's already filled; if empty fill it
    const workflowInput = modal.locator("input[type='text']").first();
    const existingVal = await workflowInput.inputValue();
    if (!existingVal.trim()) {
      await workflowInput.fill("wf_e2e_test_001");
    }

    // Select a preset reason
    const reasonSelect = modal.locator("select");
    if (await reasonSelect.isVisible()) {
      await reasonSelect.selectOption({ index: 1 });
    }

    // Submit compensation issuance — button is type="submit" inside a <form>
    const submitBtn = page.getByRole("button", { name: /Xác nhận phát hành/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click();

    // Verify voucher COMP-MOCK88 issued successfully
    await expect(page.getByText("COMP-MOCK88", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Phát Hành Bồi Thường Thành Công!")).toBeVisible();

    // Close modal
    const doneBtn = page.getByRole("button", { name: "Hoàn tất" });
    await doneBtn.click();
    await expect(modal).not.toBeVisible();
  });

  test("11. Provider portal micro-features (/app/provider) - Item availability toggle & order progression", async ({ context, page }) => {
    await installAuthenticatedFixture(context, {
      email: "provider@xone.local",
      role: "provider",
      onboardingComplete: true,
    });

    await page.goto("/app/provider");
    await expect(page.getByText(/X-One Partner Portal/i).first()).toBeVisible({ timeout: 15_000 });

    // 1. Manage Catalog Items: Toggle availability switch
    const servicesTab = page.getByRole("tab", { name: /Gắn & Quản lý Dịch vụ/i });
    await servicesTab.click();

    await expect(page.getByText("Cơm tấm đặc biệt X-One")).toBeVisible();
    await expect(page.getByText("Đang mở bán")).toBeVisible();

    // Toggle switch slider — click the visible slider element instead of the hidden input
    const switchSlider = page.locator(".xone-switch .xone-switch-slider").first();
    await switchSlider.scrollIntoViewIfNeeded();
    await switchSlider.click();
    await expect(page.getByText("Tạm ẩn")).toBeVisible();

    // 2. Kitchen Order Status Progression: Receive -> Prepare -> Ready for pickup
    const foodTab = page.getByRole("tab", { name: /Món ăn/i });
    await foodTab.click();

    // Step A: Nhận đơn ngay
    const acceptBtn = page.getByRole("button", { name: "Nhận đơn ngay" }).first();
    if (await acceptBtn.isVisible()) {
      await acceptBtn.click();
    }

    // Step B: Bắt đầu chế biến
    const prepareBtn = page.getByRole("button", { name: "Bắt đầu chế biến" }).first();
    if (await prepareBtn.isVisible()) {
      await prepareBtn.click();
    }

    // Step C: Món đã xong (Sẵn sàng lấy)
    const readyBtn = page.getByRole("button", { name: "Món đã xong (Sẵn sàng lấy)" }).first();
    if (await readyBtn.isVisible()) {
      await readyBtn.click();
      await expect(page.getByText("Đang chờ tài xế lấy món").first()).toBeVisible();
    }
  });
});
