import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { ChatDashboard } from "./chat-dashboard";

jest.mock("@/lib/api-client", () => ({
  createConversation: jest.fn(),
  createIdempotencyKey: jest.fn(() => "test-idempotency-key"),
  errorText: jest.fn(() => "test error"),
  getConversation: jest.fn(),
  isRetryableError: jest.fn(() => false),
  reverseGeocodeAddress: jest.fn(),
  runAssistantAction: jest.fn(),
  sendAssistantMessage: jest.fn(),
}));

jest.mock("@/lib/active-history-poller", () => ({
  fetchActiveHistoryShared: jest.fn(() => new Promise(() => undefined)),
  subscribeActiveHistoryShared: jest.fn(() => () => undefined),
}));

jest.mock("@/components/WorkflowCards", () => ({
  AssistantCards: () => null,
  FoodCartDock: () => null,
}));

jest.mock("@/components/voice-input", () => ({
  VoiceInput: ({ disabled }: { disabled?: boolean }) => (
    <button type="button" aria-label="voice-input" disabled={disabled}>Voice</button>
  ),
}));

jest.mock("@/features/product/context-rail", () => ({
  ActiveWorkDetailDialog: () => null,
  ActiveWorkRailCardWithCancel: () => null,
  ContextRail: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ConversationContextCards: () => null,
}));

describe("ChatDashboard voice controls", () => {
  it("renders an enabled voice input control", () => {
    render(<ChatDashboard user={{ sub: "user-m6", email: "m6@example.test", role: "USER" }} />);

    expect(screen.getByRole("button", { name: "voice-input" })).toBeEnabled();
  });
});
