"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Bike, HeartPulse, Loader2, MapPinned, Search, Utensils } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { browseService, createRideQuote, errorText } from "@/lib/api-client";
import type { RideQuote, ServiceKey } from "@/types";
import { XOneMap } from "@/features/product/xone-map";

const copy: Record<ServiceKey, { label: string; description: string }> = {
  food: { label: "Đồ ăn", description: "Tìm nhà hàng và món đang có trong nguồn dữ liệu hiện tại." },
  ride: { label: "Chuyến xe", description: "Nhập điểm đi và điểm đến để nhận một báo giá có phiên bản tariff rõ ràng." },
  restaurant: { label: "Nhà hàng", description: "Tìm địa điểm, xem thông tin và tiếp tục sang luồng giữ bàn." },
  healthcare: { label: "Lịch khám", description: "Bắt đầu từ chuyên khoa được Healthcare Service công bố." },
};
const icons = { food: Utensils, ride: Bike, restaurant: MapPinned, healthcare: HeartPulse };

export function ServiceBrowse({ service }: { service: ServiceKey }) {
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(service !== "ride");
  const [error, setError] = useState("");
  const [quote, setQuote] = useState<RideQuote>();
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [vehicle, setVehicle] = useState<"BIKE" | "CAR_4" | "CAR_7">("CAR_4");

  const load = useCallback(async (query = "") => {
    if (service === "ride") return;
    setLoading(true); setError("");
    try { const result = await browseService(service, query); setItems(result.items); setSource(result.source); }
    catch (reason) { setError(errorText(reason)); }
    finally { setLoading(false); }
  }, [service]);
  useEffect(() => { void load(); }, [load]);

  async function submitQuote(): Promise<void> {
    if (!pickup.trim() || !dropoff.trim() || loading) return;
    setLoading(true); setError("");
    try { setQuote(await createRideQuote({ pickup_address: pickup.trim(), dropoff_address: dropoff.trim(), vehicle_type: vehicle })); }
    catch (reason) { setError(errorText(reason)); }
    finally { setLoading(false); }
  }

  const Icon = icons[service];
  return <section className="service-browse" aria-labelledby="service-browse-title"><div className="service-browse-top"><Link className="text-link" href="/app/services"><ArrowLeft size={16} /> Dịch vụ</Link><Link className="text-link" href={`/app?service=${service}&mode=assistant`}>Tiếp tục với AI <ArrowRight size={16} /></Link></div><header className="service-browse-heading"><span className="service-browse-icon"><Icon size={22} /></span><div><span className="eyebrow">{service.toUpperCase()}</span><h1 id="service-browse-title">{copy[service].label}</h1><p>{copy[service].description}</p></div></header>{service === "ride" ? <RideForm pickup={pickup} dropoff={dropoff} vehicle={vehicle} loading={loading} error={error} quote={quote} setPickup={setPickup} setDropoff={setDropoff} setVehicle={setVehicle} submit={() => void submitQuote()} /> : <><form className="service-search" onSubmit={(event) => { event.preventDefault(); void load(keyword); }}><label htmlFor="service-search-input">Tìm trong nguồn hiện tại</label><div><input id="service-search-input" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={service === "healthcare" ? "Ví dụ: nội thần kinh" : "Tên, khu vực hoặc từ khóa"} /><button className="button button-primary" type="submit" disabled={loading}><Search size={16} /> Tìm</button></div></form>{loading ? <p className="inline-note" aria-live="polite">Đang tải dữ liệu thật từ {source || "domain service"}…</p> : error ? <div className="error-panel" role="alert"><p>{error}</p><button className="button button-secondary" type="button" onClick={() => void load(keyword)}>Thử lại</button></div> : items.length === 0 ? <div className="empty-state"><Search size={24} /><h2>Chưa có kết quả</h2><p>Thử từ khóa khác hoặc tiếp tục với AI để mô tả nhu cầu bằng ngôn ngữ tự nhiên.</p></div> : <div className="browse-results">{items.map((item, index) => <ResultRow key={String(item.id ?? item.name ?? item.title ?? index)} item={item} />)}</div>}</>}</section>;
}

