"use client";

import Link from "next/link";
import { ArrowLeft, LifeBuoy, RefreshCw, RotateCcw, Send, Star, XCircle } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { errorText, getHistoryDetail, listMyFeedback, prepareFoodReorder, prepareHealthcareRebook, prepareRestaurantRebook, prepareRideRebook, submitFeedback } from "@/lib/api-client";
import { canRateStatus, executeServiceCancellation, isCancellableStatus } from "@/lib/cancellation-helpers";
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
  const canRate = canRateStatus(String(resource?.status ?? ""), type, resource);
  const canCancel = isCancellableStatus(type, String(resource?.status ?? ""));
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  async function handleCancel(): Promise<void> {
    setActionPending(true); setActionMessage(""); setError("");
    try {
      const cancelResult = await executeServiceCancellation(type, resource ?? id);
      const newStatus = String(cancelResult.status ?? "CANCELLED");
      setResource((prev) => prev ? { ...prev, status: newStatus } : { status: newStatus });
      setActionMessage(cancelSuccessMessage(type));
      setShowCancelConfirm(false);
      window.dispatchEvent(new CustomEvent("xone-active-work-changed"));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setActionPending(false);
    }
  }

  return <section className="route-shell history-detail-page" aria-labelledby="history-detail-title"><Link className="text-link" href="/app/history"><ArrowLeft size={16} /> Quay lại lịch sử</Link><header className="section-heading history-detail-heading"><div><span className="eyebrow">CHI TIẾT DỊCH VỤ</span><h1 id="history-detail-title">{title}</h1><p>{statusLabel(resource?.status)}</p></div><button className="icon-button" type="button" onClick={() => void load()} aria-label="Tải lại chi tiết"><RefreshCw size={18} /></button></header>{loading ? <p className="inline-note" aria-live="polite">Đang tải chi tiết…</p> : error && !resource ? <div className="error-panel" role="alert"><p>{error}</p><button className="button button-secondary" type="button" onClick={() => void load()}>Thử lại</button></div> : <><PurposeBuiltDetail type={type} resource={resource ?? {}} id={id} />{payment ? <PaymentSummary payment={payment} /> : null}<section className="history-actions" aria-label="Thao tác giao dịch"><button className="button button-secondary" type="button" onClick={() => void reorder()} disabled={actionPending}><RotateCcw size={16} />{actionPending ? "Đang chuẩn bị…" : type === "ride_booking" ? "Đặt xe lại" : type === "restaurant_reservation" ? "Đặt bàn lại" : type === "healthcare_appointment" ? "Đặt lịch lại" : "Đặt lại"}</button>{canCancel ? <button className="button button-secondary danger" type="button" onClick={() => setShowCancelConfirm(true)} disabled={actionPending}><XCircle size={16} /> Hủy dịch vụ</button> : null}<Link className="button button-secondary" href={`/app/support?resource_type=${encodeURIComponent(type)}&resource_id=${encodeURIComponent(id)}`}><LifeBuoy size={16} /> Liên hệ hỗ trợ</Link></section>{showCancelConfirm ? <div className="confirmation-box cancel-confirmation-box" role="dialog" aria-label="Xác nhận hủy dịch vụ"><div><span className="eyebrow">XÁC NHẬN HỦY</span><h3>Xác nhận hủy {title.toLowerCase()} này?</h3><p>Sau khi hủy, yêu cầu sẽ được chuyển sang trạng thái Đã hủy và không thể hoàn tác.</p></div><div className="button-group"><button className="button button-danger" type="button" onClick={() => void handleCancel()} disabled={actionPending}>{actionPending ? "Đang hủy…" : "Xác nhận hủy"}</button><button className="button button-secondary" type="button" onClick={() => setShowCancelConfirm(false)} disabled={actionPending}>Bỏ qua</button></div></div> : null}{actionMessage ? <p className="success-note" role="status">{actionMessage}</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}{canRate ? <FeedbackForm rating={rating} comment={comment} existing={feedback} pending={actionPending} onRating={setRating} onComment={setComment} onSubmit={() => void rate()} /> : canCancel ? <p className="inline-note rating-unavailable-note">Đánh giá trải nghiệm sẽ khả dụng sau khi dịch vụ hoàn thành.</p> : null}</>}</section>;
}

