"use client";

import { ArrowRight, CalendarDays, CarFront, ChevronDown, LifeBuoy, Loader2, MessageSquareText, RefreshCw, Search, Send, ShieldCheck, Sparkles, Stethoscope, Utensils, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { addSupportMessage, createSupportTicket, errorText, getHistoryDetail, getSupportTicket, listSupportTickets } from "@/lib/api-client";
import { formatDateTime, isRecord, statusLabel } from "@/lib/presentation";
import type { FeedbackResourceType, SupportTicket, SupportTicketStatus } from "@/types";

import styles from "./support-page.module.css";

export default function SupportPage() {
  const params = useSearchParams();
  const router = useRouter();
  const resourceType = feedbackResourceType(params?.get("resource_type"));
  const resourceId = params?.get("resource_id")?.trim() ?? "";
  const linkedResource = resourceType && resourceId ? { type: resourceType, id: resourceId } : undefined;
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selected, setSelected] = useState<SupportTicket>();
  const [subject, setSubject] = useState(resourceType ? "Cần hỗ trợ về giao dịch" : "");
  const [description, setDescription] = useState(resourceId ? "Mình cần hỗ trợ về giao dịch này." : "");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [faqSearch, setFaqSearch] = useState("");
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const linkedPreview = useLinkedResource(linkedResource?.type, linkedResource?.id);
  const selectedPreview = useLinkedResource(selected?.resource_type, selected?.resource_id);

  const normalizedFaqSearch = faqSearch.trim().toLowerCase();
  const filteredFaqs = HELP_CENTER_FAQS.filter((item) => {
    if (!normalizedFaqSearch) return true;
    return (
      item.question.toLowerCase().includes(normalizedFaqSearch) ||
      item.answer.toLowerCase().includes(normalizedFaqSearch) ||
      item.category.toLowerCase().includes(normalizedFaqSearch)
    );
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTickets(uniqueTickets((await listSupportTickets()).items));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openTicket(id: string): Promise<void> {
    setError("");
    if (selected?.id === id) {
      setSelected(undefined);
      setMessage("");
      return;
    }
    try {
      setSelected(await getSupportTicket(id));
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!subject.trim() || !description.trim()) return;
    setPending(true);
    setError("");
    setSuccess("");
    try {
      const created = await createSupportTicket({
        subject: subject.trim(),
        description: description.trim(),
        ...(resourceType && resourceId ? { resource_type: resourceType, resource_id: resourceId } : {}),
      });
      setTickets((current) => uniqueTickets([created, ...current]));
      setSelected(created);
      setSubject("");
      setDescription("");
      setSuccess("Yêu cầu đã được ghi nhận. X-One sẽ giữ lại toàn bộ timeline để bạn theo dõi.");
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setPending(false);
    }
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selected || !message.trim()) return;
    setPending(true);
    setError("");
    try {
      const updated = await addSupportMessage(selected.id, message.trim());
      setSelected(updated);
      setTickets((current) => uniqueTickets(current.map((item) => item.id === updated.id ? updated : item)));
      setMessage("");
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setPending(false);
    }
  }

  function clearLinkedResource(): void {
    const next = new URLSearchParams(params?.toString() ?? "");
    next.delete("resource_type");
    next.delete("resource_id");
    router.replace(next.toString() ? `/app/support?${next.toString()}` : "/app/support");
    setSubject("");
    setDescription("");
    setSuccess("");
  }

  return (
    <section className={`route-shell support-page ${styles.page}`} aria-labelledby="support-title">
      <header className={`section-heading support-heading ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <div className={styles.heroEyebrow}>
            <span className="eyebrow">TRUNG TÂM HỖ TRỢ</span>
            <span className={styles.availability}><span aria-hidden="true" /> Đang hoạt động</span>
          </div>
          <h1 id="support-title">Mình có thể giúp gì?</h1>
          <p>Giải đáp nhanh, gửi yêu cầu mới và theo dõi mọi cập nhật trong cùng một nơi.</p>
          <div className={styles.heroSignals} aria-label="Thông tin hỗ trợ">
            <span><ShieldCheck size={15} /> Theo dõi theo từng giao dịch</span>
            <span><Sparkles size={15} /> Hỗ trợ rõ ràng, không vòng vo</span>
          </div>
        </div>
        <button className={`icon-button ${styles.refreshButton}`} type="button" onClick={() => void load()} aria-label="Tải lại yêu cầu hỗ trợ" title="Tải lại">
          <RefreshCw size={18} />
        </button>
      </header>

      <div className={styles.content}>
        {error ? <div className="error-panel" role="alert"><p>{error}</p><button className="icon-button" type="button" onClick={() => setError("")} aria-label="Đóng lỗi">×</button></div> : null}
        {success ? <p className={`success-note ${styles.successNote}`} role="status">{success}</p> : null}

        <div className="support-grid">
          <div className={styles.primaryColumn}>
            <section className={`support-faq settings-card ${styles.card} ${styles.faqCard} faq-section`} aria-labelledby="faq-title">
              <div className="settings-card-title">
                <span className={styles.cardIcon}><LifeBuoy size={18} /></span>
                <div><h2 id="faq-title">Trung tâm trợ giúp &amp; Câu hỏi thường gặp</h2><p>Giải đáp nhanh các vấn đề thường gặp hoặc tìm kiếm câu hỏi bên dưới.</p></div>
              </div>
              <div className="faq-search-box">
                <Search size={16} className="faq-search-icon" aria-hidden="true" />
                <input
                  type="search"
                  value={faqSearch}
                  onChange={(event) => setFaqSearch(event.target.value)}
                  placeholder="Tìm câu hỏi..."
                  aria-label="Tìm câu hỏi trợ giúp"
                />
              </div>
              {filteredFaqs.length === 0 ? (
                <div className="empty-state" role="status">
                  <p>Không tìm thấy câu trả lời — Tạo yêu cầu hỗ trợ</p>
                </div>
              ) : (
                <div className="faq-accordion" role="region" aria-label="Danh sách câu hỏi thường gặp">
                  {filteredFaqs.map((faq, index) => {
                    const isOpen = openFaqIndex === index;
                    return (
                      <div key={faq.question} className={`faq-item ${isOpen ? "is-open" : ""}`}>
                        <button
                          type="button"
                          className="faq-question-btn"
                          aria-expanded={isOpen}
                          aria-controls={`faq-answer-${index}`}
                          onClick={() => setOpenFaqIndex((current) => (current === index ? null : index))}
                        >
                          <strong>{faq.question}</strong>
                          <ChevronDown size={16} aria-hidden="true" />
                        </button>
                        {isOpen ? (
                          <div id={`faq-answer-${index}`} className="faq-answer">
                            <p>{faq.answer}</p>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className={`settings-card ${styles.card} ${styles.formCard}`} aria-labelledby="new-ticket-title">
              <div className="settings-card-title">
                <span className={styles.cardIcon}><MessageSquareText size={18} /></span>
                <div><h2 id="new-ticket-title">Tạo yêu cầu hỗ trợ</h2><p>{linkedResource ? "Kiểm tra giao dịch trước khi gửi yêu cầu." : "Mô tả ngắn gọn để X-One hỗ trợ nhanh hơn."}</p></div>
              </div>
              {linkedResource ? <LinkedResourcePreview type={linkedResource.type} id={linkedResource.id} resource={linkedPreview.resource} loading={linkedPreview.loading} error={linkedPreview.error} onRetry={linkedPreview.retry} onClear={clearLinkedResource} mode="form" /> : null}
              <form className="support-form" onSubmit={submit}>
                <label>Tiêu đề<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={180} placeholder="Ví dụ: Cần kiểm tra giao dịch" required /></label>
                <label>Mô tả<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} maxLength={5000} placeholder="Cho chúng mình biết điều đang xảy ra…" required /></label>
                <button className="button button-primary" type="submit" disabled={pending || !subject.trim() || !description.trim() || Boolean(linkedResource && (linkedPreview.loading || linkedPreview.error || !linkedPreview.resource))}><Send size={16} />{pending ? "Đang gửi…" : "Gửi yêu cầu"}</button>
              </form>
            </section>
          </div>

          <section className={`settings-card support-tickets ${styles.card} ${styles.ticketCard}`} aria-labelledby="tickets-title">
            <div className="settings-card-title">
              <span className={styles.cardIcon}><MessageSquareText size={18} /></span>
              <div><h2 id="tickets-title">Yêu cầu của tôi</h2><p>Chọn một yêu cầu để xem tiến độ và phản hồi.</p></div>
              <span className={styles.ticketCount} aria-label={`${tickets.length} yêu cầu`}>{tickets.length}</span>
            </div>
            {loading ? <p className="inline-note">Đang tải…</p> : tickets.length === 0 ? <div className={styles.emptyState}><span className={styles.emptyIcon}><MessageSquareText size={22} /></span><strong>Chưa có yêu cầu nào</strong><p>Khi cần hỗ trợ, bạn có thể bắt đầu bằng biểu mẫu bên trái.</p></div> : <div className={styles.ticketListHint}>Các yêu cầu mới nhất được đặt lên đầu danh sách.</div>}
            {!loading && tickets.length > 0 ? <div className={`support-ticket-list ${styles.ticketList}`}>{tickets.map((ticket) => <div className={`${styles.ticketItem} ${selected?.id === ticket.id ? styles.ticketItemExpanded : ""}`} key={ticket.id}><button className={`support-ticket ${styles.ticketButton} ${selected?.id === ticket.id ? "is-selected" : ""}`} type="button" onClick={() => void openTicket(ticket.id)} aria-expanded={selected?.id === ticket.id} aria-controls={`ticket-detail-${ticket.id}`}><span className={styles.ticketListContent}><span className={styles.ticketListTop}><strong>{ticket.subject}</strong><span className={`status-badge ${ticket.status === "OPEN" ? styles.statusOpen : ticket.status === "IN_PROGRESS" ? styles.statusProgress : ticket.status === "RESOLVED" ? styles.statusResolved : styles.statusClosed}`}>{supportStatusLabel(ticket.status)}</span></span><span className={styles.ticketListMeta}><span>{formatDate(ticket.updated_at)}</span><span className={styles.expandControl}><span>{selected?.id === ticket.id ? "Thu gọn" : "Mở rộng"}</span><ChevronDown size={15} aria-hidden="true" /></span></span></span></button>{selected?.id === ticket.id ? <TicketDetail id={`ticket-detail-${ticket.id}`} selected={selected} preview={selectedPreview} message={message} pending={pending} onSendMessage={sendMessage} onMessageChange={setMessage} /> : null}</div>)}</div> : null}
          </section>
        </div>

        <div className={styles.footerLink}><Link className="text-link" href="/app/history">Mở lịch sử để liên kết một giao dịch cụ thể <span aria-hidden="true">→</span></Link><span>Liên kết giúp đội ngũ xem đúng ngữ cảnh.</span></div>
      </div>
    </section>
  );
}

function TicketDetail({ id, selected, preview, message, pending, onSendMessage, onMessageChange }: { id: string; selected: SupportTicket; preview: ReturnType<typeof useLinkedResource>; message: string; pending: boolean; onSendMessage: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; onMessageChange: (value: string) => void }) {
  return <article id={id} className={`support-detail ${styles.ticketDetailBody}`} aria-label={`Chi tiết ${selected.subject}`}>{selected.resource_type && selected.resource_id ? <LinkedResourcePreview type={selected.resource_type} id={selected.resource_id} resource={preview.resource} loading={preview.loading} error={preview.error} onRetry={preview.retry} mode="ticket" /> : null}<p>{selected.description}</p><div className={styles.timelineHeader}><h3>Lịch sử trao đổi</h3><span>{selected.events?.length ?? 0} cập nhật</span></div><ol className={`support-timeline ${styles.timeline}`}>{(selected.events ?? []).map((event) => <li key={event.id}><span>{event.event_type === "MESSAGE" ? "Tin nhắn" : event.event_type === "CREATED" ? "Đã tạo" : "Cập nhật"}</span><p>{event.message ?? "Trạng thái đã thay đổi."}</p><time>{formatDate(event.created_at)}</time></li>)}</ol>{selected.status !== "CLOSED" ? <form className={`support-message-form ${styles.replyComposer}`} onSubmit={onSendMessage}><div className={styles.composerHeader}><span>Phản hồi hoặc bổ sung thông tin</span><small>Đội ngũ hỗ trợ sẽ thấy ngay trong timeline.</small></div><textarea aria-label="Nội dung phản hồi" value={message} onChange={(event) => onMessageChange(event.target.value)} rows={3} placeholder="Viết phản hồi của bạn…" maxLength={5000} /><button className="button button-secondary" type="submit" disabled={pending || !message.trim()}><Send size={15} /> Gửi thêm</button></form> : <p className="inline-note">Ticket đã đóng.</p>}</article>;
}

function formatDate(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date); }

function supportStatusLabel(value: SupportTicketStatus): string { return value === "OPEN" ? "Mới" : value === "IN_PROGRESS" ? "Đang xử lý" : value === "RESOLVED" ? "Đã giải quyết" : "Đã đóng"; }

const feedbackResourceTypes: FeedbackResourceType[] = ["food_order", "ride_booking", "restaurant_reservation", "healthcare_appointment"];

function feedbackResourceType(value: string | null): FeedbackResourceType | undefined {
  return value && feedbackResourceTypes.includes(value as FeedbackResourceType) ? value as FeedbackResourceType : undefined;
}

function useLinkedResource(type?: FeedbackResourceType, id?: string): { resource?: Record<string, unknown>; loading: boolean; error: string; retry: () => void } {
  const [resource, setResource] = useState<Record<string, unknown>>();
  const [loading, setLoading] = useState(Boolean(type && id));
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    if (!type || !id) {
      setResource(undefined);
      setLoading(false);
      setError("");
      return () => { active = false; };
    }
    setResource(undefined);
    setLoading(true);
    setError("");
    void getHistoryDetail(type, id).then((value) => {
      if (!active) return;
      setResource(value);
      setLoading(false);
    }).catch((reason: unknown) => {
      if (!active) return;
      setError(errorText(reason));
      setLoading(false);
    });
    return () => { active = false; };
  }, [type, id, retryCount]);

  return { resource, loading, error, retry: () => setRetryCount((current) => current + 1) };
}

function LinkedResourcePreview({ type, id, resource, loading, error, onRetry, onClear, mode }: { type: FeedbackResourceType; id: string; resource?: Record<string, unknown>; loading: boolean; error: string; onRetry: () => void; onClear?: () => void; mode: "form" | "ticket" }) {
  const summary = linkedResourceSummary(type, id, resource);
  const Icon = resourceIcon(type);
  const detailHref = `/app/history/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
  return <section className={`${styles.linkedResource} ${mode === "ticket" ? styles.ticketLinkedResource : ""}`} aria-labelledby={`linked-resource-${mode}-${id}`}>
    <div className={styles.linkedHeader}>
      <div className={styles.linkedTitle}><span className={styles.linkedIcon}><Icon size={16} /></span><div><span className={styles.linkedEyebrow}>{mode === "form" ? "GIAO DỊCH ĐANG CHỌN" : "GIAO DỊCH ĐÃ LIÊN KẾT"}</span><h3 id={`linked-resource-${mode}-${id}`}>{summary.title}</h3></div></div>
      {resource ? <span className={styles.linkedStatus}>{summary.status}</span> : null}
    </div>
    {loading ? <p className={styles.linkedLoading} role="status"><Loader2 size={15} className={styles.spinner} /> Đang tải chi tiết giao dịch…</p> : error ? <div className={styles.linkedError} role="alert"><p>Không thể tải chi tiết giao dịch để bạn kiểm tra trước khi gửi.</p><button className="text-button" type="button" onClick={onRetry}>Thử lại</button></div> : <><p className={styles.linkedContext}>{summary.context}</p><dl className={styles.linkedFacts}><div><dt>Loại</dt><dd>{summary.typeLabel}</dd></div><div><dt>Thời gian</dt><dd>{summary.time}</dd></div><div><dt>Trạng thái</dt><dd>{summary.status}</dd></div><div><dt>Mã giao dịch</dt><dd><code title={id}>{summary.shortId}</code></dd></div></dl></>}
    <div className={styles.linkedActions}>{mode === "form" && onClear ? <button className="text-button" type="button" onClick={onClear}><X size={14} /> Bỏ liên kết</button> : null}{mode === "form" ? <Link className="text-link" href="/app/history">Đổi giao dịch <ArrowRight size={14} /></Link> : <Link className="text-link" href={detailHref}>Mở chi tiết <ArrowRight size={14} /></Link>}</div>
  </section>;
}

function linkedResourceSummary(type: FeedbackResourceType, id: string, resource?: Record<string, unknown>): { title: string; typeLabel: string; context: string; time: string; status: string; shortId: string } {
  const source = resource ?? {};
  const detail = isRecord(source.quote) ? source.quote : isRecord(source.snapshot) ? source.snapshot : source;
  const route = isRecord(detail.route) ? detail.route : isRecord(source.route) ? source.route : undefined;
  const title = type === "ride_booking" ? "Chuyến xe" : type === "food_order" ? "Đơn đồ ăn" : type === "restaurant_reservation" ? "Đặt bàn" : "Lịch khám";
  const typeLabel = title;
  const status = statusLabel(source.status ?? source.booking_status ?? source.order_status ?? source.state);
  const time = formatDateTime(source.start_at ?? source.start_time ?? source.reservation_time ?? source.appointment_time ?? source.scheduled_at ?? source.booking_time ?? source.ordered_at ?? source.created_at ?? source.timestamp ?? detail.start_at ?? detail.start_time ?? detail.booking_time);
  let context = "Thông tin giao dịch đang cập nhật";
  if (type === "ride_booking") {
    const pickup = displayValue(detail.pickup_address ?? detail.pickup ?? source.pickup_address ?? source.pickup ?? route?.origin, "Điểm đón đang cập nhật");
    const dropoff = displayValue(detail.dropoff_address ?? detail.dropoff ?? source.dropoff_address ?? source.dropoff ?? route?.destination, "Điểm đến đang cập nhật");
    context = `${pickup} → ${dropoff}`;
  } else if (type === "food_order") {
    context = firstDisplay(source.restaurant_name, nestedDisplay(source.restaurant), source.delivery_address, "Đơn đồ ăn đang cập nhật");
  } else if (type === "restaurant_reservation") {
    context = firstDisplay(nestedDisplay(source.restaurant), source.name, "Nhà hàng đang cập nhật");
  } else {
    context = firstDisplay(source.facility_name, nestedDisplay(source.facility), source.doctor_name, "Cơ sở y tế đang cập nhật");
  }
  return { title, typeLabel, context, time, status, shortId: compactId(id) };
}

function resourceIcon(type: FeedbackResourceType) { return type === "ride_booking" ? CarFront : type === "food_order" ? Utensils : type === "restaurant_reservation" ? CalendarDays : Stethoscope; }
function compactId(id: string): string { return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id; }
function firstDisplay(...values: unknown[]): string { for (const value of values) { const text = nestedDisplay(value); if (text) return text; } return "Đang cập nhật"; }
function displayValue(value: unknown, fallback: string): string { return nestedDisplay(value) || fallback; }
function nestedDisplay(value: unknown): string { if (typeof value === "string" || typeof value === "number") return String(value).trim(); if (isRecord(value)) return firstDisplay(value.name, value.title, value.address, value.address_text, value.label); return ""; }

function uniqueTickets(items: SupportTicket[]): SupportTicket[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

const HELP_CENTER_FAQS: Array<{ category: string; question: string; answer: string }> = [
  { category: "Chuyến xe", question: "Làm thế nào để hủy chuyến?", answer: "Vào Lịch sử → mở chi tiết chuyến xe → chọn Hủy chuyến và xác nhận. Nếu chuyến đã có tài xế nhận, phí hủy có thể áp dụng theo chính sách hiển thị trên màn hình." },
  { category: "Chuyến xe", question: "Tại sao không tìm được tài xế?", answer: "Thường do giờ cao điểm hoặc khu vực ít tài xế. Bạn thử đặt lại sau vài phút, đổi điểm đón gần đường lớn hơn hoặc chọn loại xe khác." },
  { category: "Đồ ăn", question: "Đơn bị hủy, tiền của tôi đâu?", answer: "Tiền sẽ được hoàn về phương thức thanh toán gốc trong 3–7 ngày làm việc. Bạn có thể theo dõi trạng thái hoàn tiền trong Lịch sử giao dịch." },
  { category: "Đồ ăn", question: "Làm sao thay đổi địa chỉ giao?", answer: "Nếu quán chưa xác nhận, bạn mở chi tiết đơn và chọn đổi địa chỉ. Sau khi quán đã nhận đơn, hãy liên hệ hỗ trợ để được giúp đổi địa điểm giao." },
  { category: "Khám bệnh", question: "Làm thế nào để đổi lịch khám?", answer: "Vào Lịch sử → mở lịch khám → chọn Đổi lịch, sau đó chọn khung giờ mới còn trống và xác nhận. Bạn nên đổi trước giờ khám ít nhất 2 tiếng." },
  { category: "Khám bệnh", question: "Có thể hủy trong bao lâu?", answer: "Bạn có thể hủy miễn phí trước giờ khám ít nhất 4 tiếng. Hủy sát giờ có thể bị tính phí theo chính sách của cơ sở y tế." },
  { category: "Thanh toán", question: "Tôi bị tính tiền 2 lần?", answer: "Một giao dịch giữ tiền tạm thời có thể hiển thị như 2 lần trừ. Số tiền giữ sẽ tự hoàn sau 1–3 ngày. Nếu sau thời gian này vẫn bị trừ 2 lần, hãy tạo yêu cầu hỗ trợ kèm ảnh sao kê." },
  { category: "Thanh toán", question: "Hoàn tiền mất bao lâu?", answer: "Hoàn tiền về ví X-One thường trong 24 giờ, về thẻ ngân hàng từ 3–7 ngày làm việc tùy ngân hàng phát hành thẻ của bạn." },
];
