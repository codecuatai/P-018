import { formatAddress, formatDateTime, formatMoney, statusLabel } from "./presentation";

describe("consumer presentation helpers", () => {
  it("translates known internal statuses without echoing the enum", () => {
    expect(statusLabel("SEARCHING_DRIVER")).toBe("Đang tìm tài xế");
    expect(statusLabel("AWAITING_CONFIRMATION")).toBe("Chờ bạn xác nhận");
    expect(statusLabel("SEARCHING_DRIVER")).not.toContain("SEARCHING_DRIVER");
    expect(statusLabel("something_new")).toBe("Đang cập nhật");
  });

  it("formats Vietnamese timestamps and dong consistently", () => {
    const timestamp = formatDateTime("2026-08-14T19:57:00+07:00");
    expect(timestamp).toContain("14/08/2026");
    expect(timestamp).toContain("19:57");
    expect(formatMoney(20_000)).toBe("20.000 đ");
    expect(formatMoney(550_000, "VND")).toBe("550.000 đ");
  });

  it("removes repeated locality segments while preserving their first spelling", () => {
    expect(formatAddress("Phố Văn Miếu, Đống Đa, Hà Nội", "Đống Đa", "Hà Nội"))
      .toBe("Phố Văn Miếu, Đống Đa, Hà Nội");
  });

  it("ignores whitespace and accent-insensitive duplicates", () => {
    expect(formatAddress(" 12 Nguyễn Trãi , Thanh Xuân ", "thanh xuan", "Hà Nội"))
      .toBe("12 Nguyễn Trãi, Thanh Xuân, Hà Nội");
  });
});
