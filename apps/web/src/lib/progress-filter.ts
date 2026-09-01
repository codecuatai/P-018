// Safety filter for Agent progress payloads.
//
// The backend currently returns one final AssistantResponse per turn and does
// not stream progress events, so the UI drives an indeterminate indicator from
// local request timing. This module is the single gate for anything
// progress-shaped: it strictly whitelists fields, strips control characters
// and credentials, and never lets chain-of-thought, raw prompts, or tokens
// reach the render state.

import { isKnownAssistantItem, type ActivityEntry, type ActivityService, type AssistantAction, type AssistantItem, type AssistantResponse } from "@/types";

export type SafeProgressEvent = {
  stepId: string;
  service: ActivityService;
  label: string;
  status: "pending" | "running" | "completed" | "retrying" | "error";
  message?: string;
};

export type CurrentActivityStep = { service: ActivityService; step: string; retrying?: boolean };

const ALLOWED_EVENT_KEYS = new Set(["step_id", "stepId", "label", "step", "service", "status", "message", "detail"]);

const SENSITIVE_KEY_PATTERN = /(token|secret|api[_-]?key|authorization|bearer|password|credential|chain[_-]?of[_-]?thought|reasoning|system[_-]?prompt|raw[_-]?output|provider[_-]?data|phone|email)/i;

const SENSITIVE_VALUE_PATTERN = /(bearer\s+[a-z0-9._-]{6,}|sk-[a-z0-9]{16,}|api[_-]?key["']?\s*[:=]\s*["']?[a-z0-9]{16,}|password["']?\s*[:=]\s*["']?[a-z0-9]{4,}|authorization["']?\s*[:=])/i;

const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const SERVICES: readonly ActivityService[] = ["ride", "food", "restaurant", "healthcare", "general"];
const STATUSES: readonly SafeProgressEvent["status"][] = ["pending", "running", "completed", "retrying", "error"];

const SERVICE_LABELS: Record<ActivityService, string> = {
  ride: "Chuyến xe",
  food: "Đồ ăn",
  restaurant: "Nhà hàng",
  healthcare: "Lịch khám",
  general: "Trợ lý AI",
};

const SERVICE_BY_KIND: Partial<Record<AssistantItem["kind"], ActivityService>> = {
  restaurant_options: "restaurant",
  restaurant_unavailable: "restaurant",
  restaurant_confirmation: "restaurant",
  reservation: "restaurant",
  ride_quote: "ride",
  ride_booking: "ride",
  ride_timing_conflict: "ride",
  healthcare_options: "healthcare",
  healthcare_no_availability: "healthcare",
  appointment: "healthcare",
  healthcare_confirmation: "healthcare",
  appointment_confirmed: "healthcare",
  food_options: "food",
  food_confirmation: "food",
  food_order: "food",
  food_empty: "food",
  food_cart: "food",
};

const GENERIC_STEPS: readonly { id: string; label: string }[] = [
  { id: "understanding", label: "Đang hiểu yêu cầu" },
  { id: "fetching", label: "Đang lấy dữ liệu dịch vụ" },
  { id: "evaluating", label: "Đang đánh giá phương án" },
  { id: "preparing", label: "Đang chuẩn bị kết quả" },
];

export function serviceLabel(service: ActivityService): string {
  return SERVICE_LABELS[service];
}

function cleanText(value: unknown, maxLength = 160): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(CONTROL_CHAR_PATTERN, "").trim();
  if (!cleaned || SENSITIVE_VALUE_PATTERN.test(cleaned)) return "";
  return cleaned.slice(0, maxLength);
}

/** Strict parser for a backend progress event. Returns null when the payload is malformed or contains anything unsafe. */
export function parseProgressEvent(raw: unknown): SafeProgressEvent | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_EVENT_KEYS.has(key) || SENSITIVE_KEY_PATTERN.test(key)) return null;
  }
  const stepId = cleanText(record.step_id ?? record.stepId ?? "", 80);
  const label = cleanText(record.label ?? record.step ?? "", 120);
  if (!stepId || !label) return null;
  const service = SERVICES.includes(record.service as ActivityService) ? (record.service as ActivityService) : "general";
  const status = STATUSES.includes(record.status as SafeProgressEvent["status"]) ? (record.status as SafeProgressEvent["status"]) : "running";
  const message = cleanText(record.message ?? record.detail ?? "", 200);
  return { stepId, service, label, status, ...(message ? { message } : {}) };
}

