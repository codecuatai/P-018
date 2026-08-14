"use client";

import { ArrowUp, Bot, Loader2, Plus, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { AssistantCards } from "@/components/WorkflowCards";
import { createConversation, createIdempotencyKey, errorText, getActiveHistory, getConversation, isRetryableError, listConversations, runAssistantAction, sendAssistantMessage } from "@/lib/api-client";
import { isUserVisibleConversationMessage, type AssistantAction, type AuthUser, type ChatMessage, type ConversationRecord, type HistoryItem } from "@/types";

import { ActiveWorkDetailDialog, ActiveWorkRailCard, ContextRail, ConversationContextCards } from "@/features/product/context-rail";

export function ChatDashboard({ user }: { user: AuthUser }) {
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [activeActionId, setActiveActionId] = useState<string>();
  const [activeItems, setActiveItems] = useState<HistoryItem[]>([]);
  const [activeRefreshNonce, setActiveRefreshNonce] = useState(0);
  const [activeDetail, setActiveDetail] = useState<HistoryItem | null>(null);
  const actionKeys = useRef<Record<string, string>>({});
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;
    setLoadingHistory(true);
    const entryContext = readEntryContext();
    if (entryContext) {
      void createConversation(`Tiếp tục ${entryContext.label}`, entryContext.service).then((detail) => {
        if (!active) return;
        setConversationId(detail.conversationId);
        setMessages([]);
        setComposer(entryContext.prompt);
      }).catch(() => undefined).finally(() => { if (active) setLoadingHistory(false); });
      return () => { active = false; };
    }
    void listConversations().then(async ({ items }) => {
      if (!active || !items.length) return;
      const detail = await getConversation(items[0].conversationId);
      if (!active) return;
      setConversationId(detail.conversationId);
      setMessages(toChatMessages(detail));
    }).catch(() => undefined).finally(() => { if (active) setLoadingHistory(false); });
    return () => { active = false; };
  }, [user.sub]);

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

  async function syncConversation(id: string): Promise<void> {
    try { setMessages(toChatMessages(await getConversation(id))); } catch { /* The received response remains visible. */ }
  }

  async function send(textOverride?: string): Promise<void> {
    const text = (textOverride ?? composer).trim();
    if (!text || sending) return;
    const pendingId = makeId("assistant");
    setMessages((current) => [...current, { id: makeId("user"), role: "user", text, timestamp: new Date().toISOString(), requestStatus: "sent" }, { id: pendingId, role: "assistant", text: "Mình đang xem yêu cầu của bạn…", timestamp: new Date().toISOString(), requestStatus: "sending" }]);
    setComposer("");
    setSending(true);
    try {
      const response = await sendAssistantMessage(text, conversationId);
      setConversationId(response.conversation_id);
      setMessages((current) => current.map((item) => item.id === pendingId ? { ...item, text: response.message, response, requestStatus: "sent" } : item));
      void syncConversation(response.conversation_id);
      setActiveRefreshNonce((value) => value + 1);
    } catch (error) {
      setMessages((current) => current.map((item) => item.id === pendingId ? { ...item, text: errorText(error), requestStatus: "error", retryText: text } : item));
      setComposer(text);
    } finally { setSending(false); }
  }

  async function handleAction(action: AssistantAction): Promise<void> {
    if (!conversationId || sending || activeActionId) return;
    const idempotencyKey = actionKeys.current[action.id] ?? createIdempotencyKey(`assistant-${action.kind}`);
    actionKeys.current[action.id] = idempotencyKey;
    const pendingId = makeId("action");
    setActiveActionId(action.id);
    setSending(true);
    setMessages((current) => [...current, { id: pendingId, role: "assistant", text: "Mình đang hoàn tất bước này…", timestamp: new Date().toISOString(), requestStatus: "sending" }]);
    try {
      const response = await runAssistantAction(conversationId, action.id, idempotencyKey);
      delete actionKeys.current[action.id];
      setMessages((current) => current.filter((message) => message.id !== pendingId).map((message) => message.response?.actions.some((candidate) => candidate.id === action.id) ? { ...message, response: { ...message.response, actions: message.response.actions.filter((candidate) => candidate.id !== action.id) } } : message).concat({ id: pendingId, role: "assistant", text: response.message, response, timestamp: new Date().toISOString(), requestStatus: "sent" }));
      void syncConversation(response.conversation_id);
      setActiveRefreshNonce((value) => value + 1);
    } catch (error) {
      const retryable = isRetryableError(error);
      setMessages((current) => current.map((message) => {
        if (!message.response?.actions.some((candidate) => candidate.id === action.id) || retryable) return message.id === pendingId ? { ...message, text: errorText(error), requestStatus: "error", ...(retryable ? { retryAction: action } : {}) } : message;
        return { ...message, response: { ...message.response, actions: message.response.actions.filter((candidate) => candidate.id !== action.id) } };
      }));
    } finally { setSending(false); setActiveActionId(undefined); }
  }

  function newConversation(): void { actionKeys.current = {}; setConversationId(undefined); setMessages([]); setComposer(""); inputRef.current?.focus(); }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }

  return <section className="assistant-page" aria-labelledby="assistant-title">
    <header className="assistant-header"><div className="assistant-heading"><span className="eyebrow">X-ONE ASSISTANT</span><h1 id="assistant-title">Xin chào</h1><p>Nói điều bạn cần bằng cách tự nhiên. Mình sẽ cùng bạn xử lý từng bước.</p></div><button className="icon-button" type="button" onClick={newConversation} aria-label="Bắt đầu cuộc trò chuyện mới" title="Cuộc trò chuyện mới"><Plus size={18} /></button></header>
    <div className="assistant-layout"><div className="chat-column"><div className="chat-feed" ref={feedRef} aria-busy={loadingHistory}>{loadingHistory && messages.length === 0 ? <div className="inline-note">Đang tải cuộc trò chuyện…</div> : null}{messages.length === 0 && !loadingHistory ? <WelcomeState onStart={(prompt) => void send(prompt)} /> : null}{messages.map((message) => <MessageBubble key={message.id} message={message} onAction={(action) => void handleAction(action)} onRetry={(text) => void send(text)} activeActionId={activeActionId} />)}</div><div className="composer-wrap"><div className="composer-label"><span>Hỏi X-One bất cứ điều gì</span><span>Enter gửi · Shift+Enter xuống dòng</span></div><div className="composer-box"><textarea ref={inputRef} aria-label="Nhập yêu cầu" disabled={sending} onChange={(event) => setComposer(event.target.value)} onKeyDown={onKeyDown} placeholder="Ví dụ: Tối nay tìm nhà hàng cho 2 người rồi gọi xe tới đó…" rows={2} value={composer} /><button className="send-button" type="button" onClick={() => void send()} disabled={sending || !composer.trim()} aria-label="Gửi yêu cầu">{sending ? <Loader2 className="spinner" size={18} /> : <ArrowUp size={18} />}</button></div></div></div><ContextRail mode={activeItems.length ? "active" : "idle"} title={activeItems.length ? "Việc đang xử lý" : "Dịch vụ đang diễn ra"} description={activeItems.length ? "Cập nhật mới nhất của các dịch vụ bạn đang dùng." : ""}>{activeItems.length ? <div className="active-work-list">{activeItems.map((item) => <ActiveWorkRailCard key={`${item.type}-${item.id}`} item={item} onDetails={setActiveDetail} />)}</div> : <ConversationContextCards />}</ContextRail></div>
    <ActiveWorkDetailDialog item={activeDetail} open={Boolean(activeDetail)} onOpenChange={(open) => { if (!open) setActiveDetail(null); }} />
  </section>;
}

