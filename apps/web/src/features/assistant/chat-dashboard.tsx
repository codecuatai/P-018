"use client";

import { ArrowUp, Bot, ChevronLeft, ChevronRight, Loader2, LocateFixed, Plus, PlusCircle, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { AssistantCards, FoodCartDock, type FoodSelection } from "@/components/WorkflowCards";
import { AgentProgressIndicator } from "@/components/AgentProgressIndicator";
import { createConversation, createIdempotencyKey, errorText, getConversation, isAbortError, isRetryableError, reverseGeocodeAddress, runAssistantAction, sendAssistantMessage } from "@/lib/api-client";
import { actionActivity, buildActivityFromResponse } from "@/lib/progress-filter";
import { calculatePollingInterval } from "@/lib/active-history-cadence";
import { fetchActiveHistoryShared, subscribeActiveHistoryShared } from "@/lib/active-history-poller";
import { emitActiveConversationChanged, emitConversationsChanged, NEW_CONVERSATION_EVENT } from "@/lib/conversation-events";
import { isUserVisibleConversationMessage, type AssistantAction, type AssistantResponse, type AuthUser, type ChatMessage, type ConversationRecord, type DeviceCurrentLocation, type HistoryItem } from "@/types";

import { ActiveWorkDetailDialog, ActiveWorkRailCardWithCancel as ActiveWorkRailCard, ContextRail, ConversationContextCards } from "@/features/product/context-rail";
import { VoiceInput } from "@/components/voice-input";
import { VoiceOutput } from "@/components/voice-output";
import { useSpeechSynthesis } from "@/hooks/use-speech-synthesis";
import { deviceLocationFromPosition } from "./current-location";

export function ChatDashboard({ user, initialConversationId }: { user: AuthUser; initialConversationId?: string }) {
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [conversationLoadError, setConversationLoadError] = useState("");
  const [conversationLoadNonce, setConversationLoadNonce] = useState(0);
  const [activeActionId, setActiveActionId] = useState<string>();
  
  const tts = useSpeechSynthesis();
  const [ttsActiveMessageId, setTtsActiveMessageId] = useState<string | null>(null);
  const [activeItems, setActiveItems] = useState<HistoryItem[]>([]);
  const [activeDetail, setActiveDetail] = useState<HistoryItem | null>(null);
  const [foodSelections, setFoodSelections] = useState<Record<string, FoodSelection>>({});
  const [foodSelectionSubmitted, setFoodSelectionSubmitted] = useState(false);
  
  const [railCollapsed, setRailCollapsed] = useState(false);

  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState("");
  const [currentLocation, setCurrentLocation] = useState<DeviceCurrentLocation>();

  const actionKeys = useRef<Record<string, string>>({});
  const consumedActionIds = useRef<Set<string>>(new Set());
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeRequestController = useRef<AbortController | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 128)}px`;
  }, [composer]);

  // Abort any in-flight assistant request when the chat screen unmounts so a
  // pending fetch can never keep the request (or its timers) alive after navigation.
  useEffect(() => {
    return () => activeRequestController.current?.abort();
  }, []);

  // Rail collapse persists as a simple toggle (layout sizing is pure CSS now).
  useEffect(() => {
    try {
      const saved = localStorage.getItem("xone_rail_collapsed");
      if (saved !== null) {
        const parsed = saved === "true";
        setRailCollapsed(parsed);
        window.dispatchEvent(new CustomEvent("xone-rail-state-changed", { detail: { collapsed: parsed } }));
      }
    } catch {}

    const handleToggleEvent = () => {
      setRailCollapsed((prev) => {
        const next = !prev;
        try { localStorage.setItem("xone_rail_collapsed", String(next)); } catch {}
        window.dispatchEvent(new CustomEvent("xone-rail-state-changed", { detail: { collapsed: next } }));
        return next;
      });
    };

    window.addEventListener("xone-toggle-rail", handleToggleEvent);
    return () => window.removeEventListener("xone-toggle-rail", handleToggleEvent);
  }, []);

  function toggleRail(collapsed: boolean) {
    setRailCollapsed(collapsed);
    try { localStorage.setItem("xone_rail_collapsed", String(collapsed)); } catch {}
    window.dispatchEvent(new CustomEvent("xone-rail-state-changed", { detail: { collapsed } }));
  }

  // Conversation Logic
  useEffect(() => {
    let active = true;
    setLoadingHistory(true);
    setConversationLoadError("");
    actionKeys.current = {};
    consumedActionIds.current = new Set();
    setConversationId(initialConversationId);
    setMessages([]);
    setFoodSelections({});
    setFoodSelectionSubmitted(false);
    const entryContext = initialConversationId ? undefined : readEntryContext();
    if (initialConversationId) {
      void getConversation(initialConversationId).then((detail) => {
        if (!active) return;
        setConversationId(detail.conversationId);
        setMessages(toChatMessages(detail, consumedActionIds.current));
      }).catch((reason) => { if (active) setConversationLoadError(errorText(reason)); }).finally(() => { if (active) setLoadingHistory(false); });
      return () => { active = false; };
    }
    if (entryContext) {
      void createConversation(`Tiếp tục ${entryContext.label}`, entryContext.service).then((detail) => {
        if (!active) return;
        setConversationId(detail.conversationId);
        setMessages([]);
        setComposer(entryContext.prompt);
      }).catch(() => undefined).finally(() => { if (active) setLoadingHistory(false); });
      return () => { active = false; };
    }
    setConversationId(undefined);
    setMessages([]);
    setLoadingHistory(false);
    return () => { active = false; };
  }, [conversationLoadNonce, initialConversationId, user.sub]);

  useEffect(() => {
    const handleRideCancelled = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      setActiveItems((current) => current.filter((item) => item.id !== id));
      setActiveDetail((current) => current?.id === id ? null : current);
    };
    window.addEventListener("xone-ride-cancelled", handleRideCancelled);
    return () => window.removeEventListener("xone-ride-cancelled", handleRideCancelled);
  }, []);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let requestSignalController: AbortController | undefined;
    let refreshPromise: Promise<void> | undefined;

    const unsubscribe = subscribeActiveHistoryShared(user.sub, (items) => {
      if (active) setActiveItems(items);
    });

    const scheduleNext = (interval: number) => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (active && !document.hidden) {
        timer = window.setTimeout(() => { void refresh(); }, interval);
      }
    };

    const refresh = (force = false): Promise<void> => {
      if (!active || document.hidden) return Promise.resolve();
      if (refreshPromise) return refreshPromise;
      const controller = new AbortController();
      requestSignalController = controller;
      const run = (async () => {
        try {
          const { items, nextInterval } = await fetchActiveHistoryShared(user.sub, {
            force,
            signal: controller.signal,
          });
          if (!active) return;
          setActiveItems(items);
          scheduleNext(nextInterval);
        } catch {
          scheduleNext(60_000);
        }
      })();
      let settled: Promise<void>;
      settled = run.finally(() => {
        if (refreshPromise === settled) refreshPromise = undefined;
        if (requestSignalController === controller) requestSignalController = undefined;
      });
      refreshPromise = settled;
      return settled;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (timer !== undefined) window.clearTimeout(timer);
        timer = undefined;
      } else {
        void refresh(false);
      }
    };

    const handleWindowFocus = () => {
      if (!document.hidden) void refresh(false);
    };

    const handleActiveWorkChanged = () => {
      void refresh(true);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("xone-active-work-changed", handleActiveWorkChanged);

    void refresh();

    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      requestSignalController?.abort();
      unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("xone-active-work-changed", handleActiveWorkChanged);
    };
  }, [user.sub]);

  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" }); }, [messages.length, sending]);

  useEffect(() => {
    emitActiveConversationChanged(conversationId);
  }, [conversationId]);

  useEffect(() => {
    const handleNewConversation = () => newConversation();
    window.addEventListener(NEW_CONVERSATION_EVENT, handleNewConversation);
    return () => window.removeEventListener(NEW_CONVERSATION_EVENT, handleNewConversation);
  }, []);

  async function syncConversation(id: string): Promise<void> {
    try { setMessages(toChatMessages(await getConversation(id), consumedActionIds.current)); } catch { /* The received response remains visible. */ }
  }

  // Stopping only aborts the HTTP request on this device. Side effects the
  // backend already committed (confirmed bookings, payments) are not rolled
  // back — true workflow cancellation will require a backend cancel endpoint.
  function handleStopGenerating(): void {
    activeRequestController.current?.abort();
  }

  async function send(textOverride?: string): Promise<void> {
    const text = (textOverride ?? composer).trim();
    if (!text || sending) return;
    const pendingId = makeId("assistant");
    const pendingStartedAt = Date.now();
    const controller = new AbortController();
    activeRequestController.current = controller;
    setMessages((current) => [...current, { id: makeId("user"), role: "user", text, timestamp: new Date().toISOString(), requestStatus: "sent" }, { id: pendingId, role: "assistant", text: "Mình đang xem yêu cầu của bạn…", timestamp: new Date().toISOString(), requestStatus: "sending", pendingStartedAt }]);
    setComposer("");
    setSending(true);
    try {
      const response = await sendAssistantMessage(text, conversationId, currentLocation, controller.signal);
      setConversationId(response.conversation_id);
      if (response.items.some((item) => item.kind === "food_options") && response.actions.some((action) => action.kind === "select_food_item")) {
        setFoodSelections({});
        setFoodSelectionSubmitted(false);
      }
      setMessages((current) => current.map((item) => item.id === pendingId ? { ...item, text: response.message, response, requestStatus: "sent" } : item));
      void syncConversation(response.conversation_id);
      emitConversationsChanged();
      window.dispatchEvent(new CustomEvent("xone-active-work-changed"));
    } catch (error) {
      if (isAbortError(error)) {
        setMessages((current) => current.map((item) => item.id === pendingId ? { ...item, text: "Đã dừng tạo câu trả lời.", requestStatus: "stopped" as const } : item));
        return;
      }
      setMessages((current) => current.map((item) => item.id === pendingId ? { ...item, text: errorText(error), requestStatus: "error", retryText: text } : item));
      setComposer(text);
    } finally {
      if (activeRequestController.current === controller) activeRequestController.current = null;
      setSending(false);
    }
  }

  async function handleAction(action: AssistantAction, input?: { quantity?: number }): Promise<void> {
    if (!conversationId || sending || activeActionId || consumedActionIds.current.has(action.id)) return;
    const idempotencyKey = actionKeys.current[action.id] ?? createIdempotencyKey(`assistant-${action.kind}`);
    actionKeys.current[action.id] = idempotencyKey;
    const pendingId = makeId("action");
    const sourceResponse = messages.find((message) => message.response?.actions.some((candidate) => candidate.id === action.id))?.response;
    const activity = sourceResponse ? buildActivityFromResponse(sourceResponse, actionActivity(action)) : undefined;
    const controller = new AbortController();
    activeRequestController.current = controller;
    setActiveActionId(action.id);
    setSending(true);
    setMessages((current) => [...current, { id: pendingId, role: "assistant", text: "Mình đang hoàn tất bước này…", timestamp: new Date().toISOString(), requestStatus: "sending", pendingStartedAt: Date.now(), activity }]);
    try {
      const response = await runAssistantAction(conversationId, action.id, idempotencyKey, {
        ...input,
        ...(currentLocation ? { currentLocation } : {}),
      }, controller.signal);
      consumedActionIds.current.add(action.id);
      delete actionKeys.current[action.id];
      const keepMutationInTurn = action.kind === "select_food_item" || action.kind === "food_cart_increment" || action.kind === "food_cart_decrement" || action.kind === "food_cart_remove";
      setMessages((current) => {
        const withoutPending = current.filter((message) => message.id !== pendingId);
        const targetIndex = withoutPending.findIndex((message) => message.response?.actions.some((candidate) => candidate.id === action.id));
        if (keepMutationInTurn && targetIndex >= 0) {
          return withoutPending.map((message, index) => index === targetIndex
            ? { ...message, text: response.message, response, requestStatus: "sent" as const }
            : message);
        }
        return withoutPending.concat({ id: pendingId, role: "assistant", text: response.message, response, timestamp: new Date().toISOString(), requestStatus: "sent" });
      });
      if (!keepMutationInTurn) void syncConversation(response.conversation_id);
      emitConversationsChanged();
      window.dispatchEvent(new CustomEvent("xone-active-work-changed"));
    } catch (error) {
      if (isAbortError(error)) {
        setMessages((current) => current.map((message) => message.id === pendingId ? { ...message, text: "Đã dừng thực hiện bước này.", requestStatus: "stopped" as const } : message));
        return;
      }
      const retryable = isRetryableError(error);
      if (!retryable) consumedActionIds.current.add(action.id);
      setMessages((current) => current.map((message) => {
        if (!message.response?.actions.some((candidate) => candidate.id === action.id) || retryable) return message.id === pendingId ? { ...message, text: errorText(error), requestStatus: "error", ...(retryable ? { retryAction: action } : {}) } : message;
        return { ...message, response: { ...message.response, actions: message.response.actions.filter((candidate) => candidate.id !== action.id) } };
      }));
      if (!retryable) {
        void syncConversation(conversationId);
        window.dispatchEvent(new CustomEvent("xone-active-work-changed"));
      }
    } finally {
      if (activeRequestController.current === controller) activeRequestController.current = null;
      setSending(false);
      setActiveActionId(undefined);
    }
  }

  function handleFoodSelectionChange(selection: FoodSelection): void {
    setFoodSelections((current) => {
      if (selection.quantity <= 0) {
        const { [selection.action.id]: _removed, ...remaining } = current;
        return remaining;
      }
      return { ...current, [selection.action.id]: selection };
    });
  }

  async function confirmFoodSelections(): Promise<void> {
    const selections = Object.values(foodSelections).filter((selection) => selection.quantity > 0);
    if (!conversationId || sending || activeActionId || !selections.length) return;
    const pendingId = makeId("food-confirm");
    const controller = new AbortController();
    activeRequestController.current = controller;
    setSending(true);
    setActiveActionId("food-selection-confirm");
    setMessages((current) => [...current, { id: pendingId, role: "assistant", text: "Mình đang chuẩn bị form xác nhận đơn…", timestamp: new Date().toISOString(), requestStatus: "sending", pendingStartedAt: Date.now() }]);
    try {
      let response;
      for (const selection of selections) {
        const action = selection.action;
        const idempotencyKey = actionKeys.current[action.id] ?? createIdempotencyKey("assistant-select_food_item");
        actionKeys.current[action.id] = idempotencyKey;
        response = await runAssistantAction(conversationId, action.id, idempotencyKey, {
          quantity: selection.quantity,
          ...(currentLocation ? { currentLocation } : {}),
        }, controller.signal);
        consumedActionIds.current.add(action.id);
      }
      if (controller.signal.aborted) {
        setMessages((current) => current.map((message) => message.id === pendingId ? { ...message, text: "Đã dừng tạo đơn.", requestStatus: "stopped" as const } : message));
        return;
      }
      const checkout = response?.actions.find((action) => action.kind === "food_checkout");
      let finalResponse = response;
      if (checkout) {
        const checkoutKey = actionKeys.current[checkout.id] ?? createIdempotencyKey("assistant-food_checkout");
        actionKeys.current[checkout.id] = checkoutKey;
        finalResponse = await runAssistantAction(conversationId, checkout.id, checkoutKey, currentLocation ? { currentLocation } : undefined, controller.signal);
        consumedActionIds.current.add(checkout.id);
      }
      if (!finalResponse) throw new Error("FOOD_RESPONSE_EMPTY");
      for (const selection of selections) delete actionKeys.current[selection.action.id];
      if (checkout) delete actionKeys.current[checkout.id];
      setFoodSelections({});
      setFoodSelectionSubmitted(true);
      setMessages((current) => current.map((message) => message.id === pendingId
        ? { ...message, text: finalResponse.message, response: finalResponse, requestStatus: "sent" as const }
        : message));
      void syncConversation(finalResponse.conversation_id);
      emitConversationsChanged();
      window.dispatchEvent(new CustomEvent("xone-active-work-changed"));
    } catch (error) {
      if (isAbortError(error)) {
        setMessages((current) => current.map((message) => message.id === pendingId ? { ...message, text: "Đã dừng tạo đơn.", requestStatus: "stopped" as const } : message));
        return;
      }
      setMessages((current) => current.map((message) => message.id === pendingId ? { ...message, text: errorText(error), requestStatus: "error" } : message));
    } finally {
      if (activeRequestController.current === controller) activeRequestController.current = null;
      setSending(false);
      setActiveActionId(undefined);
    }
  }

  function newConversation(): void { actionKeys.current = {}; consumedActionIds.current = new Set(); setConversationId(undefined); setMessages([]); setComposer(""); setConversationLoadError(""); setLocateError(""); setCurrentLocation(undefined); setFoodSelections({}); setFoodSelectionSubmitted(false); inputRef.current?.focus(); }
  
  async function handleLocate(): Promise<void> {
    if (!("geolocation" in navigator)) {
      setLocateError("Trình duyệt của bạn không hỗ trợ định vị.");
      return;
    }

    setIsLocating(true);
    setLocateError("");
    try {
      const position = await getCurrentPosition();
      const address = await fetchAddress(position);
      setCurrentLocation(deviceLocationFromPosition(position, address));
      inputRef.current?.focus();
    } catch {
      setLocateError("Không thể lấy vị trí. Vui lòng kiểm tra quyền truy cập và thử lại.");
    } finally {
      setIsLocating(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }
  
  const foodSelectionFormVisible = hasFoodSelectionForm(messages) && !foodSelectionSubmitted;
  const foodSelectionTotal = Object.values(foodSelections).reduce((total, selection) => total + (typeof selection.option.price === "number" ? selection.option.price : 0) * selection.quantity, 0);
  
  return (
    <section className="assistant-page" aria-labelledby="assistant-title">
      <header className="assistant-header">
        <div className="assistant-heading">
          <span className="eyebrow">TRỢ LÝ X-ONE</span>
          <h1 id="assistant-title">Xin chào<span className="visually-hidden"> · Trợ lý X-One</span></h1>
          <p>Nói điều bạn cần bằng cách tự nhiên. Mình sẽ cùng bạn xử lý từng bước.</p>
        </div>
        <button className="icon-button" type="button" onClick={newConversation} aria-label="Bắt đầu cuộc trò chuyện mới" title="Cuộc trò chuyện mới">
          <Plus size={18} />
        </button>
      </header>
      
      <div
        className={`assistant-layout${railCollapsed ? " is-rail-collapsed" : ""}${activeItems.length ? " has-active-work" : ""}`}
      >
        <div className="chat-column">
          <div className="chat-feed" ref={feedRef} aria-busy={loadingHistory}>
            {loadingHistory && messages.length === 0 ? <div className="inline-note">Đang tải cuộc trò chuyện…</div> : null}
            {conversationLoadError && !loadingHistory ? <div className="error-panel" role="alert"><p>{conversationLoadError}</p><button className="button button-secondary" type="button" onClick={() => setConversationLoadNonce((value) => value + 1)}>Thử lại</button></div> : null}
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id || index}
                message={message}
                onAction={handleAction}
                onFoodSelectionChange={handleFoodSelectionChange}
                foodSelections={foodSelections}
                onRetry={(text) => void send(text)}
                activeActionId={activeActionId}
                tts={tts}
                ttsActiveMessageId={ttsActiveMessageId}
                setTtsActiveMessageId={setTtsActiveMessageId}
              />
            ))}
          </div>
          
          {foodSelectionFormVisible ? <FoodCartDock total={foodSelectionTotal} onConfirm={() => void confirmFoodSelections()} disabled={sending || foodSelectionTotal <= 0} /> : null}
          
          <div className="composer-wrap">
            <div className="composer-box">
              <button className="composer-addon-btn" type="button" aria-label="Thêm tùy chọn" title="Tính năng đang được phát triển" disabled>
                <PlusCircle size={20} />
              </button>
              <textarea
                ref={inputRef}
                aria-label="Nhập yêu cầu"
                disabled={sending}
                onChange={(event) => setComposer(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ví dụ: Tối nay tìm nhà hàng cho 2 người rồi gọi xe tới đó…"
                rows={1}
                value={composer}
              />
              <div className="composer-actions">
                <button className="location-button" type="button" disabled={isLocating} onClick={() => void handleLocate()} aria-label="Lấy vị trí hiện tại" title="Lấy vị trí hiện tại">
                  {isLocating ? <Loader2 className="spinner" size={18} /> : <LocateFixed size={18} />}
                </button>
                <VoiceInput
                  onTranscript={(text) => {
                    setComposer((prev) => (prev ? `${prev} ${text}` : text));
                    inputRef.current?.focus();
                  }}
                  onError={(msg) => setLocateError(msg)} // Reuse the error display
                  disabled={sending}
                />
                {sending ? (
                  <button className="send-button is-stop" type="button" onClick={handleStopGenerating} aria-label="Stop generating" title="Stop generating">
                    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">
                      <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" />
                    </svg>
                  </button>
                ) : (
                  <button className="send-button" type="button" onClick={() => void send()} disabled={!composer.trim()} aria-label="Gửi yêu cầu">
                    <ArrowUp size={16} />
                  </button>
                )}
              </div>
            </div>
            {locateError ? <p className="composer-error" role="alert">{locateError}</p> : null}
            {currentLocation ? <p className="composer-hint" role="status">Đang chia sẻ vị trí hiện tại{currentLocation.address_text ? `: ${currentLocation.address_text}` : ""}. Vị trí không được lưu vào hồ sơ.</p> : null}
            <p className="composer-hint">Enter gửi · Shift+Enter xuống dòng</p>
          </div>
        </div>

        {/* Center Vertical Edge Toggle Button for Right Rail */}
        <button
          className={`rail-edge-toggle${railCollapsed ? " is-collapsed" : ""}`}
          type="button"
          aria-label={railCollapsed ? "Mở tiện ích bên phải" : "Thu gọn tiện ích bên phải"}
          title={railCollapsed ? "Mở tiện ích" : "Thu gọn tiện ích"}
          onClick={() => toggleRail(!railCollapsed)}
        >
          {railCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>

        <ContextRail
          mode={activeItems.length ? "active" : "idle"}
          title={activeItems.length ? "Việc đang xử lý" : "Dịch vụ đang diễn ra"}
          description={activeItems.length ? "Cập nhật mới nhất của các dịch vụ bạn đang dùng." : ""}
          onCollapse={() => toggleRail(true)}
        >
          {activeItems.length ? (
            <div className="active-work-list">
              {activeItems.map((item) => <ActiveWorkRailCard key={`${item.type}-${item.id}`} item={item} onDetails={setActiveDetail} />)}
            </div>
          ) : (
            <ConversationContextCards onServiceShortcut={(prompt) => { setComposer(prompt); setTimeout(() => inputRef.current?.focus(), 0); }} />
          )}
        </ContextRail>
      </div>

      <ActiveWorkDetailDialog item={activeDetail} open={Boolean(activeDetail)} onOpenChange={(open) => { if (!open) setActiveDetail(null); }} />
    </section>
  );
}

function MessageBubble({
  message, 
  onAction, 
  onFoodSelectionChange, 
  foodSelections, 
  onRetry, 
  activeActionId,
  tts,
  ttsActiveMessageId,
  setTtsActiveMessageId 
}: { 
  message: ChatMessage; 
  onAction: (action: AssistantAction, input?: { quantity?: number }) => void; 
  onFoodSelectionChange: (selection: FoodSelection) => void; 
  foodSelections: Record<string, FoodSelection>; 
  onRetry: (text: string) => void; 
  activeActionId?: string;
  tts: import("@/hooks/use-speech-synthesis").TtsControl;
  ttsActiveMessageId: string | null;
  setTtsActiveMessageId: (id: string | null) => void;
}) {
  const assistant = message.role === "assistant";
  return (
    <article className={`chat-message ${message.role} ${message.requestStatus === "error" ? "has-error" : ""}${message.requestStatus === "stopped" ? " is-stopped" : ""}`}>
      <div className={`message-avatar${assistant ? " message-avatar-assistant" : ""}`}>
        {assistant ? <Bot size={18} /> : <span>Bạn</span>}
      </div>
      <div className="message-content">
        <div className="message-text">{message.text}</div>
        {assistant && message.text && message.requestStatus !== "sending" && (
          <VoiceOutput 
            text={message.text} 
            tts={tts}
            messageId={message.id || message.text}
            activeMessageId={ttsActiveMessageId}
            onPlay={(id) => setTtsActiveMessageId(id)}
          />
        )}
        {message.requestStatus === "sending" ? message.pendingStartedAt !== undefined ? <AgentProgressIndicator startedAt={message.pendingStartedAt} activity={message.activity} /> : <div className="typing-indicator"><span /><span /><span /></div> : null}
        {message.response ? (
          <AssistantCards response={message.response} onAction={onAction} foodSelections={foodSelections} onFoodSelectionChange={onFoodSelectionChange} disabledActionId={activeActionId} />
        ) : null}
        {message.requestStatus === "error" && message.retryText ? (
          <button className="retry-button" type="button" onClick={() => onRetry(message.retryText ?? "")}>
            <RefreshCw size={14} /> Thử lại
          </button>
        ) : null}
        {message.requestStatus === "error" && message.retryAction ? (
          <button className="retry-button" type="button" onClick={() => onAction(message.retryAction!)} disabled={Boolean(activeActionId)}>
            <RefreshCw size={14} /> Thử lại
          </button>
        ) : null}
      </div>
    </article>
  );
}

function hasFoodSelectionForm(messages: ChatMessage[]): boolean {
  return messages.some((message) => message.response?.items.some((item) => item.kind === "food_options")
    && message.response.actions.some((action) => action.kind === "select_food_item"));
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });
}

async function fetchAddress(position: GeolocationPosition): Promise<string> {
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  try {
    const result = await reverseGeocodeAddress(lat, lon);
    const candidate = result.candidates.find((item) => item.address_text.trim());
    if (candidate?.address_text.trim()) return candidate.address_text.trim();
  } catch {
    // The Gateway owns provider access. Keep the device location usable if
    // reverse geocoding is temporarily unavailable.
  }
  return `Tọa độ: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

