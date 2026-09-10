"use client";

import Link from "next/link";
import { Archive, ArchiveRestore, Edit3, MessageSquareText, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { deleteConversation, errorText, listConversations, updateConversation } from "@/lib/api-client";
import { emitConversationsChanged } from "@/lib/conversation-events";
import { formatDateTime, serviceLabel } from "@/lib/presentation";
import type { ConversationRecord } from "@/types";

const pageSize = 10;

export default function ConversationHistoryPage() {
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [deleteId, setDeleteId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listConversations(true, undefined, page, pageSize);
      setConversations(result.items);
      setTotal(result.total);
      setHasMore(result.has_more);
    } catch (reason) {
      setError(errorText(reason));
      setConversations([]);
      setTotal(0);
      setHasMore(false);
    } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { void load(); }, [load]);

  async function archive(id: string, nextStatus: "ACTIVE" | "ARCHIVED"): Promise<void> {
    try { const updated = await updateConversation(id, { status: nextStatus }); setConversations((current) => current.map((item) => item.conversationId === id ? updated : item)); emitConversationsChanged(); } catch (reason) { setError(errorText(reason)); }
  }
  function beginRename(item: ConversationRecord): void { setDeleteId(""); setEditingId(item.conversationId); setEditingTitle(item.title ?? ""); }
  async function saveRename(id: string): Promise<void> {
    const title = editingTitle.trim();
    if (!title) return;
    try { const updated = await updateConversation(id, { title }); setConversations((current) => current.map((item) => item.conversationId === id ? updated : item)); emitConversationsChanged(); setEditingId(""); setEditingTitle(""); } catch (reason) { setError(errorText(reason)); }
  }
  async function remove(id: string): Promise<void> {
    if (deleteId !== id) { setDeleteId(id); setEditingId(""); return; }
    try { await deleteConversation(id); setConversations((current) => current.filter((item) => item.conversationId !== id)); setTotal((current) => Math.max(current - 1, 0)); setDeleteId(""); emitConversationsChanged(); } catch (reason) { setError(errorText(reason)); }
  }

  return <section className="route-shell history-page" aria-labelledby="conversation-history-title">
    <header className="section-heading"><div><span className="eyebrow">LỊCH SỬ TRÒ CHUYỆN</span><h1 id="conversation-history-title">Cuộc trò chuyện gần đây</h1><p>Xem lại các cuộc trao đổi với trợ lý AI X-One.</p></div><div className="history-header-actions"><Link className="button button-secondary" href="/app/history">Hoạt động dịch vụ</Link><Link className="button button-primary" href="/app"><Plus size={16} /> Cuộc trò chuyện mới</Link><button className="icon-button" type="button" onClick={() => void load()} aria-label="Tải lại cuộc trò chuyện"><RefreshCw size={18} /></button></div></header>
    {loading ? <p className="inline-note" aria-live="polite">Đang tải 10 cuộc trò chuyện…</p> : error ? <div className="error-panel" role="alert"><p>{error}</p><button className="button button-secondary" type="button" onClick={() => void load()}>Thử lại</button></div> : null}
    {!loading && !error && conversations.length === 0 ? <div className="empty-state"><MessageSquareText size={24} /><h2>Chưa có cuộc trò chuyện nào</h2><p>Bắt đầu với trợ lý để tạo cuộc trò chuyện đầu tiên.</p><Link className="button button-primary" href="/app">Mở trợ lý</Link></div> : null}
    {conversations.length ? <section className="history-section"><div className="history-section-heading"><div><span className="eyebrow">TRÒ CHUYỆN</span><h2>Gần đây và đã lưu trữ</h2></div><span className="activity-count">{total} cuộc · trang {page}</span></div><div className="history-list">{conversations.map((item) => <ConversationRow key={item.conversationId} item={item} editingId={editingId} editingTitle={editingTitle} deleteId={deleteId} onBeginRename={beginRename} onChangeTitle={setEditingTitle} onSaveRename={(id) => void saveRename(id)} onCancelRename={() => setEditingId("")} onArchive={(id, nextStatus) => void archive(id, nextStatus)} onDelete={(id) => void remove(id)} />)}</div><div className="history-pagination"><button className="button button-secondary" type="button" disabled={page === 1 || loading} onClick={() => setPage((current) => current - 1)}>Trang trước</button><button className="button button-secondary" type="button" disabled={!hasMore || loading} onClick={() => setPage((current) => current + 1)}>Trang sau</button></div></section> : null}
  </section>;
}

function ConversationRow({ item, editingId, editingTitle, deleteId, onBeginRename, onChangeTitle, onSaveRename, onCancelRename, onArchive, onDelete }: { item: ConversationRecord; editingId: string; editingTitle: string; deleteId: string; onBeginRename: (item: ConversationRecord) => void; onChangeTitle: (value: string) => void; onSaveRename: (id: string) => void; onCancelRename: () => void; onArchive: (id: string, nextStatus: "ACTIVE" | "ARCHIVED") => void; onDelete: (id: string) => void }) {
  const archived = item.status === "ARCHIVED";
  return <article className="history-row">{editingId === item.conversationId ? <div className="history-edit-form"><label htmlFor={`conversation-title-${item.conversationId}`}>Tên cuộc trò chuyện</label><input id={`conversation-title-${item.conversationId}`} value={editingTitle} onChange={(event) => onChangeTitle(event.target.value)} autoFocus /><div><button className="button button-primary" type="button" onClick={() => onSaveRename(item.conversationId)}>Lưu tên</button><button className="text-button" type="button" onClick={onCancelRename}>Hủy</button></div></div> : <Link href={`/app/conversations/${encodeURIComponent(item.conversationId)}`}><span className="eyebrow">{item.serviceContext ? serviceLabel(item.serviceContext).toUpperCase() : "X-ONE"}</span><h3>{item.title ?? "Cuộc trò chuyện"}</h3><p>{lastPreview(item)}</p><time>{formatDateTime(item.updatedAt ?? item.lastMessageAt)}</time></Link>}<div className="history-row-actions"><button className="icon-button" type="button" onClick={() => onBeginRename(item)} aria-label={`Đổi tên ${item.title ?? "cuộc trò chuyện"}`}><Edit3 size={16} /></button><button className="icon-button" type="button" onClick={() => onArchive(item.conversationId, archived ? "ACTIVE" : "ARCHIVED")} aria-label={archived ? `Bỏ lưu trữ ${item.title ?? "cuộc trò chuyện"}` : `Lưu trữ ${item.title ?? "cuộc trò chuyện"}`}>{archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}</button><button className={`icon-button ${deleteId === item.conversationId ? "danger is-confirming" : ""}`} type="button" onClick={() => onDelete(item.conversationId)} aria-label={deleteId === item.conversationId ? "Bấm lần nữa để xóa hẳn" : `Xóa ${item.title ?? "cuộc trò chuyện"}`}><Trash2 size={16} /></button></div></article>;
}

function lastPreview(item: ConversationRecord): string { return item.messages[item.messages.length - 1]?.content || "Chưa có tin nhắn"; }
