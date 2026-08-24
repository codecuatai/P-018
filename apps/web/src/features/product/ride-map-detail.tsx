// filepath: apps/web/src/features/product/ride-map-detail.tsx
"use client";

import { useState } from "react";

import { RideTrackingPanel } from "./ride-tracking";
import { useRideTracking } from "./ride-tracking-cache";
import { XOneMap, type XOnePoint } from "./xone-map";

export type RideDetailFact = {
  label: string;
  value: string;
};

type RideMapDetailProps = {
  bookingId?: string;
  initialOrigin?: XOnePoint;
  initialDestination?: XOnePoint;
  initialRoute?: XOnePoint[];
  initialRoutePolyline?: string;
  initialRouteProvider?: string;
  initialRouteDistanceMeters?: number | null;
  initialRouteDurationSeconds?: number | null;
  status?: string;
  facts: RideDetailFact[];
};

export function RideMapDetail({ bookingId, initialOrigin, initialDestination, initialRoute, initialRoutePolyline, initialRouteProvider, initialRouteDistanceMeters, initialRouteDurationSeconds, status, facts }: RideMapDetailProps) {
  const [showInfo, setShowInfo] = useState(true);
  const { data: tracking } = useRideTracking(bookingId);
  const driverPhase = tracking?.status === "DRIVER_ASSIGNED" || tracking?.status === "DRIVER_TO_PICKUP";
  const activeRoute = driverPhase ? tracking?.driver_route : tracking?.route;
  const origin = pointFromRecord(tracking?.route?.origin) ?? initialOrigin;
  const destination = pointFromRecord(tracking?.route?.destination) ?? initialDestination;
  const routeGeometry = activeRoute?.geometry ?? initialRoute;
  const routePolyline = driverPhase ? undefined : tracking?.route?.polyline ?? initialRoutePolyline;
  const driver = tracking?.driver_location ?? undefined;
  const routeProvider = activeRoute?.provider ?? tracking?.route_provider ?? initialRouteProvider;
  const routeDistanceMeters = activeRoute?.distance_meters ?? initialRouteDistanceMeters;
  const routeDurationSeconds = activeRoute?.duration_seconds ?? initialRouteDurationSeconds;

  return (
    <div className="flex flex-col md:flex-row h-[600px] max-h-[85vh] bg-white w-full">
      <div className={`w-full md:w-[360px] flex-shrink-0 border-r border-slate-200/60 flex flex-col bg-slate-50/50 transition-all ${showInfo ? "block" : "hidden md:flex"}`}>
        <div className="p-6 border-b border-slate-200/60 bg-white">
          <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase mb-1 block">Chuyến xe</span>
          <h3 className="text-xl font-bold text-slate-900 leading-tight">Chi tiết hành trình</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-0.5">
          {facts.map((fact) => (
            <Fact key={fact.label} label={fact.label} value={fact.value} />
          ))}
        </div>
        {bookingId ? (
          <div className="p-4 bg-white border-t border-slate-200/60 shrink-0">
            <RideTrackingPanel bookingId={bookingId} hideMap />
          </div>
        ) : null}
      </div>
      <div className="flex-1 relative bg-slate-100 min-h-[300px]">
        <XOneMap origin={origin} destination={destination} current={driver ? undefined : tracking?.current_location ?? undefined} driver={driver} density="active" routeGeometry={routeGeometry} routePolyline={routePolyline} routeProvider={routeProvider} routeStatus={tracking?.status ?? status} routeDistanceMeters={routeDistanceMeters} routeDurationSeconds={routeDurationSeconds} label="Bản đồ hành trình chuyến xe" />
        <button className="md:hidden absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-white rounded-full shadow-md text-sm font-semibold text-slate-700 transition-all active:scale-95 z-10" type="button" aria-expanded={showInfo} onClick={() => setShowInfo((value) => !value)}>{showInfo ? "Xem bản đồ" : "Thông tin chuyến"}</button>
      </div>
    </div>
  );
}

function Fact({ label, value }: RideDetailFact) {
  return (
    <div className="flex flex-col gap-1 py-3 border-b border-slate-100 last:border-0">
      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <strong className="text-sm font-semibold text-slate-800 leading-relaxed">{value}</strong>
    </div>
  );
}

function pointFromRecord(value: unknown): XOnePoint | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  return pointFrom(candidate.latitude, candidate.longitude);
}

function pointFrom(latitude: unknown, longitude: unknown): XOnePoint | undefined {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { latitude: lat, longitude: lng } : undefined;
}
