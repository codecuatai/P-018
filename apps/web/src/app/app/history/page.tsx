"use client";

import Link from "next/link";
import { Archive, ArchiveRestore, CalendarDays, CarFront, Edit3, MessageSquareText, Plus, RefreshCw, Stethoscope, Trash2, Utensils } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { deleteConversation, errorText, listConversations, listHistory, updateConversation } from "@/lib/api-client";
import { emitConversationsChanged } from "@/lib/conversation-events";
import { conversationTitle, formatDateTime, formatMoney, isRecord, optionalText, statusLabel } from "@/lib/presentation";
import type { ConversationRecord, HistoryType, HistoryItem } from "@/types";

const pageSize = 20;

export default function HistoryPage() {
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [resources, setResources] = useState<HistoryItem[]>([]);
  const [totalResources, setTotalResources] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const [service, setService] = useState<HistoryType | "">("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [loadSentinel, setLoadSentinel] = useState<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);

  const load = useCallback(async (nextPage = 1, append = false) => {
    if (append && loadingMoreRef.current) return;
    if (append) loadingMoreRef.current = true;
    setLoading(true);
    setError("");
    const [conversationResult, historyResult] = await Promise.allSettled([
      listConversations(true),
      listHistory({ service: service || undefined, status: status || undefined, from: from || undefined, to: to || undefined, page: nextPage, page_size: pageSize }),
    ]);
    const failures: string[] = [];
    if (conversationResult.status === "fulfilled") setConversations(conversationResult.value.items);
    else failures.push(errorText(conversationResult.reason));
    if (historyResult.status === "fulfilled") {
      setTotalResources(historyResult.value.total);
      setHasMore(historyResult.value.has_more);
      setUnavailable(historyResult.value.unavailable);
    } else failures.push(errorText(historyResult.reason));
    if (conversationResult.status === "rejected" && historyResult.status === "rejected") setError(failures[0] ?? "Không thể tải lịch sử.");
    else if (failures.length) setError("Một phần lịch sử chưa sẵn sàng. Bạn vẫn có thể xem dữ liệu còn lại.");
    if (historyResult.status === "fulfilled") setResources((current) => append ? [...current, ...historyResult.value.items] : historyResult.value.items);
    if (historyResult.status === "fulfilled") setPage(nextPage);
    setLoading(false);
    if (append) loadingMoreRef.current = false;
  }, [from, service, status, to]);

  useEffect(() => { void load(); }, [load]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore || loadingMoreRef.current) return;
    void load(page + 1, true);
  }, [hasMore, load, loading, page]);

  useEffect(() => {
    if (!loadSentinel || !hasMore || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { rootMargin: "320px" });
    observer.observe(loadSentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loadSentinel]);

  function updateFilter<T>(setter: (value: T) => void, value: T): void {
    setPage(1);
    setter(value);
  }

  function resetFilters(): void {
    setService("");
    setStatus("");
    setFrom("");
    setTo("");
    setPage(1);
  }

  async function archive(id: string, nextStatus: "ACTIVE" | "ARCHIVED"): Promise<void> {
    try {
      const updated = await updateConversation(id, { status: nextStatus });
      setConversations((current) => current.map((item) => item.conversationId === id ? updated : item));
      emitConversationsChanged();
    } catch (reason) { setError(errorText(reason)); }
  }

  function beginRename(item: ConversationRecord): void {
    setDeleteId("");
    setEditingId(item.conversationId);
    setEditingTitle(item.title ?? "");
  }

  async function saveRename(id: string): Promise<void> {
    const title = editingTitle.trim();
    if (!title) return;
    try {
      const updated = await updateConversation(id, { title });
      setConversations((current) => current.map((item) => item.conversationId === id ? updated : item));
      emitConversationsChanged();
      setEditingId("");
      setEditingTitle("");
    } catch (reason) { setError(errorText(reason)); }
  }

  async function remove(id: string): Promise<void> {
    if (deleteId !== id) { setDeleteId(id); setEditingId(""); return; }
    try {
      await deleteConversation(id);
      setConversations((current) => current.filter((item) => item.conversationId !== id));
      setDeleteId("");
      emitConversationsChanged();
    } catch (reason) { setError(errorText(reason)); }
  }

  const activeConversations = conversations.filter((item) => item.status !== "ARCHIVED");
  const archivedConversations = conversations.filter((item) => item.status === "ARCHIVED");
  const isEmpty = !loading && !error && conversations.length === 0 && resources.length === 0;

  return <section className="route-shell history-page" aria-labelledby="history-title">
    <header className="section-heading"><div><span className="eyebrow">LỊCH SỬ</span><h1 id="history-title">Những việc bạn đã làm</h1><p>Xem nhanh các chuyến xe, đơn đồ ăn, lần đặt bàn và lịch khám gần đây.</p></div><div className="history-header-actions"><Link className="button button-primary" href="/app"><Plus size={16} /> Cuộc trò chuyện mới</Link><button className="icon-button" type="button" onClick={() => void load()} aria-label="Tải lại lịch sử"><RefreshCw size={18} /></button></div></header>
    <section className="history-filters" aria-label="Bộ lọc lịch sử"><label><span>Dịch vụ</span><select value={service} onChange={(event) => updateFilter(setService, event.target.value as HistoryType | "")}><option value="">Tất cả</option><option value="food_order">Đồ ăn</option><option value="ride_booking">Chuyến xe</option><option value="restaurant_reservation">Đặt bàn</option><option value="healthcare_appointment">Lịch khám</option></select></label><label><span>Trạng thái</span><select value={status} onChange={(event) => updateFilter(setStatus, event.target.value)}><option value="">Tất cả</option><option value="CONFIRMED">Đã xác nhận</option><option value="COMPLETED">Đã hoàn tất</option><option value="CANCELLED">Đã hủy</option><option value="NO_DRIVER">Không có tài xế</option><option value="FAILED">Thất bại</option></select></label><label><span>Từ ngày</span><input type="date" value={from} onChange={(event) => updateFilter(setFrom, event.target.value)} /></label><label><span>Đến ngày</span><input type="date" value={to} onChange={(event) => updateFilter(setTo, event.target.value)} /></label><button className="button button-secondary history-filter-reset" type="button" onClick={resetFilters}>Xóa bộ lọc</button></section>
    {loading ? <p className="inline-note" aria-live="polite">Đang tải lịch sử…</p> : error && conversations.length === 0 && resources.length === 0 ? <div className="error-panel" role="alert"><p>{error}</p><button className="button button-secondary" type="button" onClick={() => void load()}>Thử lại</button></div> : null}
    {error && !isEmpty && !loading ? <p className="partial-note" role="status">{error}</p> : null}
    {unavailable.length ? <p className="partial-note" role="status">Nguồn tạm thời chưa có: {unavailable.map(displayType).join(", ")}.</p> : null}
    {isEmpty ? <div className="empty-state"><MessageSquareText size={24} /><h2>Chưa có hoạt động nào</h2><p>Bắt đầu với trợ lý hoặc mở một dịch vụ để X-One lưu lại mạch công việc cho bạn.</p><Link className="button button-primary" href="/app">Mở trợ lý</Link></div> : null}
    {resources.length ? <section className="history-section" aria-labelledby="resource-history-title"><div className="history-section-heading"><div><span className="eyebrow">DỊCH VỤ</span><h2 id="resource-history-title">Hoạt động gần đây</h2></div><span className="activity-count">{totalResources} mục · đã tải {resources.length}</span></div><div className="history-list">{resources.map((item) => <HistoryResourceRow key={`${item.type}-${item.id}`} item={item} />)}</div><div className="history-pagination"><button className="button button-secondary" type="button" disabled={!hasMore || loading} onClick={loadMore}>{loading && hasMore ? "Đang tải…" : hasMore ? "Tải thêm hoạt động" : "Đã tải hết"}</button><div ref={setLoadSentinel} className="history-load-sentinel" aria-hidden="true" /></div></section> : null}
    {activeConversations.length ? <ConversationSection title="Cuộc trò chuyện gần đây" items={activeConversations} editingId={editingId} editingTitle={editingTitle} deleteId={deleteId} onBeginRename={beginRename} onChangeTitle={setEditingTitle} onSaveRename={(id) => void saveRename(id)} onCancelRename={() => setEditingId("")} onArchive={(id) => void archive(id, "ARCHIVED")} onDelete={(id) => void remove(id)} /> : null}
    {archivedConversations.length ? <ConversationSection title="Đã lưu trữ" items={archivedConversations} editingId={editingId} editingTitle={editingTitle} deleteId={deleteId} onBeginRename={beginRename} onChangeTitle={setEditingTitle} onSaveRename={(id) => void saveRename(id)} onCancelRename={() => setEditingId("")} onArchive={(id) => void archive(id, "ACTIVE")} onDelete={(id) => void remove(id)} archived /> : null}
  </section>;
}

