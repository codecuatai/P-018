"use client";

import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { RideMapDetail } from "@/features/product/ride-map-detail";
import { XOneMap, type XOnePoint } from "@/features/product/xone-map";
import { resolveAddress } from "@/lib/api-client";
import { formatDateTime, formatMoney, isRecord, optionalText } from "@/lib/presentation";
import type { AssistantOption, AssistantRideItem } from "@/types";


type DetailKind = "food" | "restaurant" | "healthcare" | "ride";
type DetailPrimaryAction = { label: string; onClick: () => void; disabled?: boolean };

export function ServiceDetailDialog({ open, onOpenChange, kind, option, ride, primaryAction }: { open: boolean; onOpenChange: (open: boolean) => void; kind: DetailKind; option: AssistantOption | null; ride?: AssistantRideItem; primaryAction?: DetailPrimaryAction }) {
  const [resolvedPoint, setResolvedPoint] = useState<XOnePoint>();
  const [resolving, setResolving] = useState(false);
  const nestedRestaurant = isRecord(option?.restaurant) ? option.restaurant : undefined;
  const nestedFacility = isRecord(option?.facility) ? option.facility : undefined;
  const address = optionalText(nestedFacility?.address ?? nestedRestaurant?.address ?? option?.address ?? option?.location);
  const directPoint = kind === "ride" ? pointFromRide(ride) : pointFrom(nestedFacility ?? nestedRestaurant ?? option);
  const bookingId = ride?.booking_id ?? ride?.resource_id;

  useEffect(() => { setResolvedPoint(directPoint); }, [directPoint?.latitude, directPoint?.longitude, open]);
  useEffect(() => {
    // Restaurant addresses can be resolved on demand for map display only;
    // the result is never persisted or used as booking truth. Healthcare
    // facilities remain authoritative-only, and generic city addresses are
    // intentionally not guessed.
    if (!open || directPoint || !address || kind === "ride" || kind === "healthcare" || isGenericAddress(address)) return;
    let active = true;
    setResolving(true);
    void resolveAddress(address).then((result) => {
      if (!active) return;
      const candidate = result.candidates.find((item) => item.latitude !== null && item.longitude !== null);
      if (candidate && typeof candidate.latitude === "number" && typeof candidate.longitude === "number") setResolvedPoint({ latitude: candidate.latitude, longitude: candidate.longitude });
    }).catch(() => undefined).finally(() => { if (active) setResolving(false); });
    return () => { active = false; };
  }, [address, directPoint?.latitude, directPoint?.longitude, kind, open]);

  if (!option && !ride) return null;
  const title = kind === "ride" ? optionalText(ride?.title, "Chuyến xe") : optionalText(option?.name ?? option?.doctor ?? option?.title, "Chi tiết lựa chọn");
  const restaurantName = optionalText(nestedRestaurant?.name ?? (typeof option?.restaurant === "string" ? option.restaurant : undefined));
  const facilityName = optionalText(nestedFacility?.name);
  const route = ride?.route_geometry && ride.route_geometry.length > 1 ? ride.route_geometry : undefined;

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={`service-detail-dialog service-detail-dialog-${kind}`}>
      <DialogTitle className={kind === "ride" || kind === "healthcare" || kind === "restaurant" ? "visually-hidden" : undefined}>{title}</DialogTitle>
      <DialogDescription className={kind === "ride" || kind === "healthcare" || kind === "restaurant" ? "visually-hidden" : undefined}>Thông tin quan trọng cho lựa chọn của bạn.</DialogDescription>
      {kind === "ride" ? <RideDetail ride={ride} bookingId={bookingId} route={route} /> : kind === "restaurant" ? <RestaurantDetail option={option} title={title} address={address} resolvedPoint={resolvedPoint} resolving={resolving} primaryAction={primaryAction} /> : kind === "healthcare" ? <HealthcareDetail option={option} title={title} address={address} facilityName={facilityName} resolvedPoint={resolvedPoint} resolving={resolving} primaryAction={primaryAction} /> : <div className="service-detail-dialog-body">
        {kind === "food" && option?.image_url ? <ImageWithFallback source={option.image_url} alt={title} /> : null}
        {kind === "food" ? <FoodDetail option={option} title={title} restaurantName={restaurantName} address={address} resolvedPoint={resolvedPoint} resolving={resolving} /> : null}
      </div>}
    </DialogContent>
  </Dialog>;
}

