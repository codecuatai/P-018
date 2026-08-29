import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import * as apiClient from "@/lib/api-client";
import { ChatDashboard } from "./chat-dashboard";

jest.mock("@/lib/api-client", () => ({
  createConversation: jest.fn(),
  createIdempotencyKey: jest.fn(() => "test-idempotency-key"),
  errorText: jest.fn(() => "Lỗi thử nghiệm"),
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

jest.mock("@/features/product/context-rail", () => ({
  ActiveWorkDetailDialog: () => null,
  ActiveWorkRailCardWithCancel: () => null,
  ContextRail: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ConversationContextCards: () => null,
}));

describe("ChatDashboard non-Voice controls", () => {
  it("hides the inactive plus control and keeps the mic disabled without an API call", () => {
    render(<ChatDashboard user={{ sub: "user-m6", email: "m6@example.test", role: "USER" }} />);

    expect(screen.queryByRole("button", { name: "Thêm tùy chọn" })).not.toBeInTheDocument();
    const mic = screen.getByRole("button", { name: /Nhập bằng giọng nói.*Sắp có/ });
    expect(mic).toBeDisabled();

    fireEvent.click(mic);
    fireEvent.keyDown(mic, { key: "Enter", code: "Enter" });

    expect(apiClient.sendAssistantMessage).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(mic);
  });
});
