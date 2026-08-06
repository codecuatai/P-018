export type ChatResponse = {
  response: string;
  analysis: string;
  session_id: string;
  action: string;
  missing_fields: string[];
  data: Record<string, unknown>;
};

type RideAction = "confirm_quote" | "cancel_quote" | "complete_ride" | "cancel_ride";
type ErrorDetail = string | { code?: string; message?: string; exception_type?: string };

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8002";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly isConnectionError: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function describeError(detail: ErrorDetail | undefined, status: number): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  const structuredDetail = typeof detail === "object" && detail ? detail : {};
  const message = structuredDetail.message ?? `Backend trả về HTTP ${status}.`;
  const diagnostics = [structuredDetail.code && `Mã lỗi: ${structuredDetail.code}`, structuredDetail.exception_type && `Loại lỗi: ${structuredDetail.exception_type}`]
    .filter(Boolean)
    .join(" | ");
  return diagnostics ? `${message}\n${diagnostics}` : message;
}

async function request<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Không có phản hồi mạng.";
    throw new ApiRequestError(`Không thể kết nối tới Backend tại ${API_BASE_URL}. Chi tiết: ${reason}`, true);
  }
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { detail?: ErrorDetail } | null;
    throw new ApiRequestError(describeError(errorBody?.detail, response.status), false, response.status);
  }
  return response.json() as Promise<T>;
}

export function sendChatMessage(message: string, sessionId?: string): Promise<ChatResponse> {
  return request<ChatResponse>("/api/v1/chat", { message, session_id: sessionId || undefined });
}

export function sendRideAction(action: RideAction, sessionId: string, quoteId: string): Promise<ChatResponse> {
  return request<ChatResponse>("/api/v1/ride-actions", {
    action,
    session_id: sessionId,
    quote_id: quoteId,
  });
}

export { API_BASE_URL };

