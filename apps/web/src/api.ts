export type ChatResponse = {
  response: string;
  workflow_id?: string;
  intent?: string;
  stage?: string;
  data?: Record<string, unknown>;
};

export type ChatRequestOptions = {
  actorId: string;
  workflowId?: string;
};

// The browser-facing backend is the NestJS gateway, never an internal service.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export async function sendChatMessage(message: string, options: ChatRequestOptions): Promise<ChatResponse> {
  const correlationId = globalThis.crypto?.randomUUID?.() ?? "web-" + Date.now();
  const response = await fetch(`${API_BASE_URL}/api/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Actor-Id": options.actorId,
      "X-Correlation-Id": correlationId,
    },
    body: JSON.stringify({
      message,
      ...(options.workflowId ? { workflow_id: options.workflowId } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Backend returned ${response.status}`);
  }

  const envelope = (await response.json()) as {
    data?: ChatResponse & { message?: string };
    meta?: Record<string, unknown>;
  };
  if (!envelope.data) {
    throw new Error("Backend returned an invalid response envelope");
  }
  return {
    ...envelope.data,
    response: envelope.data.response ?? envelope.data.message ?? "",
  };
}

export { API_BASE_URL };
