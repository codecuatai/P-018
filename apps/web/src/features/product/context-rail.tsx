import { ArrowRight, CalendarDays, CarFront, CheckCircle2, ShieldCheck, Stethoscope, Utensils } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { HistoryItem } from "@/types";

export type ContextRailMode = "idle" | "active" | "tracking" | "recovery";

export function ContextRail({ mode, title, description, children }: { mode: ContextRailMode; title: string; description: string; children: ReactNode }) {
  return <aside className={`context-rail context-rail-${mode}`} aria-label="Việc đang xử lý">
    <div className="context-rail-heading"><span className="eyebrow">ĐANG DIỄN RA</span><h2>{title}</h2><p>{description}</p></div>
    {children}
  </aside>;
}

export function ActiveRideRailCard({ ride }: { ride: HistoryItem }) {
  const status = ride.status || String(ride.resource.status ?? "Đang xử lý");
  return <div className="active-ride-rail-card">
    <div className="active-ride-rail-icon" aria-hidden="true"><CarFront size={18} /></div>
    <div><strong>{ride.title || "Chuyến xe"}</strong><span>{ride.detail || "Đang cập nhật trạng thái."}</span><small>Trạng thái: {status}</small></div>
    <Link className="text-link" href={`/app/history/${ride.type}/${encodeURIComponent(ride.id)}`}>Mở chi tiết <ArrowRight size={14} /></Link>
  </div>;
}

export function ActiveWorkRailCard({ item }: { item: HistoryItem }) {
  const status = item.status || String(item.resource.status ?? "Đang xử lý");
  const Icon = item.type === "ride_booking" ? CarFront : item.type === "food_order" ? Utensils : item.type === "restaurant_reservation" ? CalendarDays : Stethoscope;
  return <div className="active-ride-rail-card">
    <div className="active-ride-rail-icon" aria-hidden="true"><Icon size={18} /></div>
    <div><strong>{item.title || titleFor(item.type)}</strong><span>{item.detail || "Đang cập nhật thông tin."}</span><small>{statusLabel(status)} · {status}</small></div>
    <Link className="text-link" href={`/app/history/${item.type}/${encodeURIComponent(item.id)}`}>Mở chi tiết <ArrowRight size={14} /></Link>
  </div>;
}

export function ConversationContextCards() {
  return <>
    <div className="context-card context-card-accent"><div className="context-card-title"><CheckCircle2 size={17} /><strong>Rõ ràng theo từng bước</strong></div><p>Đặt xe, tìm món, đặt bàn hoặc tìm lịch khám trong cùng một không gian.</p><div className="context-steps"><span><CheckCircle2 size={15} /> Hiểu yêu cầu</span><span><CheckCircle2 size={15} /> Tìm thông tin thật</span><span><ShieldCheck size={15} /> Xác nhận rõ ràng</span></div></div>
    <div className="context-card"><div className="context-card-title"><ShieldCheck size={17} /><strong>An toàn cho mỗi bước</strong></div><p>Giá, lịch trống và kết quả chỉ xuất hiện từ các dịch vụ đã xác thực. Những bước cuối luôn cần bạn đồng ý.</p></div>
  </>;
}

function titleFor(type: HistoryItem["type"]): string {
  return type === "ride_booking" ? "Chuyến xe" : type === "food_order" ? "Đơn đồ ăn" : type === "restaurant_reservation" ? "Đặt bàn" : "Lịch khám";
}

function statusLabel(status: string): string {
  return ({ SEARCHING_DRIVER: "Đang tìm tài xế", DRIVER_TO_PICKUP: "Tài xế đang đến", DRIVER_ARRIVED: "Tài xế đã đến", IN_PROGRESS: "Đang di chuyển", ARRIVED_DESTINATION: "Đã đến nơi", PREPARING: "Đang chuẩn bị", OUT_FOR_DELIVERY: "Đang giao", HELD: "Đang giữ chỗ", CONFIRMED: "Đã xác nhận", BOOKED: "Đã đặt" } as Record<string, string>)[status] ?? "Đang xử lý";
}
