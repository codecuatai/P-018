"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AssistantCards } from "@/components/WorkflowCards";
import { errorText, getConversation } from "@/lib/api-client";
import type { AssistantAction, ConversationRecord } from "@/types";

export function ConversationDetail({ id }: { id: string }) {
  const [conversation, setConversation] = useState<ConversationRecord>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setConversation(await getConversation(id)); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  return <section className="route-shell" aria-labelledby="conversation-title"><div className="route-back"><Link className="text-link" href="/app/history"><ArrowLeft size={15} /> Lịch sử</Link></div>{loading ? <p className="inline-note">Đang tải cuộc trò chuyện…</p> : error ? <div className="error-panel" role="alert"><p>{error}</p><button className="button button-secondary" type="button" onClick={() => void load()}><RefreshCw size={15} /> Thử lại</button></div> : conversation ? <><header className="section-heading"><div><span className="eyebrow">{conversation.serviceContext ?? "X-ONE"}</span><h1 id="conversation-title">{conversation.title ?? "Cuộc trò chuyện"}</h1><p>{formatDate(conversation.updatedAt)}</p></div></header><div className="conversation-transcript">{conversation.messages.map((message, index) => <article className={`transcript-message ${message.role}`} key={`${message.createdAt}-${index}`}><span className="eyebrow">{message.role === "user" ? "BẠN" : "X-ONE"}</span><p>{message.content}</p>{message.data ? <AssistantCards response={message.data} onAction={(_action: AssistantAction) => undefined} disabledActionId="history-read-only" /> : null}<time>{formatDate(message.createdAt)}</time></article>)}</div></> : <div className="empty-state"><h2>Không tìm thấy cuộc trò chuyện</h2><Link className="button button-primary" href="/app/history">Về lịch sử</Link></div>}</section>;
}

function formatDate(value?: string): string { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date); }
