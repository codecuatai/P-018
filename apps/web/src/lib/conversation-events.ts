export const CONVERSATIONS_CHANGED_EVENT = "xone:conversations-changed";
export const NEW_CONVERSATION_EVENT = "xone:new-conversation";
export const ACTIVE_CONVERSATION_EVENT = "xone:active-conversation";
export const NOTIFICATIONS_CHANGED_EVENT = "xone:notifications-changed";

export function emitConversationsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CONVERSATIONS_CHANGED_EVENT));
}

export function emitNewConversation(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NEW_CONVERSATION_EVENT));
}

export function emitActiveConversationChanged(conversationId?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACTIVE_CONVERSATION_EVENT, { detail: { conversationId } }));
}

export function emitNotificationsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT));
}
