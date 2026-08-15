export function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function dateText(value: unknown): string {
  const raw = text(value);
  if (!raw) return "Theo lựa chọn";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toLocaleString("vi-VN");
  }
}

export function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toLocaleString("vi-VN");
  }
}

export function formatMoney(value: unknown, currency = "VND"): string {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        typeof (value as Record<string, unknown>).amount === "number"
      ? ((value as Record<string, unknown>).amount as number)
      : undefined;

  if (typeof numeric !== "number" || !Number.isFinite(numeric)) {
    return "Đang cập nhật";
  }

  try {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency,
    }).format(numeric);
  } catch {
    return `${numeric.toLocaleString("vi-VN")} ${currency}`;
  }
}
