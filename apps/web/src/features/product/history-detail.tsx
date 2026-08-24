"use client";

import Link from "next/link";
import { ArrowLeft, LifeBuoy, RefreshCw, RotateCcw, Send, Star } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { errorText, getHistoryDetail, listMyFeedback, prepareFoodReorder, prepareHealthcareRebook, prepareRestaurantRebook, prepareRideRebook, submitFeedback } from "@/lib/api-client";
import { formatDateTime, formatMoney, isRecord, optionalText, statusLabel } from "@/lib/presentation";
import type { FeedbackItem, HistoryType } from "@/types";

import { FoodTrackingPanel } from "./food-tracking";
import { RideTrackingPanel } from "./ride-tracking";
import { XOneMap, type XOnePoint } from "./xone-map";

export function HistoryDetail({ type, id }: { type: HistoryType; id: string }) {
  const [resource, setResource] = useState<Record<string, unknown>>();
  const [feedback, setFeedback] = useState<FeedbackItem>();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [resourceResult, feedbackResult] = await Promise.allSettled([getHistoryDetail(type, id), listMyFeedback()]);
    if (resourceResult.status === "fulfilled") setResource(resourceResult.value); else setError(errorText(resourceResult.reason));
    if (feedbackResult.status === "fulfilled") {
      const current = feedbackResult.value.items.find((item) => item.resource_type === type && item.resource_id === id);
      setFeedback(current); setRating(current?.rating ?? 0); setComment(current?.comment ?? "");
    }
    setLoading(false);
  }, [id, type]);
  useEffect(() => { void load(); }, [load]);

  async function reorder(): Promise<void> {
    setActionPending(true); setActionMessage(""); setError("");
    try {
      const result = type === "food_order" ? await prepareFoodReorder(id) : type === "ride_booking" ? await prepareRideRebook(id) : type === "restaurant_reservation" ? await prepareRestaurantRebook(id) : await prepareHealthcareRebook(id);
      setActionMessage(reorderMessage(type, result));
    } catch (reason) { setError(errorText(reason)); } finally { setActionPending(false); }
  }

  async function rate(): Promise<void> {
    if (!rating) return;
    setActionPending(true); setError("");
    try { const result = await submitFeedback({ domain: domainFor(type), resource_type: type, resource_id: id, rating, ...(comment.trim() ? { comment: comment.trim() } : {}) }); setFeedback(result); setActionMessage("Cảm ơn bạn. Đánh giá đã được lưu cho giao dịch này."); }
    catch (reason) { setError(errorText(reason)); } finally { setActionPending(false); }
  }

  const title = ({ food_order: "Đơn đồ ăn", ride_booking: "Chuyến xe", restaurant_reservation: "Đặt bàn", healthcare_appointment: "Lịch khám" } as Record<HistoryType, string>)[type];
  const payment = isRecord(resource?.payment) ? resource.payment : undefined;
  const canRate = canRateStatus(String(resource?.status ?? ""), type);
  
  return (
    <section className="w-full flex flex-col gap-6" aria-labelledby="history-detail-title">
      <Link className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors self-start" href="/app/history">
        <ArrowLeft size={16} /> Quay lại lịch sử
      </Link>
      
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">CHI TIẾT DỊCH VỤ</span>
          <h1 id="history-detail-title" className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
          <p className="text-sm font-medium text-slate-500">{statusLabel(resource?.status)}</p>
        </div>
        <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 active:scale-95 transition-all shadow-sm" type="button" onClick={() => void load()} aria-label="Tải lại chi tiết">
          <RefreshCw size={18} />
        </button>
      </header>

      {loading ? (
        <p className="text-sm font-medium text-slate-500 animate-pulse" aria-live="polite">Đang tải chi tiết…</p>
      ) : error && !resource ? (
        <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-center justify-between gap-3" role="alert">
          <span className="text-sm font-semibold text-red-600">{error}</span>
          <button className="px-4 py-2 bg-white border border-red-200 text-red-700 text-xs font-bold rounded-lg hover:bg-red-50 active:scale-95 transition-all shadow-sm" type="button" onClick={() => void load()}>Thử lại</button>
        </div>
      ) : (
        <>
          <PurposeBuiltDetail type={type} resource={resource ?? {}} id={id} />
          {payment ? <PaymentSummary payment={payment} /> : null}
          
          <section className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-100" aria-label="Thao tác giao dịch">
            <button className="flex-1 px-4 py-3 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50" type="button" onClick={() => void reorder()} disabled={actionPending}>
              <RotateCcw size={16} />
              {actionPending ? "Đang chuẩn bị…" : type === "ride_booking" ? "Đặt xe lại" : type === "restaurant_reservation" ? "Đặt bàn lại" : type === "healthcare_appointment" ? "Đặt lịch lại" : "Đặt lại"}
            </button>
            <Link className="flex-1 px-4 py-3 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2" href={`/app/support?resource_type=${encodeURIComponent(type)}&resource_id=${encodeURIComponent(id)}`}>
              <LifeBuoy size={16} /> Liên hệ hỗ trợ
            </Link>
          </section>
          
          {actionMessage ? <p className="text-sm font-semibold text-emerald-600 bg-emerald-50 p-4 rounded-xl border border-emerald-100" role="status">{actionMessage}</p> : null}
          {error ? <p className="text-sm font-semibold text-red-600 bg-red-50 p-4 rounded-xl border border-red-100" role="alert">{error}</p> : null}
          {canRate ? <FeedbackForm rating={rating} comment={comment} existing={feedback} pending={actionPending} onRating={setRating} onComment={setComment} onSubmit={() => void rate()} /> : null}
        </>
      )}
    </section>
  );
}