function RideDetail({ ride, bookingId, route }: { ride?: AssistantRideItem; bookingId?: string; route?: Array<{ latitude: number; longitude: number }> }) {
  return <RideMapDetail bookingId={bookingId} initialOrigin={pointFromRide(ride, "pickup")} initialDestination={pointFromRide(ride, "dropoff")} initialRoute={route} initialRoutePolyline={ride?.route_polyline} initialRouteProvider={ride?.route_provider} initialRouteDistanceMeters={ride?.route_distance_meters} initialRouteDurationSeconds={ride?.route_duration_seconds} status={ride?.status} facts={[{ label: "Điểm đón", value: optionalText(ride?.pickup) }, { label: "Điểm đến", value: optionalText(ride?.dropoff) }, { label: "Loại xe", value: optionalText(ride?.vehicle) }, { label: "Khoảng cách", value: ride?.distance_km !== undefined ? `${ride.distance_km} km` : ride?.route_distance_meters ? `${(ride.route_distance_meters / 1000).toFixed(1)} km` : "Đang cập nhật" }, { label: "Thời gian dự kiến", value: ride?.duration_minutes ? `${ride.duration_minutes} phút` : ride?.route_duration_seconds ? `${Math.ceil(ride.route_duration_seconds / 60)} phút` : "Đang cập nhật" }, { label: "Giá dự kiến", value: formatMoney(ride?.amount, optionalText(ride?.currency, "VND")) }]} />;
}

function RestaurantDetail({ option, title, address, resolvedPoint, resolving, primaryAction }: { option: AssistantOption | null; title: string; address: string; resolvedPoint?: XOnePoint; resolving: boolean; primaryAction?: DetailPrimaryAction }) {
  const [showInfo, setShowInfo] = useState(false);
  const map = resolvedPoint ? <XOneMap restaurant={resolvedPoint} density="active" label={`Vị trí ${title}`} /> : resolving ? <p className="inline-note restaurant-map-empty">Đang xác định vị trí…</p> : <p className="inline-note restaurant-map-empty">Nhà hàng chưa có tọa độ hợp lệ; X-One giữ nguyên địa chỉ và không tự đoán vị trí.</p>;
  return <div className="restaurant-map-detail">
    <section className="restaurant-map-stage" aria-label="Bản đồ và thông tin nhà hàng">
      <div className="restaurant-map-canvas">
        {map}
        <button className="detail-info-button restaurant-map-info-button" type="button" aria-expanded={showInfo} onClick={() => setShowInfo((value) => !value)}>Thông tin nhà hàng</button>
        {showInfo ? <aside className="restaurant-map-info-panel" aria-label="Thông tin nhà hàng"><span className="eyebrow">NHÀ HÀNG</span><h3>{title}</h3><p>{optionalText(option?.description, address)}</p><div className="consumer-detail-grid"><Detail label="Địa chỉ" value={address} /><Detail label="Ẩm thực" value={optionalText(option?.cuisine)} /><Detail label="Đánh giá" value={option?.rating !== undefined ? `${option.rating} ★` : "Đang cập nhật"} /><Detail label="Số lượt đánh giá" value={option?.review_count ? String(option.review_count) : "Đang cập nhật"} /><Detail label="Mức giá" value={optionalText(option?.price_level)} /><Detail label="Giờ mở cửa" value={hoursText(option?.opening_hours)} /></div>{primaryAction ? <button className="button button-primary restaurant-map-select" type="button" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>{primaryAction.label}</button> : null}</aside> : null}
      </div>
    </section>
  </div>;
}

function HealthcareDetail({ option, title, address, facilityName, resolvedPoint, resolving, primaryAction }: { option: AssistantOption | null; title: string; address: string; facilityName: string; resolvedPoint?: XOnePoint; resolving: boolean; primaryAction?: DetailPrimaryAction }) {
  const [showInfo, setShowInfo] = useState(true);
  const facilityPoint = resolvedPoint ? { ...resolvedPoint, label: facilityName || title } : undefined;
  const map = facilityPoint ? <XOneMap healthcare={facilityPoint} density="active" label={`Vị trí ${facilityName || title}`} /> : resolving ? <p className="inline-note">Đang xác định vị trí…</p> : <p className="inline-note">Cơ sở chưa có tọa độ authoritative; bản đồ sẽ không tự suy đoán vị trí.</p>;
  return <div className="healthcare-map-detail">
    <section className="healthcare-map-stage" aria-label="Bản đồ và thông tin lịch khám">
      <div className="healthcare-map-canvas">
        {map}
        <button className="detail-info-button healthcare-map-info-button" type="button" aria-expanded={showInfo} onClick={() => setShowInfo((value) => !value)}>{showInfo ? "Ẩn thông tin" : "Thông tin lịch"}</button>
        {showInfo ? <aside className="healthcare-map-info-panel" aria-label="Thông tin lịch khám"><span className="eyebrow">LỊCH KHÁM</span><h3>{title}</h3><p>{facilityName || "Cơ sở đang cập nhật"}</p><div className="consumer-detail-grid"><Detail label="Chuyên khoa" value={optionalText(option?.department)} /><Detail label="Ngày giờ" value={formatDateTime(option?.start_time)} /><Detail label="Địa chỉ" value={address} /><Detail label="Giá khám" value={formatMoney(option?.price, "VND")} /></div>{primaryAction ? <button className="button button-primary healthcare-map-select" type="button" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>{primaryAction.label}</button> : null}</aside> : null}
      </div>
    </section>
  </div>;
}

