import { useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { Bot, Check, CircleAlert, CircleCheck, Loader2, Plus, RefreshCw, Send, Sparkles } from "lucide-react";
import {
  acknowledgeHealthcarePayment,
  asRecord,
  checkGatewayHealth,
  confirmHealthcare,
  confirmRestaurant,
  confirmRidePayment,
  confirmRideService,
  createIdempotencyKey,
  errorText,
  executeFoodConfirmation,
  getFoodOrder,
  responseText,
  sendFoodMessage,
  sendHealthcareMessage,
  sendRestaurantMessage,
  sendRideMessage,
  stringValue,
} from "../api";
import { ServiceSelector, serviceDefinition } from "../components/ServiceSelector";
import { WorkflowCards } from "../components/WorkflowCards";
import type { AuthUser, ChatMessage, ClientSessions, Domain, DomainSession, SessionActivity, WorkflowAction } from "../types";

interface ChatDashboardProps {
  user: AuthUser;
  activeDomain: Domain;
  sessions: ClientSessions;
  onDomainChange: (domain: Domain) => void;
  onSessionsChange: Dispatch<SetStateAction<ClientSessions>>;
  onActivity: (activity: SessionActivity) => void;
  onOpenServices: () => void;
}

type GatewayStatus = "checking" | "online" | "offline";

export function ChatDashboard({
  user,
  activeDomain,
  sessions,
  onDomainChange,
  onSessionsChange,
  onActivity,
  onOpenServices,
}: ChatDashboardProps) {
  const [composer, setComposer] = useState("");
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>("checking");
  const feedRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(true);
  const session = sessions[activeDomain];
  const service = useMemo(() => serviceDefinition(activeDomain), [activeDomain]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    void refreshGatewayStatus();
    const interval = globalThis.setInterval(() => { void refreshGatewayStatus(); }, 30_000);
    return () => globalThis.clearInterval(interval);
  }, []);

  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: "smooth" });
  }, [session.messages.length, session.isSending, activeDomain]);

  useEffect(() => {
    composerRef.current?.focus();
  }, [activeDomain]);

  async function refreshGatewayStatus() {
    setGatewayStatus("checking");
    try {
      await checkGatewayHealth();
      if (mountedRef.current) setGatewayStatus("online");
    } catch {
      if (mountedRef.current) setGatewayStatus("offline");
    }
  }

  async function sendMessage(textOverride?: string, contextOverride?: Record<string, unknown>, domainOverride = activeDomain) {
    const text = (textOverride ?? composer).trim();
    const current = sessions[domainOverride];
    if (!text || current.isSending) return;

    const userMessage: ChatMessage = {
      id: createMessageId("user"),
      role: "user",
      text,
      domain: domainOverride,
      timestamp: new Date().toISOString(),
      requestStatus: "sent",
    };
    const loadingId = createMessageId("assistant");
    const loadingMessage: ChatMessage = {
      id: loadingId,
      role: "assistant",
      text: "Đang xử lý yêu cầu…",
      domain: domainOverride,
      timestamp: new Date().toISOString(),
      requestStatus: "sending",
    };
    const context = contextOverride ?? contextFor(domainOverride, current.lastPayload);
    const workflowId = current.workflowId ?? (domainOverride === "ride" || domainOverride === "food" ? undefined : createMessageId(`${domainOverride}-workflow`));
    const conversationId = current.conversationId ?? (domainOverride === "food" ? createMessageId("food-conversation") : undefined);

    onSessionsChange((previous) => {
      const next = { ...previous[domainOverride], isSending: true, messages: [...previous[domainOverride].messages, userMessage, loadingMessage] };
      if (workflowId) next.workflowId = workflowId;
      if (conversationId) next.conversationId = conversationId;
      return { ...previous, [domainOverride]: next };
    });
    if (domainOverride === activeDomain) setComposer("");

    try {
      const payload = await dispatchMessage(domainOverride, text, workflowId, conversationId, context, user.sub);
      if (!mountedRef.current) return;
      updateResponse(domainOverride, loadingId, payload, context, workflowId, conversationId);
    } catch (error) {
      if (!mountedRef.current) return;
      const detail = errorText(error);
      onSessionsChange((previous) => {
        const currentSession = previous[domainOverride];
        return {
          ...previous,
          [domainOverride]: {
            ...currentSession,
            isSending: false,
            messages: currentSession.messages.map((message) => message.id === loadingId ? {
              ...message,
              text: `Không thể hoàn tất yêu cầu. ${detail}`,
              requestStatus: "error",
              retryText: text,
              retryContext: context,
            } : message),
          },
        };
      });
      if (domainOverride === activeDomain) setComposer(text);
    }
  }

  async function handleAction(action: WorkflowAction) {
    if (action.type === "message") {
      await sendMessage(action.text, action.context, action.domain);
      return;
    }
    const current = sessions[action.domain];
    if (current.isSending) return;
    setSessionSending(action.domain, true);

    try {
      const workflowId = current.workflowId;
      let payload: Record<string, unknown>;
      if (action.type === "ride-confirm" && workflowId) {
        payload = await confirmRideService(workflowId, user.sub) as unknown as Record<string, unknown>;
      } else if (action.type === "ride-payment" && workflowId) {
        payload = await confirmRidePayment(workflowId, user.sub) as unknown as Record<string, unknown>;
      } else if (action.type === "food-confirm" && current.pendingConfirmationId && current.conversationId) {
        const key = current.pendingIdempotencyKey ?? createIdempotencyKey("food-confirm");
        rememberKey(action.domain, key);
        payload = await executeFoodConfirmation(current.pendingConfirmationId, current.conversationId, key);
        const order = asRecord(payload.order);
        const orderId = stringValue(order?.id);
        if (orderId) {
          try {
            const refreshed = await pollFoodOrder(orderId);
            if (refreshed) payload = { ...payload, order: refreshed };
          } catch {
            // The order was already created by the confirmation; an optional read may retry later.
          }
        }
      } else if (action.type === "restaurant-confirm" && current.pendingConfirmationId && workflowId) {
        const key = current.pendingIdempotencyKey ?? createIdempotencyKey("restaurant-confirm");
        rememberKey(action.domain, key);
        payload = await confirmRestaurant(current.pendingConfirmationId, workflowId, key);
      } else if (action.type === "healthcare-payment" && workflowId) {
        const appointment = asRecord(current.lastPayload?.appointment);
        const appointmentId = numberFrom(appointment?.appointment_id ?? appointment?.id);
        if (!appointmentId) throw new Error("Lịch hẹn chưa có mã appointment hợp lệ.");
        const key = current.pendingPaymentKey ?? createIdempotencyKey("healthcare-payment");
        rememberKey(action.domain, key, true);
        payload = await acknowledgeHealthcarePayment(appointmentId, workflowId, key);
      } else if (action.type === "healthcare-confirm" && current.pendingConfirmationId && workflowId) {
        const key = current.pendingIdempotencyKey ?? createIdempotencyKey("healthcare-confirm");
        rememberKey(action.domain, key);
        payload = await confirmHealthcare(current.pendingConfirmationId, workflowId, key);
      } else {
        throw new Error("Workflow chưa sẵn sàng cho thao tác này. Hãy tải lại dữ liệu mới nhất.");
      }
      if (!mountedRef.current) return;
      updateActionResponse(action.domain, payload);
    } catch (error) {
      if (!mountedRef.current) return;
      const detail = errorText(error);
      onSessionsChange((previous) => ({
        ...previous,
        [action.domain]: {
          ...previous[action.domain],
          isSending: false,
          messages: [...previous[action.domain].messages, {
            id: createMessageId("error"),
            role: "assistant",
            text: `Không thể hoàn tất thao tác. ${detail}`,
            domain: action.domain,
            timestamp: new Date().toISOString(),
            requestStatus: "error",
          }],
        },
      }));
    }
  }

  function updateResponse(
    domain: Domain,
    loadingId: string,
    payload: Record<string, unknown>,
    context: Record<string, unknown>,
    workflowId?: string,
    conversationId?: string,
  ) {
    const pending = asRecord(payload.pending_confirmation);
    const terminal = activityFrom(domain, payload);
    onSessionsChange((previous) => {
      const currentSession = previous[domain];
    const responseWorkflowId = domain === "ride" ? stringValue(payload.workflow_id) || workflowId : workflowId;
    const next: DomainSession = {
        ...currentSession,
        isSending: false,
        ...(responseWorkflowId ? { workflowId: responseWorkflowId } : {}),
        ...(conversationId ? { conversationId } : {}),
        lastPayload: payload,
        messages: currentSession.messages.map((message) => message.id === loadingId ? {
          ...message,
          text: responseText(payload, "Gateway đã nhận yêu cầu và trả về dữ liệu mới."),
          payload,
          requestStatus: "sent",
        } : message),
      };
      applyPendingState(next, pending, Boolean(terminal));
      return { ...previous, [domain]: next };
    });
    setGatewayStatus("online");
    if (terminal) onActivity(terminal);
  }

  function updateActionResponse(domain: Domain, payload: Record<string, unknown>) {
    const terminal = activityFrom(domain, payload);
    onSessionsChange((previous) => {
      const currentSession = previous[domain];
      const next: DomainSession = {
        ...currentSession,
        isSending: false,
        lastPayload: payload,
        messages: [...currentSession.messages, {
          id: createMessageId("assistant"),
          role: "assistant",
          text: actionResponseText(domain, payload),
          domain,
          timestamp: new Date().toISOString(),
          payload,
          requestStatus: "sent",
        }],
      };
      applyPendingState(next, asRecord(payload.pending_confirmation), Boolean(terminal));
      return { ...previous, [domain]: next };
    });
    setGatewayStatus("online");
    if (terminal) onActivity(terminal);
  }

  function setSessionSending(domain: Domain, isSending: boolean) {
    onSessionsChange((previous) => ({ ...previous, [domain]: { ...previous[domain], isSending } }));
  }

  function rememberKey(domain: Domain, key: string, payment = false) {
    onSessionsChange((previous) => ({
      ...previous,
      [domain]: { ...previous[domain], ...(payment ? { pendingPaymentKey: key } : { pendingIdempotencyKey: key }) },
    }));
  }

  function startNewConversation() {
    onSessionsChange((previous) => ({
      ...previous,
      [activeDomain]: {
        domain: activeDomain,
        messages: [],
        isSending: false,
      },
    }));
    setComposer("");
    composerRef.current?.focus();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <section className="assistant-page" aria-labelledby="assistant-title">
      <header className="assistant-header">
        <div className="assistant-heading">
          <span className="eyebrow">TRỢ LÝ</span>
          <h1 id="assistant-title">Bạn muốn làm gì hôm nay?</h1>
          <p>Một cuộc trò chuyện, bốn dịch vụ có thể thực hiện qua Gateway.</p>
        </div>
        <div className="assistant-header-actions">
          <GatewayStatus status={gatewayStatus} onRetry={() => void refreshGatewayStatus()} />
          <button className="icon-button" type="button" onClick={startNewConversation} aria-label="Bắt đầu phiên mới" title="Phiên mới"><Plus size={18} /></button>
        </div>
      </header>

      <ServiceSelector activeDomain={activeDomain} onSelect={onDomainChange} />

      <div className="assistant-layout">
        <div className="chat-column">
          <div className="chat-feed" ref={feedRef}>
            {session.messages.length === 0 ? (
              <WelcomeState service={service} onStart={(domain, prompt) => { onDomainChange(domain); void sendMessage(prompt, undefined, domain); }} onOpenServices={onOpenServices} />
            ) : null}
            {session.messages.map((message) => (
              <MessageBubble key={message.id} message={message} session={session} onAction={handleAction} onRetry={(text, context) => void sendMessage(text, context, activeDomain)} />
            ))}
          </div>
          <div className="composer-wrap">
            <div className="composer-label"><span>{service.label}</span><span>Enter gửi · Shift+Enter xuống dòng</span></div>
            <div className="composer-box">
              <textarea
                ref={composerRef}
                aria-label="Nhập yêu cầu"
                disabled={session.isSending}
                onChange={(event) => setComposer(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={`Ví dụ: ${service.prompt}`}
                rows={2}
                value={composer}
              />
              <button className="send-button" type="button" onClick={() => void sendMessage()} disabled={session.isSending || !composer.trim()} aria-label="Gửi yêu cầu">
                {session.isSending ? <Loader2 className="spinner" size={18} /> : <Send size={18} />}
              </button>
            </div>
          </div>
        </div>
        <aside className="assistant-context">
          <div className="context-card">
            <span className="eyebrow">PHIÊN HIỆN TẠI</span>
            <ContextServiceIcon service={service} />
            <p>{service.description}</p>
            <dl className="context-list">
              <div><dt>Workflow</dt><dd>{session.workflowId ? "Đã tạo" : "Chưa bắt đầu"}</dd></div>
              <div><dt>Conversation</dt><dd>{session.conversationId ? "Đang giữ" : "Theo domain"}</dd></div>
              <div><dt>Confirmation</dt><dd>{session.pendingConfirmationId ? "Đang chờ" : "Không có"}</dd></div>
            </dl>
          </div>
          <div className="context-card context-card-muted">
            <div className="context-card-title"><ShieldIcon /><strong>An toàn thao tác</strong></div>
            <p>Giá, trạng thái và kết quả chỉ hiển thị sau khi Gateway trả về. Các bước cuối luôn cần xác nhận riêng.</p>
          </div>
          <button className="context-link" type="button" onClick={onOpenServices}>Xem tất cả dịch vụ <span aria-hidden="true">→</span></button>
        </aside>
      </div>
    </section>
  );
}

function WelcomeState({ service, onStart, onOpenServices }: { service: ReturnType<typeof serviceDefinition>; onStart: (domain: Domain, prompt: string) => void; onOpenServices: () => void }) {
  const ServiceIcon = service.icon;
  return (
    <div className="welcome-state">
      <div className="welcome-icon"><Bot size={25} /></div>
      <span className="eyebrow">X-ONE ASSISTANT</span>
      <h2>Một trợ lý. Mọi dịch vụ hằng ngày.</h2>
      <p>Chọn một gợi ý bên dưới hoặc nhập yêu cầu tự nhiên. X-One sẽ chuyển đúng domain và hiển thị các bước xác nhận rõ ràng.</p>
      <div className="welcome-actions">
        <button type="button" onClick={() => onStart(service.domain, service.prompt)}><ServiceIcon size={17} /> {service.label}</button>
        <button type="button" onClick={onOpenServices}><Sparkles size={17} /> Chọn dịch vụ khác</button>
      </div>
      <div className="prompt-list">
        {[
          ["ride", "Từ sân bay Nội Bài đến Hoàn Kiếm bằng xe 4 chỗ"],
          ["food", "Tìm phở bò dưới 100 nghìn ở Hà Nội"],
          ["restaurant", "Đặt bàn cho 2 người tối mai ở Hà Nội"],
          ["healthcare", "Tôi bị mệt và muốn đặt lịch khám"],
        ].map(([domain, prompt]) => (
          <button key={domain} type="button" onClick={() => onStart(domain as Domain, prompt)}><span>{prompt}</span><span aria-hidden="true">→</span></button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message, session, onAction, onRetry }: { message: ChatMessage; session: DomainSession; onAction: (action: WorkflowAction) => void; onRetry: (text: string, context?: Record<string, unknown>) => void }) {
  const isAssistant = message.role === "assistant";
  return (
    <article className={`chat-message ${message.role} ${message.requestStatus === "error" ? "has-error" : ""}`}>
      <div className="message-avatar">{isAssistant ? <Bot size={17} /> : <span>U</span>}</div>
      <div className="message-content">
        <div className="message-meta"><strong>{isAssistant ? "X-One" : "Bạn"}</strong>{message.domain ? <span className="message-domain">{serviceDefinition(message.domain).shortLabel}</span> : null}<time>{formatTime(message.timestamp)}</time></div>
        <div className="message-text">{message.text}</div>
        {message.requestStatus === "sending" ? <div className="typing-indicator"><span /><span /><span /></div> : null}
        {message.payload && message.requestStatus === "sent" ? <WorkflowCards domain={message.domain ?? session.domain} payload={message.payload} session={session} onAction={onAction} /> : null}
        {message.requestStatus === "error" && message.retryText ? <button className="retry-button" type="button" onClick={() => onRetry(message.retryText!, message.retryContext)}><RefreshCw size={14} /> Thử lại</button> : null}
      </div>
    </article>
  );
}

function GatewayStatus({ status, onRetry }: { status: GatewayStatus; onRetry: () => void }) {
  if (status === "checking") return <span className="gateway-status checking"><Loader2 className="spinner" size={14} /> Đang kiểm tra backend</span>;
  if (status === "online") return <span className="gateway-status online"><CircleCheck size={14} /> Backend đã kết nối</span>;
  return <button className="gateway-status offline" type="button" onClick={onRetry}><CircleAlert size={14} /> Không kết nối được backend <RefreshCw size={13} /></button>;
}

async function dispatchMessage(domain: Domain, text: string, workflowId?: string, conversationId?: string, context?: Record<string, unknown>, actorId?: string): Promise<Record<string, unknown>> {
  if (domain === "ride" && actorId) return await sendRideMessage(text, actorId, workflowId) as unknown as Record<string, unknown>;
  if (domain === "food" && conversationId) return await sendFoodMessage(conversationId, text) as Record<string, unknown>;
  if (domain === "restaurant" && workflowId) return await sendRestaurantMessage(text, workflowId, context) as Record<string, unknown>;
  if (domain === "healthcare" && workflowId) return await sendHealthcareMessage(text, workflowId, context) as Record<string, unknown>;
  throw new Error("Phiên dịch vụ chưa sẵn sàng.");
}

function contextFor(domain: Domain, payload?: Record<string, unknown>): Record<string, unknown> {
  if (!payload) return {};
  if (domain === "restaurant") return { slots: asRecord(payload.slots) ?? {}, tool_name: stringValue(asRecord(payload.tool_request)?.tool_name), tool_result: payload.tool_result ?? null };
  if (domain === "healthcare") return {
    slots: asRecord(payload.slots) ?? {},
    patient_id: numberFrom(asRecord(payload.slots)?.patient_id) ?? 1,
    appointment_id: numberFrom(asRecord(payload.appointment)?.appointment_id ?? asRecord(payload.appointment)?.id) ?? null,
    tool_name: stringValue(asRecord(payload.tool_request)?.tool_name),
    tool_result: payload.tool_result ?? null,
    symptoms: stringValue(payload.symptoms, "dau bung"),
  };
  return {};
}

function applyPendingState(session: DomainSession, pending: Record<string, unknown> | undefined, terminal: boolean) {
  if (pending) {
    session.pendingConfirmationId = stringValue(pending.id) || undefined;
    session.pendingConfirmationAction = stringValue(pending.action) || undefined;
    return;
  }
  if (terminal) {
    session.pendingConfirmationId = undefined;
    session.pendingConfirmationAction = undefined;
    session.pendingIdempotencyKey = undefined;
  }
}

function activityFrom(domain: Domain, payload: Record<string, unknown>): SessionActivity | undefined {
  const timestamp = new Date().toISOString();
  if (domain === "ride") {
    const booking = asRecord(payload.booking);
    if (stringValue(payload.stage) !== "COMPLETED" || stringValue(booking?.status) !== "DRIVER_ASSIGNED" || !booking?.id) return undefined;
    const quote = asRecord(payload.quote);
    return { id: `ride-${String(booking.id)}`, domain, title: "Chuyến xe", reference: String(booking.id), status: "DRIVER_ASSIGNED", detail: `${stringValue(quote?.pickup_address, "Điểm đón")} → ${stringValue(quote?.dropoff_address, "Điểm đến")}`, timestamp };
  }
  if (domain === "food") {
    const order = asRecord(payload.order);
    const payment = asRecord(payload.payment);
    if (!order?.id || stringValue(payment?.status) !== "SUCCEEDED") return undefined;
    return { id: `food-${String(order.id)}`, domain, title: "Đơn đồ ăn", reference: String(order.id), status: stringValue(order.status, "Đã tạo"), detail: stringValue(order.restaurant_name, "Order từ Food Service"), timestamp };
  }
  if (domain === "restaurant") {
    const result = asRecord(payload.tool_result) ?? asRecord(asRecord(payload.result)?.tool_result);
    if (!result?.id || stringValue(result.status) !== "CONFIRMED") return undefined;
    return { id: `restaurant-${String(result.id)}`, domain, title: "Đặt bàn", reference: String(result.id), status: "CONFIRMED", detail: stringValue(result.restaurant_name, "Reservation Restaurant Service"), timestamp };
  }
  const result = asRecord(payload.tool_result) ?? asRecord(asRecord(payload.result)?.tool_result);
  const appointment = asRecord(result?.appointment) ?? (result?.status ? result : undefined) ?? asRecord(payload.appointment);
  if (!appointment?.id && !appointment?.appointment_id || stringValue(appointment?.status) !== "CONFIRMED") return undefined;
  const reference = String(appointment.id ?? appointment.appointment_id);
  return { id: `healthcare-${reference}`, domain, title: "Lịch khám", reference, status: "CONFIRMED", detail: stringValue(asRecord(appointment.doctor)?.name, "Appointment Healthcare Service"), timestamp };
}

function actionResponseText(domain: Domain, payload: Record<string, unknown>): string {
  const activity = activityFrom(domain, payload);
  if (activity) {
    if (domain === "ride") return "Gateway đã hoàn tất booking và trả về trạng thái DRIVER_ASSIGNED.";
    if (domain === "food") return "Gateway đã tạo order và ghi nhận payment sandbox thành công.";
    if (domain === "restaurant") return "Gateway đã xác nhận reservation. Đặt bàn thành công.";
    return "Gateway đã xác nhận appointment. Lịch khám đã hoàn tất.";
  }
  if (domain === "healthcare" && stringValue(payload.status) === "PAYMENT_SUCCEEDED") return "Thanh toán demo đã được ghi nhận. Kiểm tra lại lịch hẹn rồi xác nhận bước cuối.";
  return responseText(payload, "Gateway đã xử lý thao tác và trả về dữ liệu mới.");
}

function numberFrom(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isInteger(Number(value))) return Number(value);
  return undefined;
}

function createMessageId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${uuid ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function formatTime(value: string): string {
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? "" : new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(time);
}

async function pollFoodOrder(orderId: string): Promise<Record<string, unknown> | undefined> {
  const deadline = Date.now() + 12_000;
  let latest: Record<string, unknown> | undefined;
  while (Date.now() < deadline) {
    latest = await getFoodOrder(orderId);
    const status = stringValue(latest.status);
    if (["DELIVERED", "CANCELLED", "REFUNDED", "PAYMENT_FAILED"].includes(status)) return latest;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 1_000));
  }
  return latest;
}

function ShieldIcon() {
  return <Check size={16} />;
}

function ContextServiceIcon({ service }: { service: ReturnType<typeof serviceDefinition> }) {
  const ServiceIcon = service.icon;
  return <div className={`context-service service-${service.accent}`}><ServiceIcon size={18} /><strong>{service.label}</strong></div>;
}
