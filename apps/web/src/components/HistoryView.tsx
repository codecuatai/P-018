import { Activity as ActivityIcon, ArrowRight, CheckCircle2, CircleDashed } from "lucide-react";
import type { SessionActivity } from "../types";

interface HistoryViewProps {
  activities: SessionActivity[];
  onOpenAssistant: () => void;
}

export function HistoryView({ activities, onOpenAssistant }: HistoryViewProps) {
  return <section className="activity-page" aria-labelledby="activity-title"><div className="section-heading"><div><span className="eyebrow">HOẠT ĐỘNG</span><h1 id="activity-title">Những việc đã hoàn tất</h1><p>Các kết quả được xác nhận trong cuộc trò chuyện hiện tại.</p></div><div className="activity-count"><ActivityIcon size={16} /> {activities.length} kết quả</div></div>{activities.length === 0 ? <div className="empty-panel"><div className="empty-icon"><CircleDashed size={24} /></div><h2>Chưa có kết quả nào</h2><p>Khi một việc được xác nhận, kết quả sẽ xuất hiện ở đây.</p><button className="button button-primary" type="button" onClick={onOpenAssistant}>Mở cuộc trò chuyện <ArrowRight size={16} /></button></div> : <div className="activity-list">{activities.map((activity) => <ActivityRow activity={activity} key={activity.id} />)}</div>}</section>;
}

function ActivityRow({ activity }: { activity: SessionActivity }) {
  return <article className="activity-row"><div className="activity-icon"><CheckCircle2 size={19} /></div><div className="activity-copy"><div className="activity-row-heading"><strong>{activity.title}</strong><span>{formatDateTime(activity.timestamp)}</span></div><p>{activity.detail}</p><div className="activity-meta"><span>{activity.reference}</span><span><CheckCircle2 size={14} /> {activity.status}</span></div></div></article>;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