function RideForm({ pickup, dropoff, vehicle, loading, error, quote, setPickup, setDropoff, setVehicle, submit }: { pickup: string; dropoff: string; vehicle: "BIKE" | "CAR_4" | "CAR_7"; loading: boolean; error: string; quote?: RideQuote; setPickup: (value: string) => void; setDropoff: (value: string) => void; setVehicle: (value: "BIKE" | "CAR_4" | "CAR_7") => void; submit: () => void }) {
  return <div className="ride-browse-flow"><form className="ride-form" onSubmit={(event) => { event.preventDefault(); submit(); }}><label htmlFor="ride-pickup">Điểm đi</label><input id="ride-pickup" value={pickup} onChange={(event) => setPickup(event.target.value)} placeholder="Địa chỉ đón" required minLength={3} /><label htmlFor="ride-dropoff">Điểm đến</label><input id="ride-dropoff" value={dropoff} onChange={(event) => setDropoff(event.target.value)} placeholder="Địa chỉ đến" required minLength={3} /><label htmlFor="ride-vehicle">Loại xe</label><select id="ride-vehicle" value={vehicle} onChange={(event) => setVehicle(event.target.value as typeof vehicle)}><option value="BIKE">Xe máy</option><option value="CAR_4">Ô tô 4 chỗ</option><option value="CAR_7">Ô tô 7 chỗ</option></select>{error ? <p className="form-error" role="alert">{error}</p> : null}<button className="button button-primary button-wide" type="submit" disabled={loading || !pickup.trim() || !dropoff.trim()}>{loading ? <Loader2 className="spinner" size={16} /> : <MapPinned size={16} />}{loading ? "Đang tính lộ trình…" : "Nhận báo giá"}</button></form>{quote ? <article className="quote-result" aria-live="polite"><div className="quote-result-heading"><div><span className="eyebrow">BÁO GIÁ {quote.tariff_version}</span><h2>{formatMoney(quote.amount, quote.currency)}</h2></div><span className="status-badge">Còn hiệu lực</span></div><dl><div><dt>Lộ trình</dt><dd>{quote.distance_km} km · khoảng {quote.duration_minutes} phút</dd></div><div><dt>Loại xe</dt><dd>{vehicleLabel(quote.vehicle_type)}</dd></div><div><dt>Nguồn route</dt><dd>{quote.route_provider ?? "deterministic"}</dd></div></dl><XOneMap origin={quote.pickup_latitude && quote.pickup_longitude ? { latitude: quote.pickup_latitude, longitude: quote.pickup_longitude } : undefined} destination={quote.dropoff_latitude && quote.dropoff_longitude ? { latitude: quote.dropoff_latitude, longitude: quote.dropoff_longitude } : undefined} label="Lộ trình báo giá" /><p className="inline-note">Báo giá chỉ là bước xem trước. X-One sẽ yêu cầu xác nhận rõ ràng trước khi tạo booking.</p></article> : <div className="quote-result quote-empty"><MapPinned size={22} /><p>Nhập hai điểm để xem khoảng cách, ETA và phiên bản tariff từ Ride Service.</p></div>}</div>;
}

function ResultRow({ item }: { item: Record<string, unknown> }) { const name = String(item.name ?? item.title ?? item.label ?? item.id ?? "Kết quả"); const detail = String(item.address ?? item.description ?? item.location ?? item.department ?? item.cuisine ?? "Thông tin từ domain service"); const status = item.status ? String(item.status) : ""; return <article className="browse-result"><div><h2>{name}</h2><p>{detail}</p>{status ? <small>{status}</small> : null}</div><span className="result-arrow" aria-hidden="true">→</span></article>; }
function formatMoney(amount: number, currency: string): string { return new Intl.NumberFormat("vi-VN", { style: "currency", currency: currency || "VND", maximumFractionDigits: 0 }).format(amount); }
function vehicleLabel(value: string): string { return ({ BIKE: "Xe máy", CAR_4: "Ô tô 4 chỗ", CAR_7: "Ô tô 7 chỗ" } as Record<string, string>)[value] ?? value; }
