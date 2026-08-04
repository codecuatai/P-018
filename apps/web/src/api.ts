export type ChatResponse = {
  response: string;
  analysis: string;
  session_id: string;
  action: string;
  missing_fields: string[];
  data: Record<string, unknown>;
};

type RideAction = "confirm_quote" | "cancel_quote" | "complete_ride" | "cancel_ride";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8002";

async function request<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(errorBody?.detail ?? `Backend returned ${response.status}`);
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