"use client";

import { ArrowRight, CalendarDays, CarFront, Stethoscope, Utensils } from "lucide-react";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime, formatMoney, isRecord, optionalText, statusLabel } from "@/lib/presentation";
import type { HistoryItem } from "@/types";

import { RideTrackingPanel } from "./ride-tracking";
import { XOneMap, type XOnePoint } from "./xone-map";

export type ContextRailMode = "idle" | "active" | "tracking" | "recovery";

export function ContextRail({ mode, title, description, children }: { mode: ContextRailMode; title: string; description: string; children: ReactNode }) {
  return <aside className={`context-rail context-rail-${mode}`} aria-label="Dịch vụ đang diễn ra">
    {mode !== "idle" ? <div className="context-rail-heading"><span className="eyebrow">ĐANG DIỄN RA</span><h2>{title}</h2><p>{description}</p></div> : null}
    {children}
  </aside>;
}

export function ActiveRideRailCard({ ride, onDetails }: { ride: HistoryItem; onDetails?: (item: HistoryItem) => void }) {
  return <ActiveWorkRailCard item={ride} onDetails={onDetails} />;
}

export function ActiveWorkRailCard({ item, onDetails }: { item: HistoryItem; onDetails?: (item: HistoryItem) => void }) {
  const status = item.status || String(item.resource.status ?? "");
  const Icon = item.type === "ride_booking" ? CarFront : item.type === "food_order" ? Utensils : item.type === "restaurant_reservation" ? CalendarDays : Stethoscope;
  return <article className="active-ride-rail-card">
    <div className="active-ride-rail-icon" aria-hidden="true"><Icon size={18} /></div>
    <div><strong>{item.title || titleFor(item.type)}</strong><span>{item.detail || summaryFor(item)}</span><small>{statusLabel(status)}</small></div>
    <button className="text-link" type="button" onClick={() => onDetails?.(item)}><span>Xem chi tiết</span><ArrowRight size={14} /></button>
  </article>;
}

export function ConversationContextCards() {
  return <p className="context-empty-state">Chưa có dịch vụ đang diễn ra.</p>;
}

export function ActiveWorkDetailDialog({ item, open, onOpenChange }: { item: HistoryItem | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!item) return null;
  const resource = item.resource;
  const ride = item.type === "ride_booking";
  const food = item.type === "food_order";
  const restaurant = item.type === "restaurant_reservation";
  const title = item.title || titleFor(item.type);
  const origin = ride ? pointFrom(resource.pickup_latitude, resource.pickup_longitude) ?? nestedPoint(resource.route, "origin") : undefined;
  const destination = ride ? pointFrom(resource.dropoff_latitude, resource.dropoff_longitude) ?? nestedPoint(resource.route, "destination") : pointFrom(resource.latitude, resource.longitude) ?? pointFromRecord(restaurant || food ? resource.restaurant : resource.facility);
  const driver = ride ? pointFrom(resource.driver_latitude ?? resource.current_latitude, resource.driver_longitude ?? resource.current_longitude) ?? pointFromRecord(resource.driver_location) : undefined;
  const route = ride ? routeFrom(resource.route ?? resource) : undefined;
  const routePolyline = typeof resource.route_polyline === "string" ? resource.route_polyline : undefined;
  const address = optionalText(resource.address ?? resource.location);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="service-detail-dialog active-work-detail-dialog">
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{statusLabel(resource.status ?? item.status)}</DialogDescription>
      <div className="service-detail-dialog-body">
        <div className="consumer-detail-grid">
          {ride ? <>
            <Fact label="Điểm đón" value={optionalText(resource.pickup_address ?? resource.pickup)} />
            <Fact label="Điểm đến" value={optionalText(resource.dropoff_address ?? resource.dropoff ?? resource.destination)} />
            <Fact label="Loại xe" value={optionalText(resource.vehicle_type ?? resource.vehicle)} />
            <Fact label="Giá dự kiến" value={formatMoney(resource.amount ?? resource.fare, String(resource.currency ?? "VND"))} />
            <Fact label="Thời gian dự kiến" value={minutesText(resource.duration_minutes ?? resource.duration)} />
            <Fact label="Khoảng cách" value={distanceText(resource.distance_km ?? resource.distance, resource.route)} />
          </> : food ? <>
            <Fact label="Nhà hàng" value={nestedName(resource.restaurant) || optionalText(resource.restaurant_name)} />
            <Fact label="Tổng đơn" value={formatMoney(resource.total ?? resource.amount, String(resource.currency ?? "VND"))} />
            <Fact label="Địa chỉ giao" value={address} />
            <Fact label="Món đã chọn" value={itemsText(resource.items)} />
          </> : restaurant ? <>
            <Fact label="Nhà hàng" value={nestedName(resource.restaurant) || optionalText(resource.name)} />
            <Fact label="Thời gian" value={formatDateTime(resource.start_at ?? resource.reservation_time)} />
            <Fact label="Số khách" value={resource.party_size ? `${String(resource.party_size)} người` : "Đang cập nhật"} />
            <Fact label="Địa chỉ" value={address} />
          </> : <>
            <Fact label="Cơ sở" value={nestedName(resource.facility) || optionalText(resource.facility_name)} />
            <Fact label="Chuyên khoa" value={optionalText(resource.department)} />
            <Fact label="Bác sĩ" value={optionalText(resource.doctor_name ?? resource.doctor)} />
            <Fact label="Thời gian" value={formatDateTime(resource.start_time ?? resource.appointment_time)} />
            <Fact label="Chi phí" value={formatMoney(resource.price ?? resource.amount, String(resource.currency ?? "VND"))} />
          </>}
        </div>
        {destination || origin || driver ? <XOneMap origin={origin} destination={destination} current={driver} driver={driver} routeGeometry={route} routePolyline={routePolyline} label={ride ? "Hành trình chuyến xe" : `${title}: vị trí`} /> : null}
        {ride ? <RideTrackingPanel bookingId={optionalText(resource.booking_id ?? resource.resource_id ?? resource.id, item.id)} /> : null}
      </div>
    </DialogContent>
  </Dialog>;
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

function distanceText(value: unknown, route: unknown): string {
  const direct = Number(value);
  const meters = isRecord(route) ? Number(route.distance_meters) : NaN;
  const km = Number.isFinite(direct) ? direct : Number.isFinite(meters) ? meters / 1000 : NaN;
  return Number.isFinite(km) && km > 0 ? `${km.toFixed(1)} km` : "Đang cập nhật";
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
