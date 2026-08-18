import { useState, useRef, useCallback } from 'react';
import { sendAssistantMessage, runAssistantAction } from '../api/assistant';
import { errorText, isRecord } from '../api/client';
import { createIdempotencyKey, makeId } from '../utils/id';
import type {
  AssistantAction,
  AssistantResponse,
  AuthUser,
  ChatMessage,
  SessionActivity,
} from '../types';

interface UseChatProps {
  user: AuthUser;
  onActivity?: (activity: SessionActivity) => void;
}

export function useChat({ user, onActivity }: UseChatProps) {
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string | undefined>();

  const activeActionRef = useRef<string | undefined>(undefined);
  const actionKeysRef = useRef<Record<string, string>>({});

  const recordActivities = useCallback(
    (response: AssistantResponse) => {
      if (!onActivity) return;
      for (const item of response.completed) {
        const safeItem: Record<string, unknown> = isRecord(item) ? item : {};
        const reference =
          safeItem['reservation_code'] ??
          safeItem['appointment_id'] ??
          item.kind;
        onActivity({
          id: `${response.conversation_id}-${item.kind}-${String(reference)}`,
          title: item.title,
          reference: String(reference ?? 'Đã lưu'),
          status: 'Đã hoàn tất',
          detail: 'Kết quả đã được xác nhận trong cuộc trò chuyện.',
          timestamp: new Date().toISOString(),
        });
      }
    },
    [onActivity]
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      const userMessage: ChatMessage = {
        id: makeId('user'),
        role: 'user',
        text: trimmed,
        timestamp: new Date().toISOString(),
        requestStatus: 'sent',
      };

      const pendingId = makeId('assistant');
      const pendingMessage: ChatMessage = {
        id: pendingId,
        role: 'assistant',
        text: 'Mình đang xem yêu cầu của bạn…',
        timestamp: new Date().toISOString(),
        requestStatus: 'sending',
      };

      setMessages((current) => [...current, userMessage, pendingMessage]);
      setSending(true);

      try {
        const response = await sendAssistantMessage(trimmed, conversationId);
        setConversationId(response.conversation_id);
        setMessages((current) =>
          current.map((item) =>
            item.id === pendingId
              ? {
                  ...item,
                  text: response.message,
                  response,
                  requestStatus: 'sent' as const,
                }
              : item
          )
        );
        recordActivities(response);
      } catch (error) {
        const detail = errorText(error);
        setMessages((current) =>
          current.map((message) =>
            message.id === pendingId
              ? {
                  ...message,
                  text: detail,
                  requestStatus: 'error',
                  retryText: trimmed,
                }
              : message
          )
        );
      } finally {
        setSending(false);
      }
    },
    [conversationId, recordActivities, sending]
  );

  const handleAction = useCallback(
    async (action: AssistantAction) => {
      if (!conversationId || sending || activeActionRef.current) return;

      const idempotencyKey =
        actionKeysRef.current[action.id] ??
        createIdempotencyKey(`assistant-${action.kind}`);
      actionKeysRef.current[action.id] = idempotencyKey;

      activeActionRef.current = action.id;
      setActiveActionId(action.id);
      setSending(true);

      const pendingId = makeId('action');
      setMessages((current) => [
        ...current,
        {
          id: pendingId,
          role: 'assistant',
          text: 'Mình đang hoàn tất bước này…',
          timestamp: new Date().toISOString(),
          requestStatus: 'sending',
        },
      ]);

      try {
        const response = await runAssistantAction(
          conversationId,
          action.id,
          idempotencyKey
        );
        delete actionKeysRef.current[action.id];

        setMessages((current) =>
          current
            .filter((message) => message.id !== pendingId)
            .map((message) =>
              message.response?.actions.some(
                (candidate) => candidate.id === action.id
              )
                ? {
                    ...message,
                    response: {
                      ...message.response,
                      actions: message.response.actions.filter(
                        (candidate) =>
                          candidate.id !== action.id &&
                          !(
                            (action.kind === 'select_restaurant' ||
                              action.kind === 'select_healthcare_slot') &&
                            candidate.kind === action.kind
                          )
                      ),
                    },
                  }
                : message
            )
            .concat({
              id: pendingId,
              role: 'assistant',
              text: response.message,
              response,
              timestamp: new Date().toISOString(),
              requestStatus: 'sent' as const,
            })
        );
        recordActivities(response);
      } catch (error) {
        setMessages((current) =>
          current.map((message) =>
            message.id === pendingId
              ? {
                  ...message,
                  text: errorText(error),
                  requestStatus: 'error',
                  retryAction: action,
                }
              : message
          )
        );
      } finally {
        setSending(false);
        setActiveActionId(undefined);
        activeActionRef.current = undefined;
      }
    },
    [conversationId, recordActivities, sending]
  );

  const newConversation = useCallback(() => {
    actionKeysRef.current = {};
    activeActionRef.current = undefined;
    setActiveActionId(undefined);
    setConversationId(undefined);
    setMessages([]);
  }, []);

  return {
    conversationId,
    messages,
    sending,
    activeActionId,
    send,
    handleAction,
    newConversation,
  };
}
