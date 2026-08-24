// filepath: apps/web/src/components/ServiceDetailDialog.tsx
"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] p-0 overflow-hidden bg-white rounded-3xl sm:rounded-[2rem] border-slate-200/60 shadow-2xl focus:outline-none">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">Thông tin quan trọng cho lựa chọn của bạn.</DialogDescription>
        {kind === "ride" ? (
          <RideDetail ride={ride} bookingId={bookingId} route={route} />
        ) : kind === "restaurant" ? (
          <RestaurantDetail option={option} title={title} address={address} resolvedPoint={resolvedPoint} resolving={resolving} primaryAction={primaryAction} />
        ) : kind === "healthcare" ? (
          <HealthcareDetail option={option} title={title} address={address} facilityName={facilityName} resolvedPoint={resolvedPoint} resolving={resolving} primaryAction={primaryAction} />
        ) : kind === "food" ? (
          <FoodDetail option={option} title={title} restaurantName={restaurantName} address={address} resolvedPoint={resolvedPoint} resolving={resolving} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RideDetail({ ride, bookingId, route }: { ride?: AssistantRideItem; bookingId?: string; route?: Array<{ latitude: number; longitude: number }> }) {
  return <RideMapDetail bookingId={bookingId} initialOrigin={pointFromRide(ride, "pickup")} initialDestination={pointFromRide(ride, "dropoff")} initialRoute={route} initialRoutePolyline={ride?.route_polyline} initialRouteProvider={ride?.route_provider} initialRouteDistanceMeters={ride?.route_distance_meters} initialRouteDurationSeconds={ride?.route_duration_seconds} status={ride?.status} facts={[{ label: "Điểm đón", value: optionalText(ride?.pickup) }, { label: "Điểm đến", value: optionalText(ride?.dropoff) }, { label: "Loại xe", value: optionalText(ride?.vehicle) }, { label: "Khoảng cách", value: ride?.distance_km !== undefined ? `${ride.distance_km} km` : ride?.route_distance_meters ? `${(ride.route_distance_meters / 1000).toFixed(1)} km` : "Đang cập nhật" }, { label: "Thời gian dự kiến", value: ride?.duration_minutes ? `${ride.duration_minutes} phút` : ride?.route_duration_seconds ? `${Math.ceil(ride.route_duration_seconds / 60)} phút` : "Đang cập nhật" }, { label: "Giá dự kiến", value: formatMoney(ride?.amount, optionalText(ride?.currency, "VND")) }]} />;
}

function RestaurantDetail({ option, title, address, resolvedPoint, resolving, primaryAction }: { option: AssistantOption | null; title: string; address: string; resolvedPoint?: XOnePoint; resolving: boolean; primaryAction?: DetailPrimaryAction }) {
  const [showInfo, setShowInfo] = useState(true);
  const map = resolvedPoint ? <XOneMap restaurant={resolvedPoint} density="active" label={`Vị trí ${title}`} /> : resolving ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500"><LoaderCircle className="animate-spin text-blue-600" size={24} /><span className="text-sm font-medium">Đang xác định vị trí…</span></div> : <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-medium text-sm text-center px-6">Nhà hàng chưa có tọa độ hợp lệ;<br />X-One giữ nguyên địa chỉ và không tự đoán vị trí.</div>;

  return (
    <div className="flex flex-col md:flex-row h-[600px] max-h-[85vh] bg-white">
      <div className={`w-full md:w-[360px] flex-shrink-0 border-r border-slate-200/60 flex flex-col bg-slate-50/50 transition-all ${showInfo ? "block" : "hidden md:flex"}`}>
        <div className="p-6 border-b border-slate-200/60 bg-white">
          <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase mb-1 block">Nhà hàng</span>
          <h3 className="text-xl font-bold text-slate-900 leading-tight">{title}</h3>
          <p className="text-sm font-medium text-slate-500 mt-1 line-clamp-2">{optionalText(option?.description, address)}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-0.5">
          <Detail label="Địa chỉ" value={address} />
          <Detail label="Ẩm thực" value={optionalText(option?.cuisine)} />
          <Detail label="Đánh giá" value={option?.rating !== undefined ? `${option.rating} ★` : "Đang cập nhật"} />
          <Detail label="Số lượt đánh giá" value={option?.review_count ? String(option.review_count) : "Đang cập nhật"} />
          <Detail label="Mức giá" value={optionalText(option?.price_level)} />
          <Detail label="Giờ mở cửa" value={hoursText(option?.opening_hours)} />
        </div>
        {primaryAction ? (
          <div className="p-4 bg-white border-t border-slate-200/60">
            <button className="w-full py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-all shadow-sm shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed" type="button" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>{primaryAction.label}</button>
          </div>
        ) : null}
      </div>
      <div className="flex-1 relative bg-slate-100 min-h-[300px]">
        {map}
        <button className="md:hidden absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-white rounded-full shadow-md text-sm font-semibold text-slate-700 transition-all active:scale-95 z-10" type="button" aria-expanded={showInfo} onClick={() => setShowInfo((value) => !value)}>{showInfo ? "Xem bản đồ" : "Thông tin nhà hàng"}</button>
      </div>
    </div>
  );
}

function HealthcareDetail({ option, title, address, facilityName, resolvedPoint, resolving, primaryAction }: { option: AssistantOption | null; title: string; address: string; facilityName: string; resolvedPoint?: XOnePoint; resolving: boolean; primaryAction?: DetailPrimaryAction }) {
  const [showInfo, setShowInfo] = useState(true);
  const facilityPoint = resolvedPoint ? { ...resolvedPoint, label: facilityName || title } : undefined;
  const map = facilityPoint ? <XOneMap healthcare={facilityPoint} density="active" label={`Vị trí ${facilityName || title}`} /> : resolving ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500"><LoaderCircle className="animate-spin text-blue-600" size={24} /><span className="text-sm font-medium">Đang xác định vị trí…</span></div> : <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-medium text-sm text-center px-6">Cơ sở chưa có tọa độ authoritative;<br />bản đồ sẽ không tự suy đoán vị trí.</div>;

  return (
    <div className="flex flex-col md:flex-row h-[600px] max-h-[85vh] bg-white">
      <div className={`w-full md:w-[360px] flex-shrink-0 border-r border-slate-200/60 flex flex-col bg-slate-50/50 transition-all ${showInfo ? "block" : "hidden md:flex"}`}>
        <div className="p-6 border-b border-slate-200/60 bg-white">
          <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase mb-1 block">Lịch khám</span>
          <h3 className="text-xl font-bold text-slate-900 leading-tight">{title}</h3>
          <p className="text-sm font-medium text-slate-500 mt-1 line-clamp-2">{facilityName || "Cơ sở đang cập nhật"}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-0.5">
          <Detail label="Chuyên khoa" value={optionalText(option?.department)} />
          <Detail label="Ngày giờ" value={formatDateTime(option?.start_time)} />
          <Detail label="Địa chỉ" value={address} />
          <Detail label="Giá khám" value={formatMoney(option?.price, "VND")} />
        </div>
        {primaryAction ? (
          <div className="p-4 bg-white border-t border-slate-200/60">
            <button className="w-full py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-all shadow-sm shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed" type="button" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>{primaryAction.label}</button>
          </div>
        ) : null}
      </div>
      <div className="flex-1 relative bg-slate-100 min-h-[300px]">
        {map}
        <button className="md:hidden absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-white rounded-full shadow-md text-sm font-semibold text-slate-700 transition-all active:scale-95 z-10" type="button" aria-expanded={showInfo} onClick={() => setShowInfo((value) => !value)}>{showInfo ? "Xem bản đồ" : "Thông tin lịch"}</button>
      </div>
    </div>
  );
}

function FoodDetail({ option, title, restaurantName, address, resolvedPoint, resolving }: { option: AssistantOption | null; title: string; restaurantName: string; address: string; resolvedPoint?: XOnePoint; resolving: boolean }) {
  const [showInfo, setShowInfo] = useState(true);

  return (
    <div className="flex flex-col md:flex-row h-[600px] max-h-[85vh] bg-white">
      <div className={`w-full md:w-[380px] flex-shrink-0 border-r border-slate-200/60 flex flex-col bg-white transition-all ${showInfo ? "block" : "hidden md:flex"}`}>
        <div className="p-6 border-b border-slate-200/60 bg-white">
          <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase mb-1 block">Món ăn</span>
          <h3 className="text-xl font-bold text-slate-900 leading-tight mb-1">{title}</h3>
          <p className="text-sm font-medium text-slate-500 truncate">{restaurantName}</p>
        </div>
        <div className="flex-1 overflow-y-auto bg-slate-50/50">
          <div className="p-6 space-y-0.5 border-b border-slate-200/60 bg-white">
            <Detail label="Giá" value={formatMoney(option?.price, "VND")} />
            <Detail label="Nhà hàng" value={restaurantName} />
            <Detail label="Mô tả" value={optionalText(option?.description)} />
            <Detail label="Danh mục" value={optionalText(option?.category)} />
            <Detail label="Đánh giá" value={option?.rating !== undefined ? `${option.rating} ★${option.review_count ? ` · ${option.review_count} đánh giá` : ""}` : "Đang cập nhật"} />
            <Detail label="Địa chỉ" value={address} />
          </div>
          <OptionGroups groups={option?.options ?? option?.option_groups} />
        </div>
      </div>
      <div className="flex-1 relative bg-slate-100 flex flex-col">
        {option?.image_url ? (
          <div className="h-[240px] md:h-1/2 w-full shrink-0 bg-slate-100 border-b border-slate-200/60">
            <ImageWithFallback source={option.image_url} alt={title} />
          </div>
        ) : null}
        <div className="flex-1 relative bg-slate-100 min-h-[200px]">
          {resolvedPoint ? (
            <XOneMap restaurant={resolvedPoint} density="active" label={`Vị trí ${restaurantName || "nhà hàng"}`} />
          ) : resolving ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500">
              <LoaderCircle className="animate-spin text-blue-600" size={24} />
              <span className="text-sm font-medium">Đang tải vị trí nhà hàng...</span>
            </div>
          ) : (
            <div className="absolute inset-0 grid place-items-center text-slate-500 font-medium text-sm">Chưa có tọa độ bản đồ cho nhà hàng này.</div>
          )}
        </div>
        <button className="md:hidden absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-white rounded-full shadow-md text-sm font-semibold text-slate-700 transition-all active:scale-95 z-10" type="button" aria-expanded={showInfo} onClick={() => setShowInfo((value) => !value)}>{showInfo ? "Xem hình & bản đồ" : "Thông tin món"}</button>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-3 border-b border-slate-100 last:border-0">
      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <strong className="text-sm font-semibold text-slate-800 leading-relaxed">{value}</strong>
    </div>
  );
}

function OptionGroups({ groups }: { groups?: Array<Record<string, unknown>> }) {
  if (!groups?.length) return null;
  return (
    <section className="p-6" aria-label="Tùy chọn món">
      <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">Tùy chọn đi kèm</h4>
      <div className="grid gap-3">
        {groups.map((group, index) => (
          <div className="p-3.5 bg-white border border-slate-100 rounded-xl shadow-sm" key={`${String(group.id ?? group.name)}-${index}`}>
            <strong className="text-sm font-bold text-slate-800 block mb-1.5">{optionalText(group.name ?? group.label, "Tùy chọn")}</strong>
            <span className="text-xs font-medium text-slate-500 leading-relaxed block">{Array.isArray(group.options) ? group.options.map((value) => isRecord(value) ? optionalText(value.name ?? value.label) : optionalText(value)).join(", ") : "Đang cập nhật"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ImageWithFallback({ source, alt }: { source: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400 font-medium text-sm" role="img" aria-label={`${alt}: ảnh không khả dụng`}>Ảnh không khả dụng</div>
  ) : (
    <img className="w-full h-full object-cover" src={source} alt={alt} onError={() => setFailed(true)} />
  );
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

