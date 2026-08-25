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
  const [showInfo, setShowInfo] = useState(false);
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

  return <div className={`ride-map-detail${bookingId ? " has-status" : " no-status"}`}>
    <section className="ride-map-stage" aria-label="Bản đồ hành trình chuyến xe">
      <div className="ride-map-canvas">
        <XOneMap origin={origin} destination={destination} current={driver ? undefined : tracking?.current_location ?? undefined} driver={driver} density="active" routeGeometry={routeGeometry} routePolyline={routePolyline} routeProvider={routeProvider} routeStatus={tracking?.status ?? status} routeDistanceMeters={routeDistanceMeters} routeDurationSeconds={routeDurationSeconds} label="Bản đồ hành trình chuyến xe" />
        <button className="detail-info-button ride-map-info-button" type="button" aria-expanded={showInfo} onClick={() => setShowInfo((value) => !value)}>Thông tin chuyến</button>
        {showInfo ? <aside className="ride-map-info-panel" aria-label="Thông tin chuyến"><div className="consumer-detail-grid">{facts.map((fact) => <Fact key={fact.label} label={fact.label} value={fact.value} />)}</div></aside> : null}
      </div>
    </section>
    {bookingId ? <RideTrackingPanel bookingId={bookingId} hideMap polling className="ride-map-status-panel" /> : null}
  </div>;
}

function Fact({ label, value }: RideDetailFact) {
  return <div className="consumer-detail-fact"><span>{label}</span><strong>{value}</strong></div>;
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
