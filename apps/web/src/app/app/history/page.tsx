"use client";

import Link from "next/link";
import { Archive, ClipboardList, MessageSquareText, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { errorText, listConversations, listHistory, updateConversation } from "@/lib/api-client";
import type { ConversationRecord, HistoryItem } from "@/types";

export default function HistoryPage() {
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [resources, setResources] = useState<HistoryItem[]>([]);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [conversationResult, historyResult] = await Promise.allSettled([listConversations(), listHistory()]);
    const failures: string[] = [];
    if (conversationResult.status === "fulfilled") setConversations(conversationResult.value.items);
    else failures.push(errorText(conversationResult.reason));
    if (historyResult.status === "fulfilled") { setResources(historyResult.value.items); setUnavailable(historyResult.value.unavailable); }
    else failures.push(errorText(historyResult.reason));
    if (conversationResult.status === "rejected" && historyResult.status === "rejected") setError(failures[0] ?? "Không thể tải lịch sử.");
    else if (failures.length) setError("Một phần lịch sử chưa sẵn sàng. Bạn vẫn có thể xem dữ liệu còn lại.");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function archive(id: string): Promise<void> {
    try { await updateConversation(id, { status: "ARCHIVED" }); setConversations((current) => current.filter((item) => item.conversationId !== id)); }
    catch (reason) { setError(errorText(reason)); }
  }

  const isEmpty = !loading && !error && conversations.length === 0 && resources.length === 0;
  return <section className="route-shell history-page" aria-labelledby="history-title">
    <header className="section-heading"><div><span className="eyebrow">LỊCH SỬ</span><h1 id="history-title">Những việc bạn đã làm</h1><p>Cuộc trò chuyện và giao dịch được ghép từ Core cùng các domain; dữ liệu lỗi ở một nguồn không che mất nguồn còn lại.</p></div><button className="icon-button" type="button" onClick={() => void load()} aria-label="Tải lại lịch sử"><RefreshCw size={18} /></button></header>
    {loading ? <p className="inline-note" aria-live="polite">Đang tải lịch sử…</p> : error && conversations.length === 0 && resources.length === 0 ? <div className="error-panel" role="alert"><p>{error}</p><button className="button button-secondary" type="button" onClick={() => void load()}>Thử lại</button></div> : null}
    {error && !isEmpty && !loading ? <p className="partial-note" role="status">{error}</p> : null}
    {unavailable.length ? <p className="partial-note" role="status">Nguồn tạm thời chưa có: {unavailable.map(displayType).join(", ")}.</p> : null}
    {isEmpty ? <div className="empty-state"><MessageSquareText size={24} /><h2>Chưa có hoạt động nào</h2><p>Bắt đầu với trợ lý hoặc mở một dịch vụ để X-One lưu lại mạch công việc cho bạn.</p><Link className="button button-primary" href="/app">Mở trợ lý</Link></div> : null}
    {resources.length ? <section className="history-section" aria-labelledby="resource-history-title"><div className="history-section-heading"><div><span className="eyebrow">GIAO DỊCH</span><h2 id="resource-history-title">Hoạt động dịch vụ</h2></div><span className="activity-count">{resources.length} mục</span></div><div className="history-list">{resources.map((item) => <Link className="history-resource-row" key={`${item.type}-${item.id}`} href={`/app/history/${item.type}/${encodeURIComponent(item.id)}`}><span className={`history-resource-mark ${item.type.split("_")[0]}`} aria-hidden="true"><ClipboardList size={17} /></span><span className="history-resource-copy"><strong>{item.title}</strong><span>{item.detail}</span><small>{formatStatus(item.status)} · {formatDate(item.timestamp)}</small></span><span className="history-resource-arrow" aria-hidden="true">→</span></Link>)}</div></section> : null}
    {conversations.length ? <section className="history-section" aria-labelledby="conversation-history-title"><div className="history-section-heading"><div><span className="eyebrow">TRÒ CHUYỆN</span><h2 id="conversation-history-title">Cuộc trò chuyện gần đây</h2></div></div><div className="history-list">{conversations.map((item) => <article className="history-row" key={item.conversationId}><Link href={`/app/conversations/${encodeURIComponent(item.conversationId)}`}><span className="eyebrow">{item.serviceContext ?? "X-ONE"}</span><h3>{item.title ?? "Cuộc trò chuyện"}</h3><p>{lastPreview(item)}</p><time>{formatDate(item.updatedAt ?? item.lastMessageAt)}</time></Link><button className="icon-button" type="button" onClick={() => void archive(item.conversationId)} aria-label={`Lưu trữ ${item.title ?? "cuộc trò chuyện"}`}><Archive size={17} /></button></article>)}</div></section> : null}
  </section>;
}

function lastPreview(item: ConversationRecord): string { return item.messages[item.messages.length - 1]?.content || "Chưa có tin nhắn"; }
function formatDate(value?: string): string { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function formatStatus(value: string): string { return ({ CONFIRMED: "Đã xác nhận", COMPLETED: "Đã hoàn tất", DRIVER_ASSIGNED: "Đã tìm thấy tài xế", CANCELLED: "Đã hủy", DRAFT: "Đang giữ", ACTIVE: "Đang hoạt động" } as Record<string, string>)[value] ?? value; }
function displayType(value: string): string { return ({ food_order: "đơn đồ ăn", ride_booking: "chuyến xe", restaurant_reservation: "đặt bàn", healthcare_appointment: "lịch khám" } as Record<string, string>)[value] ?? value; }
