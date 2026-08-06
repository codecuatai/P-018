export type ChatResponse = {
  response: string;
};

// The browser-facing backend is the NestJS gateway, never an internal service.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8001";

export async function sendChatMessage(message: string, sessionId: string = "default_session"): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, session_id: sessionId }),
  });

  if (!response.ok) {
    throw new Error(`Backend returned ${response.status}`);
  }

  return response.json() as Promise<ChatResponse>;
}

export { API_BASE_URL };
