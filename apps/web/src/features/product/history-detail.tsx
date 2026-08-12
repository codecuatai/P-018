"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { errorText, getHistoryDetail } from "@/lib/api-client";
import type { HistoryType } from "@/types";

import { RideTrackingPanel } from "./ride-tracking";

export function HistoryDetail({ type, id }: { type: HistoryType; id: string }) {
  const [resource, setResource] = useState<Record<string, unknown>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setResource(await getHistoryDetail(type, id)); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }, [id, type]);
  useEffect(() => { void load(); }, [load]);
  const title = ({ food_order: "Đơn đồ ăn", ride_booking: "Chuyến xe", restaurant_reservation: "Đặt bàn", healthcare_appointment: "Lịch khám" } as Record<HistoryType, string>)[type];
  const payment = isRecord(resource?.payment) ? resource.payment : undefined;
  return <section className="route-shell" aria-labelledby="history-detail-title"><Link className="text-link" href="/app/history"><ArrowLeft size={16} /> Quay lại lịch sử</Link><header className="section-heading history-detail-heading"><div><span className="eyebrow">{type.replaceAll("_", " ").toUpperCase()}</span><h1 id="history-detail-title">{title}</h1><p>Mã tham chiếu: <code>{id}</code></p></div><button className="icon-button" type="button" onClick={() => void load()} aria-label="Tải lại chi tiết"><RefreshCw size={18} /></button></header>{loading ? <p className="inline-note" aria-live="polite">Đang tải chi tiết…</p> : error ? <div className="error-panel" role="alert"><p>{error}</p><button className="button button-secondary" type="button" onClick={() => void load()}>Thử lại</button></div> : <><dl className="history-detail-list">{Object.entries(resource ?? {}).filter(([key]) => key !== "payment" && !/(^|_)(id|hash|version)$/i.test(key) && typeof resource?.[key] !== "object").map(([key, value]) => <div key={key}><dt>{labelFor(key)}</dt><dd>{String(value ?? "—")}</dd></div>)}</dl>{payment ? <PaymentSummary payment={payment} /> : null}{type === "ride_booking" ? <RideTrackingPanel bookingId={id} /> : null}</>}</section>;
}

function PaymentSummary({ payment }: { payment: Record<string, unknown> }) {
  const receipt = isRecord(payment.receipt) ? payment.receipt : undefined;
  const refunds = Array.isArray(payment.refunds) ? payment.refunds.filter(isRecord) : [];
  return <section className="payment-summary" aria-labelledby="payment-summary-title"><div className="payment-summary-heading"><div><span className="eyebrow">THANH TOÁN</span><h2 id="payment-summary-title">{formatMoney(payment.amount, payment.currency)}</h2></div><span className="status-badge">{String(payment.status ?? "UNKNOWN")}</span></div><dl><div><dt>Phương thức</dt><dd>{String(payment.method ?? "—")}</dd></div>{payment.paid_at ? <div><dt>Đã thanh toán</dt><dd>{String(payment.paid_at)}</dd></div> : null}{payment.receipt_id ? <div><dt>Hóa đơn</dt><dd>{String(payment.receipt_id)}</dd></div> : null}</dl>{receipt ? <p className="inline-note">Hóa đơn đã sẵn sàng trong Core: {String(receipt.receipt_id ?? payment.receipt_id ?? "đã phát hành")}.</p> : payment.status === "SUCCEEDED" ? <p className="inline-note">Thanh toán đã thành công; hóa đơn đang được đồng bộ.</p> : null}{refunds.length ? <div className="payment-refunds"><strong>Hoàn tiền</strong>{refunds.map((refund) => <span key={String(refund.id)}>{String(refund.status)} · {formatMoney(refund.amount, refund.currency)}</span>)}</div> : null}</section>;
}

function formatMoney(amount: unknown, currency: unknown): string { const value = typeof amount === "number" ? amount : Number(amount); return Number.isFinite(value) ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: typeof currency === "string" ? currency : "VND", maximumFractionDigits: 0 }).format(value) : "Chưa có số tiền"; }
function labelFor(value: string): string { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
