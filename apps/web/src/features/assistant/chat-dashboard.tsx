"use client";

import { ArrowUp, Bot, CheckCircle2, Loader2, Plus, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { AssistantCards } from "@/components/WorkflowCards";
import { createIdempotencyKey, errorText, runAssistantAction, sendAssistantMessage } from "@/lib/api-client";
import type { AssistantAction, ChatMessage, AuthUser } from "@/types";

type StoredChat = { conversationId?: string; messages: ChatMessage[] };

export function ChatDashboard({ user }: { user: AuthUser }) {
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string>();
  const actionKeys = useRef<Record<string, string>>({});
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const restored = readChat(user.sub);
    setConversationId(restored.conversationId);
    setMessages(restored.messages);
    actionKeys.current = readActionKeys(user.sub);
  }, [user.sub]);

  useEffect(() => { saveChat(user.sub, { conversationId, messages }); }, [conversationId, messages, user.sub]);
  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" }); }, [messages.length, sending]);

  async function send(textOverride?: string) {
    const text = (textOverride ?? composer).trim();
    if (!text || sending) return;
    const pendingId = makeId("assistant");
    setMessages((current) => [...current, { id: makeId("user"), role: "user", text, timestamp: new Date().toISOString(), requestStatus: "sent" }, { id: pendingId, role: "assistant", text: "Mình đang xem yêu cầu của bạn…", timestamp: new Date().toISOString(), requestStatus: "sending" }]);
    setComposer(""); setSending(true);
    try {
      const response = await sendAssistantMessage(text, conversationId);
      setConversationId(response.conversation_id);
      setMessages((current) => current.map((item) => item.id === pendingId ? { ...item, text: response.message, response, requestStatus: "sent" } : item));
    } catch (error) {
      const detail = errorText(error);
      setMessages((current) => current.map((item) => item.id === pendingId ? { ...item, text: detail, requestStatus: "error", retryText: text } : item));
      setComposer(text);
    } finally { setSending(false); }
  }

  async function handleAction(action: AssistantAction) {
    if (!conversationId || sending || activeActionId) return;
    const idempotencyKey = actionKeys.current[action.id] ?? createIdempotencyKey(`assistant-${action.kind}`);
    actionKeys.current[action.id] = idempotencyKey; saveActionKeys(user.sub, actionKeys.current);
    const pendingId = makeId("action");
    setActiveActionId(action.id); setSending(true);
    setMessages((current) => [...current, { id: pendingId, role: "assistant", text: "Mình đang hoàn tất bước này…", timestamp: new Date().toISOString(), requestStatus: "sending" }]);
    try {
      const response = await runAssistantAction(conversationId, action.id, idempotencyKey);
      delete actionKeys.current[action.id]; saveActionKeys(user.sub, actionKeys.current);
      setMessages((current) => current.filter((message) => message.id !== pendingId).map((message) => message.response?.actions.some((candidate) => candidate.id === action.id) ? { ...message, response: { ...message.response, actions: message.response.actions.filter((candidate) => candidate.id !== action.id) } } : message).concat({ id: pendingId, role: "assistant", text: response.message, response, timestamp: new Date().toISOString(), requestStatus: "sent" }));
    } catch (error) {
      setMessages((current) => current.map((message) => message.id === pendingId ? { ...message, text: errorText(error), requestStatus: "error", retryAction: action } : message));
    } finally { setSending(false); setActiveActionId(undefined); }
  }

  function newConversation() {
    clearChat(user.sub); actionKeys.current = {}; setConversationId(undefined); setMessages([]); setComposer(""); inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
  }

  return <section className="assistant-page" aria-labelledby="assistant-title"><header className="assistant-header"><div className="assistant-heading"><span className="eyebrow">X-ONE ASSISTANT</span><h1 id="assistant-title">Xin chào</h1><p>Nói điều bạn cần bằng cách tự nhiên. Mình sẽ cùng bạn xử lý từng bước.</p></div><button className="icon-button" type="button" onClick={newConversation} aria-label="Bắt đầu cuộc trò chuyện mới" title="Cuộc trò chuyện mới"><Plus size={18} /></button></header><div className="assistant-layout"><div className="chat-column"><div className="chat-feed" ref={feedRef}>{messages.length === 0 ? <WelcomeState onStart={(prompt) => void send(prompt)} /> : null}{messages.map((message) => <MessageBubble key={message.id} message={message} onAction={handleAction} onRetry={(text) => void send(text)} activeActionId={activeActionId} />)}</div><div className="composer-wrap"><div className="composer-label"><span>Hỏi X-One bất cứ điều gì</span><span>Enter gửi · Shift+Enter xuống dòng</span></div><div className="composer-box"><textarea ref={inputRef} aria-label="Nhập yêu cầu" disabled={sending} onChange={(event) => setComposer(event.target.value)} onKeyDown={onKeyDown} placeholder="Ví dụ: Tối nay tìm nhà hàng cho 2 người rồi gọi xe tới đó…" rows={2} value={composer} /><button className="send-button" type="button" onClick={() => void send()} disabled={sending || !composer.trim()} aria-label="Gửi yêu cầu">{sending ? <Loader2 className="spinner" size={18} /> : <ArrowUp size={18} />}</button></div></div></div><aside className="assistant-context"><div className="context-card context-card-accent"><div className="context-card-title"><Sparkles size={17} /><strong>Một cuộc trò chuyện</strong></div><p>Đặt xe, tìm món, đặt bàn hoặc tìm lịch khám ngay trong cùng một nơi.</p><div className="context-steps"><span><CheckCircle2 size={15} /> Hiểu yêu cầu</span><span><CheckCircle2 size={15} /> Tìm thông tin thật</span><span><ShieldCheck size={15} /> Xác nhận rõ ràng</span></div></div><div className="context-card"><div className="context-card-title"><ShieldCheck size={17} /><strong>An toàn cho mỗi bước</strong></div><p>Giá, lịch trống và kết quả chỉ xuất hiện từ các dịch vụ đã xác thực. Những bước cuối luôn cần bạn đồng ý.</p></div></aside></div></section>;
}

