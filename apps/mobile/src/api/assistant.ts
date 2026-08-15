import { request } from './client';
import type { AssistantResponse } from '../types';

export async function sendAssistantMessage(
  message: string,
  conversationId?: string
): Promise<AssistantResponse> {
  return request<AssistantResponse>('/api/v1/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({
      message,
      ...(conversationId ? { conversation_id: conversationId } : {}),
    }),
  });
}

export async function runAssistantAction(
  conversationId: string,
  actionId: string,
  idempotencyKey: string
): Promise<AssistantResponse> {
  return request<AssistantResponse>(
    '/api/v1/assistant/actions',
    {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: conversationId,
        action_id: actionId,
      }),
    },
    { idempotencyKey }
  );
}