function ConversationSection({ title, items, archived = false, editingId, editingTitle, deleteId, onBeginRename, onChangeTitle, onSaveRename, onCancelRename, onArchive, onDelete }: { title: string; items: ConversationRecord[]; archived?: boolean; editingId: string; editingTitle: string; deleteId: string; onBeginRename: (item: ConversationRecord) => void; onChangeTitle: (value: string) => void; onSaveRename: (id: string) => void; onCancelRename: () => void; onArchive: (id: string) => void; onDelete: (id: string) => void }) {
  return <section className="history-section" aria-labelledby={archived ? "archived-conversation-title" : "conversation-history-title"}><div className="history-section-heading"><div><span className="eyebrow">TRÒ CHUYỆN</span><h2 id={archived ? "archived-conversation-title" : "conversation-history-title"}>{title}</h2></div><span className="activity-count">{items.length} cuộc</span></div><div className="history-list">{items.map((item) => <article className="history-row" key={item.conversationId}>{editingId === item.conversationId ? <div className="history-edit-form"><label htmlFor={`conversation-title-${item.conversationId}`}>Tên cuộc trò chuyện</label><input id={`conversation-title-${item.conversationId}`} value={editingTitle} onChange={(event) => onChangeTitle(event.target.value)} autoFocus /><div><button className="button button-primary" type="button" onClick={() => onSaveRename(item.conversationId)}>Lưu tên</button><button className="text-button" type="button" onClick={onCancelRename}>Hủy</button></div></div> : <Link href={`/app/conversations/${encodeURIComponent(item.conversationId)}`}><span className="eyebrow">{item.serviceContext ?? "X-ONE"}</span><h3>{item.title ?? "Cuộc trò chuyện"}</h3><p>{lastPreview(item)}</p><time>{formatDateTime(item.updatedAt ?? item.lastMessageAt)}</time></Link>}<div className="history-row-actions"><button className="icon-button" type="button" onClick={() => onBeginRename(item)} aria-label={`Đổi tên ${item.title ?? "cuộc trò chuyện"}`}><Edit3 size={16} /></button><button className="icon-button" type="button" onClick={() => onArchive(item.conversationId)} aria-label={archived ? `Bỏ lưu trữ ${item.title ?? "cuộc trò chuyện"}` : `Lưu trữ ${item.title ?? "cuộc trò chuyện"}`}>{archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}</button><button className={`icon-button ${deleteId === item.conversationId ? "danger is-confirming" : ""}`} type="button" onClick={() => onDelete(item.conversationId)} aria-label={deleteId === item.conversationId ? "Bấm lần nữa để xóa hẳn" : `Xóa ${item.title ?? "cuộc trò chuyện"}`}><Trash2 size={16} /></button></div></article>)}</div></section>;
}