function WelcomeState({ onStart }: { onStart: (prompt: string) => void }) {
  const prompts = ["Đặt xe từ VinUni đến Hồ Gươm bằng xe 4 chỗ", "Tìm phở bò giao về nhà", "Tối nay tìm nhà hàng cho 2 người ở Hà Nội", "Giúp tôi đặt lịch khám thần kinh sáng mai"];
  return <div className="welcome-state"><div className="welcome-icon"><Bot size={26} /></div><span className="eyebrow">XIN CHÀO</span><h2>Mình có thể giúp gì hôm nay?</h2><p>Chỉ cần nói như đang nhắn tin. Nếu cần nhiều việc, mình sẽ sắp xếp chúng trong cùng cuộc trò chuyện.</p><div className="prompt-list">{prompts.map((prompt) => <button key={prompt} type="button" onClick={() => onStart(prompt)}><span>{prompt}</span><span aria-hidden="true">↗</span></button>)}</div></div>;
}

function MessageBubble({ message, onAction, onRetry, activeActionId }: { message: ChatMessage; onAction: (action: AssistantAction) => void; onRetry: (text: string) => void; activeActionId?: string }) {
  const assistant = message.role === "assistant";
  return <article className={`chat-message ${message.role} ${message.requestStatus === "error" ? "has-error" : ""}`}><div className="message-avatar">{assistant ? <Bot size={17} /> : <span>Bạn</span>}</div><div className="message-content"><div className="message-meta"><strong>{assistant ? "X-One" : "Bạn"}</strong><time>{formatTime(message.timestamp)}</time></div><div className="message-text">{message.text}</div>{message.requestStatus === "sending" ? <div className="typing-indicator"><span /><span /><span /></div> : null}{message.response ? <AssistantCards response={message.response} onAction={onAction} disabledActionId={activeActionId} /> : null}{message.requestStatus === "error" && message.retryText ? <button className="retry-button" type="button" onClick={() => onRetry(message.retryText ?? "")}><RefreshCw size={14} /> Thử lại</button> : null}{message.requestStatus === "error" && message.retryAction ? <button className="retry-button" type="button" onClick={() => onAction(message.retryAction!)} disabled={Boolean(activeActionId)}><RefreshCw size={14} /> Thử lại</button> : null}</div></article>;
}

function toChatMessages(record: ConversationRecord): ChatMessage[] { return record.messages.filter(isUserVisibleConversationMessage).map((message, index) => ({ id: `${record.conversationId}-${index}`, role: message.role, text: message.content, timestamp: message.createdAt, ...(message.role === "assistant" && message.data ? { response: message.data } : {}), requestStatus: "sent" })); }
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
