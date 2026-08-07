export type ChatResponse = {
  response: string;
};

// The browser-facing backend is the NestJS gateway, never an internal service.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export async function sendChatMessage(conversationId: string, message: string, accessToken: string): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    throw new Error(`Backend returned ${response.status}`);
  }

  return response.json() as Promise<ChatResponse>;
}

export { API_BASE_URL };
