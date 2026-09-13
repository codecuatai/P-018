"use client";

import { ChatDashboard } from "@/features/assistant/chat-dashboard";
import { UpcomingHero } from "@/features/product/upcoming-hero";
import { useAuth } from "@/providers/auth-provider";

export function AssistantPage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="assistant-page-wrapper">
      <UpcomingHero />
      <ChatDashboard user={user} />
    </div>
  );
}
