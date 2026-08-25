"use client";

import { ArrowUp, Bot, Loader2, Plus, RefreshCw, LocateFixed, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { AssistantCards, FoodCartDock, type FoodSelection } from "@/components/WorkflowCards";
import { createConversation, createIdempotencyKey, errorText, getActiveHistory, getConversation, isRetryableError, runAssistantAction, sendAssistantMessage } from "@/lib/api-client";
import { emitActiveConversationChanged, emitConversationsChanged, NEW_CONVERSATION_EVENT } from "@/lib/conversation-events";
import { isUserVisibleConversationMessage, type AssistantAction, type AssistantResponse, type AuthUser, type ChatMessage, type ConversationRecord, type HistoryItem } from "@/types";

import { ActiveWorkDetailDialog, ActiveWorkRailCardWithCancel as ActiveWorkRailCard, ContextRail } from "@/features/product/context-rail";

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
  const [showContextRail, setShowContextRail] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const actionKeys = useRef<Record<string, string>>({});
  const consumedActionIds = useRef<Set<string>>(new Set());
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    let request: AbortController | undefined;
    const refresh = async (): Promise<void> => {
      if (!active || document.hidden || request) return;
      request = new AbortController();
      try {
        const result = await getActiveHistory(request.signal);
        if (active) setActiveItems((current) => sameHistoryItems(current, result.items) ? current : result.items);
        if (active && result.items.length && !document.hidden) timer = window.setTimeout(() => { void refresh(); }, 5000);
      } catch {
        // Keep the last known active work visible during a transient network failure.
        if (active && !document.hidden) timer = window.setTimeout(() => { void refresh(); }, 5000);
      }
      finally { request = undefined; }
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (timer !== undefined) window.clearTimeout(timer);
        timer = undefined;
      } else {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void refresh();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      request?.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
        delete actionKeys.current[action.id];
      }
      const checkout = response?.actions.find((action) => action.kind === "food_checkout");
      let finalResponse = response;
      if (checkout) {
        const checkoutKey = actionKeys.current[checkout.id] ?? createIdempotencyKey("assistant-food_checkout");
        actionKeys.current[checkout.id] = checkoutKey;
        finalResponse = await runAssistantAction(conversationId, checkout.id, checkoutKey);
        consumedActionIds.current.add(checkout.id);
        delete actionKeys.current[checkout.id];
      }
      if (!finalResponse) throw new Error("FOOD_RESPONSE_EMPTY");
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

  function newConversation(): void { actionKeys.current = {}; consumedActionIds.current = new Set(); setConversationId(undefined); setMessages([]); setComposer(""); setConversationLoadError(""); setFoodSelections({}); setFoodSelectionSubmitted(false); inputRef.current?.focus(); }
  
  async function handleLocate(): Promise<void> {
    if (!("geolocation" in navigator)) {
      alert("Trình duyệt không hỗ trợ vị trí.");
      return;
    }

    setIsLocating(true);
    try {
      const position = await getCurrentPosition();
      const address = await fetchAddress(position);
      setComposer((previous) => previous + (previous ? " " : "") + address);
      inputRef.current?.focus();
    } catch {
      alert("Không thể lấy vị trí. Vui lòng kiểm tra quyền truy cập và thử lại.");
    } finally {
      setIsLocating(false);
    }
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }
  const foodSelectionFormVisible = hasFoodSelectionForm(messages) && !foodSelectionSubmitted;
  const foodSelectionTotal = Object.values(foodSelections).reduce((total, selection) => total + (typeof selection.option.price === "number" ? selection.option.price : 0) * selection.quantity, 0);
  const hasActiveService = activeItems.length > 0;

  return <section className="assistant-page" aria-labelledby="assistant-title">
    <h1 id="assistant-title" className="visually-hidden">Trợ lý X-One</h1>
    <header className="assistant-header"><div className="assistant-heading"><span className="eyebrow">X-ONE ASSISTANT</span><h1 id="assistant-title">Xin chào</h1><p>Nói điều bạn cần bằng cách tự nhiên. Mình sẽ cùng bạn xử lý từng bước.</p></div><button className="icon-button" type="button" onClick={newConversation} aria-label="Bắt đầu cuộc trò chuyện mới" title="Cuộc trò chuyện mới"><Plus size={18} /></button></header>
    <div className="assistant-layout"><div className="chat-column"><div className="chat-feed" ref={feedRef} aria-busy={loadingHistory}>{loadingHistory && messages.length === 0 ? <div className="inline-note">Đang tải cuộc trò chuyện…</div> : null}{conversationLoadError && !loadingHistory ? <div className="error-panel" role="alert"><p>{conversationLoadError}</p><button className="button button-secondary" type="button" onClick={() => setConversationLoadNonce((value) => value + 1)}>Thử lại</button></div> : null}{messages.length === 0 && !loadingHistory && !conversationLoadError ? <WelcomeState onStart={(prompt) => void send(prompt)} /> : null}{messages.map((message) => <MessageBubble key={message.id} message={message} onAction={(action) => void handleAction(action)} onFoodSelectionChange={handleFoodSelectionChange} foodSelections={foodSelections} onRetry={(text) => void send(text)} activeActionId={activeActionId} />)}</div>{foodSelectionFormVisible ? <FoodCartDock total={foodSelectionTotal} onConfirm={() => void confirmFoodSelections()} disabled={sending || foodSelectionTotal <= 0} /> : null}<div className="composer-wrap"><div className="composer-inner"><div className="composer-label"><span>Hỏi X-One bất cứ điều gì</span><span>Enter gửi · Shift+Enter xuống dòng</span></div><div className="composer-box"><textarea ref={inputRef} aria-label="Nhập yêu cầu" disabled={sending} onChange={(event) => setComposer(event.target.value)} onKeyDown={onKeyDown} placeholder="Ví dụ: Tối nay tìm nhà hàng cho 2 người rồi gọi xe tới đó…" rows={2} value={composer} /><div className="composer-actions"><button className="location-button" type="button" disabled={isLocating} onClick={() => void handleLocate()} aria-label="Lấy vị trí hiện tại" title="Lấy vị trí hiện tại">{isLocating ? <Loader2 className="spinner" size={18} /> : <LocateFixed size={18} />}</button><button className="send-button" type="button" onClick={() => void send()} disabled={sending || !composer.trim()} aria-label="Gửi yêu cầu">{sending ? <Loader2 className="spinner" size={18} /> : <ArrowUp size={18} />}</button></div></div></div></div></div>{hasActiveService ? <div id="active-service-panel" className={`sidebar-wrapper ${showContextRail ? "open" : "closed"}`}><div className="sidebar-inner"><ContextRail mode="active" title="Việc đang xử lý" description="Cập nhật mới nhất của các dịch vụ bạn đang dùng."><div className="active-work-list">{activeItems.map((item) => <ActiveWorkRailCard key={`${item.type}-${item.id}`} item={item} onDetails={setActiveDetail} />)}</div></ContextRail></div></div> : null}</div>
    {hasActiveService ? <button className={`sidebar-toggle-btn ${showContextRail ? "open" : "closed"}`} type="button" onClick={() => setShowContextRail((visible) => !visible)} aria-expanded={showContextRail} aria-controls="active-service-panel" aria-label={showContextRail ? "Thu gọn bảng dịch vụ" : "Mở bảng dịch vụ"}>{showContextRail ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}</button> : null}
    <ActiveWorkDetailDialog item={activeDetail} open={Boolean(activeDetail)} onOpenChange={(open) => { if (!open) setActiveDetail(null); }} />
  </section>;
}

