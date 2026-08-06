import { Bot, CircleAlert, Loader2, RotateCcw, Send, Paperclip } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { API_BASE_URL, ApiRequestError, sendChatMessage } from "../api";
import "./ChatDashboard.css";

type ConnectionState = "checking" | "online" | "offline";
type ChatMessage = { id: string; role: "user" | "assistant"; text: string; timestamp: string };
const SESSION_KEY = "navigo_session_id";

export function ChatDashboard() {
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() => sessionStorage.getItem(SESSION_KEY));
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetch(`${API_BASE_URL}/health`).then((response) => setConnection(response.ok ? "online" : "offline")).catch(() => setConnection("offline"));
  }, []);
  
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, sending]);

  // Auto focus input after agent finishes replying
  useEffect(() => {
    if (!sending) {
      inputRef.current?.focus();
    }
  }, [sending]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    inputRef.current?.focus();
  };

  const resetConversation = () => { sessionStorage.removeItem(SESSION_KEY); setSessionId(null); setMessages([]); };
  
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending || connection !== "online") return;
    setInput("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text, timestamp: new Date().toISOString() }]);
    setSending(true);
    try {
      const result = await sendChatMessage(text, sessionId ?? undefined);
      setSessionId(result.session_id);
      sessionStorage.setItem(SESSION_KEY, result.session_id);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: result.response || "Hệ thống chưa có phản hồi cho yêu cầu này.", timestamp: new Date().toISOString() }]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Không thể kết nối tới backend.";
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: `Không thể xử lý yêu cầu: ${detail}`, timestamp: new Date().toISOString() }]);
      if (error instanceof ApiRequestError && error.isConnectionError) setConnection("offline");
    } finally { setSending(false); }
  };
  
  const label = connection === "online" ? "Backend đang kết nối" : connection === "offline" ? "Backend chưa khả dụng" : "Đang kiểm tra backend";

  return <section className="live-chat-shell" aria-label="NaviGo AI Concierge" onContextMenu={handleContextMenu}>
    <header className="live-chat-header">
      <div className="brand-lockup">
        <Bot size={24} color="#00e5ff" />
        <div><h2>NaviGo AI</h2><p className="status-text"><span className="status-dot"></span>Trợ lý uy tín</p></div>
      </div>
      <button className="reset-btn" onClick={resetConversation} disabled={sending || messages.length === 0}>
        <RotateCcw size={16} /> Đặt lại đầu
      </button>
    </header>

    <section className="live-chat-messages" aria-live="polite">
      {messages.length === 0 ? <div className="empty-conversation"><Bot size={48} color="#00e5ff" /><h2>Xin chào!</h2><p>Tôi có thể giúp bạn đặt vé máy bay, khách sạn, combo hoặc dịch vụ đưa đón. Bạn muốn đi đâu?</p></div> : messages.map((message) => <article className={`live-message ${message.role}`} key={message.id}>
        {message.role === 'assistant' && <div className="avatar assistant-avatar"><Bot size={16} /></div>}
        <div className="message-content">
          <p>{message.text}</p>
          <time dateTime={message.timestamp}>{new Date(message.timestamp).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</time>
        </div>
      </article>)}
      {sending && <article className="live-message assistant loading">
        <div className="avatar assistant-avatar"><Bot size={16} /></div>
        <div className="message-content">
          <Loader2 className="spinner" size={18} /><span>Agent đang xử lý yêu cầu…</span>
        </div>
      </article>}
      <div ref={endRef} />
    </section>

    <div className="chat-actions-container">
      <form className="live-chat-form" onSubmit={submit}>
        <button type="button" className="attach-btn"><Paperclip size={20} /></button>
        <input 
          ref={inputRef}
          aria-label="Yêu cầu dịch vụ" 
          value={input} 
          onChange={(event) => setInput(event.target.value)} 
          disabled={sending || connection !== "online"} 
          placeholder={connection === "online" ? "Nhập yêu cầu của bạn tại đây..." : "Chờ backend sẵn sàng…"} 
        />
        <button type="submit" className="send-message" disabled={sending || connection !== "online" || !input.trim()}>
          <Send size={18} />
        </button>
      </form>
      <div className="chat-footer-note">AI có thể mắc lỗi. Vui lòng kiểm tra thông tin trước khi xác nhận đặt dịch vụ.</div>
    </div>
  </section>;
}


