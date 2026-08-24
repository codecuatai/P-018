// filepath: apps/web/src/features/assistant/chat-dashboard.tsx
"use client";

import { ArrowUp, Bot, ChevronLeft, ChevronRight, Loader2, Mic, PanelRightOpen, Plus, PlusCircle, RefreshCw, Sparkles, Car, Utensils, UtensilsCrossed, Stethoscope } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { AssistantCards, FoodCartDock, type FoodSelection } from "@/components/WorkflowCards";
import { createConversation, createIdempotencyKey, errorText, getActiveHistory, getConversation, isRetryableError, runAssistantAction, sendAssistantMessage } from "@/lib/api-client";
import { emitConversationsChanged, NEW_CONVERSATION_EVENT } from "@/lib/conversation-events";
import { isUserVisibleConversationMessage, type AssistantAction, type AssistantResponse, type AuthUser, type ChatMessage, type ConversationRecord, type HistoryItem } from "@/types";

import { ActiveWorkDetailDialog, ActiveWorkRailCardWithCancel as ActiveWorkRailCard, ContextRail, ConversationContextCards } from "@/features/product/context-rail";

export function ChatDashboard({ user, initialConversationId }: { user: AuthUser; initialConversationId?: string }) {
  const [conversationId, setConversationId] = useState<string>();
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
  const actionKeys = useRef<Record<string, string>>({});
  const consumedActionIds = useRef<Set<string>>(new Set());
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
        if (!isNaN(parsed) && parsed >= 220 && parsed <= 500) setRailWidth(parsed);
      }
    } catch { }

    const handleToggleEvent = () => {
      setRailCollapsed((prev) => {
        const next = !prev;
        try { localStorage.setItem("xone_rail_collapsed", String(next)); } catch { }
        window.dispatchEvent(new CustomEvent("xone-rail-state-changed", { detail: { collapsed: next } }));
        return next;
      });
    };

    window.addEventListener("xone-toggle-rail", handleToggleEvent);
    return () => window.removeEventListener("xone-toggle-rail", handleToggleEvent);
  }, []);

  const handleRailMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingRail(true);
  };

  useEffect(() => {
    if (!isResizingRail) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(Math.max(window.innerWidth - e.clientX, 220), 500);
      setRailWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizingRail(false);
      try {
        localStorage.setItem("xone_rail_width", String(railWidth));
      } catch { }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingRail, railWidth]);

  function toggleRail(collapsed: boolean) {
    setRailCollapsed(collapsed);
    try { localStorage.setItem("xone_rail_collapsed", String(collapsed)); } catch { }
    window.dispatchEvent(new CustomEvent("xone-rail-state-changed", { detail: { collapsed } }));
  }

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
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }
  const foodSelectionFormVisible = hasFoodSelectionForm(messages) && !foodSelectionSubmitted;
  const foodSelectionTotal = Object.values(foodSelections).reduce((total, selection) => total + (typeof selection.option.price === "number" ? selection.option.price : 0) * selection.quantity, 0);

  return (
    <section className="flex flex-col h-full w-full overflow-hidden bg-slate-50/50" aria-labelledby="assistant-title">
      <h1 id="assistant-title" className="sr-only">Trợ lý X-One</h1>

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 py-5 md:px-10 shrink-0 border-b border-slate-200/60 bg-white">
        <div className="grid gap-1">
          <span className="text-[10px] font-extrabold text-slate-400 tracking-widest uppercase">Trợ lý cá nhân</span>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Xin chào, {user?.full_name || "bạn"}!</h2>
          <p className="text-sm text-slate-500 font-medium">Nói điều bạn cần bằng cách tự nhiên. Mình sẽ cùng bạn xử lý từng bước.</p>
        </div>
        <button className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200/60 rounded-xl text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-white hover:border-slate-300 hover:shadow-sm active:scale-95 self-start md:self-auto" type="button" onClick={newConversation} aria-label="Bắt đầu cuộc trò chuyện mới" title="Cuộc trò chuyện mới">
          <Plus size={16} strokeWidth={2.5} />
          <span>Hội thoại mới</span>
        </button>
      </header>

      {/* Layout Grid */}
      <div
        className={`relative flex-1 grid min-h-0 overflow-hidden ${isResizingRail ? "select-none cursor-col-resize" : ""}`}
        style={{
          gridTemplateColumns: railCollapsed ? "minmax(0, 1fr) 0px" : `minmax(0, 1fr) ${railWidth}px`,
        }}
      >

        {/* Main Chat Column */}
        <div className="flex flex-col h-full min-w-0 bg-white md:rounded-tl-2xl md:border-t md:border-l border-slate-200/60 shadow-sm relative overflow-hidden md:ml-4">

          {/* Feed */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 lg:p-8 space-y-8 scrollbar-thin scrollbar-thumb-slate-200 hover:scrollbar-thumb-slate-300" ref={feedRef} aria-busy={loadingHistory}>
            {loadingHistory && messages.length === 0 ? <div className="text-center text-sm text-slate-400 font-medium my-10">Đang tải cuộc trò chuyện…</div> : null}
            {conversationLoadError && !loadingHistory ? (
              <div className="mx-auto max-w-md p-4 bg-red-50 border border-red-100 rounded-2xl text-center grid gap-3" role="alert">
                <p className="text-sm text-red-600 font-medium">{conversationLoadError}</p>
                <button className="mx-auto px-4 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-200 active:scale-95 transition-all" type="button" onClick={() => setConversationLoadNonce((value) => value + 1)}>Thử lại</button>
              </div>
            ) : null}
            {messages.length === 0 && !loadingHistory && !conversationLoadError ? <WelcomeState onStart={(prompt) => void send(prompt)} /> : null}
            {messages.map((message) => <MessageBubble key={message.id} message={message} onAction={(action) => void handleAction(action)} onFoodSelectionChange={handleFoodSelectionChange} foodSelections={foodSelections} onRetry={(text) => void send(text)} activeActionId={activeActionId} />)}
          </div>

          {foodSelectionFormVisible ? <FoodCartDock total={foodSelectionTotal} onConfirm={() => void confirmFoodSelections()} disabled={sending || foodSelectionTotal <= 0} /> : null}

          {/* Composer */}
          <div className="p-4 md:p-6 bg-white/90 backdrop-blur-md border-t border-slate-100 shrink-0 sticky bottom-0 z-10">
            <div className="relative flex items-end gap-2 max-w-4xl mx-auto bg-slate-50 border border-slate-200/80 rounded-2xl shadow-sm focus-within:bg-white focus-within:shadow-md focus-within:border-blue-300 transition-all duration-300 px-3 py-2.5">
              <button className="p-2 -ml-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-xl transition-colors active:scale-95 shrink-0" type="button" aria-label="Thêm tùy chọn" title="Thêm">
                <PlusCircle size={20} strokeWidth={2} />
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
                className="flex-1 max-h-32 min-h-[24px] bg-transparent border-0 outline-none resize-none py-2 text-slate-900 text-[15px] placeholder:text-slate-400 scrollbar-thin"
              />

              <div className="flex items-center gap-1.5 shrink-0">
                <button className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-xl transition-colors active:scale-95" type="button" aria-label="Nhập bằng giọng nói" title="Giọng nói">
                  <Mic size={18} strokeWidth={2} />
                </button>
                <button
                  className="grid place-items-center w-10 h-10 rounded-xl bg-blue-600 text-white font-bold transition-all duration-200 hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-blue-600/20"
                  type="button"
                  onClick={() => void send()}
                  disabled={sending || !composer.trim()}
                  aria-label="Gửi yêu cầu"
                >
                  {sending ? <Loader2 className="animate-spin" size={18} strokeWidth={2.5} /> : <ArrowUp size={18} strokeWidth={2.5} />}
                </button>
              </div>
            </div>
            <p className="text-center text-[10px] text-slate-400 mt-2 font-medium uppercase tracking-wider">Nhấn Enter để gửi · Shift + Enter để xuống dòng</p>
          </div>

        </div>

        {/* Rail edge toggle */}
        <button
          className={`absolute top-1/2 -translate-y-1/2 z-40 grid w-7 h-7 place-items-center bg-white border border-slate-200/80 rounded-full text-slate-500 cursor-pointer shadow-sm shadow-slate-200/50 transition-all duration-200 hover:bg-blue-600 hover:text-white hover:border-blue-600 hover:shadow-md hover:scale-110 active:scale-95 ${railCollapsed ? "shadow-md" : ""}`}
          type="button"
          aria-label={railCollapsed ? "Mở tiện ích bên phải" : "Thu gọn tiện ích bên phải"}
          title={railCollapsed ? "Mở tiện ích" : "Thu gọn tiện ích"}
          onClick={() => toggleRail(!railCollapsed)}
          style={{
            right: railCollapsed ? "10px" : `${railWidth}px`,
            transform: "translate(50%, -50%)"
          }}
        >
          {railCollapsed ? <ChevronLeft size={14} strokeWidth={2.5} /> : <ChevronRight size={14} strokeWidth={2.5} />}
        </button>

        {/* Rail Content */}
        <ContextRail
          mode={activeItems.length ? "active" : "idle"}
          title={activeItems.length ? "Việc đang xử lý" : "Dịch vụ đang diễn ra"}
          description={activeItems.length ? "Cập nhật mới nhất của các dịch vụ bạn đang dùng." : ""}
          onCollapse={() => toggleRail(true)}
          style={{ width: railCollapsed ? 0 : railWidth }}
          resizer={
            !railCollapsed ? (
              <div
                className="absolute top-0 -left-[3px] bottom-0 w-[6px] z-[35] cursor-col-resize transition-colors duration-200 hover:bg-blue-500/60"
                onMouseDown={handleRailMouseDown}
                onDoubleClick={() => toggleRail(true)}
                title="Kéo để chỉnh kích thước tiện ích, nhấp đúp để ẩn"
              />
            ) : undefined
          }
        >
          {activeItems.length ? (
            <div className="grid gap-3 p-4">
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
  icon: React.ComponentType<{ size: number, strokeWidth?: number, className?: string }>;
  service: string;
  desc: string;
  prompt: string;
  example: string;
  accent?: string;
};

function WelcomeState({ onStart }: { onStart: (prompt: string) => void }) {
  const services: ServiceCard[] = [
    {
      icon: Car,
      service: "Đặt xe di chuyển",
      desc: "Xe 4 chỗ, 7 chỗ đón tận nơi",
      prompt: "Đặt xe từ VinUni đến Hồ Gươm bằng xe 4 chỗ",
      example: "VinUni → Hồ Gươm (4 chỗ)",
    },
    {
      icon: Utensils,
      service: "Giao đồ ăn ngon",
      desc: "Tìm quán ngon và đặt món nóng",
      prompt: "Tìm phở bò giao về nhà",
      example: "Tìm phở bò giao tận nơi",
    },
    {
      icon: UtensilsCrossed,
      service: "Đặt bàn nhà hàng",
      desc: "Hẹn hò, tiệc gia đình, tiếp khách",
      prompt: "Tối nay tìm nhà hàng cho 2 người ở Hà Nội",
      example: "Bàn 2 người tối nay ở Hà Nội",
    },
    {
      icon: Stethoscope,
      service: "Đặt lịch khám bệnh",
      desc: "Bác sĩ chuyên khoa, đặt hẹn nhanh",
      prompt: "Giúp tôi đặt lịch khám thần kinh sáng mai",
      example: "Khám chuyên khoa thần kinh",
    },
  ];

  return (
    <div className="grid gap-6 max-w-4xl mx-auto w-full pt-8 pb-16 md:pt-16 md:pb-24 px-4 md:px-8">
      <div className="flex flex-col items-center md:items-start text-center md:text-left gap-4">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-100/80 text-blue-700 text-[10px] font-extrabold rounded-full uppercase tracking-widest shadow-sm">
          <Sparkles size={13} strokeWidth={2.5} className="text-blue-600" />
          <span>X-ONE ASSISTANT</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">Bạn cần hỗ trợ gì hôm nay?</h2>
        <p className="text-slate-500 text-sm md:text-[15px] max-w-xl leading-relaxed">
          Nhắn tin tự nhiên như trò chuyện. Bạn có thể chọn 1 dịch vụ bên dưới hoặc gõ yêu cầu kết hợp nhiều việc cùng lúc.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        {services.map(({ icon: Icon, service, desc, prompt, example }) => (
          <button
            key={service}
            type="button"
            className="group flex flex-col text-left p-5 rounded-2xl border border-slate-200/60 bg-white transition-all duration-300 hover:shadow-lg hover:shadow-slate-200/40 hover:border-blue-200 hover:-translate-y-1 active:scale-[0.98]"
            onClick={() => onStart(prompt)}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="grid place-items-center w-11 h-11 rounded-xl bg-slate-50 border border-slate-100 text-slate-600 transition-all duration-300 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 group-hover:shadow-md group-hover:shadow-blue-600/20">
                <Icon size={20} strokeWidth={2} />
              </div>
              <span className="text-slate-300 transition-all duration-300 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-blue-600" aria-hidden="true">
                <ArrowUp size={18} strokeWidth={2.5} className="rotate-45" />
              </span>
            </div>

            <div className="grid gap-1">
              <strong className="text-slate-900 font-bold text-[15px]">{service}</strong>
              <p className="text-slate-500 text-[13px] leading-relaxed mb-3">{desc}</p>

              <div className="inline-block mt-auto w-fit px-2.5 py-1.5 bg-slate-50 rounded-lg text-xs text-slate-500 border border-slate-100/80 font-medium transition-colors duration-300 group-hover:bg-blue-50/60 group-hover:border-blue-100 group-hover:text-blue-700">
                <span className="opacity-70">Ví dụ:</span> &ldquo;{example}&rdquo;
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

  return (
    <article className={`flex gap-3 md:gap-4 w-full max-w-4xl mx-auto group ${assistant ? "items-start" : "items-start flex-row-reverse"} ${message.requestStatus === "error" ? "opacity-90" : ""}`}>
      {/* Avatar */}
      <div className={`grid place-items-center w-8 h-8 rounded-full shrink-0 mt-1 shadow-sm ${assistant ? "bg-blue-600 text-white shadow-blue-600/20" : "bg-white text-slate-600 font-extrabold text-[10px] border border-slate-200"}`}>
        {assistant ? <Bot size={16} strokeWidth={2.5} /> : <span>YOU</span>}
      </div>

      {/* Content */}
      <div className={`grid gap-2 min-w-0 flex-1 ${assistant ? "max-w-[90%] md:max-w-[85%]" : "max-w-[85%] md:max-w-[75%]"}`}>

        {/* Text */}
        {message.text && (
          <div className={`${assistant ? "text-slate-700 text-[15px] leading-relaxed mt-1" : "bg-slate-100 text-slate-900 px-4 py-2.5 rounded-2xl rounded-tr-sm text-[15px] leading-relaxed shadow-sm border border-slate-200/50 w-fit ml-auto break-words"}`}>
            {message.text}
          </div>
        )}

        {/* Typing indicator */}
        {message.requestStatus === "sending" && (
          <div className="flex items-center gap-1.5 px-4 py-3 bg-slate-50 w-fit rounded-2xl rounded-tl-sm border border-slate-100 shadow-sm mt-1">
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        )}

        {/* Cards */}
        {message.response ? (
          <div className="mt-2 w-full overflow-hidden rounded-xl border border-slate-100 shadow-sm bg-white">
            <AssistantCards response={message.response} onAction={onAction} foodSelections={foodSelections} onFoodSelectionChange={onFoodSelectionChange} disabledActionId={activeActionId} />
          </div>
        ) : null}

        {/* Errors / Retries */}
        {message.requestStatus === "error" && message.retryText && (
          <button className="inline-flex items-center justify-center gap-2 w-fit mt-1 px-4 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-semibold border border-red-100 transition-all hover:bg-red-100 active:scale-95 shadow-sm" type="button" onClick={() => onRetry(message.retryText ?? "")}>
            <RefreshCw size={14} strokeWidth={2.5} /> Thử lại
          </button>
        )}
        {message.requestStatus === "error" && message.retryAction && (
          <button className="inline-flex items-center justify-center gap-2 w-fit mt-1 px-4 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-semibold border border-red-100 transition-all hover:bg-red-100 active:scale-95 shadow-sm" type="button" onClick={() => onAction(message.retryAction!)} disabled={Boolean(activeActionId)}>
            <RefreshCw size={14} strokeWidth={2.5} /> Thử lại
          </button>
        )}
      </div>
    </article>
  );
}

function hasFoodSelectionForm(messages: ChatMessage[]): boolean {
  return messages.some((message) => message.response?.items.some((item) => item.kind === "food_options")
    && message.response.actions.some((action) => action.kind === "select_food_item"));
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