function PurposeBuiltDetail({ type, resource, id }: { type: HistoryType; resource: Record<string, unknown>; id: string }) {
  if (type === "ride_booking") {
    const origin = pointFrom(resource.pickup_latitude, resource.pickup_longitude) ?? nestedPoint(resource.route, "origin");
    const destination = pointFrom(resource.dropoff_latitude, resource.dropoff_longitude) ?? nestedPoint(resource.route, "destination");
    return (
      <section className="flex flex-col gap-6">
        <DetailSection title="Hành trình">
          <Fact label="Điểm đón" value={optionalText(resource.pickup_address ?? resource.pickup)} />
          <Fact label="Điểm đến" value={optionalText(resource.dropoff_address ?? resource.dropoff)} />
          <Fact label="Khoảng cách" value={distanceText(resource.distance_km, resource.route)} />
          <Fact label="Thời gian" value={minutesText(resource.duration_minutes, resource.route)} />
          <Fact label="Loại xe" value={optionalText(resource.vehicle_type ?? resource.vehicle)} />
          <Fact label="Giá chuyến" value={formatMoney(resource.amount ?? resource.fare, String(resource.currency ?? "VND"))} />
          <Fact label="Tài xế" value={driverText(resource.driver)} />
        </DetailSection>
        {origin || destination ? (
          <div className="h-[250px] w-full rounded-3xl overflow-hidden border border-slate-200/60 shadow-sm relative">
            <XOneMap origin={origin} destination={destination} routeGeometry={routeFrom(resource.route)} routePolyline={typeof resource.route_polyline === "string" ? resource.route_polyline : undefined} label="Bản đồ hành trình" />
          </div>
        ) : null}
        <RideTrackingPanel bookingId={id} />
      </section>
    );
  }
  if (type === "food_order") return (
    <section className="flex flex-col gap-6">
      <Image source={resource.image_url ?? nestedValue(resource.restaurant, "image_url")} alt="Đơn đồ ăn" />
      <DetailSection title="Đơn đồ ăn">
        <Fact label="Nhà hàng" value={nestedName(resource.restaurant) || optionalText(resource.restaurant_name)} />
        <Fact label="Món đã chọn" value={itemsSummary(resource.items)} />
        <Fact label="Tổng cộng" value={formatMoney(resource.total ?? resource.amount, String(resource.currency ?? "VND"))} />
        <Fact label="Địa chỉ giao" value={optionalText(resource.delivery_address ?? resource.address)} />
      </DetailSection>
      <FoodTrackingPanel orderId={id} />
    </section>
  );
  if (type === "restaurant_reservation") {
    const point = pointFrom(resource.latitude, resource.longitude) ?? nestedPoint(resource.restaurant, "location");
    return (
      <section className="flex flex-col gap-6">
        <Image source={resource.image_url ?? nestedValue(resource.restaurant, "image_url")} alt="Nhà hàng" />
        <DetailSection title="Thông tin đặt bàn">
          <Fact label="Nhà hàng" value={nestedName(resource.restaurant) || optionalText(resource.name)} />
          <Fact label="Địa chỉ" value={optionalText(resource.address ?? resource.location)} />
          <Fact label="Thời gian" value={formatDateTime(resource.start_at ?? resource.reservation_time)} />
          <Fact label="Số khách" value={resource.party_size ? `${String(resource.party_size)} người` : "Đang cập nhật"} />
          <Fact label="Trạng thái" value={statusLabel(resource.status)} />
        </DetailSection>
        {point ? (
          <div className="h-[250px] w-full rounded-3xl overflow-hidden border border-slate-200/60 shadow-sm relative">
            <XOneMap restaurant={point} label="Vị trí nhà hàng" />
          </div>
        ) : null}
      </section>
    );
  }
  const point = pointFrom(resource.latitude, resource.longitude) ?? nestedPoint(resource.facility, "location");
  return (
    <section className="flex flex-col gap-6">
      <Image source={resource.image_url ?? nestedValue(resource.facility, "image_url")} alt="Cơ sở y tế" />
      <DetailSection title="Thông tin lịch khám">
        <Fact label="Cơ sở" value={nestedName(resource.facility) || optionalText(resource.facility_name)} />
        <Fact label="Địa chỉ" value={optionalText(resource.address ?? nestedValue(resource.facility, "address"))} />
        <Fact label="Chuyên khoa" value={optionalText(resource.department)} />
        <Fact label="Bác sĩ" value={optionalText(resource.doctor_name ?? resource.doctor)} />
        <Fact label="Người khám" value={optionalText(resource.patient_name)} />
        <Fact label="Thời gian" value={formatDateTime(resource.start_time ?? resource.appointment_time)} />
        <Fact label="Chi phí" value={formatMoney(resource.price ?? resource.amount, String(resource.currency ?? "VND"))} />
      </DetailSection>
      {point ? (
        <div className="h-[250px] w-full rounded-3xl overflow-hidden border border-slate-200/60 shadow-sm relative">
          <XOneMap healthcare={point} label="Vị trí cơ sở y tế" />
        </div>
      ) : null}
    </section>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) { 
  return (
    <section className="bg-white rounded-3xl border border-slate-200/60 p-6 md:p-8 shadow-sm flex flex-col gap-5">
      <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">{title}</h2>
      <div className="flex flex-col gap-4">
        {children}
      </div>
    </section>
  ); 
}

function Fact({ label, value }: { label: string; value: string }) { 
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4 py-1">
      <span className="text-sm font-bold text-slate-500 whitespace-nowrap">{label}</span>
      <strong className="text-sm font-bold text-slate-900 text-left sm:text-right">{value}</strong>
    </div>
  ); 
}