function PurposeBuiltDetail({ type, resource, id }: { type: HistoryType; resource: Record<string, unknown>; id: string }) {
  if (type === "ride_booking") {
    const origin = pointFrom(resource.pickup_latitude, resource.pickup_longitude) ?? nestedPoint(resource.route, "origin");
    const destination = pointFrom(resource.dropoff_latitude, resource.dropoff_longitude) ?? nestedPoint(resource.route, "destination");
    return <section className="history-purpose-detail"><DetailSection title="Hành trình"><Fact label="Điểm đón" value={optionalText(resource.pickup_address ?? resource.pickup)} /><Fact label="Điểm đến" value={optionalText(resource.dropoff_address ?? resource.dropoff)} /><Fact label="Khoảng cách" value={distanceText(resource.distance_km, resource.route)} /><Fact label="Thời gian" value={minutesText(resource.duration_minutes, resource.route)} /><Fact label="Loại xe" value={optionalText(resource.vehicle_type ?? resource.vehicle)} /><Fact label="Giá chuyến" value={formatMoney(resource.amount ?? resource.fare, String(resource.currency ?? "VND"))} /><Fact label="Tài xế" value={driverText(resource.driver)} /></DetailSection>{origin || destination ? <XOneMap origin={origin} destination={destination} routeGeometry={routeFrom(resource.route)} routePolyline={typeof resource.route_polyline === "string" ? resource.route_polyline : undefined} label="Bản đồ hành trình" /> : null}<RideTrackingPanel bookingId={id} /></section>;
  }
  if (type === "food_order") return <section className="history-purpose-detail"><Image source={resource.image_url ?? nestedValue(resource.restaurant, "image_url")} alt="Đơn đồ ăn" /><DetailSection title="Đơn đồ ăn"><Fact label="Nhà hàng" value={nestedName(resource.restaurant) || optionalText(resource.restaurant_name)} /><Fact label="Món đã chọn" value={itemsSummary(resource.items)} /><Fact label="Tổng cộng" value={formatMoney(resource.total ?? resource.amount, String(resource.currency ?? "VND"))} /><Fact label="Địa chỉ giao" value={optionalText(resource.delivery_address ?? resource.address)} /></DetailSection><FoodTrackingPanel orderId={id} /></section>;
  if (type === "restaurant_reservation") {
    const point = pointFrom(resource.latitude, resource.longitude) ?? nestedPoint(resource.restaurant, "location");
    return <section className="history-purpose-detail"><Image source={resource.image_url ?? nestedValue(resource.restaurant, "image_url")} alt="Nhà hàng" /><DetailSection title="Thông tin đặt bàn"><Fact label="Nhà hàng" value={nestedName(resource.restaurant) || optionalText(resource.name)} /><Fact label="Địa chỉ" value={optionalText(resource.address ?? resource.location)} /><Fact label="Thời gian" value={formatDateTime(resource.start_at ?? resource.reservation_time)} /><Fact label="Số khách" value={resource.party_size ? `${String(resource.party_size)} người` : "Đang cập nhật"} /><Fact label="Trạng thái" value={statusLabel(resource.status)} /></DetailSection>{point ? <XOneMap restaurant={point} label="Vị trí nhà hàng" /> : null}</section>;
  }
  const point = pointFrom(resource.latitude, resource.longitude) ?? nestedPoint(resource.facility, "location");
  return <section className="history-purpose-detail"><Image source={resource.image_url ?? nestedValue(resource.facility, "image_url")} alt="Cơ sở y tế" /><DetailSection title="Thông tin lịch khám"><Fact label="Cơ sở" value={nestedName(resource.facility) || optionalText(resource.facility_name)} /><Fact label="Địa chỉ" value={optionalText(resource.address ?? nestedValue(resource.facility, "address"))} /><Fact label="Chuyên khoa" value={optionalText(resource.department)} /><Fact label="Bác sĩ" value={optionalText(resource.doctor_name ?? resource.doctor)} /><Fact label="Người khám" value={optionalText(resource.patient_name)} /><Fact label="Thời gian" value={formatDateTime(resource.start_time ?? resource.appointment_time)} /><Fact label="Chi phí" value={formatMoney(resource.price ?? resource.amount, String(resource.currency ?? "VND"))} /></DetailSection>{point ? <XOneMap healthcare={point} label="Vị trí cơ sở y tế" /> : null}</section>;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) { return <section className="history-detail-section"><h2>{title}</h2><div className="consumer-detail-grid">{children}</div></section>; }
