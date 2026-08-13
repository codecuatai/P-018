"use client";

import Link from "next/link";
import { LifeBuoy, MessageSquareText, RefreshCw, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { addSupportMessage, createSupportTicket, errorText, getSupportTicket, listSupportTickets } from "@/lib/api-client";
import type { FeedbackResourceType, SupportTicket } from "@/types";

export default function SupportPage() {
  const params = useSearchParams();
  const resourceType = (params?.get("resource_type") ?? "") as FeedbackResourceType | "";
  const resourceId = params?.get("resource_id") ?? "";
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selected, setSelected] = useState<SupportTicket>();
  const [subject, setSubject] = useState(resourceType ? "Cần hỗ trợ về giao dịch" : "");
  const [description, setDescription] = useState(resourceId ? `Mã giao dịch cần hỗ trợ: ${resourceId}` : "");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => { setLoading(true); setError(""); try { setTickets(uniqueTickets((await listSupportTickets()).items)); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);

  async function openTicket(id: string): Promise<void> { setError(""); try { setSelected(await getSupportTicket(id)); } catch (reason) { setError(errorText(reason)); } }
  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> { event.preventDefault(); if (!subject.trim() || !description.trim()) return; setPending(true); setError(""); setSuccess(""); try { const created = await createSupportTicket({ subject: subject.trim(), description: description.trim(), ...(resourceType && resourceId ? { resource_type: resourceType, resource_id: resourceId } : {}) }); setTickets((current) => uniqueTickets([created, ...current])); setSelected(created); setSubject(""); setDescription(""); setSuccess("Yêu cầu đã được ghi nhận. X-One sẽ giữ lại toàn bộ timeline để bạn theo dõi."); } catch (reason) { setError(errorText(reason)); } finally { setPending(false); } }
  async function sendMessage(event: React.FormEvent<HTMLFormElement>): Promise<void> { event.preventDefault(); if (!selected || !message.trim()) return; setPending(true); setError(""); try { const updated = await addSupportMessage(selected.id, message.trim()); setSelected(updated); setTickets((current) => uniqueTickets(current.map((item) => item.id === updated.id ? updated : item))); setMessage(""); } catch (reason) { setError(errorText(reason)); } finally { setPending(false); } }

  return <section className="route-shell support-page" aria-labelledby="support-title"><header className="section-heading"><div><span className="eyebrow">TRUNG TÂM HỖ TRỢ</span><h1 id="support-title">Mình có thể giúp gì?</h1><p>FAQ nhanh, yêu cầu mới và timeline hỗ trợ theo đúng giao dịch của tài khoản.</p></div><button className="icon-button" type="button" onClick={() => void load()} aria-label="Tải lại yêu cầu hỗ trợ"><RefreshCw size={18} /></button></header>{error ? <div className="error-panel" role="alert"><p>{error}</p><button className="icon-button" type="button" onClick={() => setError("")} aria-label="Đóng lỗi">×</button></div> : null}{success ? <p className="success-note" role="status">{success}</p> : null}<div className="support-grid"><div><section className="support-faq settings-card" aria-labelledby="faq-title"><div className="settings-card-title"><LifeBuoy size={19} /><div><h2 id="faq-title">Câu hỏi thường gặp</h2><p>Thông tin ngắn gọn trước khi gửi yêu cầu.</p></div></div><details><summary>Tại sao giá hoặc tình trạng có thể thay đổi?</summary><p>Giá, menu, khung giờ và tài xế luôn được kiểm tra lại từ domain authoritative trước bước xác nhận cuối.</p></details><details><summary>Đặt lại có tự động thanh toán không?</summary><p>Không. Đặt lại chỉ chuẩn bị một luồng mới; bạn vẫn xem lại và xác nhận ở các bước cần thiết.</p></details><details><summary>Làm sao theo dõi phản hồi?</summary><p>Mở một yêu cầu ở danh sách bên cạnh để xem timeline và gửi thêm thông tin.</p></details></section><section className="settings-card" aria-labelledby="new-ticket-title"><div className="settings-card-title"><MessageSquareText size={19} /><div><h2 id="new-ticket-title">Tạo yêu cầu hỗ trợ</h2><p>{resourceType && resourceId ? `Đang liên kết giao dịch ${resourceId}.` : "Bạn có thể liên kết một giao dịch từ trang lịch sử."}</p></div></div><form className="support-form" onSubmit={submit}><label>Tiêu đề<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={180} required /></label><label>Mô tả<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} maxLength={5000} required /></label><button className="button button-primary" type="submit" disabled={pending || !subject.trim() || !description.trim()}><Send size={16} />{pending ? "Đang gửi…" : "Gửi yêu cầu"}</button></form></section></div><section className="settings-card support-tickets" aria-labelledby="tickets-title"><div className="settings-card-title"><MessageSquareText size={19} /><div><h2 id="tickets-title">Yêu cầu của tôi</h2><p>Chỉ hiển thị ticket thuộc tài khoản hiện tại.</p></div></div>{loading ? <p className="inline-note">Đang tải…</p> : tickets.length === 0 ? <p className="inline-note">Chưa có yêu cầu nào.</p> : <div className="support-ticket-list">{tickets.map((ticket) => <button className={`support-ticket ${selected?.id === ticket.id ? "is-selected" : ""}`} type="button" key={ticket.id} onClick={() => void openTicket(ticket.id)}><strong>{ticket.subject}</strong><span>{ticket.status} · {formatDate(ticket.updated_at)}</span></button>)}</div>}{selected ? <article className="support-detail"><div className="support-detail-heading"><div><span className="eyebrow">TICKET</span><h3>{selected.subject}</h3></div><span className="status-badge">{selected.status}</span></div><p>{selected.description}</p><ol className="support-timeline">{(selected.events ?? []).map((event) => <li key={event.id}><span>{event.event_type === "MESSAGE" ? "Tin nhắn" : event.event_type === "CREATED" ? "Đã tạo" : "Cập nhật"}</span><p>{event.message ?? "Trạng thái đã thay đổi."}</p><time>{formatDate(event.created_at)}</time></li>)}</ol>{selected.status !== "CLOSED" ? <form className="support-message-form" onSubmit={sendMessage}><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} placeholder="Bổ sung thông tin…" maxLength={5000} /><button className="button button-secondary" type="submit" disabled={pending || !message.trim()}><Send size={15} /> Gửi thêm</button></form> : <p className="inline-note">Ticket đã đóng.</p>}</article> : null}</section></div><p className="inline-note"><Link className="text-link" href="/app/history">Mở lịch sử để liên kết một giao dịch cụ thể →</Link></p></section>;
}

function formatDate(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date); }

function uniqueTickets(items: SupportTicket[]): SupportTicket[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