function Image({ source, alt }: { source: unknown; alt: string }) { 
  const [failed, setFailed] = useState(false); 
  const url = typeof source === "string" && source.trim() ? source : ""; 
  return url && !failed ? (
    <img className="w-full h-[200px] object-cover rounded-3xl border border-slate-200/60 shadow-sm bg-slate-50" src={url} alt={alt} onError={() => setFailed(true)} />
  ) : (
    <div className="w-full h-[200px] rounded-3xl border border-slate-200/60 shadow-sm bg-slate-50 flex items-center justify-center text-sm font-bold text-slate-400" role="img" aria-label={`${alt}: ảnh không khả dụng`}>
      Ảnh không khả dụng
    </div>
  ); 
}

function PaymentSummary({ payment }: { payment: Record<string, unknown> }) { 
  return (
    <section className="bg-blue-50/50 rounded-3xl border border-blue-100 p-6 shadow-sm flex flex-col gap-4" aria-labelledby="payment-summary-title">
      <div className="flex items-center justify-between border-b border-blue-200/50 pb-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">THANH TOÁN</span>
          <h2 id="payment-summary-title" className="text-xl font-bold text-blue-950 tracking-tight">{formatMoney(payment.amount, String(payment.currency ?? "VND"))}</h2>
        </div>
        <span className="px-2.5 py-1 bg-white border border-blue-200 text-blue-700 text-xs font-bold uppercase tracking-wider rounded-lg shadow-sm">
          {statusLabel(payment.status)}
        </span>
      </div>
      <dl className="flex flex-col gap-3 text-sm">
        <div className="flex items-baseline justify-between">
          <dt className="font-bold text-blue-800/70">Phương thức</dt>
          <dd className="font-bold text-blue-950">{optionalText(payment.method)}</dd>
        </div>
        {payment.paid_at ? (
          <div className="flex items-baseline justify-between">
            <dt className="font-bold text-blue-800/70">Đã thanh toán</dt>
            <dd className="font-bold text-blue-950">{formatDateTime(payment.paid_at)}</dd>
          </div>
        ) : null}
      </dl>
      {payment.status === "SUCCEEDED" ? <p className="text-xs font-bold text-blue-600 mt-1">Thanh toán đã thành công.</p> : null}
    </section>
  ); 
}

