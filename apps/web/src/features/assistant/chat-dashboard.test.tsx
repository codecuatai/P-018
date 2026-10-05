import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

jest.mock("@/components/voice-input", () => ({
  VoiceInput: ({ onTranscript }: { onTranscript: (text: string) => void }) => (
    <button type="button" aria-label="Nhập bằng giọng nói" onClick={() => onTranscript("Tìm quán phở")}>Mic</button>
  ),
}));

jest.mock("@/components/voice-output", () => ({
  VoiceOutput: () => <button type="button" aria-label="Đọc văn bản">Phát</button>,
}));

jest.mock("@/features/product/context-rail", () => ({
  ActiveWorkDetailDialog: () => null,
  ActiveWorkRailCardWithCancel: () => null,
  ContextRail: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ConversationContextCards: () => null,
}));

describe("ChatDashboard voice controls", () => {
  it("exposes voice input without showing the removed add-ons control", () => {
    render(<ChatDashboard user={{ sub: "user-m6", email: "m6@example.test", role: "USER" }} />);

    expect(screen.queryByRole("button", { name: "Thêm tùy chọn" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nhập bằng giọng nói" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Nhập yêu cầu" })).toHaveAttribute("placeholder", "Bạn cần X-One giúp gì?");
    expect(apiClient.sendAssistantMessage).not.toHaveBeenCalled();
  });

  it("does not show audio playback for a text-typed reply", async () => {
    jest.mocked(apiClient.sendAssistantMessage).mockResolvedValue({
      conversation_id: "conversation-typed",
      message: "Mình tìm thấy quán phù hợp.",
      items: [],
      actions: [],
    } as never);

    render(<ChatDashboard user={{ sub: "user-typed", email: "typed@example.test", role: "USER" }} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Nhập yêu cầu" }), { target: { value: "Tìm quán phở" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));

    await screen.findByText("Mình tìm thấy quán phù hợp.");
    expect(screen.queryByRole("button", { name: "Đọc văn bản" })).not.toBeInTheDocument();
  });

  it("shows manual audio playback for a reply to a mic-entered request", async () => {
    jest.mocked(apiClient.sendAssistantMessage).mockResolvedValue({
      conversation_id: "conversation-voice",
      message: "Mình tìm thấy quán phù hợp.",
      items: [],
      actions: [],
    } as never);

    render(<ChatDashboard user={{ sub: "user-voice", email: "voice@example.test", role: "USER" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Nhập bằng giọng nói" }));
    expect(screen.getByRole("textbox", { name: "Nhập yêu cầu" })).toHaveValue("Tìm quán phở");
    fireEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));

    await screen.findByText("Mình tìm thấy quán phù hợp.");
    expect(screen.getByRole("button", { name: "Đọc văn bản" })).toBeInTheDocument();
  });

  it("captures device location when the user asks for the current location", async () => {
    const position = {
      coords: { latitude: 21.01, longitude: 105.82, accuracy: 12 },
      timestamp: Date.now(),
    } as GeolocationPosition;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: (success: PositionCallback) => success(position) },
    });
    jest.mocked(apiClient.reverseGeocodeAddress).mockResolvedValue({
      candidates: [{ address_text: "Địa chỉ thiết bị", latitude: 21.01, longitude: 105.82 }],
    } as never);
    jest.mocked(apiClient.sendAssistantMessage).mockResolvedValue({
      conversation_id: "conversation-current-location",
      message: "Đã nhận vị trí.",
      items: [],
      actions: [],
    } as never);

    render(<ChatDashboard user={{ sub: "user-location", email: "location@example.test", role: "USER" }} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Nhập yêu cầu" }), {
      target: { value: "Đặt xe từ vị trí hiện tại đi sân bay Nội Bài" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));

    await waitFor(() => expect(apiClient.sendAssistantMessage).toHaveBeenCalledWith(
      "Đặt xe từ vị trí hiện tại đi sân bay Nội Bài",
      undefined,
      expect.objectContaining({ latitude: 21.01, longitude: 105.82, source: "device" }),
      expect.any(AbortSignal),
    ));
  });
});
