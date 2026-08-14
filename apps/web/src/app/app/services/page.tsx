"use client";

import { Activity, ArrowRight, Bike, HeartPulse, RefreshCw, Utensils } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { errorText, listServiceCatalog } from "@/lib/api-client";
import type { ServiceCatalog, ServiceCatalogEntry } from "@/types";

const icons = { food: Utensils, ride: Bike, restaurant: Activity, healthcare: HeartPulse };
const accents = { food: "service-card-food", ride: "service-card-ride", restaurant: "service-card-restaurant", healthcare: "service-card-healthcare" };

export default function ServicesPage() {
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setCatalog(await listServiceCatalog()); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);

  return <section className="service-hub" aria-labelledby="services-title"><header className="section-heading"><div><span className="eyebrow">DỊCH VỤ</span><h1 id="services-title">Bốn cách để tiếp tục một việc đang dang dở</h1><p>Danh mục được cập nhật từ các dịch vụ hiện có. Khi thông tin tạm gián đoạn, X-One nói rõ để bạn chủ động thử lại.</p></div><button className="icon-button" type="button" onClick={() => void load()} aria-label="Tải lại dịch vụ"><RefreshCw size={18} /></button></header>{loading ? <div className="service-loading" aria-live="polite"><span className="loading-mark" /><p>Đang kiểm tra các dịch vụ…</p></div> : error ? <div className="error-panel" role="alert"><p>{error}</p><button className="button button-secondary" type="button" onClick={() => void load()}>Thử lại</button></div> : catalog ? <div className="service-grid">{catalog.items.map((service) => <ServiceCard key={service.id} service={service} />)}</div> : null}<p className="inline-note">Kiểm tra gần nhất: {catalog ? new Date(catalog.checked_at).toLocaleString("vi-VN") : "chưa có"}</p></section>;
}

function ServiceCard({ service }: { service: ServiceCatalogEntry }) {
  const Icon = icons[service.id];
  const itemNames = service.items.slice(0, 3).map((item) => String(item.name ?? item.title ?? item.description ?? "")).filter(Boolean);
  return <article className={`service-card ${accents[service.id]}`}><div className="service-card-top"><span className="service-icon"><Icon size={21} /></span><span className={`service-status ${service.status.toLowerCase()}`}>{service.status === "AVAILABLE" ? "Sẵn sàng" : "Tạm gián đoạn"}</span></div><div><span className="eyebrow">DỊCH VỤ</span><h2>{service.label}</h2><p>{service.description}</p></div>{itemNames.length ? <div className="service-preview"><span>Dữ liệu gần đây</span>{itemNames.map((name) => <strong key={name}>{name}</strong>)}</div> : <div className="service-preview"><span>Điểm bắt đầu</span><strong>{service.browse_mode === "quote" ? "Nhập lộ trình để nhận báo giá" : "Mở danh sách để chọn tiếp"}</strong></div>}<div className="service-card-actions"><Link className="button button-primary" href={`/app/services/${service.id}`}>Mở dịch vụ <ArrowRight size={15} /></Link><Link className="text-link" href={`/app?service=${service.id}&mode=assistant`}>Tiếp tục với AI</Link></div></article>;
}
