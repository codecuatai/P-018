export type Domain = "ride" | "food" | "restaurant" | "healthcare";

export type AppView = "assistant" | "services" | "activity" | "account";

export interface AuthUser {
  sub: string;
  email: string;
  role: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  domain?: Domain;
  timestamp: string;
  payload?: Record<string, unknown>;
  requestStatus?: "sending" | "sent" | "error";
  retryText?: string;
  retryContext?: Record<string, unknown>;
}

export interface DomainSession {
  domain: Domain;
  workflowId?: string;
  conversationId?: string;
  messages: ChatMessage[];
  lastPayload?: Record<string, unknown>;
  pendingConfirmationId?: string;
  pendingConfirmationAction?: string;
  pendingIdempotencyKey?: string;
  pendingPaymentKey?: string;
  isSending: boolean;
}

export type ClientSessions = Record<Domain, DomainSession>;

export interface SessionActivity {
  id: string;
  domain: Domain;
  title: string;
  reference: string;
  status: string;
  detail: string;
  timestamp: string;
}

export type WorkflowAction =
  | { type: "ride-confirm"; domain: "ride" }
  | { type: "ride-payment"; domain: "ride" }
  | { type: "food-confirm"; domain: "food" }
  | { type: "restaurant-confirm"; domain: "restaurant" }
  | { type: "healthcare-payment"; domain: "healthcare" }
  | { type: "healthcare-confirm"; domain: "healthcare" }
  | { type: "message"; domain: Domain; text: string; context?: Record<string, unknown> };

export function createClientSessions(): ClientSessions {
  return {
    ride: createDomainSession("ride"),
    food: createDomainSession("food"),
    restaurant: createDomainSession("restaurant"),
    healthcare: createDomainSession("healthcare"),
  };
}

function createDomainSession(domain: Domain): DomainSession {
  return { domain, messages: [], isSending: false };
}
