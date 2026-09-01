"use client";

import { ArrowRight, CalendarDays, CarFront, PanelRightClose, Stethoscope, Utensils, UtensilsCrossed } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { errorText, resolveAddress } from "@/lib/api-client";
import { executeServiceCancellation, isCancellableStatus } from "@/lib/cancellation-helpers";
import { formatAddress, formatDateTime, formatMoney, isRecord, optionalText, statusLabel } from "@/lib/presentation";
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
    <aside className={`context-rail context-rail-${mode}`} aria-label="Dịch vụ đang diễn ra" style={style}>
      {resizer}
      <div className="context-rail-heading">
        <div className="context-rail-heading-copy">
          {mode !== "idle" ? <span className="eyebrow">ĐANG DIỄN RA</span> : <span className="eyebrow">TIỆN ÍCH</span>}
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {children}
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
  const typeAccent = item.type === "ride_booking" ? "active-card-ride" : item.type === "food_order" ? "active-card-food" : item.type === "restaurant_reservation" ? "active-card-restaurant" : "active-card-healthcare";
  return <article className={`active-ride-rail-card ${typeAccent}`}>
    <div className="active-card-top-row">
      <div className="active-ride-rail-icon" aria-hidden="true"><Icon size={16} /></div>
      <div className="active-card-header-copy">
        <strong>{item.title || titleFor(item.type)}</strong>
        <span className="active-card-pulse-badge"><span className="pulse-dot" aria-hidden="true" />{statusLabel(status)}</span>
      </div>
    </div>
    {detail && <div className="active-card-detail-line">{detail}</div>}
    <div className="active-card-actions-row">
      <button className="text-link" type="button" onClick={() => onDetails?.(item)}><span>Xem chi tiết</span><ArrowRight size={13} /></button>
      {children}
    </div>
  </article>;
}