function toChatMessages(record: ConversationRecord, consumedActionIds: Set<string> = new Set()): ChatMessage[] { return record.messages.filter(isUserVisibleConversationMessage).map((message, index) => ({ id: `${record.conversationId}-${index}`, role: message.role, text: message.content, timestamp: message.createdAt, ...(message.role === "assistant" && message.data ? { response: { ...message.data, actions: message.data.actions.filter((action) => !consumedActionIds.has(action.id)) } } : {}), requestStatus: "sent" })); }
function makeId(prefix: string): string { return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`; }
function formatTime(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(date); }

type EntryContext = { service: "food" | "ride" | "restaurant" | "healthcare"; label: string; prompt: string };


function readEntryContext(): EntryContext | undefined {
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") !== "assistant") return undefined;
  const service = params.get("service");
  const labels: Record<NonNullable<EntryContext>["service"], string> = {
    food: "Đồ ăn",
    ride: "Chuyến xe",
    restaurant: "Nhà hàng",
    healthcare: "Lịch khám",
  };
  if (!service || !(service in labels)) return undefined;
  const label = labels[service as EntryContext["service"]];
  return {
    service: service as EntryContext["service"],
    label,
    prompt: `Mình đang xem ${label}. Hãy giúp mình tiếp tục từ dịch vụ này và hỏi những thông tin còn thiếu.`,
  };
}