function Fact({ label, value }: { label: string; value: string }) { return <div className="consumer-detail-fact"><span>{label}</span><strong>{value}</strong></div>; }
function Image({ source, alt }: { source: unknown; alt: string }) { const [failed, setFailed] = useState(false); const url = typeof source === "string" && source.trim() ? source : ""; return url && !failed ? <img className="history-detail-image" src={url} alt={alt} onError={() => setFailed(true)} /> : <div className="history-detail-image service-image-fallback" role="img" aria-label={`${alt}: ảnh không khả dụng`}>Ảnh không khả dụng</div>; }
function PaymentSummary({ payment }: { payment: Record<string, unknown> }) { return <section className="payment-summary" aria-labelledby="payment-summary-title"><div className="payment-summary-heading"><div><span className="eyebrow">THANH TOÁN</span><h2 id="payment-summary-title">{formatMoney(payment.amount, String(payment.currency ?? "VND"))}</h2></div><span className="status-badge">{statusLabel(payment.status)}</span></div><dl><div><dt>Phương thức</dt><dd>{optionalText(payment.method)}</dd></div>{payment.paid_at ? <div><dt>Đã thanh toán</dt><dd>{formatDateTime(payment.paid_at)}</dd></div> : null}</dl>{payment.status === "SUCCEEDED" ? <p className="inline-note">Thanh toán đã thành công.</p> : null}</section>; }
function minutesText(value: unknown, route: unknown): string { const direct = Number(value); const seconds = isRecord(route) ? Number(route.duration_seconds) : NaN; const minutes = Number.isFinite(direct) ? direct : Number.isFinite(seconds) ? Math.ceil(seconds / 60) : NaN; return Number.isFinite(minutes) ? `${minutes} phút` : "Đang cập nhật"; }
function distanceText(value: unknown, route: unknown): string { const direct = Number(value); const meters = isRecord(route) ? Number(route.distance_meters) : NaN; const km = Number.isFinite(direct) ? direct : Number.isFinite(meters) ? meters / 1000 : NaN; return Number.isFinite(km) ? `${km.toFixed(1)} km` : "Đang cập nhật"; }
function driverText(value: unknown): string { return isRecord(value) ? optionalText(value.name ?? value.full_name, "Tài xế đang cập nhật") : "Tài xế đang cập nhật"; }
function nestedName(value: unknown): string { return isRecord(value) ? optionalText(value.name ?? value.title, "") : typeof value === "string" ? value : ""; }
function nestedValue(value: unknown, key: string): unknown { return isRecord(value) ? value[key] : undefined; }
function itemsSummary(value: unknown): string { if (!Array.isArray(value)) return "Món đang cập nhật"; return value.map((item) => isRecord(item) ? `${optionalText(item.name ?? item.title, "Món ăn")} × ${String(item.quantity ?? 1)}` : "Món ăn").join(", "); }
function pointFrom(latitude: unknown, longitude: unknown): XOnePoint | undefined { const lat = Number(latitude); const lng = Number(longitude); return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { latitude: lat, longitude: lng } : undefined; }
function nestedPoint(value: unknown, key: string): XOnePoint | undefined { if (!isRecord(value) || !isRecord(value[key]) || value[key].suspicious === true) return undefined; return pointFrom(value[key].latitude, value[key].longitude); }
function routeFrom(value: unknown): XOnePoint[] | undefined { const geometry = isRecord(value) ? value.geometry : value; if (!Array.isArray(geometry)) return undefined; const points = geometry.map((point) => isRecord(point) ? pointFrom(point.latitude, point.longitude) : undefined).filter((point): point is XOnePoint => Boolean(point)); return points.length > 1 ? points : undefined; }
function FeedbackForm({ rating, comment, existing, pending, onRating, onComment, onSubmit }: { rating: number; comment: string; existing?: FeedbackItem; pending: boolean; onRating: (value: number) => void; onComment: (value: string) => void; onSubmit: () => void }) { return <section className="feedback-card" aria-labelledby="feedback-title"><div className="settings-card-title"><Star size={18} /><div><h2 id="feedback-title">{existing ? "Sửa đánh giá" : "Đánh giá trải nghiệm"}</h2><p>Đánh giá dịch vụ bạn vừa dùng.</p></div></div><div className="rating-picker" role="radiogroup" aria-label="Chọn số sao">{[1, 2, 3, 4, 5].map((value) => <button key={value} className={value <= rating ? "is-selected" : ""} type="button" role="radio" aria-checked={value === rating} aria-label={`${value} sao`} onClick={() => onRating(value)}><Star size={20} fill={value <= rating ? "currentColor" : "none"} /></button>)}</div><label className="feedback-comment">Nhận xét<textarea value={comment} onChange={(event) => onComment(event.target.value)} maxLength={1000} rows={3} placeholder="Điều gì hữu ích hoặc cần cải thiện?" /></label><button className="button button-primary" type="button" disabled={pending || rating < 1} onClick={onSubmit}><Send size={15} /> Lưu đánh giá</button></section>; }
function cancelSuccessMessage(type: HistoryType): string {
  if (type === "restaurant_reservation") return "Đặt bàn đã được hủy thành công.";
  if (type === "healthcare_appointment") return "Lịch khám đã được hủy thành công.";
  if (type === "ride_booking") return "Chuyến xe đã được hủy thành công.";
  return "Đơn hàng đã được hủy thành công.";
}
function domainFor(type: HistoryType): "food" | "ride" | "restaurant" | "healthcare" { return type === "food_order" ? "food" : type === "ride_booking" ? "ride" : type === "restaurant_reservation" ? "restaurant" : "healthcare"; }
function reorderMessage(type: HistoryType, result: Record<string, unknown>): string { if (type === "food_order") { const unavailable = Array.isArray(result.unavailable_items) ? result.unavailable_items.length : 0; return `Giỏ mới đã được chuẩn bị. Giá và món đã được kiểm tra lại${unavailable ? `; ${unavailable} món không còn phục vụ.` : "."}`; } if (type === "ride_booking") return "Báo giá mới đã được tính theo lộ trình hiện tại. Bạn hãy xem lại và xác nhận chuyến."; if (type === "restaurant_reservation") return "Khung giờ mới đã được kiểm tra. Bạn hãy chọn giờ và giữ bàn ở bước tiếp theo."; return "Thông tin cơ sở và bác sĩ đã được làm mới. Bạn hãy chọn một khung giờ hiện tại."; }
