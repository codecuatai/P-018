"use client";

import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { resolveAddress } from "@/lib/api-client";
import { formatDateTime, formatMoney, isRecord, optionalText } from "@/lib/presentation";
import { XOneMap, type XOnePoint } from "@/features/product/xone-map";
import type { AssistantOption, AssistantRideItem } from "@/types";

type DetailKind = "food" | "restaurant" | "healthcare" | "ride";

export function ServiceDetailDialog({ open, onOpenChange, kind, option, ride }: { open: boolean; onOpenChange: (open: boolean) => void; kind: DetailKind; option: AssistantOption | null; ride?: AssistantRideItem }) {
  const [resolvedPoint, setResolvedPoint] = useState<XOnePoint>();
  const [resolving, setResolving] = useState(false);
  const nestedRestaurant = isRecord(option?.restaurant) ? option?.restaurant : undefined;
  const nestedFacility = isRecord(option?.facility) ? option?.facility : undefined;
  const address = optionalText(nestedFacility?.address ?? nestedRestaurant?.address ?? option?.address ?? option?.location);
  const directPoint = kind === "ride" ? pointFromRide(ride) : pointFrom(nestedFacility ?? nestedRestaurant ?? option);

  useEffect(() => { setResolvedPoint(directPoint); }, [directPoint?.latitude, directPoint?.longitude, open]);

  useEffect(() => {
    if (!open || directPoint || !address || kind === "ride") return;
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
    <DialogContent className="service-detail-dialog">
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>Thông tin quan trọng cho lựa chọn của bạn.</DialogDescription>
      <div className="service-detail-dialog-body">
        {kind !== "ride" && option?.image_url ? <ImageWithFallback source={option.image_url} alt={title} /> : null}
        {kind === "ride" ? <>
          <div className="detail-hero-copy"><span className="eyebrow">HÀNH TRÌNH</span><p>{optionalText(ride?.pickup)} → {optionalText(ride?.dropoff)}</p></div>
          <div className="consumer-detail-grid"><Detail label="Điểm đón" value={optionalText(ride?.pickup)} /><Detail label="Điểm đến" value={optionalText(ride?.dropoff)} /><Detail label="Loại xe" value={optionalText(ride?.vehicle)} /><Detail label="Khoảng cách" value={ride?.distance_km !== undefined ? `${ride.distance_km} km` : ride?.route_distance_meters ? `${(ride.route_distance_meters / 1000).toFixed(1)} km` : "Đang cập nhật"} /><Detail label="Thời gian dự kiến" value={ride?.duration_minutes ? `${ride.duration_minutes} phút` : ride?.route_duration_seconds ? `${Math.ceil(ride.route_duration_seconds / 60)} phút` : "Đang cập nhật"} /><Detail label="Giá dự kiến" value={formatMoney(ride?.amount, optionalText(ride?.currency, "VND"))} /></div>
          <XOneMap origin={pointFromRide(ride, "pickup")} destination={pointFromRide(ride, "dropoff")} routeGeometry={route} routePolyline={ride?.route_polyline} label="Bản đồ hành trình" />
        </> : kind === "food" ? <>
          <div className="detail-hero-copy"><span className="eyebrow">MÓN ĂN</span><h3>{title}</h3><p>{restaurantName}</p></div>
          <div className="consumer-detail-grid"><Detail label="Giá" value={formatMoney(option?.price, "VND")} /><Detail label="Nhà hàng" value={restaurantName} /><Detail label="Mô tả" value={optionalText(option?.description)} /><Detail label="Danh mục" value={optionalText(option?.category)} /><Detail label="Đánh giá nhà hàng" value={option?.rating !== undefined ? `${option.rating} ★${option.review_count ? ` · ${option.review_count} đánh giá` : ""}` : "Đang cập nhật"} /><Detail label="Địa chỉ" value={address} /></div>
          <OptionGroups groups={option?.options ?? option?.option_groups} />
          {resolvedPoint ? <XOneMap restaurant={resolvedPoint} label={`Vị trí ${restaurantName || "nhà hàng"}`} /> : resolving ? <p className="inline-note">Đang xác định vị trí…</p> : null}
        </> : kind === "restaurant" ? <>
          <div className="detail-hero-copy"><span className="eyebrow">NHÀ HÀNG</span><h3>{title}</h3><p>{optionalText(option?.description)}</p></div>
          <div className="consumer-detail-grid"><Detail label="Địa chỉ" value={address} /><Detail label="Ẩm thực" value={optionalText(option?.cuisine)} /><Detail label="Đánh giá" value={option?.rating !== undefined ? `${option.rating} ★` : "Đang cập nhật"} /><Detail label="Số lượt đánh giá" value={option?.review_count ? String(option.review_count) : "Đang cập nhật"} /><Detail label="Mức giá" value={optionalText(option?.price_level)} /><Detail label="Giờ mở cửa" value={hoursText(option?.opening_hours)} /></div>
          {resolvedPoint ? <XOneMap restaurant={resolvedPoint} label={`Vị trí ${title}`} /> : resolving ? <p className="inline-note">Đang xác định vị trí…</p> : null}
        </> : <>
          <div className="detail-hero-copy"><span className="eyebrow">LỊCH KHÁM</span><h3>{title}</h3><p>{facilityName}</p></div>
          <div className="consumer-detail-grid"><Detail label="Cơ sở" value={facilityName} /><Detail label="Địa chỉ" value={address} /><Detail label="Chuyên khoa" value={optionalText(option?.department)} /><Detail label="Bác sĩ" value={optionalText(option?.doctor)} /><Detail label="Chức danh" value={optionalText(option?.doctor_title)} /><Detail label="Ngày giờ" value={formatDateTime(option?.start_time)} /><Detail label="Giá" value={formatMoney(option?.price, "VND")} /></div>
          {resolvedPoint ? <XOneMap healthcare={resolvedPoint} label={`Vị trí ${facilityName || "cơ sở"}`} /> : resolving ? <p className="inline-note">Đang xác định vị trí…</p> : null}
        </>}
      </div>
    </DialogContent>
  </Dialog>;
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
  if (!isRecord(value)) return undefined;
  if (value.suspicious === true) return undefined;
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

function hoursText(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(" · ") : optionalText(value);
}
