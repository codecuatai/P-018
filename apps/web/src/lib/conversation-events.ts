export const CONVERSATIONS_CHANGED_EVENT = "xone:conversations-changed";
export const NEW_CONVERSATION_EVENT = "xone:new-conversation";

export function emitConversationsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CONVERSATIONS_CHANGED_EVENT));
}

export function emitNewConversation(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NEW_CONVERSATION_EVENT));
}