function minutesText(value: unknown, route: unknown): string { const direct = Number(value); const seconds = isRecord(route) ? Number(route.duration_seconds) : NaN; const minutes = Number.isFinite(direct) ? direct : Number.isFinite(seconds) ? Math.ceil(seconds / 60) : NaN; return Number.isFinite(minutes) ? `${minutes} phút` : "Đang cập nhật"; }
function distanceText(value: unknown, route: unknown): string { const direct = Number(value); const meters = isRecord(route) ? Number(route.distance_meters) : NaN; const km = Number.isFinite(direct) ? direct : Number.isFinite(meters) ? meters / 1000 : NaN; return Number.isFinite(km) ? `${km.toFixed(1)} km` : "Đang cập nhật"; }
function driverText(value: unknown): string { return isRecord(value) ? optionalText(value.name ?? value.full_name, "Tài xế đang cập nhật") : "Tài xế đang cập nhật"; }
function nestedName(value: unknown): string { return isRecord(value) ? optionalText(value.name ?? value.title, "") : typeof value === "string" ? value : ""; }
function nestedValue(value: unknown, key: string): unknown { return isRecord(value) ? value[key] : undefined; }
function itemsSummary(value: unknown): string { if (!Array.isArray(value)) return "Món đang cập nhật"; return value.map((item) => isRecord(item) ? `${optionalText(item.name ?? item.title, "Món ăn")} × ${String(item.quantity ?? 1)}` : "Món ăn").join(", "); }
function pointFrom(latitude: unknown, longitude: unknown): XOnePoint | undefined { const lat = Number(latitude); const lng = Number(longitude); return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { latitude: lat, longitude: lng } : undefined; }
function nestedPoint(value: unknown, key: string): XOnePoint | undefined { if (!isRecord(value) || !isRecord(value[key]) || value[key].suspicious === true) return undefined; return pointFrom(value[key].latitude, value[key].longitude); }
function routeFrom(value: unknown): XOnePoint[] | undefined { const geometry = isRecord(value) ? value.geometry : value; if (!Array.isArray(geometry)) return undefined; const points = geometry.map((point) => isRecord(point) ? pointFrom(point.latitude, point.longitude) : undefined).filter((point): point is XOnePoint => Boolean(point)); return points.length > 1 ? points : undefined; }

