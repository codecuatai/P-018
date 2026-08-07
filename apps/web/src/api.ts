export type ChatResponse = {
  response: string;
};

// The browser-facing backend is the NestJS gateway, never an internal service.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8001";

export async function sendChatMessage(message: string, sessionId: string = "default_session"): Promise<ChatResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, session_id: sessionId }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    return await response.json() as ChatResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

export { API_BASE_URL };