function WelcomeState({ onStart }: { onStart: (prompt: string) => void }) {
  const prompts = ["Đặt xe từ VinUni đến Hồ Gươm bằng xe 4 chỗ", "Tìm phở bò giao về nhà", "Tối nay tìm nhà hàng cho 2 người ở Hà Nội", "Giúp tôi đặt lịch khám thần kinh sáng mai"];
  return <div className="welcome-state"><div className="welcome-icon"><Bot size={26} /></div><span className="eyebrow">XIN CHÀO</span><h2>Mình có thể giúp gì hôm nay?</h2><p>Chỉ cần nói như đang nhắn tin. Nếu cần nhiều việc, mình sẽ sắp xếp chúng trong cùng cuộc trò chuyện.</p><div className="prompt-list">{prompts.map((prompt) => <button key={prompt} type="button" onClick={() => onStart(prompt)}><span>{prompt}</span><span aria-hidden="true">↗</span></button>)}</div></div>;
}

function MessageBubble({ message, onAction, onFoodSelectionChange, foodSelections, onRetry, activeActionId }: { message: ChatMessage; onAction: (action: AssistantAction, input?: { quantity?: number }) => void; onFoodSelectionChange: (selection: FoodSelection) => void; foodSelections: Record<string, FoodSelection>; onRetry: (text: string) => void; activeActionId?: string }) {
  const assistant = message.role === "assistant";
  return <article className={`chat-message ${message.role} ${message.requestStatus === "error" ? "has-error" : ""}`}><div className="message-avatar">{assistant ? <Bot size={17} /> : <span>Bạn</span>}</div><div className="message-content"><div className="message-meta"><strong>{assistant ? "X-One" : "Bạn"}</strong><time>{formatTime(message.timestamp)}</time></div><div className="message-text">{message.text}</div>{message.requestStatus === "sending" ? <div className="typing-indicator"><span /><span /><span /></div> : null}{message.response ? <AssistantCards response={message.response} onAction={onAction} foodSelections={foodSelections} onFoodSelectionChange={onFoodSelectionChange} disabledActionId={activeActionId} /> : null}{message.requestStatus === "error" && message.retryText ? <button className="retry-button" type="button" onClick={() => onRetry(message.retryText ?? "")}><RefreshCw size={14} /> Thử lại</button> : null}{message.requestStatus === "error" && message.retryAction ? <button className="retry-button" type="button" onClick={() => onAction(message.retryAction!)} disabled={Boolean(activeActionId)}><RefreshCw size={14} /> Thử lại</button> : null}</div></article>;
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

// Cập nhật hàm fetchAddress sử dụng API Nominatim (OpenStreetMap) lấy chi tiết đến mức độ số nhà, tên đường
async function fetchAddress(position: GeolocationPosition): Promise<string> {
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  
  try {
    // Dùng Nominatim với tham số zoom=18 (cấp độ đường phố) và addressdetails=1 để lấy chi tiết
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=vi`
    );
    
    if (response.ok) {
      const data = await response.json();
      const addr = data.address;
      
      if (addr) {
        // 1. Lấy số nhà và tên đường
        const houseNumber = addr.house_number ? `Số ${addr.house_number}` : "";
        const road = addr.road || "";
        const streetInfo = [houseNumber, road].filter(Boolean).join(" ");
        
        // 2. Lấy Quận/Huyện và Tỉnh/Thành phố
        const district = addr.county || addr.suburb || addr.city_district || "";
        const city = addr.city || addr.province || addr.state || "";
        
        // 3. Ghép tất cả lại
        const rawAddress = [streetInfo, district, city].filter(Boolean).join(", ");
        
        // 4. Mẹo UX: Xóa các từ bị lặp nhau (ví dụ: Gia Lâm, Gia Lâm, Hà Nội -> Gia Lâm, Hà Nội)
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

function sameHistoryItems(left: HistoryItem[], right: HistoryItem[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const next = right[index];
    return item.id === next?.id && item.type === next?.type && item.status === next?.status && item.timestamp === next?.timestamp && JSON.stringify(item.resource) === JSON.stringify(next.resource);
  });
}

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