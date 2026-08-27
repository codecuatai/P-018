export type DisplayValue = string | number | null | undefined;

const STATUS_LABELS: Record<string, string> = {
  QUOTE_CREATED: "Đã tạo chuyến",
  AWAITING_CONFIRMATION: "Chờ bạn xác nhận",
  SEARCHING_DRIVER: "Đang tìm tài xế",
  DRIVER_ASSIGNED: "Đã có tài xế",
  DRIVER_TO_PICKUP: "Tài xế đang đến",
  DRIVER_ARRIVED: "Tài xế đã đến điểm đón",
  IN_PROGRESS: "Đang di chuyển",
  ARRIVED_DESTINATION: "Đã đến nơi",
  COMPLETED: "Đã hoàn tất",
  NO_DRIVER: "Chưa tìm được tài xế",
  FAILED: "Có lỗi xảy ra",
  PAYMENT_FAILED: "Thanh toán chưa thành công",
  CANCELLED: "Đã hủy",
  EXPIRED: "Đã hết hạn",
  CONSUMED: "Đã sử dụng",
  PAYMENT_PENDING: "Đang chờ thanh toán",
  PAID: "Đã nhận đơn",
  RESTAURANT_CONFIRMING: "Nhà hàng đang xác nhận",
  RESTAURANT_ACCEPTED: "Nhà hàng đã nhận đơn",
  PREPARING: "Đang chuẩn bị món",
  READY_FOR_PICKUP: "Đang chờ lấy món",
  PICKED_UP: "Đang lấy món",
  DELIVERING: "Đang giao",
  DELIVERED: "Đã giao",
  HELD: "Đang giữ chỗ",
  CONFIRMED: "Đã xác nhận",
  BOOKED: "Đã đặt",
  PAYMENT_CONFIRMED: "Đã thanh toán",
  APPOINTMENT_CONFIRMED: "Lịch đã được xác nhận",
  SUCCEEDED: "Đã thanh toán",
  REFUNDED: "Đã hoàn tiền",
  REJECTED: "Không thể thực hiện",
  REFUND_PENDING: "Đang xử lý hoàn tiền",
  DRAFT: "Đang chuẩn bị",
  ACTIVE: "Đang diễn ra",
  AVAILABLE: "Đang phục vụ",
  UNAVAILABLE: "Tạm thời chưa có",
};

export function statusLabel(status: unknown): string {
  const key = String(status ?? "").trim().toUpperCase();
  return STATUS_LABELS[key] ?? "Đang cập nhật";
}

export function formatDateTime(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === "") return "Đang cập nhật";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? "Đang cập nhật"
    : new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatTime(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatMoney(value: unknown, currency = "VND"): string {
  const amount = typeof value === "number"
    ? value
    : isRecord(value) && typeof value.amount === "number"
      ? value.amount
      : Number(value);
  if (!Number.isFinite(amount)) return "Đang cập nhật";
  const normalizedCurrency = currency.toUpperCase();
  if (normalizedCurrency === "VND" || normalizedCurrency === "VNĐ" || normalizedCurrency === "₫") {
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(amount)} đ`;
  }
  try {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: normalizedCurrency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(amount)} ${currency}`;
  }
}

export function optionalText(value: unknown, fallback = "Đang cập nhật"): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/** Format catalog addresses without repeating comma-separated locality segments. */
export function formatAddress(...parts: unknown[]): string {
  const seen = new Set<string>();
  const segments: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string" && typeof part !== "number") continue;
    for (const segment of String(part).split(",")) {
      const value = segment.trim();
      if (!value) continue;
      const key = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi-VN");
      if (seen.has(key)) continue;
      seen.add(key);
      segments.push(value);
    }
  }
  return segments.join(", ");
}

export function numberValue(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function conversationTitle(record: { title?: string; serviceContext?: string; messages?: Array<{ role: string; content: string }> }): string {
  const explicit = typeof record.title === "string" ? record.title.trim() : "";
  if (explicit) return explicit;
  const firstUserMessage = record.messages?.find((message) => message.role === "user" && message.content.trim())?.content.trim();
  if (firstUserMessage) return firstUserMessage.length > 42 ? `${firstUserMessage.slice(0, 42).trimEnd()}…` : firstUserMessage;
  const service = typeof record.serviceContext === "string" ? record.serviceContext.trim() : "";
  return service ? `Cuộc trò chuyện · ${service}` : "Cuộc trò chuyện mới";
}