function WelcomeState({ onStart }: { onStart: (prompt: string) => void }) {
  const prompts = ["Đặt xe từ VinUni đến Hồ Gươm bằng xe 4 chỗ", "Tìm phở bò giao về nhà", "Tối nay tìm nhà hàng cho 2 người ở Hà Nội", "Giúp tôi đặt lịch khám thần kinh sáng mai"];
  return <div className="welcome-state"><div className="welcome-icon"><Bot size={26} /></div><span className="eyebrow">XIN CHÀO</span><h2>Mình có thể giúp gì hôm nay?</h2><p>Chỉ cần nói như đang nhắn tin. Nếu cần nhiều việc, mình sẽ sắp xếp chúng trong cùng cuộc trò chuyện.</p><div className="prompt-list">{prompts.map((prompt) => <button key={prompt} type="button" onClick={() => onStart(prompt)}><span>{prompt}</span><span aria-hidden="true">↗</span></button>)}</div></div>;
}

function MessageBubble({ message, onAction, onRetry, activeActionId }: { message: ChatMessage; onAction: (action: AssistantAction) => void; onRetry: (text: string) => void; activeActionId?: string }) {
  const assistant = message.role === "assistant";
  return <article className={`chat-message ${message.role} ${message.requestStatus === "error" ? "has-error" : ""}`}><div className="message-avatar">{assistant ? <Bot size={17} /> : <span>Bạn</span>}</div><div className="message-content"><div className="message-meta"><strong>{assistant ? "X-One" : "Bạn"}</strong><time>{formatTime(message.timestamp)}</time></div><div className="message-text">{message.text}</div>{message.requestStatus === "sending" ? <div className="typing-indicator"><span /><span /><span /></div> : null}{message.response ? <AssistantCards response={message.response} onAction={onAction} disabledActionId={activeActionId} /> : null}{message.requestStatus === "error" && message.retryText ? <button className="retry-button" type="button" onClick={() => onRetry(message.retryText ?? "")}><RefreshCw size={14} /> Thử lại</button> : null}{message.requestStatus === "error" && message.retryAction ? <button className="retry-button" type="button" onClick={() => onAction(message.retryAction!)} disabled={Boolean(activeActionId)}><RefreshCw size={14} /> Thử lại</button> : null}</div></article>;
}

function storageKey(userId: string) { return `xone.session.chat.v1:${userId}`; }
function actionStorageKey(userId: string) { return `xone.assistant.action-keys.v1:${userId}`; }
function makeId(prefix: string) { return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`; }
function readChat(userId: string): StoredChat { try { const raw = sessionStorage.getItem(storageKey(userId)); const value = raw ? JSON.parse(raw) as StoredChat : { messages: [] }; return Array.isArray(value.messages) ? { conversationId: typeof value.conversationId === "string" ? value.conversationId : undefined, messages: value.messages.filter(isChatMessage) } : { messages: [] }; } catch { return { messages: [] }; } }
function saveChat(userId: string, value: StoredChat) { try { sessionStorage.setItem(storageKey(userId), JSON.stringify(value)); } catch { /* The live tab remains usable. */ } }
function clearChat(userId: string) { try { sessionStorage.removeItem(storageKey(userId)); sessionStorage.removeItem(actionStorageKey(userId)); } catch { /* No persisted chat is required. */ } }
function readActionKeys(userId: string): Record<string, string> { try { const raw = sessionStorage.getItem(actionStorageKey(userId)); const value = raw ? JSON.parse(raw) as unknown : {}; return value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : {}; } catch { return {}; } }
function saveActionKeys(userId: string, value: Record<string, string>) { try { sessionStorage.setItem(actionStorageKey(userId), JSON.stringify(value)); } catch { /* The live tab remains usable. */ } }
function isChatMessage(value: unknown): value is ChatMessage { return typeof value === "object" && value !== null && "id" in value && "role" in value && "text" in value && "timestamp" in value; }
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(date); }
