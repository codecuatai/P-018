"use client";

import { ArrowUp, Bot, ChevronLeft, ChevronRight, Loader2, LocateFixed, Mic, Plus, PlusCircle, RefreshCw, Sparkles, Car, Utensils, UtensilsCrossed, Stethoscope, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";

import { AssistantCards, FoodCartDock, type FoodSelection } from "@/components/WorkflowCards";
import { createConversation, createIdempotencyKey, errorText, getConversation, isRetryableError, runAssistantAction, sendAssistantMessage } from "@/lib/api-client";
import { calculatePollingInterval } from "@/lib/active-history-cadence";
import { fetchActiveHistoryShared, subscribeActiveHistoryShared } from "@/lib/active-history-poller";
import { emitActiveConversationChanged, emitConversationsChanged, NEW_CONVERSATION_EVENT } from "@/lib/conversation-events";
import { isUserVisibleConversationMessage, type AssistantAction, type AssistantResponse, type AuthUser, type ChatMessage, type ConversationRecord, type HistoryItem } from "@/types";

import { ActiveWorkDetailDialog, ActiveWorkRailCardWithCancel as ActiveWorkRailCard, ContextRail, ConversationContextCards } from "@/features/product/context-rail";

export function ChatDashboard({ user, initialConversationId }: { user: AuthUser; initialConversationId?: string }) {
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [conversationLoadError, setConversationLoadError] = useState("");
  const [conversationLoadNonce, setConversationLoadNonce] = useState(0);
  const [activeActionId, setActiveActionId] = useState<string>();
  const [activeItems, setActiveItems] = useState<HistoryItem[]>([]);
  const [activeRefreshNonce, setActiveRefreshNonce] = useState(0);
  const [activeDetail, setActiveDetail] = useState<HistoryItem | null>(null);
  const [foodSelections, setFoodSelections] = useState<Record<string, FoodSelection>>({});
  const [foodSelectionSubmitted, setFoodSelectionSubmitted] = useState(false);
  
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [railWidth, setRailWidth] = useState(280);
  const [isResizingRail, setIsResizingRail] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1040);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState("");

  const actionKeys = useRef<Record<string, string>>({});
  const consumedActionIds = useRef<Set<string>>(new Set());
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const railWidthRef = useRef(railWidth);

  // Resize Rail Logic
  useEffect(() => {
    try {
      const saved = localStorage.getItem("xone_rail_collapsed");
      if (saved !== null) {
        const parsed = saved === "true";
        setRailCollapsed(parsed);
        window.dispatchEvent(new CustomEvent("xone-rail-state-changed", { detail: { collapsed: parsed } }));
      }
      const savedWidth = localStorage.getItem("xone_rail_width");
      if (savedWidth) {
        const parsed = parseInt(savedWidth, 10);
        if (!Number.isNaN(parsed) && parsed >= 220 && parsed <= 500) {
          railWidthRef.current = parsed;
          setRailWidth(parsed);
        }
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

  const handleRailMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsResizingRail(true);
  };

  useEffect(() => {
    if (!isResizingRail) return;
    const handleMouseMove = (event: MouseEvent) => {
      const newWidth = Math.min(Math.max(window.innerWidth - event.clientX, 220), 500);
      railWidthRef.current = newWidth;
      setRailWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizingRail(false);
      try {
        localStorage.setItem("xone_rail_width", String(railWidthRef.current));
      } catch {}
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingRail]);

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

    const unsubscribe = subscribeActiveHistoryShared(user.sub, (items) => {
      if (active) setActiveItems(items);
    });

    const scheduleNext = (interval: number) => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (active && !document.hidden) {
        timer = window.setTimeout(() => { void refresh(); }, interval);
      }
    };

    const refresh = async (force = false): Promise<void> => {
      if (!active || document.hidden) return;
      requestSignalController = new AbortController();
      try {
        const { items, nextInterval } = await fetchActiveHistoryShared(user.sub, {
          force,
          signal: requestSignalController.signal,
        });
        if (!active) return;
        setActiveItems(items);
        scheduleNext(nextInterval);
      } catch {
        scheduleNext(60_000);
      } finally {
        requestSignalController = undefined;
      }
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
  }, [activeRefreshNonce, user.sub]);

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

  async function send(textOverride?: string): Promise<void> {
    const text = (textOverride ?? composer).trim();
    if (!text || sending) return;
    const pendingId = makeId("assistant");
    setMessages((current) => [...current, { id: makeId("user"), role: "user", text, timestamp: new Date().toISOString(), requestStatus: "sent" }, { id: pendingId, role: "assistant", text: "Mình đang xem yêu cầu của bạn…", timestamp: new Date().toISOString(), requestStatus: "sending" }]);
    setComposer("");
    setSending(true);
    try {
      const requestStartedAt = Date.now();
      const response = await sendAssistantMessage(text, conversationId);
      await holdHealthcareDemoResponse(response, requestStartedAt);
      setConversationId(response.conversation_id);
      if (response.items.some((item) => item.kind === "food_options") && response.actions.some((action) => action.kind === "select_food_item")) {
        setFoodSelections({});
        setFoodSelectionSubmitted(false);
      }
      setMessages((current) => current.map((item) => item.id === pendingId ? { ...item, text: response.message, response, requestStatus: "sent" } : item));
      void syncConversation(response.conversation_id);
      emitConversationsChanged();
      setActiveRefreshNonce((value) => value + 1);
    } catch (error) {
      setMessages((current) => current.map((item) => item.id === pendingId ? { ...item, text: errorText(error), requestStatus: "error", retryText: text } : item));
      setComposer(text);
    } finally { setSending(false); }
  }

  async function handleAction(action: AssistantAction, input?: { quantity?: number }): Promise<void> {
    if (!conversationId || sending || activeActionId || consumedActionIds.current.has(action.id)) return;
    const idempotencyKey = actionKeys.current[action.id] ?? createIdempotencyKey(`assistant-${action.kind}`);
    actionKeys.current[action.id] = idempotencyKey;
    const pendingId = makeId("action");
    setActiveActionId(action.id);
    setSending(true);
    setMessages((current) => [...current, { id: pendingId, role: "assistant", text: "Mình đang hoàn tất bước này…", timestamp: new Date().toISOString(), requestStatus: "sending" }]);
    try {
      const response = await runAssistantAction(conversationId, action.id, idempotencyKey, input);
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
      setActiveRefreshNonce((value) => value + 1);
    } catch (error) {
      const retryable = isRetryableError(error);
      if (!retryable) consumedActionIds.current.add(action.id);
      setMessages((current) => current.map((message) => {
        if (!message.response?.actions.some((candidate) => candidate.id === action.id) || retryable) return message.id === pendingId ? { ...message, text: errorText(error), requestStatus: "error", ...(retryable ? { retryAction: action } : {}) } : message;
        return { ...message, response: { ...message.response, actions: message.response.actions.filter((candidate) => candidate.id !== action.id) } };
      }));
      if (!retryable) {
        void syncConversation(conversationId);
        setActiveRefreshNonce((value) => value + 1);
      }
    } finally { setSending(false); setActiveActionId(undefined); }
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
    setSending(true);
    setActiveActionId("food-selection-confirm");
    setMessages((current) => [...current, { id: pendingId, role: "assistant", text: "Mình đang chuẩn bị form xác nhận đơn…", timestamp: new Date().toISOString(), requestStatus: "sending" }]);
    try {
      let response;
      for (const selection of selections) {
        const action = selection.action;
        const idempotencyKey = actionKeys.current[action.id] ?? createIdempotencyKey("assistant-select_food_item");
        actionKeys.current[action.id] = idempotencyKey;
        response = await runAssistantAction(conversationId, action.id, idempotencyKey, { quantity: selection.quantity });
        consumedActionIds.current.add(action.id);
      }
      const checkout = response?.actions.find((action) => action.kind === "food_checkout");
      let finalResponse = response;
      if (checkout) {
        const checkoutKey = actionKeys.current[checkout.id] ?? createIdempotencyKey("assistant-food_checkout");
        actionKeys.current[checkout.id] = checkoutKey;
        finalResponse = await runAssistantAction(conversationId, checkout.id, checkoutKey);
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
      setActiveRefreshNonce((value) => value + 1);
    } catch (error) {
      setMessages((current) => current.map((message) => message.id === pendingId ? { ...message, text: errorText(error), requestStatus: "error" } : message));
    } finally { setSending(false); setActiveActionId(undefined); }
  }

  function newConversation(): void { actionKeys.current = {}; consumedActionIds.current = new Set(); setConversationId(undefined); setMessages([]); setComposer(""); setConversationLoadError(""); setLocateError(""); setFoodSelections({}); setFoodSelectionSubmitted(false); inputRef.current?.focus(); }
  
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
      setComposer((previous) => previous + (previous ? " " : "") + address);
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
          <span className="eyebrow">X-ONE ASSISTANT</span>
          <h1 id="assistant-title">Xin chào<span className="visually-hidden"> · Trợ lý X-One</span></h1>
          <p>Nói điều bạn cần bằng cách tự nhiên. Mình sẽ cùng bạn xử lý từng bước.</p>
        </div>
        <button className="icon-button" type="button" onClick={newConversation} aria-label="Bắt đầu cuộc trò chuyện mới" title="Cuộc trò chuyện mới">
          <Plus size={18} />
        </button>
      </header>
      
      <div
        className={`assistant-layout${railCollapsed ? " is-rail-collapsed" : ""}${isResizingRail ? " is-resizing-active" : ""}`}
        style={isMobile ? undefined : { gridTemplateColumns: railCollapsed ? "minmax(0, 1fr) 0px" : `minmax(0, 1fr) ${railWidth}px` }}
      >
        <div className="chat-column">
          <div className="chat-feed" ref={feedRef} aria-busy={loadingHistory}>
            {loadingHistory && messages.length === 0 ? <div className="inline-note">Đang tải cuộc trò chuyện…</div> : null}
            {conversationLoadError && !loadingHistory ? <div className="error-panel" role="alert"><p>{conversationLoadError}</p><button className="button button-secondary" type="button" onClick={() => setConversationLoadNonce((value) => value + 1)}>Thử lại</button></div> : null}
            {messages.length === 0 && !loadingHistory && !conversationLoadError ? <WelcomeState onStart={(prompt) => void send(prompt)} /> : null}
            {messages.map((message) => <MessageBubble key={message.id} message={message} onAction={(action) => void handleAction(action)} onFoodSelectionChange={handleFoodSelectionChange} foodSelections={foodSelections} onRetry={(text) => void send(text)} activeActionId={activeActionId} />)}
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
                <button className="composer-mic-btn" type="button" aria-label="Nhập bằng giọng nói" title="Tính năng đang được phát triển" disabled>
                  <Mic size={18} />
                </button>
                <button className="send-button" type="button" onClick={() => void send()} disabled={sending || !composer.trim()} aria-label="Gửi yêu cầu">
                  {sending ? <Loader2 className="spinner" size={16} /> : <ArrowUp size={16} />}
                </button>
              </div>
            </div>
            {locateError ? <p className="composer-error" role="alert">{locateError}</p> : null}
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
          style={isMobile ? undefined : { right: railCollapsed ? "10px" : `${railWidth}px` }}
        >
          {railCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>

        <ContextRail
          mode={activeItems.length ? "active" : "idle"}
          title={activeItems.length ? "Việc đang xử lý" : "Dịch vụ đang diễn ra"}
          description={activeItems.length ? "Cập nhật mới nhất của các dịch vụ bạn đang dùng." : ""}
          onCollapse={() => toggleRail(true)}
          style={isMobile ? undefined : { width: railCollapsed ? 0 : railWidth }}
          resizer={
            !railCollapsed && !isMobile ? (
              <div className="rail-resizer" onMouseDown={handleRailMouseDown} onDoubleClick={() => toggleRail(true)} title="Kéo để chỉnh kích thước tiện ích, nhấp đúp để ẩn" />
            ) : undefined
          }
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

type ServiceCard = {
  icon: LucideIcon;
  service: string;
  desc: string;
  accent: string;
  prompt: string;
  example: string;
};

function WelcomeState({ onStart }: { onStart: (prompt: string) => void }) {
  const services: ServiceCard[] = [
    {
      icon: Car,
      service: "Đặt xe di chuyển",
      desc: "Xe 4 chỗ, 7 chỗ đón tận nơi",
      accent: "welcome-card-ride",
      prompt: "Đặt xe từ VinUni đến Hồ Gươm bằng xe 4 chỗ",
      example: "VinUni → Hồ Gươm (4 chỗ)",
    },
    {
      icon: Utensils,
      service: "Giao đồ ăn ngon",
      desc: "Tìm quán ngon và đặt món nóng",
      accent: "welcome-card-food",
      prompt: "Tìm phở bò giao về nhà",
      example: "Tìm phở bò giao tận nơi",
    },
    {
      icon: UtensilsCrossed,
      service: "Đặt bàn nhà hàng",
      desc: "Hẹn hò, tiệc gia đình, tiếp khách",
      accent: "welcome-card-restaurant",
      prompt: "Tối nay tìm nhà hàng cho 2 người ở Hà Nội",
      example: "Bàn 2 người tối nay ở Hà Nội",
    },
    {
      icon: Stethoscope,
      service: "Đặt lịch khám bệnh",
      desc: "Bác sĩ chuyên khoa, đặt hẹn nhanh",
      accent: "welcome-card-healthcare",
      prompt: "Giúp tôi đặt lịch khám thần kinh sáng mai",
      example: "Khám chuyên khoa thần kinh",
    },
  ];

  return (
    <div className="welcome-state">
      <div className="welcome-hero-badge">
        <span className="welcome-sparkle"><Sparkles size={14} /></span>
        <span>X-ONE CONCIERGE</span>
      </div>
      <h2 className="welcome-headline">Bạn cần hỗ trợ gì hôm nay?</h2>
      <p className="welcome-sub">
        Nhắn tin tự nhiên như trò chuyện. Bạn có thể chọn 1 dịch vụ bên dưới hoặc gõ yêu cầu kết hợp nhiều việc cùng lúc.
      </p>
      <div className="welcome-services-grid">
        {services.map(({ icon: Icon, service, desc, accent, prompt, example }) => (
          <button
            key={service}
            type="button"
            className={`welcome-service-card ${accent}`}
            onClick={() => onStart(prompt)}
          >
            <div className="welcome-card-icon-wrap">
              <Icon size={20} aria-hidden="true" />
            </div>
            <div className="welcome-card-body">
              <div className="welcome-card-title-row">
                <strong>{service}</strong>
                <span className="welcome-card-arrow" aria-hidden="true">↗</span>
              </div>
              <p className="welcome-card-desc">{desc}</p>
              <div className="welcome-card-prompt-pill">
                <span>Ví dụ:</span> &ldquo;{example}&rdquo;
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message, onAction, onFoodSelectionChange, foodSelections, onRetry, activeActionId }: { message: ChatMessage; onAction: (action: AssistantAction, input?: { quantity?: number }) => void; onFoodSelectionChange: (selection: FoodSelection) => void; foodSelections: Record<string, FoodSelection>; onRetry: (text: string) => void; activeActionId?: string }) {
  const assistant = message.role === "assistant";
  return <article className={`chat-message ${message.role} ${message.requestStatus === "error" ? "has-error" : ""}`}><div className={`message-avatar${assistant ? " message-avatar-assistant" : ""}`}>{assistant ? <Bot size={18} /> : <span>Bạn</span>}</div><div className="message-content"><div className="message-text">{message.text}</div>{message.requestStatus === "sending" ? <div className="typing-indicator"><span /><span /><span /></div> : null}{message.response ? <AssistantCards response={message.response} onAction={onAction} foodSelections={foodSelections} onFoodSelectionChange={onFoodSelectionChange} disabledActionId={activeActionId} /> : null}{message.requestStatus === "error" && message.retryText ? <button className="retry-button" type="button" onClick={() => onRetry(message.retryText ?? "")}><RefreshCw size={14} /> Thử lại</button> : null}{message.requestStatus === "error" && message.retryAction ? <button className="retry-button" type="button" onClick={() => onAction(message.retryAction!)} disabled={Boolean(activeActionId)}><RefreshCw size={14} /> Thử lại</button> : null}</div></article>;
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

const REVERSE_GEOCODE_TIMEOUT_MS = 8_000;

// Reverse geocode through Nominatim (OpenStreetMap) for house-number level detail.
// The request is aborted after REVERSE_GEOCODE_TIMEOUT_MS so a slow or unreachable
// provider can never leave the composer's locate button spinning.
async function fetchAddress(position: GeolocationPosition): Promise<string> {
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REVERSE_GEOCODE_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=vi`,
      { signal: controller.signal },
    );
    
    if (response.ok) {
      const data = await response.json();
      const addr = data.address;
      
      if (addr) {
        const houseNumber = addr.house_number ? `Số ${addr.house_number}` : "";
        const road = addr.road || "";
        const streetInfo = [houseNumber, road].filter(Boolean).join(" ");
        
        const district = addr.county || addr.suburb || addr.city_district || "";
        const city = addr.city || addr.province || addr.state || "";
        
        const rawAddress = [streetInfo, district, city].filter(Boolean).join(", ");
        const uniqueParts = [...new Set(rawAddress.split(", ").map(s => s.trim()))].filter(Boolean);
        
        if (uniqueParts.length > 0) {
          return uniqueParts.join(", ");
        }
      }
    }
    throw new Error("Không có dữ liệu chi tiết");
    
  } catch (error) {
    console.warn("Lỗi API Nominatim, fallback về tọa độ thô:", error);
    return `Tọa độ: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  } finally {
    window.clearTimeout(timer);
  }
}

async function holdHealthcareDemoResponse(response: AssistantResponse, requestStartedAt: number): Promise<void> {
  const isHealthcareResponse = response.items.some((item) => ["healthcare_options", "healthcare_no_availability", "appointment", "healthcare_confirmation", "appointment_confirmed"].includes(item.kind))
    || response.actions.some((action) => action.kind.startsWith("healthcare_") || action.kind === "select_healthcare_slot");
  if (!isHealthcareResponse) return;

  const remainingDelay = 6000 - (Date.now() - requestStartedAt);
  if (remainingDelay > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, remainingDelay));
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