export function ActiveWorkRailCardWithCancel({ item, onDetails, onCancelled }: { item: HistoryItem; onDetails?: (item: HistoryItem) => void; onCancelled?: () => void }) {
  const [cancelled, setCancelled] = useState(false);
  const [pending, setPending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");

  const bookingId = item.type === "ride_booking" ? optionalText(item.resource.booking_id ?? item.resource.resource_id ?? item.resource.id, item.id) : undefined;
  const { data: tracking } = useRideTracking(bookingId);
  const status = tracking?.status ?? item.status ?? String(item.resource.status ?? "");
  const canCancel = isCancellableStatus(item.type, status);
  const cancellationLabel = item.type === "restaurant_reservation" ? "Hủy đặt bàn" : item.type === "food_order" ? "Hủy đơn" : "Hủy lịch khám";

  if (cancelled) return null;

  async function handleCancel() {
    setPending(true); setError("");
    try {
      await executeServiceCancellation(item.type, item.resource, item.id);
      setCancelled(true);
      onCancelled?.();
      window.dispatchEvent(new CustomEvent("xone-active-work-changed"));
      if (item.type === "ride_booking") {
        window.dispatchEvent(new CustomEvent("xone-ride-cancelled", { detail: { id: item.id } }));
      }
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setPending(false);
      setShowConfirm(false);
    }
  }

  return <ActiveWorkRailCard item={item} onDetails={onDetails}>
    {item.type === "ride_booking" ? (
      <RideCancelButton bookingId={bookingId} status={status} onCancelled={() => { setCancelled(true); onCancelled?.(); window.dispatchEvent(new CustomEvent("xone-ride-cancelled", { detail: { id: item.id } })); }} className="active-ride-cancel" />
    ) : canCancel ? (
      showConfirm ? (
        <div className="active-card-cancel-confirm">
          <small>{cancellationLabel}?</small>
          <button className="active-work-cancel-confirm" type="button" onClick={() => void handleCancel()} disabled={pending}>{pending ? "Đang hủy…" : "Xác nhận hủy"}</button>
          <button className="active-work-cancel-dismiss" type="button" onClick={() => setShowConfirm(false)} disabled={pending}>Giữ lại</button>
        </div>
      ) : (
        <button className="active-work-cancel-btn" type="button" onClick={() => setShowConfirm(true)}>{cancellationLabel}</button>
      )
    ) : null}
    {error ? <small className="form-error">{error}</small> : null}
  </ActiveWorkRailCard>;
}

export function ConversationContextCards({ onServiceShortcut }: { onServiceShortcut?: (prompt: string) => void }) {
  const services = [
    {
      icon: CarFront,
      label: "Đi xe",
      accent: "service-shortcut-ride",
      prompt: "Đặt xe từ ",
      description: "Xe 4 chỗ, 7 chỗ, nhanh chóng",
    },
    {
      icon: Utensils,
      label: "Đồ ăn",
      accent: "service-shortcut-food",
      prompt: "Tìm ",
      description: "Giao hàng tận nơi",
    },
    {
      icon: UtensilsCrossed,
      label: "Nhà hàng",
      accent: "service-shortcut-restaurant",
      prompt: "Đặt bàn nhà hàng ",
      description: "Ăn tối, tiệc, sự kiện",
    },
    {
      icon: Stethoscope,
      label: "Khám bệnh",
      accent: "service-shortcut-healthcare",
      prompt: "Đặt lịch khám ",
      description: "Đặt hẹn bác sĩ nhanh",
    },
  ];

  return (
    <div className="service-shortcuts">
      <span className="service-shortcuts-label">Bắt đầu từ đây</span>
      <div className="service-shortcuts-grid">
        {services.map(({ icon: Icon, label, accent, prompt, description }) => (
          <button
            key={label}
            type="button"
            className={`service-shortcut-card ${accent}`}
            onClick={() => onServiceShortcut?.(prompt)}
          >
            <span className="service-shortcut-icon"><Icon size={16} aria-hidden="true" /></span>
            <div className="service-shortcut-info">
              <span className="service-shortcut-name">{label}</span>
              <span className="service-shortcut-desc">{description}</span>
            </div>
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
  const address = optionalText(resource.address ?? resource.location);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={`service-detail-dialog active-work-detail-dialog${ride ? " active-ride-detail-dialog" : ""}${restaurant ? " service-detail-dialog-restaurant active-restaurant-detail-dialog" : ""}${healthcare ? " service-detail-dialog-healthcare active-healthcare-detail-dialog" : ""}`}>
      <DialogTitle className={ride || restaurant || healthcare ? "visually-hidden" : undefined}>{title}</DialogTitle>
      <DialogDescription className={ride || restaurant || healthcare ? "visually-hidden" : undefined}>{statusLabel(resource.status ?? item.status)}</DialogDescription>
      {ride ? <ActiveRideDetail item={item} /> : restaurant ? <ActiveRestaurantDetail item={item} /> : healthcare ? <ActiveHealthcareDetail item={item} destination={destination} /> : food ? <ActiveFoodDetail item={item} /> : <div className="service-detail-dialog-body">
        <div className="consumer-detail-grid">
          <>
            <Fact label="Cơ sở" value={nestedName(resource.facility) || optionalText(resource.facility_name)} />
            <Fact label="Chuyên khoa" value={optionalText(resource.department)} />
            <Fact label="Bác sĩ" value={optionalText(resource.doctor_name ?? resource.doctor)} />
            <Fact label="Thời gian" value={formatDateTime(resource.start_time ?? resource.appointment_time)} />
            <Fact label="Chi phí" value={formatMoney(resource.price ?? resource.amount, String(resource.currency ?? "VND"))} />
          </>
        </div>
        {destination || origin ? <XOneMap origin={origin} destination={destination} routeGeometry={route} routePolyline={routePolyline} label={`${title}: vị trí`} /> : null}
      </div>}
    </DialogContent>
  </Dialog>;
}

function ActiveFoodDetail({ item }: { item: HistoryItem }) {
  const resource = item.resource;
  const orderId = optionalText(resource.id ?? resource.order_id ?? resource.resource_id, item.id);
  const pickupStops = Array.isArray(resource.pickup_stops) ? resource.pickup_stops.filter(isRecord) : [];
  const pickupNames = pickupStops.map((stop) => nestedName(stop)).filter(Boolean);
  return <div className="service-detail-dialog-body food-active-detail"><div className="consumer-detail-grid"><Fact label="Điểm lấy hàng" value={pickupNames.length ? pickupNames.join(" → ") : nestedName(resource.restaurant) || optionalText(resource.restaurant_name)} /><Fact label="Địa chỉ giao" value={optionalText(resource.delivery_address ?? resource.address)} /><Fact label="Món đã chọn" value={itemsText(resource.items)} /><Fact label="Tổng đơn" value={formatMoney(resource.total ?? resource.amount, String(resource.currency ?? "VND"))} /><Fact label="Trạng thái" value={statusLabel(resource.status ?? item.status)} /></div>{orderId ? <FoodTrackingPanel orderId={orderId} /> : null}</div>;
}

function ActiveRestaurantDetail({ item }: { item: HistoryItem }) {
  const [resolvedPoint, setResolvedPoint] = useState<XOnePoint>();
  const [resolving, setResolving] = useState(false);
  const resource = item.resource;
  const restaurant = isRecord(resource.restaurant) ? resource.restaurant : undefined;
  const name = nestedName(restaurant) || optionalText(resource.restaurant_name ?? resource.name, "Nhà hàng");
  const address = formatAddress(resource.address, restaurant?.address, restaurant?.location, resource.district, restaurant?.district, resource.city, restaurant?.city) || "Địa chỉ nhà hàng chưa có";
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
  return <div className={`restaurant-map-detail${location ? "" : " restaurant-map-detail-no-map"}`}>
    <section className={`restaurant-map-stage${location ? "" : " is-unavailable"}`} aria-label="Bản đồ và thông tin đặt bàn">
      <div className="restaurant-map-canvas">
        {location ? <XOneMap restaurant={location} variant="location-detail" density="active" label={`Vị trí ${name}`} /> : resolving ? <p className="inline-note restaurant-map-empty">Đang xác định vị trí từ địa chỉ nhà hàng…</p> : <p className="inline-note restaurant-map-empty">{address}</p>}
        <aside className="restaurant-map-info-panel" aria-label="Thông tin đặt bàn"><span className="eyebrow">ĐẶT BÀN ĐÃ XÁC NHẬN</span><h3>{name}</h3><p>{address}</p><div className="consumer-detail-grid"><Fact label="Thời gian" value={formatDateTime(resource.start_at ?? resource.reservation_time)} /><Fact label="Số khách" value={resource.party_size ? `${String(resource.party_size)} người` : "Chưa có"} /><Fact label="Trạng thái" value={statusLabel(resource.status ?? item.status)} /><Fact label="Bàn" value={optionalText(resource.table_code, "Đã sắp xếp")} /><Fact label="Ẩm thực" value={optionalText(restaurant?.cuisine, "Theo thực đơn nhà hàng")} /><Fact label="Đánh giá" value={typeof restaurant?.rating === "number" ? `${String(restaurant.rating)} ★` : "Chưa có"} /><Fact label="Mức giá" value={optionalText(restaurant?.price_level, "Chưa có")} /><Fact label="Giờ mở cửa" value="Hằng ngày: 08:00–22:00" /></div></aside>
      </div>
    </section>
  </div>;
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
  return <div className="healthcare-map-detail active-healthcare-map-detail"><section className="healthcare-map-stage" aria-label="Bản đồ và thông tin lịch khám"><div className="healthcare-map-canvas">
    {location ? <XOneMap healthcare={location} density="active" label={`Vị trí ${facilityName}`} /> : <p className="inline-note">Cơ sở chưa có tọa độ đã xác minh nên X-One không hiển thị vị trí ước lượng.</p>}
    <button className="detail-info-button healthcare-map-info-button" type="button" aria-expanded={showInfo} onClick={() => setShowInfo((value) => !value)}>{showInfo ? "Ẩn thông tin" : "Thông tin lịch"}</button>
    {showInfo ? <aside className="healthcare-map-info-panel" aria-label="Thông tin lịch khám"><span className="eyebrow">LỊCH KHÁM</span><h3>{item.title || "Lịch khám"}</h3><p>{facilityName}</p><div className="consumer-detail-grid"><Fact label="Bác sĩ" value={doctor} /><Fact label="Chuyên khoa" value={department} /><Fact label="Ngày giờ" value={formatDateTime(startTime)} /><Fact label="Địa chỉ" value={address} /><Fact label="Chi phí" value={formatMoney(resource.price ?? resource.amount, String(resource.currency ?? "VND"))} /><Fact label="Trạng thái" value={statusLabel(resource.status ?? item.status)} /></div></aside> : null}
  </div></section></div>;
}

function ActiveRideDetail({ item }: { item: HistoryItem }) {
  const resource = item.resource;
  const bookingId = optionalText(resource.booking_id ?? resource.resource_id ?? resource.id, item.id);
  const summary = rideSummary(item);
  const origin = pointFrom(resource.pickup_latitude, resource.pickup_longitude) ?? nestedPoint(resource.route, "origin");
  const destination = pointFrom(resource.dropoff_latitude, resource.dropoff_longitude) ?? nestedPoint(resource.route, "destination");
  const stopovers = Array.isArray(resource.stopovers)
    ? resource.stopovers.flatMap((stopover) => {
      const point = pointFromRecord(stopover);
      return point ? [{ ...point, label: optionalText(isRecord(stopover) ? stopover.address : undefined) }] : [];
    })
    : [];
  const route = routeFrom(resource.route ?? resource);
  const pickup = optionalText(resource.pickup_address ?? resource.pickup, summary.pickup);
  const dropoff = optionalText(resource.dropoff_address ?? resource.dropoff, summary.dropoff);
  const vehicle = optionalText(resource.vehicle_type ?? resource.vehicle, summary.vehicle);
  const distance = distanceText(resource.distance_km ?? resource.distance, resource.route, summary.distance);
  const duration = durationText(resource.duration_minutes ?? resource.duration, resource.route, summary.duration);
  const fare = rideMoneyText(resource.amount ?? resource.fare, String(resource.currency ?? "VND"), summary.fare);

  return <RideMapDetail bookingId={bookingId} initialOrigin={origin} initialDestination={destination} initialStopovers={stopovers} initialRoute={route} initialRoutePolyline={typeof resource.route_polyline === "string" ? resource.route_polyline : undefined} initialRouteProvider={typeof resource.route_provider === "string" ? resource.route_provider : undefined} initialRouteDistanceMeters={typeof resource.route_distance_meters === "number" ? resource.route_distance_meters : undefined} initialRouteDurationSeconds={typeof resource.route_duration_seconds === "number" ? resource.route_duration_seconds : undefined} status={item.status} facts={[{ label: "Điểm đón", value: pickup }, { label: "Điểm đến", value: dropoff }, { label: "Loại xe", value: vehicle }, { label: "Khoảng cách", value: distance }, { label: "Thời gian dự kiến", value: duration }, { label: "Giá dự kiến", value: fare }]} />;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="consumer-detail-fact"><span>{label}</span><strong>{value}</strong></div>;
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
  if (value.suspicious === true || value.coordinate_status === "suspicious_default") return undefined;
  return pointFrom(value.latitude, value.longitude)
    ?? nestedPoint(value, "location")
    ?? nestedPoint(value, "coordinates")
    ?? nestedPoint(value, "coordinate");
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
