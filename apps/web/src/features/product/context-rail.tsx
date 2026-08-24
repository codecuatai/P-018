// filepath: apps/web/src/features/product/context-rail.tsx
"use client";

import { ArrowRight, CalendarDays, CarFront, Stethoscope, Utensils, UtensilsCrossed } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { resolveAddress } from "@/lib/api-client";
import { formatDateTime, formatMoney, isRecord, optionalText, statusLabel } from "@/lib/presentation";
import type { HistoryItem } from "@/types";
import { RideMapDetail } from "./ride-map-detail";
import { FoodTrackingPanel } from "./food-tracking";
import { RideCancelButton } from "./ride-cancel-button";
import { parseRideDriver } from "./ride-tracking";
import { useRideTracking } from "./ride-tracking-cache";

import { XOneMap, type XOnePoint } from "./xone-map";

export type ContextRailMode = "idle" | "active" | "tracking" | "recovery";

export function ContextRail({
  mode,
  title,
  description,
  onCollapse,
  style,
  resizer,
  children,
}: {
  mode: ContextRailMode;
  title: string;
  description: string;
  onCollapse?: () => void;
  style?: React.CSSProperties;
  resizer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <aside className="flex flex-col h-full bg-slate-50/50 border-l border-slate-200/60 overflow-hidden relative shrink-0 transition-all duration-300 ease-in-out" aria-label="Dịch vụ đang diễn ra" style={style}>
      {resizer}
      <div className="px-5 pt-6 pb-4 shrink-0">
        <div className="grid gap-1">
          {mode !== "idle" ? <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">ĐANG DIỄN RA</span> : <span className="text-[10px] font-extrabold text-slate-400 tracking-widest uppercase">TIỆN ÍCH</span>}
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h2>
          {description ? <p className="text-xs text-slate-500 font-medium leading-relaxed">{description}</p> : null}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-200">
        {children}
      </div>
    </aside>
  );
}

export function ActiveRideRailCard({ ride, onDetails }: { ride: HistoryItem; onDetails?: (item: HistoryItem) => void }) {
  return <ActiveWorkRailCard item={ride} onDetails={onDetails} />;
}

export function ActiveWorkRailCard({ item, onDetails, children }: { item: HistoryItem; onDetails?: (item: HistoryItem) => void; children?: ReactNode }) {
  const bookingId = item.type === "ride_booking" ? optionalText(item.resource.booking_id ?? item.resource.resource_id ?? item.resource.id, item.id) : undefined;
  const { data: tracking } = useRideTracking(bookingId);
  const driver = parseRideDriver(tracking?.driver);
  const status = tracking?.status ?? item.status ?? String(item.resource.status ?? "");
  const Icon = item.type === "ride_booking" ? CarFront : item.type === "food_order" ? Utensils : item.type === "restaurant_reservation" ? CalendarDays : Stethoscope;
  const detail = tracking?.driver ? driver.name + (driver.vehicle ? " · " + driver.vehicle : "") : item.detail || summaryFor(item);

  return (
    <article className="group flex flex-col p-4 bg-white border border-slate-200/60 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-200 hover:-translate-y-0.5 transition-all duration-300">
      <div className="flex items-start gap-3 mb-3">
        <div className="grid place-items-center w-10 h-10 rounded-xl bg-slate-50 text-slate-600 border border-slate-100 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 group-hover:shadow-md group-hover:shadow-blue-600/20 transition-all duration-300 shrink-0">
          <Icon size={18} strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0 grid gap-1 mt-0.5">
          <strong className="text-sm font-bold text-slate-900 truncate">{item.title || titleFor(item.type)}</strong>
          <span className="inline-flex items-center gap-1.5 w-fit px-2 py-0.5 rounded-full bg-slate-50 border border-slate-100 text-[10px] font-bold text-slate-600 tracking-wide uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" aria-hidden="true" />
            {statusLabel(status)}
          </span>
        </div>
      </div>
      {detail && <div className="text-xs text-slate-500 leading-relaxed mb-3 line-clamp-2">{detail}</div>}
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100">
        <button className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors" type="button" onClick={() => onDetails?.(item)}>
          <span>Xem chi tiết</span>
          <ArrowRight size={14} strokeWidth={2.5} />
        </button>
        {children}
      </div>
    </article>
  );
}

export function ActiveWorkRailCardWithCancel({ item, onDetails, onCancelled }: { item: HistoryItem; onDetails?: (item: HistoryItem) => void; onCancelled?: () => void }) {
  const [cancelled, setCancelled] = useState(false);
  const bookingId = item.type === "ride_booking" ? optionalText(item.resource.booking_id ?? item.resource.resource_id ?? item.resource.id, item.id) : undefined;
  const { data: tracking } = useRideTracking(bookingId);
  const status = tracking?.status ?? item.status ?? String(item.resource.status ?? "");

  if (cancelled) return null;

  return (
    <ActiveWorkRailCard item={item} onDetails={onDetails}>
      {item.type === "ride_booking" ? (
        <RideCancelButton
          bookingId={bookingId}
          status={status}
          onCancelled={() => { setCancelled(true); onCancelled?.(); window.dispatchEvent(new CustomEvent("xone-ride-cancelled", { detail: { id: item.id } })); }}
          className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors ml-3"
        />
      ) : null}
    </ActiveWorkRailCard>
  );
}

export function ConversationContextCards({ onServiceShortcut }: { onServiceShortcut?: (prompt: string) => void }) {
  const services = [
    {
      icon: CarFront,
      label: "Đi xe",
      prompt: "Đặt xe từ ",
      description: "Xe 4, 7 chỗ, gọi xe nhanh chóng",
    },
    {
      icon: Utensils,
      label: "Đồ ăn",
      prompt: "Tìm ",
      description: "Giao đồ ăn tận cửa",
    },
    {
      icon: UtensilsCrossed,
      label: "Nhà hàng",
      prompt: "Đặt bàn nhà hàng ",
      description: "Đặt bàn hẹn hò, đối tác",
    },
    {
      icon: Stethoscope,
      label: "Khám bệnh",
      prompt: "Đặt lịch khám ",
      description: "Đặt khám bác sĩ chuyên khoa",
    },
  ];

  return (
    <div className="px-4 pb-6">
      <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3 px-1">Lối tắt dịch vụ</span>
      <div className="grid gap-3">
        {services.map(({ icon: Icon, label, prompt, description }) => (
          <button
            key={label}
            type="button"
            className="group flex flex-col p-4 bg-white border border-slate-200/60 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-200 hover:-translate-y-0.5 transition-all duration-300 text-left active:scale-[0.98]"
            onClick={() => onServiceShortcut?.(prompt)}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="grid place-items-center w-8 h-8 rounded-lg bg-slate-50 text-slate-600 border border-slate-100 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-colors duration-300">
                <Icon size={16} strokeWidth={2} />
              </div>
              <span className="text-[13px] font-bold text-slate-900">{label}</span>
            </div>
            <span className="text-[11px] text-slate-500 leading-relaxed block pl-11">{description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ActiveWorkDetailDialog({ item, open, onOpenChange }: { item: HistoryItem | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!item) return null;
  const resource = item.resource;
  const ride = item.type === "ride_booking";
  const food = item.type === "food_order";
  const restaurant = item.type === "restaurant_reservation";
  const healthcare = item.type === "healthcare_appointment";
  const title = item.title || titleFor(item.type);
  const origin = ride ? pointFrom(resource.pickup_latitude, resource.pickup_longitude) ?? nestedPoint(resource.route, "origin") : undefined;
  const destination = ride ? pointFrom(resource.dropoff_latitude, resource.dropoff_longitude) ?? nestedPoint(resource.route, "destination") : pointFrom(resource.latitude, resource.longitude) ?? pointFromRecord(restaurant || food ? resource.restaurant : resource.facility) ?? pointFromRecord(resource.location);
  const route = ride ? routeFrom(resource.route ?? resource) : undefined;
  const routePolyline = typeof resource.route_polyline === "string" ? resource.route_polyline : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] p-0 overflow-hidden bg-white rounded-3xl sm:rounded-[2rem] border-slate-200/60 shadow-2xl focus:outline-none">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{statusLabel(resource.status ?? item.status)}</DialogDescription>

        {ride ? <ActiveRideDetail item={item} /> : restaurant ? <ActiveRestaurantDetail item={item} /> : healthcare ? <ActiveHealthcareDetail item={item} destination={destination} /> : food ? <ActiveFoodDetail item={item} /> : (
          <div className="flex flex-col md:flex-row h-[600px] max-h-[85vh] bg-white">
            <div className="w-full md:w-[360px] flex-shrink-0 bg-slate-50/50 border-r border-slate-200/60 p-6 overflow-y-auto">
              <div className="grid gap-2">
                <Fact label="Cơ sở" value={nestedName(resource.facility) || optionalText(resource.facility_name)} />
                <Fact label="Chuyên khoa" value={optionalText(resource.department)} />
                <Fact label="Bác sĩ" value={optionalText(resource.doctor_name ?? resource.doctor)} />
                <Fact label="Thời gian" value={formatDateTime(resource.start_time ?? resource.appointment_time)} />
                <Fact label="Chi phí" value={formatMoney(resource.price ?? resource.amount, String(resource.currency ?? "VND"))} />
              </div>
            </div>
            <div className="flex-1 relative bg-slate-100 min-h-[300px]">
              {destination || origin ? <XOneMap origin={origin} destination={destination} routeGeometry={route} routePolyline={routePolyline} label={`${title}: vị trí`} /> : <div className="absolute inset-0 grid place-items-center text-slate-500 font-medium text-sm">Chưa có thông tin vị trí</div>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ActiveFoodDetail({ item }: { item: HistoryItem }) {
  const resource = item.resource;
  const orderId = optionalText(resource.id ?? resource.order_id ?? resource.resource_id, item.id);
  const pickupStops = Array.isArray(resource.pickup_stops) ? resource.pickup_stops.filter(isRecord) : [];
  const pickupNames = pickupStops.map((stop) => nestedName(stop)).filter(Boolean);

  return (
    <div className="flex flex-col md:flex-row h-[600px] max-h-[85vh] bg-white">
      <div className="w-full md:w-[360px] flex-shrink-0 border-r border-slate-200/60 flex flex-col bg-slate-50/50">
        <div className="p-6 border-b border-slate-200/60 bg-white">
          <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase mb-1 block">Chi tiết đơn hàng</span>
          <h3 className="text-xl font-bold text-slate-900">{pickupNames.length ? pickupNames.join(" → ") : nestedName(resource.restaurant) || optionalText(resource.restaurant_name)}</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-0.5">
          <Fact label="Điểm lấy hàng" value={pickupNames.length ? pickupNames.join(" → ") : nestedName(resource.restaurant) || optionalText(resource.restaurant_name)} />
          <Fact label="Địa chỉ giao" value={optionalText(resource.delivery_address ?? resource.address)} />
          <Fact label="Món đã chọn" value={itemsText(resource.items)} />
          <Fact label="Tổng đơn" value={formatMoney(resource.total ?? resource.amount, String(resource.currency ?? "VND"))} />
          <Fact label="Trạng thái" value={statusLabel(resource.status ?? item.status)} />
        </div>
      </div>
      <div className="flex-1 relative bg-slate-100 min-h-[300px]">
        {orderId ? <FoodTrackingPanel orderId={orderId} /> : <div className="absolute inset-0 grid place-items-center text-slate-400 font-medium text-sm">Chưa có thông tin theo dõi</div>}
      </div>
    </div>
  );
}

function ActiveRestaurantDetail({ item }: { item: HistoryItem }) {
  const [resolvedPoint, setResolvedPoint] = useState<XOnePoint>();
  const [resolving, setResolving] = useState(false);
  const resource = item.resource;
  const restaurant = isRecord(resource.restaurant) ? resource.restaurant : undefined;
  const name = nestedName(restaurant) || optionalText(resource.restaurant_name ?? resource.name, "Nhà hàng");
  const address = optionalText(resource.address ?? restaurant?.address ?? restaurant?.location, "Địa chỉ nhà hàng chưa có");
  const directPoint = pointFromRecord(restaurant) ?? pointFrom(resource.latitude, resource.longitude) ?? pointFromRecord(resource.location);
  const canResolve = Boolean(address) && !/chưa có|đang cập nhật/i.test(address);

  useEffect(() => { setResolvedPoint(directPoint); }, [directPoint?.latitude, directPoint?.longitude]);
  useEffect(() => {
    if (directPoint || !canResolve) return;
    let active = true;
    setResolving(true);
    void resolveAddress(address).then((result) => {
      if (!active) return;
      const candidate = result.candidates.find((entry) => typeof entry.latitude === "number" && typeof entry.longitude === "number");
      if (candidate) setResolvedPoint({ latitude: candidate.latitude!, longitude: candidate.longitude! });
    }).catch(() => undefined).finally(() => { if (active) setResolving(false); });
    return () => { active = false; };
  }, [address, canResolve, directPoint?.latitude, directPoint?.longitude]);

  const location = resolvedPoint ? { ...resolvedPoint, label: name } : undefined;

  return (
    <div className="flex flex-col md:flex-row h-[600px] max-h-[85vh] bg-white">
      <div className="w-full md:w-[360px] flex-shrink-0 border-r border-slate-200/60 flex flex-col bg-slate-50/50">
        <div className="p-6 border-b border-slate-200/60 bg-white">
          <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase mb-1 block">Đặt bàn nhà hàng</span>
          <h3 className="text-xl font-bold text-slate-900">{name}</h3>
          <p className="text-sm text-slate-500 mt-1 line-clamp-2">{address}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-0.5">
          <Fact label="Thời gian" value={formatDateTime(resource.start_at ?? resource.reservation_time)} />
          <Fact label="Số khách" value={resource.party_size ? `${String(resource.party_size)} người` : "Chưa có"} />
          <Fact label="Trạng thái" value={statusLabel(resource.status ?? item.status)} />
          <Fact label="Bàn" value={optionalText(resource.table_code, "Đã sắp xếp")} />
          <Fact label="Ẩm thực" value={optionalText(restaurant?.cuisine, "Theo thực đơn nhà hàng")} />
          <Fact label="Đánh giá" value={typeof restaurant?.rating === "number" ? `${String(restaurant.rating)} ★` : "Chưa có"} />
          <Fact label="Mức giá" value={optionalText(restaurant?.price_level, "Chưa có")} />
          <Fact label="Giờ mở cửa" value="Hằng ngày: 08:00–22:00" />
        </div>
      </div>
      <div className="flex-1 relative bg-slate-100 min-h-[300px]">
        {location ? <XOneMap restaurant={location} density="active" label={`Vị trí ${name}`} /> : resolving ? <div className="absolute inset-0 grid place-items-center text-slate-500 font-medium text-sm">Đang xác định vị trí từ địa chỉ nhà hàng…</div> : <div className="absolute inset-0 grid place-items-center text-slate-500 font-medium text-sm px-6 text-center">{address}</div>}
      </div>
    </div>
  );
}

function ActiveHealthcareDetail({ item, destination }: { item: HistoryItem; destination?: XOnePoint }) {
  const [showInfo, setShowInfo] = useState(true);
  const resource = item.resource;
  const facility = isRecord(resource.facility) ? resource.facility : undefined;
  const facilityName = nestedName(facility) || optionalText(resource.facility_name, "Cơ sở khám");
  const address = optionalText(resource.address ?? facility?.address, "Địa chỉ cơ sở chưa có");
  const doctor = optionalText(resource.doctor_name ?? nestedName(resource.doctor), "Bác sĩ chưa có tên");
  const department = optionalText(resource.department_name ?? nestedName(resource.department) ?? (typeof resource.department === "string" ? resource.department : undefined), "Thông tin khoa chưa có");
  const startTime = resource.start_time ?? resource.appointment_time;
  const location = destination ? { ...destination, label: facilityName } : undefined;

  return (
    <div className="flex flex-col md:flex-row h-[600px] max-h-[85vh] bg-white">
      <div className={`w-full md:w-[360px] flex-shrink-0 border-r border-slate-200/60 flex flex-col bg-slate-50/50 transition-all ${showInfo ? "block" : "hidden md:flex"}`}>
        <div className="p-6 border-b border-slate-200/60 bg-white">
          <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase mb-1 block">Lịch khám bệnh</span>
          <h3 className="text-xl font-bold text-slate-900">{item.title || "Lịch khám"}</h3>
          <p className="text-sm text-slate-500 mt-1 line-clamp-2">{facilityName}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-0.5">
          <Fact label="Bác sĩ" value={doctor} />
          <Fact label="Chuyên khoa" value={department} />
          <Fact label="Ngày giờ" value={formatDateTime(startTime)} />
          <Fact label="Địa chỉ" value={address} />
          <Fact label="Chi phí" value={formatMoney(resource.price ?? resource.amount, String(resource.currency ?? "VND"))} />
          <Fact label="Trạng thái" value={statusLabel(resource.status ?? item.status)} />
        </div>
      </div>
      <div className="flex-1 relative bg-slate-100 min-h-[300px]">
        {location ? <XOneMap healthcare={location} density="active" label={`Vị trí ${facilityName}`} /> : <div className="absolute inset-0 grid place-items-center text-slate-500 font-medium text-sm text-center px-6">Cơ sở chưa có tọa độ đã xác minh nên X-One không hiển thị vị trí ước lượng.</div>}
        <button className="md:hidden absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-white rounded-full shadow-md text-sm font-semibold text-slate-700 transition-all active:scale-95" type="button" aria-expanded={showInfo} onClick={() => setShowInfo((value) => !value)}>{showInfo ? "Xem bản đồ" : "Thông tin lịch"}</button>
      </div>
    </div>
  );
}

function ActiveRideDetail({ item }: { item: HistoryItem }) {
  const resource = item.resource;
  const bookingId = optionalText(resource.booking_id ?? resource.resource_id ?? resource.id, item.id);
  const summary = rideSummary(item);
  const origin = pointFrom(resource.pickup_latitude, resource.pickup_longitude) ?? nestedPoint(resource.route, "origin");
  const destination = pointFrom(resource.dropoff_latitude, resource.dropoff_longitude) ?? nestedPoint(resource.route, "destination");
  const route = routeFrom(resource.route ?? resource);
  const pickup = optionalText(resource.pickup_address ?? resource.pickup, summary.pickup);
  const dropoff = optionalText(resource.dropoff_address ?? resource.dropoff, summary.dropoff);
  const vehicle = optionalText(resource.vehicle_type ?? resource.vehicle, summary.vehicle);
  const distance = distanceText(resource.distance_km ?? resource.distance, resource.route, summary.distance);
  const duration = durationText(resource.duration_minutes ?? resource.duration, resource.route, summary.duration);
  const fare = rideMoneyText(resource.amount ?? resource.fare, String(resource.currency ?? "VND"), summary.fare);

  return <RideMapDetail bookingId={bookingId} initialOrigin={origin} initialDestination={destination} initialRoute={route} initialRoutePolyline={typeof resource.route_polyline === "string" ? resource.route_polyline : undefined} initialRouteProvider={typeof resource.route_provider === "string" ? resource.route_provider : undefined} initialRouteDistanceMeters={typeof resource.route_distance_meters === "number" ? resource.route_distance_meters : undefined} initialRouteDurationSeconds={typeof resource.route_duration_seconds === "number" ? resource.route_duration_seconds : undefined} status={item.status} facts={[{ label: "Điểm đón", value: pickup }, { label: "Điểm đến", value: dropoff }, { label: "Loại xe", value: vehicle }, { label: "Khoảng cách", value: distance }, { label: "Thời gian dự kiến", value: duration }, { label: "Giá dự kiến", value: fare }]} />;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-3 border-b border-slate-100 last:border-0">
      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <strong className="text-sm font-semibold text-slate-800">{value}</strong>
    </div>
  );
}

function titleFor(type: HistoryItem["type"]): string {
  return type === "ride_booking" ? "Chuyến xe" : type === "food_order" ? "Đơn đồ ăn" : type === "restaurant_reservation" ? "Đặt bàn" : "Lịch khám";
}

function summaryFor(item: HistoryItem): string {
  const resource = item.resource;
  if (item.type === "ride_booking") return `${optionalText(resource.pickup_address ?? resource.pickup)} → ${optionalText(resource.dropoff_address ?? resource.dropoff)}`;
  if (item.type === "food_order") return `${nestedName(resource.restaurant) || optionalText(resource.restaurant_name)} · ${itemsText(resource.items)}`;
  if (item.type === "restaurant_reservation") return `${nestedName(resource.restaurant) || optionalText(resource.name)} · ${formatDateTime(resource.start_at ?? resource.reservation_time)}`;
  return `${nestedName(resource.facility) || optionalText(resource.facility_name)} · ${optionalText(resource.department)}`;
}

function rideSummary(item: HistoryItem): { pickup: string; dropoff: string; vehicle: string; distance: string; duration: string; fare: string } {
  const routeText = [item.detail, item.title].find((value) => /→|->/.test(value)) ?? "";
  const routeParts = routeText.split(/\s+(?:→|->)\s+/).map((value) => value.trim()).filter(Boolean);
  const detailParts = item.detail.split(/\s+·\s+/).map((value) => value.trim()).filter(Boolean);
  return {
    pickup: routeParts[0] ?? "Đang cập nhật",
    dropoff: routeParts[1]?.split(/\s+·\s+/)[0] ?? "Đang cập nhật",
    vehicle: detailParts.find((value) => /^(BIKE|CAR[_-]\d+|xe\s)/i.test(value)) ?? "Đang cập nhật",
    distance: detailParts.find((value) => /\b\d+(?:[.,]\d+)?\s*km\b/i.test(value)) ?? "Đang cập nhật",
    duration: detailParts.find((value) => /\b\d+\s*phút\b/i.test(value)) ?? "Đang cập nhật",
    fare: detailParts.find((value) => /\d[\d.,]*\s*(?:VND|đ|₫)\b/i.test(value)) ?? "Đang cập nhật",
  };
}

function nestedName(value: unknown): string {
  return isRecord(value) ? optionalText(value.name ?? value.title) : typeof value === "string" ? value : "";
}

function itemsText(value: unknown): string {
  if (!Array.isArray(value)) return "Đang cập nhật món";
  return `${value.length} món`;
}

function minutesText(value: unknown): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? `${Math.ceil(numeric)} phút` : "Đang cập nhật";
}

function durationText(value: unknown, route: unknown, fallback = "Đang cập nhật"): string {
  const minutes = Number(value);
  if (Number.isFinite(minutes) && minutes > 0) return `${Math.ceil(minutes)} phút`;
  const seconds = isRecord(route) ? Number(route.duration_seconds) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? `${Math.ceil(seconds / 60)} phút` : fallback;
}

function distanceText(value: unknown, route: unknown, fallback = "Đang cập nhật"): string {
  const direct = Number(value);
  const meters = isRecord(route) ? Number(route.distance_meters) : NaN;
  const km = Number.isFinite(direct) ? direct : Number.isFinite(meters) ? meters / 1000 : NaN;
  return Number.isFinite(km) && km > 0 ? `${km.toFixed(1)} km` : fallback;
}

function rideMoneyText(value: unknown, currency: string, fallback: string): string {
  return value === undefined || value === null || value === "" ? fallback : formatMoney(value, currency);
}

function pointFrom(latitude: unknown, longitude: unknown): XOnePoint | undefined {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { latitude: lat, longitude: lng } : undefined;
}

function pointFromRecord(value: unknown): XOnePoint | undefined {
  if (!isRecord(value)) return undefined;
  if (value.suspicious === true) return undefined;
  return pointFrom(value.latitude, value.longitude) ?? nestedPoint(value, "location");
}

function nestedPoint(value: unknown, key: string): XOnePoint | undefined {
  return isRecord(value) ? pointFrom(isRecord(value[key]) ? value[key].latitude : undefined, isRecord(value[key]) ? value[key].longitude : undefined) : undefined;
}

function routeFrom(value: unknown): XOnePoint[] | undefined {
  const route = isRecord(value) ? value.geometry : value;
  if (!Array.isArray(route)) return undefined;
  const points = route.map((point) => isRecord(point) ? pointFrom(point.latitude, point.longitude) : undefined).filter((point): point is XOnePoint => Boolean(point));
  return points.length > 1 ? points : undefined;
}
