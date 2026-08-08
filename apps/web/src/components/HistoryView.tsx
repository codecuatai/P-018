import { Activity as ActivityIcon, ArrowRight, CalendarDays, CarFront, CheckCircle2, CircleDashed, Stethoscope, Utensils } from "lucide-react";
import type { Domain, SessionActivity } from "../types";

interface HistoryViewProps {
  activities: SessionActivity[];
  onOpenAssistant: () => void;
}

export function HistoryView({ activities, onOpenAssistant }: HistoryViewProps) {
  return (
    <section className="activity-page" aria-labelledby="activity-title">
      <div className="section-heading">
        <div><span className="eyebrow">HOẠT ĐỘNG</span><h1 id="activity-title">Hoạt động trong phiên</h1><p>Chỉ hiển thị các kết quả đã được Gateway xác nhận trong tab hiện tại.</p></div>
        <div className="activity-count"><ActivityIcon size={16} /> {activities.length} kết quả</div>
      </div>
      {activities.length === 0 ? (
        <div className="empty-panel"><div className="empty-icon"><CircleDashed size={24} /></div><h2>Chưa có hoạt động đã xác nhận</h2><p>Hoàn tất một workflow trong Trợ lý để kết quả thật xuất hiện tại đây.</p><button className="button button-primary" type="button" onClick={onOpenAssistant}>Mở Trợ lý <ArrowRight size={16} /></button></div>
      ) : (
        <div className="activity-list">
          {activities.map((activity) => <ActivityRow activity={activity} key={activity.id} />)}
        </div>
      )}
    </section>
  );
}

function ActivityRow({ activity }: { activity: SessionActivity }) {
  const Icon = iconFor(activity.domain);
  return (
    <article className={`activity-row activity-${activity.domain}`}>
      <div className="activity-icon"><Icon size={19} /></div>
      <div className="activity-copy"><div className="activity-row-heading"><strong>{activity.title}</strong><span>{formatDateTime(activity.timestamp)}</span></div><p>{activity.detail}</p><div className="activity-meta"><span>Mã: {activity.reference}</span><span><CheckCircle2 size={14} /> {activity.status}</span></div></div>
    </article>
  );
}

function iconFor(domain: Domain) {
  if (domain === "ride") return CarFront;
  if (domain === "food") return Utensils;
  if (domain === "restaurant") return CalendarDays;
  return Stethoscope;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
