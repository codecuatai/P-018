"use client";

import Link from "next/link";
import { CalendarDays, CarFront, MessageSquareText, Plus, RefreshCw, Stethoscope, Utensils } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { errorText, listHistory } from "@/lib/api-client";
import { formatDateTime, formatMoney, isRecord, optionalText, statusLabel } from "@/lib/presentation";
import type { HistoryType, HistoryItem } from "@/types";

const pageSize = 10;

export default function HistoryPage() {
  const [resources, setResources] = useState<HistoryItem[]>([]);
  const [totalResources, setTotalResources] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [service, setService] = useState<HistoryType | "">("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listHistory({ service: service || undefined, status: status || undefined, from: from || undefined, to: to || undefined, page, page_size: pageSize });
      setResources(result.items);
      setTotalResources(result.total);
      setHasMore(result.has_more);
      setUnavailable(result.unavailable);
    } catch (reason) {
      setError(errorText(reason));
      setResources([]);
      setTotalResources(0);
      setHasMore(false);
      setUnavailable([]);
    } finally { setLoading(false); }
  }, [from, page, service, status, to]);

  useEffect(() => { void load(); }, [load]);

  function updateFilter<T>(setter: (value: T) => void, value: T): void { setPage(1); setter(value); }
  function resetFilters(): void { setService(""); setStatus(""); setFrom(""); setTo(""); setPage(1); }
  const isEmpty = !loading && !error && resources.length === 0;

  return <section className="route-shell history-page" aria-labelledby="history-title">
    <header className="section-heading"><div><span className="eyebrow">LỊCH SỬ DỊCH VỤ</span><h1 id="history-title">Hoạt động gần đây</h1><p>Xem nhanh các chuyến xe, đơn đồ ăn, lần đặt bàn và lịch khám gần đây.</p></div><div className="history-header-actions"><Link className="button button-secondary" href="/app/history/conversations">Lịch sử trò chuyện</Link><Link className="button button-primary" href="/app"><Plus size={16} /> Cuộc trò chuyện mới</Link><button className="icon-button" type="button" onClick={() => void load()} aria-label="Tải lại hoạt động gần đây"><RefreshCw size={18} /></button></div></header>
    <section className="history-filters" aria-label="Bộ lọc hoạt động dịch vụ"><label><span>Dịch vụ</span><select value={service} onChange={(event) => updateFilter(setService, event.target.value as HistoryType | "")}><option value="">Tất cả</option><option value="food_order">Đồ ăn</option><option value="ride_booking">Chuyến xe</option><option value="restaurant_reservation">Đặt bàn</option><option value="healthcare_appointment">Lịch khám</option></select></label><label><span>Trạng thái</span><select value={status} onChange={(event) => updateFilter(setStatus, event.target.value)}><option value="">Tất cả</option><option value="CONFIRMED">Đã xác nhận</option><option value="COMPLETED">Đã hoàn tất</option><option value="CANCELLED">Đã hủy</option><option value="NO_DRIVER">Không có tài xế</option><option value="FAILED">Thất bại</option></select></label><label><span>Từ ngày</span><input type="date" value={from} onChange={(event) => updateFilter(setFrom, event.target.value)} /></label><label><span>Đến ngày</span><input type="date" value={to} onChange={(event) => updateFilter(setTo, event.target.value)} /></label><button className="button button-secondary history-filter-reset" type="button" onClick={resetFilters}>Xóa bộ lọc</button></section>
    {loading ? <p className="inline-note" aria-live="polite">Đang tải 10 hoạt động dịch vụ…</p> : error ? <div className="error-panel" role="alert"><p>{error}</p><button className="button button-secondary" type="button" onClick={() => void load()}>Thử lại</button></div> : null}
    {isEmpty ? <div className="empty-state"><MessageSquareText size={24} /><h2>Chưa có hoạt động dịch vụ nào</h2><p>Bắt đầu với trợ lý hoặc mở một dịch vụ để X-One lưu lại mạch công việc cho bạn.</p><Link className="button button-primary" href="/app">Mở trợ lý</Link></div> : null}
    {resources.length ? <section className="history-section" aria-labelledby="resource-history-title"><div className="history-section-heading"><div><span className="eyebrow">DỊCH VỤ</span><h2 id="resource-history-title">Hoạt động gần đây</h2></div><span className="activity-count">{totalResources} mục · trang {page}</span></div><div className="history-list">{resources.map((item) => <HistoryResourceRow key={`${item.type}-${item.id}`} item={item} />)}</div><div className="history-pagination"><button className="button button-secondary" type="button" disabled={page === 1 || loading} onClick={() => setPage((current) => current - 1)}>Trang trước</button><button className="button button-secondary" type="button" disabled={!hasMore || loading} onClick={() => setPage((current) => current + 1)}>Trang sau</button></div></section> : null}
  </section>;
}

