"use client";

import { ChatDashboard } from "@/features/assistant/chat-dashboard";
import { useAuth } from "@/providers/auth-provider";

export function AssistantPage() {
  const { user } = useAuth();
  if (!user) return null;
  return <ChatDashboard user={user} />;
}
