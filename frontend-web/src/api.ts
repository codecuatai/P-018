export type ChatResponse = {
  response: string;
  analysis: string;
};

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function sendChatMessage(message: string): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    throw new Error(`Backend returned ${response.status}`);
  }

  return response.json() as Promise<ChatResponse>;
}

export { API_BASE_URL };