function HistoryResourceRow({ item }: { item: HistoryItem }) {
  const Icon = item.type === "ride_booking" ? CarFront : item.type === "food_order" ? Utensils : item.type === "restaurant_reservation" ? CalendarDays : Stethoscope;
  const summary = historySummary(item);
  return <Link className="history-resource-row" href={`/app/history/${item.type}/${encodeURIComponent(item.id)}`}><span className={`history-resource-mark ${item.type.split("_")[0]}`} aria-hidden="true"><Icon size={17} /></span><span className="history-resource-copy"><strong>{summary.title}</strong><span>{summary.detail}</span><small>{statusLabel(item.status)} · {formatDateTime(item.timestamp)}</small></span><span className="history-resource-arrow" aria-hidden="true">→</span></Link>;
}

function historySummary(item: HistoryItem): { title: string; detail: string } {
  const resource = item.resource;
  if (item.type === "ride_booking") {
    const snap = (typeof resource.quote === "object" && resource.quote !== null ? resource.quote : typeof resource.snapshot === "object" && resource.snapshot !== null ? resource.snapshot : resource) as Record<string, unknown>;
    return { title: `${optionalText(snap.pickup_address ?? snap.pickup ?? resource.pickup_address ?? resource.pickup, "Điểm đón")} → ${optionalText(snap.dropoff_address ?? snap.dropoff ?? resource.dropoff_address ?? resource.dropoff, "Điểm đến")}`, detail: `${formatMoney(snap.amount ?? snap.fare ?? resource.amount ?? resource.fare, String(snap.currency ?? resource.currency ?? "VND"))} · ${optionalText(snap.vehicle_type ?? snap.vehicle ?? resource.vehicle_type ?? resource.vehicle)}` };
  }
  if (item.type === "food_order") return { title: nestedName(resource.restaurant) || optionalText(resource.restaurant_name, "Đơn đồ ăn"), detail: `${itemsCount(resource.items)} · ${formatMoney(resource.total ?? resource.amount, String(resource.currency ?? "VND"))}` };
  if (item.type === "restaurant_reservation") return { title: nestedName(resource.restaurant) || optionalText(resource.name, "Đặt bàn"), detail: `${formatDateTime(resource.start_at ?? resource.reservation_time)} · ${resource.party_size ? `${String(resource.party_size)} người` : "Số khách đang cập nhật"}` };
  return { title: nestedName(resource.facility) || optionalText(resource.facility_name, "Lịch khám"), detail: `${optionalText(resource.department)} · ${optionalText(resource.doctor_name ?? resource.doctor)} · ${formatDateTime(resource.start_time ?? resource.appointment_time)}` };
}

function nestedName(value: unknown): string { return isRecord(value) ? optionalText(value.name ?? value.title, "") : typeof value === "string" ? value : ""; }
function itemsCount(value: unknown): string { return Array.isArray(value) ? `${value.length} món` : "Món đang cập nhật"; }
function displayType(value: string): string { return ({ food_order: "đơn đồ ăn", ride_booking: "chuyến xe", restaurant_reservation: "đặt bàn", healthcare_appointment: "lịch khám" } as Record<string, string>)[value] ?? value; }