function FeedbackForm({ rating, comment, existing, pending, onRating, onComment, onSubmit }: { rating: number; comment: string; existing?: FeedbackItem; pending: boolean; onRating: (value: number) => void; onComment: (value: string) => void; onSubmit: () => void }) { 
  return (
    <section className="bg-amber-50/50 rounded-3xl border border-amber-100 p-6 shadow-sm flex flex-col gap-5 mt-4" aria-labelledby="feedback-title">
      <div className="flex items-center gap-3 border-b border-amber-100/50 pb-4">
        <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center">
          <Star size={20} />
        </div>
        <div>
          <h2 id="feedback-title" className="text-lg font-bold text-amber-950 leading-tight">{existing ? "Sửa đánh giá" : "Đánh giá trải nghiệm"}</h2>
          <p className="text-xs font-medium text-amber-800/70 mt-0.5">Đánh giá dịch vụ bạn vừa dùng.</p>
        </div>
      </div>
      <div className="flex items-center gap-2" role="radiogroup" aria-label="Chọn số sao">
        {[1, 2, 3, 4, 5].map((value) => (
          <button key={value} className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${value <= rating ? "text-amber-500 hover:scale-110 active:scale-95" : "text-amber-200 hover:text-amber-300 hover:scale-110"}`} type="button" role="radio" aria-checked={value === rating} aria-label={`${value} sao`} onClick={() => onRating(value)}>
            <Star size={32} fill={value <= rating ? "currentColor" : "none"} strokeWidth={1.5} />
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-amber-900">Nhận xét</span>
        <textarea className="w-full px-4 py-3 bg-white border border-amber-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-400/20 focus:border-amber-400 transition-all placeholder:text-amber-300 resize-y min-h-[80px]" value={comment} onChange={(event) => onComment(event.target.value)} maxLength={1000} rows={3} placeholder="Điều gì hữu ích hoặc cần cải thiện?" />
      </label>
      <div className="flex justify-end pt-2">
        <button className="px-6 py-2.5 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600 active:scale-95 transition-all shadow-sm shadow-amber-500/20 disabled:opacity-50 flex items-center gap-2" type="button" disabled={pending || rating < 1} onClick={onSubmit}>
          <Send size={15} />
          Lưu đánh giá
        </button>
      </div>
    </section>
  ); 
}
function domainFor(type: HistoryType): "food" | "ride" | "restaurant" | "healthcare" { return type === "food_order" ? "food" : type === "ride_booking" ? "ride" : type === "restaurant_reservation" ? "restaurant" : "healthcare"; }
function canRateStatus(status: string, type: HistoryType): boolean { const value = status.toUpperCase(); return type === "ride_booking" ? value === "COMPLETED" : type === "food_order" ? ["DELIVERED", "COMPLETED", "FULFILLED"].includes(value) : ["CONFIRMED", "COMPLETED", "PAYMENT_CONFIRMED", "SEATED"].includes(value); }
function reorderMessage(type: HistoryType, result: Record<string, unknown>): string { if (type === "food_order") { const unavailable = Array.isArray(result.unavailable_items) ? result.unavailable_items.length : 0; return `Giỏ mới đã được chuẩn bị. Giá và món đã được kiểm tra lại${unavailable ? `; ${unavailable} món không còn phục vụ.` : "."}`; } if (type === "ride_booking") return "Báo giá mới đã được tính theo lộ trình hiện tại. Bạn hãy xem lại và xác nhận chuyến."; if (type === "restaurant_reservation") return "Khung giờ mới đã được kiểm tra. Bạn hãy chọn giờ và giữ bàn ở bước tiếp theo."; return "Thông tin cơ sở và bác sĩ đã được làm mới. Bạn hãy chọn một khung giờ hiện tại."; }