export function genericProgressStep(elapsedMs: number): { id: string; label: string } {
  if (elapsedMs < 1500) return GENERIC_STEPS[0]!;
  if (elapsedMs < 4000) return GENERIC_STEPS[1]!;
  if (elapsedMs < 7000) return GENERIC_STEPS[2]!;
  return GENERIC_STEPS[3]!;
}

export function genericActivityEntries(elapsedMs: number): ActivityEntry[] {
  const activeId = genericProgressStep(elapsedMs).id;
  return GENERIC_STEPS.map((step) => ({
    id: `generic-${step.id}`,
    service: "general" as const,
    label: SERVICE_LABELS.general,
    step: step.label,
    status: step.id === activeId ? ("running" as const) : ("pending" as const),
  }));
}

/** Builds a truthful timeline from a resolved response: completed branches, task errors, and the step currently running (optional). */
export function buildActivityFromResponse(response: AssistantResponse, current?: CurrentActivityStep): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  for (const item of response.completed ?? []) {
    const service = serviceForItem(item) ?? "general";
    const step = cleanText(item.title, 120) || "Đã hoàn thành";
    entries.push({ id: `completed-${entries.length}`, service, label: SERVICE_LABELS[service], step, status: "completed" });
  }
  for (const item of response.items ?? []) {
    if (isKnownAssistantItem(item) && item.kind === "task_error") {
      const service = serviceFromErrorItem(item, response) ?? "general";
      const step = cleanText(item.title, 120) || "Không thể hoàn tất bước này";
      const detail = cleanText(item.note ?? item.error_code, 200);
      entries.push({ id: `error-${entries.length}`, service, label: SERVICE_LABELS[service], step, status: "error", ...(detail ? { detail } : {}) });
    }
  }
  if (current) {
    const index = entries.findIndex((entry) => entry.service === current.service && entry.status !== "error");
    if (index >= 0) {
      entries[index] = { ...entries[index], step: current.step, status: current.retrying ? "retrying" : "running" };
    } else {
      entries.push({ id: `current-${entries.length}`, service: current.service, label: SERVICE_LABELS[current.service], step: current.step, status: current.retrying ? "retrying" : "running" });
    }
  }
  return entries;
}

/** Maps an action being executed to the timeline entry shown while it runs. */
export function actionActivity(action: AssistantAction): CurrentActivityStep {
  return { service: serviceForActionKind(action.kind), step: actionStepLabel(action) };
}

function serviceForItem(item: AssistantItem): ActivityService | undefined {
  return SERVICE_BY_KIND[item.kind];
}

function serviceFromErrorItem(item: AssistantItem, response: AssistantResponse): ActivityService | undefined {
  if (isKnownAssistantItem(item) && item.kind === "task_error" && item.action_id) {
    const action = response.actions.find((candidate) => candidate.id === item.action_id);
    if (action) return serviceForActionKind(action.kind);
  }
  return serviceForItem(item);
}

function serviceForActionKind(kind: string): ActivityService {
  if (kind.startsWith("ride_")) return "ride";
  if (kind.startsWith("food_")) return "food";
  if (kind.startsWith("restaurant_") || kind.startsWith("select_restaurant")) return "restaurant";
  if (kind.startsWith("healthcare_") || kind.startsWith("select_healthcare")) return "healthcare";
  return "general";
}

function actionStepLabel(action: AssistantAction): string {
  switch (action.kind) {
    case "restaurant_confirm": return "Đang xác nhận đặt bàn";
    case "ride_service": return "Đang đặt chuyến xe";
    case "ride_payment": return "Đang thanh toán chuyến xe";
    case "select_healthcare_slot": return "Đang chọn khung giờ khám";
    case "healthcare_confirm": return "Đang xác nhận lịch khám";
    case "healthcare_cancel": return "Đang hủy lịch khám";
    case "select_food_item": return "Đang chọn món";
    case "food_checkout": return "Đang chuẩn bị đơn hàng";
    case "food_confirm": return "Đang xác nhận đơn hàng";
    case "food_payment": return "Đang thanh toán";
    default: return cleanText(action.label, 120) || "Đang xử lý bước này";
  }
}