function FoodDetail({ option, title, restaurantName, address, resolvedPoint, resolving }: { option: AssistantOption | null; title: string; restaurantName: string; address: string; resolvedPoint?: XOnePoint; resolving: boolean }) {
  return <><div className="detail-hero-copy"><span className="eyebrow">MÓN ĂN</span><h3>{title}</h3><p>{restaurantName}</p></div><div className="consumer-detail-grid"><Detail label="Giá" value={formatMoney(option?.price, "VND")} /><Detail label="Nhà hàng" value={restaurantName} /><Detail label="Mô tả" value={optionalText(option?.description)} /><Detail label="Danh mục" value={optionalText(option?.category)} /><Detail label="Đánh giá nhà hàng" value={option?.rating !== undefined ? `${option.rating} ★${option.review_count ? ` · ${option.review_count} đánh giá` : ""}` : "Đang cập nhật"} /><Detail label="Địa chỉ" value={address} /></div><OptionGroups groups={option?.options ?? option?.option_groups} />{resolvedPoint ? <XOneMap restaurant={resolvedPoint} label={`Vị trí ${restaurantName || "nhà hàng"}`} /> : resolving ? <p className="inline-note">Đang xác định vị trí…</p> : null}</>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="consumer-detail-fact"><span>{label}</span><strong>{value}</strong></div>; }

function OptionGroups({ groups }: { groups?: Array<Record<string, unknown>> }) {
  if (!groups?.length) return null;
  return <section className="detail-option-groups" aria-label="Tùy chọn món"><h4>Tùy chọn đi kèm</h4>{groups.map((group, index) => <div key={`${String(group.id ?? group.name)}-${index}`}><strong>{optionalText(group.name ?? group.label, "Tùy chọn")}</strong><span>{Array.isArray(group.options) ? group.options.map((value) => isRecord(value) ? optionalText(value.name ?? value.label) : optionalText(value)).join(", ") : "Đang cập nhật"}</span></div>)}</section>;
}

function ImageWithFallback({ source, alt }: { source: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className="detail-image service-image-fallback" role="img" aria-label={`${alt}: ảnh không khả dụng`}>Ảnh không khả dụng</div> : <img className="detail-image" src={source} alt={alt} onError={() => setFailed(true)} />;
}

function pointFrom(value: unknown): XOnePoint | undefined {
  if (!isRecord(value) || value.suspicious === true || value.coordinate_status === "suspicious_default") return undefined;
  const latitude = value.latitude;
  const longitude = value.longitude;
  return typeof latitude === "number" && typeof longitude === "number" ? { latitude, longitude } : undefined;
}

function pointFromRide(ride?: AssistantRideItem, kind?: "pickup" | "dropoff"): XOnePoint | undefined {
  if (!ride) return undefined;
  const latitude = kind === "pickup" ? ride.pickup_latitude : kind === "dropoff" ? ride.dropoff_latitude : undefined;
  const longitude = kind === "pickup" ? ride.pickup_longitude : kind === "dropoff" ? ride.dropoff_longitude : undefined;
  return typeof latitude === "number" && typeof longitude === "number" ? { latitude, longitude } : undefined;
}

function hoursText(value: string | string[] | Array<Record<string, unknown>> | undefined): string {
  if (!value) return "Hằng ngày: 08:00–22:00";
  let parsed: unknown = value;
  if (typeof value === "string") {
    if (isMissingHours(value)) return "Hằng ngày: 08:00–22:00";
    try { parsed = JSON.parse(value); } catch { return value; }
  }
  if (Array.isArray(parsed)) return parsed.map((entry) => openingHourText(entry)).filter(Boolean).join(" · ") || "Hằng ngày: 08:00–22:00";
  return openingHourText(parsed) || "Hằng ngày: 08:00–22:00";
}

function isMissingHours(value: string): boolean {
  const folded = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replaceAll("đ", "d").trim();
  return !folded || folded === "dang cap nhat" || folded === "unknown" || folded === "n/a" || (folded.includes("dang cap nhat") && !/\d/.test(folded));
}

function openingHourText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";
  const day = optionalText(value.day ?? value.weekday ?? value.name);
  const open = optionalText(value.open ?? value.open_time ?? value.opens);
  const close = optionalText(value.close ?? value.close_time ?? value.closes);
  const visibleOpen = open && !isMissingHours(open) ? open : "";
  const visibleClose = close && !isMissingHours(close) ? close : "";
  if (day && (visibleOpen || visibleClose)) return `${day}: ${visibleOpen || "?"}–${visibleClose || "?"}`;
  return day && !isMissingHours(day) ? day : visibleOpen || visibleClose;
}

function isGenericAddress(value: string): boolean {
  const folded = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[,\s]+/g, " ").trim();
  return /^(ha noi|hanoi|viet nam|vietnam)(, viet nam)?$/.test(folded);
}