function lastPreview(item: ConversationRecord): string { return item.messages[item.messages.length - 1]?.content || "Chưa có tin nhắn"; }
function HistoryResourceRow({ item }: { item: HistoryItem }) {
  const Icon = item.type === "ride_booking" ? CarFront : item.type === "food_order" ? Utensils : item.type === "restaurant_reservation" ? CalendarDays : Stethoscope;
  const summary = historySummary(item);
  return <Link className="history-resource-row" href={`/app/history/${item.type}/${encodeURIComponent(item.id)}`}><span className={`history-resource-mark ${item.type.split("_")[0]}`} aria-hidden="true"><Icon size={17} /></span><span className="history-resource-copy"><strong>{summary.title}</strong><span>{summary.detail}</span><small>{statusLabel(item.status)} · {formatDateTime(item.timestamp)}</small></span><span className="history-resource-arrow" aria-hidden="true">→</span></Link>;
}

function historySummary(item: HistoryItem): { title: string; detail: string } {
  const resource = item.resource;
  if (item.type === "ride_booking") return { title: `${optionalText(resource.pickup_address ?? resource.pickup, "Điểm đón")} → ${optionalText(resource.dropoff_address ?? resource.dropoff, "Điểm đến")}`, detail: `${formatMoney(resource.amount ?? resource.fare, String(resource.currency ?? "VND"))} · ${optionalText(resource.vehicle_type ?? resource.vehicle)}` };
  if (item.type === "food_order") return { title: nestedName(resource.restaurant) || optionalText(resource.restaurant_name, "Đơn đồ ăn"), detail: `${itemsCount(resource.items)} · ${formatMoney(resource.total ?? resource.amount, String(resource.currency ?? "VND"))}` };
  if (item.type === "restaurant_reservation") return { title: nestedName(resource.restaurant) || optionalText(resource.name, "Đặt bàn"), detail: `${formatDateTime(resource.start_at ?? resource.reservation_time)} · ${resource.party_size ? `${String(resource.party_size)} người` : "Số khách đang cập nhật"}` };
  return { title: nestedName(resource.facility) || optionalText(resource.facility_name, "Lịch khám"), detail: `${optionalText(resource.department)} · ${optionalText(resource.doctor_name ?? resource.doctor)} · ${formatDateTime(resource.start_time ?? resource.appointment_time)}` };
}

function nestedName(value: unknown): string { return isRecord(value) ? optionalText(value.name ?? value.title, "") : typeof value === "string" ? value : ""; }
function itemsCount(value: unknown): string { return Array.isArray(value) ? `${value.length} món` : "Món đang cập nhật"; }
function displayType(value: string): string { return ({ food_order: "đơn đồ ăn", ride_booking: "chuyến xe", restaurant_reservation: "đặt bàn", healthcare_appointment: "lịch khám" } as Record<string, string>)[value] ?? value; }
