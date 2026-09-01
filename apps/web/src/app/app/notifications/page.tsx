"use client";

import Link from "next/link";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { errorText, listNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/api-client";
import { emitNotificationsChanged } from "@/lib/conversation-events";
import type { NotificationItem } from "@/types";

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<"ALL" | "UNREAD" | "READ">("ALL");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [unread, setUnread] = useState(0);
  const [partial, setPartial] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listNotifications(filter === "ALL" ? undefined : filter, page);
      setItems(result.items);
      setUnread(result.unread_count);
      setPartial(result.partial);
      setHasMore(result.has_more);
    } catch (reason) { setError(errorText(reason)); }
    finally { setLoading(false); }
  }, [filter, page]);

  useEffect(() => { void load(); }, [load]);

  async function read(id: string): Promise<void> {
    try {
      await markNotificationRead(id);
      setItems((current) => current.map((item) => item.id === id ? { ...item, status: "READ", read_at: new Date().toISOString() } : item));
      setUnread((current) => Math.max(0, current - 1));
      emitNotificationsChanged();
    }
    catch (reason) { setError(errorText(reason)); }
  }

  async function readAll(): Promise<void> {
    try {
      await markAllNotificationsRead();
      setItems((current) => current.map((item) => ({ ...item, status: "READ" })));
      setUnread(0);
      emitNotificationsChanged();
    }
    catch (reason) { setError(errorText(reason)); }
  }

  return <section className="route-shell activity-page" aria-labelledby="notifications-title">
    <header className="section-heading"><div><span className="eyebrow">TRUNG TÂM THÔNG BÁO</span><h1 id="notifications-title">Thông báo của bạn</h1><p>Cập nhật mới nhất về các dịch vụ của bạn, chỉ xuất hiện một lần.</p></div><div className="history-header-actions"><button className="button button-secondary" type="button" onClick={() => void readAll()} disabled={!unread || loading}><CheckCheck size={16} /> Đọc tất cả</button><button className="icon-button" type="button" onClick={() => void load()} aria-label="Tải lại thông báo"><RefreshCw size={18} /></button></div></header>
    <div className="notification-filters" role="tablist" aria-label="Lọc thông báo"><button className={filter === "ALL" ? "is-active" : ""} type="button" role="tab" aria-selected={filter === "ALL"} onClick={() => { setFilter("ALL"); setPage(1); }}>Tất cả</button><button className={filter === "UNREAD" ? "is-active" : ""} type="button" role="tab" aria-selected={filter === "UNREAD"} onClick={() => { setFilter("UNREAD"); setPage(1); }}>Chưa đọc · {unread}</button><button className={filter === "READ" ? "is-active" : ""} type="button" role="tab" aria-selected={filter === "READ"} onClick={() => { setFilter("READ"); setPage(1); }}>Đã đọc</button></div>
    {partial ? <p className="partial-note" role="status">Một số dịch vụ đang tạm thời chưa phản hồi; thông báo đã lưu vẫn được hiển thị.</p> : null}
    {loading ? <p className="inline-note" aria-live="polite">Đang tải thông báo…</p> : error ? <div className="error-panel" role="alert"><p>{error}</p><button className="button button-secondary" type="button" onClick={() => void load()}>Thử lại</button></div> : items.length === 0 ? <div className="empty-state"><Bell size={24} /><h2>Chưa có thông báo</h2><p>Khi đơn hàng, chuyến xe hoặc lịch khám thay đổi, cập nhật sẽ xuất hiện ở đây.</p></div> : <><div className="activity-list">{items.map((item) => <NotificationRow key={item.id} item={item} onRead={() => void read(item.id)} />)}</div><nav className="history-pagination" aria-label="Phân trang thông báo"><button className="button button-secondary" type="button" disabled={page === 1 || loading} onClick={() => setPage((current) => current - 1)}>Trang trước</button><span>Trang {page}</span><button className="button button-secondary" type="button" disabled={!hasMore || loading} onClick={() => setPage((current) => current + 1)}>Trang sau</button></nav></>}
  </section>;
}

function NotificationRow({ item, onRead }: { item: NotificationItem; onRead: () => void }) {
  const href = item.resource_type && item.resource_id && ["food_order", "ride_booking", "restaurant_reservation", "healthcare_appointment"].includes(item.resource_type) ? `/app/history/${item.resource_type}/${encodeURIComponent(item.resource_id)}` : undefined;
  const content = <><span className="activity-icon"><Bell size={17} /></span><span className="activity-copy"><span className="activity-row-heading"><strong>{item.title}</strong><span>{formatDate(item.created_at)}</span></span><p>{item.body}</p><span className="activity-meta"><span>{item.status === "UNREAD" ? "Chưa đọc" : "Đã đọc"}</span>{href ? <span>Xem chi tiết →</span> : null}</span></span></>;
  return <article className={`activity-row ${item.status === "UNREAD" ? "notification-unread" : ""}`}>{href ? <Link href={href} onClick={item.status === "UNREAD" ? onRead : undefined}>{content}</Link> : <button className="activity-row-button" type="button" onClick={item.status === "UNREAD" ? onRead : undefined}>{content}</button>}</article>;
}

function formatDate(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date); }
