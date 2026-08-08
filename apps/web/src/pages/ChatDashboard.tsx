import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Bot, CheckCircle2, Loader2, Plus, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { createIdempotencyKey, errorText, runAssistantAction, sendAssistantMessage } from "../api";
import { AssistantCards } from "../components/WorkflowCards";
import type { AssistantAction, AssistantResponse, AuthUser, ChatMessage, SessionActivity } from "../types";

interface ChatDashboardProps {
  user: AuthUser;
  resetKey: number;
  onActivity: (activity: SessionActivity) => void;
}

type StoredChat = { conversationId?: string; messages: ChatMessage[] };

export function ChatDashboard({ user, resetKey, onActivity }: ChatDashboardProps) {
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string | undefined>();
  const [hydrated, setHydrated] = useState(false);
  const activeActionRef = useRef<string | undefined>(undefined);
  const actionKeysRef = useRef<Record<string, string>>({});
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setHydrated(false);
    if (resetKey > 0) {
      clearStoredChat(user.sub);
      actionKeysRef.current = {};
      setConversationId(undefined);
      setMessages([]);
      setComposer("");
    } else {
      const restored = loadStoredChat(user.sub);
      setConversationId(restored.conversationId);
      setMessages(restored.messages);
      actionKeysRef.current = loadActionKeys(user.sub);
    }
    setHydrated(true);
  }, [resetKey, user.sub]);

  useEffect(() => {
    if (hydrated) saveStoredChat(user.sub, { conversationId, messages });
  }, [conversationId, hydrated, messages, user.sub]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending]);

  async function send(textOverride?: string) {
    const text = (textOverride ?? composer).trim();
    if (!text || sending) return;
    const userMessage: ChatMessage = { id: makeId("user"), role: "user", text, timestamp: new Date().toISOString(), requestStatus: "sent" };
    const pendingId = makeId("assistant");
    const pendingMessage: ChatMessage = { id: pendingId, role: "assistant", text: "Mình đang xem yêu cầu của bạn…", timestamp: new Date().toISOString(), requestStatus: "sending" };
    setMessages((current) => [...current, userMessage, pendingMessage]);
    setComposer("");
    setSending(true);
    try {
      const response = await sendAssistantMessage(text, conversationId);
      setConversationId(response.conversation_id);
      setMessages((current) => current.map((item) => item.id === pendingId ? { ...item, text: response.message, response, requestStatus: "sent" as const } : item));
      recordActivities(response, onActivity);
    } catch (error) {
      const detail = errorText(error);
      setMessages((current) => current.map((message) => message.id === pendingId ? { ...message, text: detail, requestStatus: "error", retryText: text } : message));
      setComposer(text);
    } finally {
      setSending(false);
    }
  }

  async function handleAction(action: AssistantAction) {
    if (!conversationId || sending || activeActionRef.current) return;
    const idempotencyKey = actionKeysRef.current[action.id] ?? createIdempotencyKey(`assistant-${action.kind}`);
    actionKeysRef.current[action.id] = idempotencyKey;
    saveActionKeys(user.sub, actionKeysRef.current);
    activeActionRef.current = action.id;
    setActiveActionId(action.id);
    setSending(true);
    const pendingId = makeId("action");
    setMessages((current) => [...current, { id: pendingId, role: "assistant", text: "Mình đang hoàn tất bước này…", timestamp: new Date().toISOString(), requestStatus: "sending" }]);
    try {
      const response = await runAssistantAction(conversationId, action.id, idempotencyKey);
      delete actionKeysRef.current[action.id];
      saveActionKeys(user.sub, actionKeysRef.current);
      setMessages((current) => current
        .filter((message) => message.id !== pendingId)
        .map((message) => message.response?.actions.some((candidate) => candidate.id === action.id)
          ? {
            ...message,
            response: {
              ...message.response,
              actions: message.response.actions.filter((candidate) => candidate.id !== action.id && !(
                (action.kind === "select_restaurant" || action.kind === "select_healthcare_slot")
                && candidate.kind === action.kind
              )),
            },
          }
          : message)
        .concat({ id: pendingId, role: "assistant", text: response.message, response, timestamp: new Date().toISOString(), requestStatus: "sent" as const }));
      recordActivities(response, onActivity);
    } catch (error) {
      setMessages((current) => current.map((message) => message.id === pendingId ? { ...message, text: errorText(error), requestStatus: "error", retryAction: action } : message));
    } finally {
      setSending(false);
      setActiveActionId(undefined);
      activeActionRef.current = undefined;
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  function newConversation() {
    clearStoredChat(user.sub);
    actionKeysRef.current = {};
    activeActionRef.current = undefined;
    setActiveActionId(undefined);
    setConversationId(undefined);
    setMessages([]);
    setComposer("");
    inputRef.current?.focus();
  }

  return (
    <section className="assistant-page" aria-labelledby="assistant-title">
      <header className="assistant-header">
        <div className="assistant-heading"><span className="eyebrow">X-ONE ASSISTANT</span><h1 id="assistant-title">Xin chào</h1><p>Nói điều bạn cần bằng cách tự nhiên. Mình sẽ cùng bạn xử lý từng bước.</p></div>
        <button className="icon-button" type="button" onClick={newConversation} aria-label="Bắt đầu cuộc trò chuyện mới" title="Cuộc trò chuyện mới"><Plus size={18} /></button>
      </header>

      <div className="assistant-layout">
        <div className="chat-column">
          <div className="chat-feed" ref={feedRef}>
            {messages.length === 0 ? <WelcomeState onStart={(prompt) => void send(prompt)} /> : null}
            {messages.map((message) => <MessageBubble key={message.id} message={message} onAction={handleAction} onRetry={(text) => void send(text)} onRetryAction={handleAction} activeActionId={activeActionId} />)}
          </div>
          <div className="composer-wrap">
            <div className="composer-label"><span>Hỏi X-One bất cứ điều gì</span><span>Enter gửi · Shift+Enter xuống dòng</span></div>
            <div className="composer-box"><textarea ref={inputRef} aria-label="Nhập yêu cầu" disabled={sending} onChange={(event) => setComposer(event.target.value)} onKeyDown={handleKeyDown} placeholder="Ví dụ: Tối nay tìm nhà hàng cho 2 người rồi gọi xe tới đó…" rows={2} value={composer} /><button className="send-button" type="button" onClick={() => void send()} disabled={sending || !composer.trim()} aria-label="Gửi yêu cầu">{sending ? <Loader2 className="spinner" size={18} /> : <ArrowUp size={18} />}</button></div>
          </div>
        </div>
        <aside className="assistant-context">
          <div className="context-card context-card-accent"><div className="context-card-title"><Sparkles size={17} /><strong>Một cuộc trò chuyện</strong></div><p>Đặt xe, tìm món, đặt bàn hoặc tìm lịch khám ngay trong cùng một nơi.</p><div className="context-steps"><span><CheckCircle2 size={15} /> Hiểu yêu cầu</span><span><CheckCircle2 size={15} /> Tìm thông tin thật</span><span><ShieldCheck size={15} /> Xác nhận rõ ràng</span></div></div>
          <div className="context-card"><div className="context-card-title"><ShieldCheck size={17} /><strong>An toàn cho mỗi bước</strong></div><p>Giá, lịch trống và kết quả chỉ xuất hiện từ các dịch vụ đã xác thực. Những bước cuối luôn cần bạn đồng ý.</p></div>
        </aside>
      </div>
    </section>
  );
}

function WelcomeState({ onStart }: { onStart: (prompt: string) => void }) {
  const prompts = [
    "Đặt xe từ VinUni đến Hồ Gươm bằng xe 4 chỗ",
    "Tìm phở bò giao về nhà",
    "Tối nay tìm nhà hàng cho 2 người ở Hà Nội",
    "Giúp tôi đặt lịch khám thần kinh sáng mai",
  ];
  return <div className="welcome-state"><div className="welcome-icon"><Bot size={26} /></div><span className="eyebrow">XIN CHÀO</span><h2>Mình có thể giúp gì hôm nay?</h2><p>Chỉ cần nói như đang nhắn tin. Nếu cần nhiều việc, mình sẽ sắp xếp chúng trong cùng cuộc trò chuyện.</p><div className="prompt-list">{prompts.map((prompt) => <button key={prompt} type="button" onClick={() => onStart(prompt)}><span>{prompt}</span><span aria-hidden="true">↗</span></button>)}</div></div>;
}

function MessageBubble({ message, onAction, onRetry, onRetryAction, activeActionId }: { message: ChatMessage; onAction: (action: AssistantAction) => void; onRetry: (text: string) => void; onRetryAction: (action: AssistantAction) => void; activeActionId?: string }) {
  const isAssistant = message.role === "assistant";
  return <article className={`chat-message ${message.role} ${message.requestStatus === "error" ? "has-error" : ""}`}><div className="message-avatar">{isAssistant ? <Bot size={17} /> : <span>Bạn</span>}</div><div className="message-content"><div className="message-meta"><strong>{isAssistant ? "X-One" : "Bạn"}</strong><time>{formatTime(message.timestamp)}</time></div><div className="message-text">{message.text}</div>{message.requestStatus === "sending" ? <div className="typing-indicator"><span /><span /><span /></div> : null}{message.response ? <AssistantCards response={message.response} onAction={onAction} disabledActionId={activeActionId} /> : null}{message.requestStatus === "error" && message.retryText ? <button className="retry-button" type="button" onClick={() => onRetry(message.retryText ?? "")}><RefreshCw size={14} /> Thử lại</button> : null}{message.requestStatus === "error" && message.retryAction ? <button className="retry-button" type="button" onClick={() => onRetryAction(message.retryAction!)} disabled={Boolean(activeActionId)}><RefreshCw size={14} /> Thử lại</button> : null}</div></article>;
}

function recordActivities(response: AssistantResponse, onActivity: (activity: SessionActivity) => void) {
  for (const item of response.completed) {
    onActivity({ id: `${response.conversation_id}-${item.kind}-${String(item.reservation_code ?? item.appointment_id ?? item.kind)}`, title: item.title, reference: String(item.reservation_code ?? item.appointment_id ?? "Đã lưu"), status: "Đã hoàn tất", detail: "Kết quả đã được xác nhận trong cuộc trò chuyện.", timestamp: new Date().toISOString() });
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function storageKey(userId: string): string {
  return `xone.session.chat.v1:${userId}`;
}

function loadStoredChat(userId: string): StoredChat {
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (!raw) return { messages: [] };
    const parsed = JSON.parse(raw) as StoredChat;
    if (!Array.isArray(parsed.messages)) return { messages: [] };
    return {
      conversationId: typeof parsed.conversationId === "string" ? parsed.conversationId : undefined,
      messages: parsed.messages.filter(isChatMessage),
    };
  } catch {
    return { messages: [] };
  }
}

function saveStoredChat(userId: string, value: StoredChat): void {
  try { sessionStorage.setItem(storageKey(userId), JSON.stringify(value)); } catch { /* Current tab remains usable without browser storage. */ }
}

function clearStoredChat(userId: string): void {
  try { sessionStorage.removeItem(storageKey(userId)); sessionStorage.removeItem(actionStorageKey(userId)); } catch { /* Nothing else is required. */ }
}

function actionStorageKey(userId: string): string {
  return `xone.assistant.action-keys.v1:${userId}`;
}

function loadActionKeys(userId: string): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(actionStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) as unknown : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

function saveActionKeys(userId: string, value: Record<string, string>): void {
  try { sessionStorage.setItem(actionStorageKey(userId), JSON.stringify(value)); } catch { /* Current tab remains usable without browser storage. */ }
}

function isChatMessage(value: unknown): value is ChatMessage {
  return typeof value === "object" && value !== null && "id" in value && "role" in value && "text" in value && "timestamp" in value;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(date);
}
