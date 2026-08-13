import { ArrowRight, CarFront, CheckCircle2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { HistoryItem } from "@/types";

export type ContextRailMode = "idle" | "active" | "tracking" | "recovery";

export function ContextRail({ mode, title, description, children }: { mode: ContextRailMode; title: string; description: string; children: ReactNode }) {
  return <aside className={`context-rail context-rail-${mode}`} aria-label="Ngữ cảnh hiện tại">
    <div className="context-rail-heading"><span className="eyebrow">NGỮ CẢNH HIỆN TẠI</span><h2>{title}</h2><p>{description}</p></div>
    {children}
  </aside>;
}

export function ActiveRideRailCard({ ride }: { ride: HistoryItem }) {
  const status = ride.status || String(ride.resource.status ?? "Đang xử lý");
  return <div className="active-ride-rail-card">
    <div className="active-ride-rail-icon" aria-hidden="true"><CarFront size={18} /></div>
    <div><strong>{ride.title || "Chuyến xe"}</strong><span>{ride.detail || "Ride Service đang cập nhật trạng thái."}</span><small>Trạng thái: {status}</small></div>
    <Link className="text-link" href={`/app/history/${ride.type}/${encodeURIComponent(ride.id)}`}>Mở chi tiết <ArrowRight size={14} /></Link>
  </div>;
}

export function ConversationContextCards() {
  return <>
    <div className="context-card context-card-accent"><div className="context-card-title"><CheckCircle2 size={17} /><strong>Rõ ràng theo từng bước</strong></div><p>Đặt xe, tìm món, đặt bàn hoặc tìm lịch khám trong cùng một không gian.</p><div className="context-steps"><span><CheckCircle2 size={15} /> Hiểu yêu cầu</span><span><CheckCircle2 size={15} /> Tìm thông tin thật</span><span><ShieldCheck size={15} /> Xác nhận rõ ràng</span></div></div>
    <div className="context-card"><div className="context-card-title"><ShieldCheck size={17} /><strong>An toàn cho mỗi bước</strong></div><p>Giá, lịch trống và kết quả chỉ xuất hiện từ các dịch vụ đã xác thực. Những bước cuối luôn cần bạn đồng ý.</p></div>
  </>;
}
