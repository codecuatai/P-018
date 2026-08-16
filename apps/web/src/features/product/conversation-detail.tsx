"use client";

import { ChatDashboard } from "@/features/assistant/chat-dashboard";
import { useAuth } from "@/providers/auth-provider";

export function ConversationDetail({ id }: { id: string }) {
  const { user } = useAuth();
  if (!user) return null;
  return <ChatDashboard user={user} initialConversationId={id} />;
}
