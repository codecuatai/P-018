import type { LucideIcon } from "lucide-react";

export type Loadable<T> = { data?: T; loading: boolean; error?: string };

export type MainTabId =
  | "overview"
  | "users"
  | "transactions"
  | "ai-integrations"
  | "support"
  | "system-logs";

export type SubTabId =
  | "summary"
  | "health"
  | "datasets"
  | "user-list"
  | "user-services"
  | "domain-trans"
  | "payments-list"
  | "workflow-reconciliation"
  | "api-keys"
  | "token-usage"
  | "support-queue"
  | "feedback-ratings"
  | "logs-view";

export interface TabDefinition {
  id: MainTabId;
  label: string;
  subtitle: string;
  icon: LucideIcon;
  subtabs: Array<{ id: SubTabId; label: string; icon: LucideIcon; hashName?: string }>;
}

