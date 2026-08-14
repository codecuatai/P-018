"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { statusLabel } from "@/lib/presentation";

export type XOnePoint = {
  latitude: number;
  longitude: number;
  label?: string;
  suspicious?: boolean;
};

type LeafletMap = import("leaflet").Map;
type LeafletApi = typeof import("leaflet");
type LeafletMarker = import("leaflet").CircleMarker;
type MarkerKey = "origin" | "destination" | "current" | "user" | "driver" | "restaurant" | "healthcare";

type XOneMapProps = {
  origin?: XOnePoint | null;
  destination?: XOnePoint | null;
  current?: XOnePoint | null;
  user?: XOnePoint | null;
  driver?: XOnePoint | null;
  restaurant?: XOnePoint | null;
  healthcare?: XOnePoint | null;
  routePolyline?: string | null;
  routeGeometry?: XOnePoint[] | null;
  routeProvider?: string;
  routeStatus?: string;
  routeDistanceMeters?: number | null;
  routeDurationSeconds?: number | null;
  providerUnavailable?: boolean;
  locationDenied?: boolean;
  density?: "default" | "active";
  label?: string;
};

type MapState = "loading" | "ready" | "error";

const TILE_BASE_URL = "https://maps.geoapify.com/v1/tile";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · <a href="https://www.geoapify.com/">Geoapify</a> · <a href="https://openmaptiles.org/">OpenMapTiles</a>';

export function XOneMap({
  origin,
  destination,
  current,
  user,
  driver,
  restaurant,
  healthcare,
  routePolyline,
  routeGeometry,
  routeProvider,
  routeStatus,
  routeDistanceMeters,
  routeDurationSeconds,
  providerUnavailable = false,
  locationDenied = false,
  density = "default",
  label = "Sơ đồ vị trí",
}: XOneMapProps) {
  const mapNodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<LeafletApi | undefined>(undefined);
  const tileLayerRef = useRef<import("leaflet").TileLayer | undefined>(undefined);
  const markerRefs = useRef<Partial<Record<MarkerKey, LeafletMarker>>>({});
  const polylineRef = useRef<import("leaflet").Polyline | undefined>(undefined);
  const fitKeyRef = useRef("");
  const [mapState, setMapState] = useState<MapState>("loading");
  const [retryVersion, setRetryVersion] = useState(0);
  const mapData = useMemo(() => {
    const parsedRoute = (routeGeometry ?? parseRoute(routePolyline)).map(sanitizePoint).filter(isPoint);
    const markers = {
      origin: sanitizePoint(origin),
      destination: sanitizePoint(destination),
      current: sanitizePoint(current),
      user: sanitizePoint(user),
      driver: sanitizePoint(driver),
      restaurant: sanitizePoint(restaurant),
      healthcare: sanitizePoint(healthcare),
    };
    const points = [...parsedRoute, ...Object.values(markers)].filter(isPoint);
    return { route: parsedRoute, markers, points };
  }, [current, destination, driver, healthcare, origin, restaurant, routeGeometry, routePolyline, user]);

  const mapTargetAvailable = !providerUnavailable && mapData.points.length > 0 && mapState !== "error";

  useEffect(() => {
    if (providerUnavailable || !mapData.points.length) {
      setMapState("error");
      return;
    }
    if (mapState === "error" || !mapTargetAvailable || !mapNodeRef.current) {
      return;
    }

    let disposed = false;
    let resizeFrame: number | undefined;
    let resizeTimer: number | undefined;

    const invalidateMapSize = (map: LeafletMap): void => {
      if (disposed || mapRef.current !== map || !mapNodeRef.current?.isConnected) return;
      try { map.invalidateSize({ animate: false }); } catch { /* map is being removed */ }
    };

    async function createMap(): Promise<void> {
      try {
        if (mapRef.current) return;
        const leafletModule = await import("leaflet");
        if (disposed || !mapNodeRef.current) return;
        const L = (leafletModule.default ?? leafletModule) as typeof import("leaflet");
        const map = L.map(mapNodeRef.current, { zoomControl: false, attributionControl: true, preferCanvas: true });
        mapRef.current = map;
        leafletRef.current = L;
        const browserKey = process.env.NEXT_PUBLIC_GEOAPIFY_MAP_API_KEY?.trim();
        const style = process.env.NEXT_PUBLIC_GEOAPIFY_MAP_STYLE?.trim() || "osm-bright";
        if (!browserKey || browserKey.includes("__PASTE_")) throw new Error("map-key-unavailable");
        const tileUrl = `${TILE_BASE_URL}/${encodeURIComponent(style)}/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(browserKey)}`;
        const tileLayer = L.tileLayer(tileUrl, { attribution: TILE_ATTRIBUTION, maxZoom: 19 });
        tileLayerRef.current = tileLayer;
        tileLayer.on("tileerror", () => { if (!disposed) setMapState("error"); });
        tileLayer.addTo(map);
        resizeFrame = window.requestAnimationFrame(() => invalidateMapSize(map));
        resizeTimer = window.setTimeout(() => invalidateMapSize(map), 120);
        if (!disposed) setMapState("ready");
      } catch {
        if (!disposed) setMapState("error");
      }
    }

    setMapState("loading");
    void createMap();
    return () => {
      disposed = true;
      if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
      if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
      tileLayerRef.current?.off();
      Object.values(markerRefs.current).forEach((marker) => marker?.remove());
      polylineRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = undefined;
      tileLayerRef.current = undefined;
      markerRefs.current = {};
      polylineRef.current = undefined;
      fitKeyRef.current = "";
    };
  }, [mapTargetAvailable, providerUnavailable, retryVersion]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || mapState !== "ready") return;

    const route = mapData.route.length > 1 ? mapData.route : [];
    if (route.length > 1) {
      if (!polylineRef.current) {
        polylineRef.current = L.polyline(route.map(toLatLng), { color: "#315EF5", weight: 5, opacity: 0.86, lineCap: "round", lineJoin: "round" }).addTo(map);
      } else {
        polylineRef.current.setLatLngs(route.map(toLatLng));
      }
    } else if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = undefined;
    }

    const markerStyles: Array<[MarkerKey, string, string]> = [
      ["origin", "#102A43", "Điểm đón"],
      ["destination", "#1F9D68", "Điểm đến"],
      ["current", "#315EF5", "Vị trí hiện tại"],
      ["user", "#315EF5", "Vị trí của bạn"],
      ["driver", "#E07A3F", "Tài xế"],
      ["restaurant", "#E07A3F", "Nhà hàng"],
      ["healthcare", "#A54D86", "Cơ sở y tế"],
    ];
    for (const [key, color, markerLabel] of markerStyles) {
      const point = mapData.markers[key];
      const existing = markerRefs.current[key];
      if (!point) {
        existing?.remove();
        delete markerRefs.current[key];
        continue;
      }
      const marker = existing ?? L.circleMarker(toLatLng(point), { radius: key === "current" || key === "driver" ? 8 : 7, color: "#FFFFFF", weight: 2, fillColor: color, fillOpacity: 1 }).addTo(map);
      marker.setLatLng(toLatLng(point));
      marker.unbindTooltip();
      marker.bindTooltip(point.label ?? markerLabel, { direction: "top", offset: [0, -6] });
      markerRefs.current[key] = marker;
    }

    const fitPoints = [...route, ...["origin", "destination", "user", "restaurant", "healthcare"].map((key) => mapData.markers[key as MarkerKey]).filter(isPoint)];
    const fitKey = fitPoints.map((point) => `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`).join("|");
    if (fitKey && fitKey !== fitKeyRef.current) {
      fitKeyRef.current = fitKey;
      map.fitBounds(L.latLngBounds(fitPoints.map(toLatLng)), { padding: [24, 24], maxZoom: 15 });
    }
  }, [mapData, mapState]);

  const canRenderMap = mapTargetAvailable;
  return <section className={`xone-map xone-map-${density}`} aria-label={label}>
    <div className="xone-map-toolbar">
      <small>{routeProvider ? "Lộ trình đã được cập nhật" : "Bản đồ vị trí"}</small>
      <span>
        <button type="button" aria-label="Thu nhỏ bản đồ" onClick={() => mapRef.current?.zoomOut()} disabled={!canRenderMap}><Minus size={13} /></button>
        <button type="button" aria-label="Phóng to bản đồ" onClick={() => mapRef.current?.zoomIn()} disabled={!canRenderMap}><Plus size={13} /></button>
      </span>
    </div>
    {canRenderMap ? <div ref={mapNodeRef} className={`xone-map-leaflet xone-map-leaflet-${density}`} data-map-state={mapState} role="img" aria-label={`${label}: bản đồ nền và các điểm đã xác minh`} /> : <MapFallback label={label} points={mapData.points} providerUnavailable={providerUnavailable} locationDenied={locationDenied} routeProvider={routeProvider} routeStatus={routeStatus} routeDistanceMeters={routeDistanceMeters} routeDurationSeconds={routeDurationSeconds} onRetry={() => { setMapState("loading"); setRetryVersion((value) => value + 1); }} />}
    {mapData.points.length ? <div className="xone-map-legend"><LegendDot color="origin" label="Điểm đi" show={Boolean(mapData.markers.origin)} /><LegendDot color="destination" label="Điểm đến" show={Boolean(mapData.markers.destination)} /><LegendDot color="current" label="Vị trí hiện tại" show={Boolean(mapData.markers.current || mapData.markers.driver)} /></div> : null}
    <small>{mapState === "loading" && canRenderMap ? "Đang tải bản đồ nền…" : mapData.route.length > 1 ? "Tuyến đường hiển thị theo dữ liệu đã xác minh." : mapData.markers.origin && mapData.markers.destination ? "Chưa có dữ liệu đường đi cho chuyến này." : "Chỉ hiển thị các tọa độ đã được xác minh."}</small>
  </section>;
}

function MapFallback({ label, points, providerUnavailable, locationDenied, routeProvider, routeStatus, routeDistanceMeters, routeDurationSeconds, onRetry }: { label: string; points: XOnePoint[]; providerUnavailable: boolean; locationDenied: boolean; routeProvider?: string; routeStatus?: string; routeDistanceMeters?: number | null; routeDurationSeconds?: number | null; onRetry: () => void }) {
  const reason = providerUnavailable
    ? "Dịch vụ bản đồ/đường đi hiện không khả dụng."
    : locationDenied
      ? "Quyền vị trí chưa được cấp; không tự đoán tọa độ."
      : points.length
        ? "Bản đồ nền chưa tải được trong môi trường hiện tại."
        : "Chưa có tọa độ đã xác minh.";
  return <div className="xone-map-fallback" role="img" aria-label={`${label}: ${reason}`}>
    <strong>{providerUnavailable || points.length ? "Hiện chưa tải được bản đồ." : reason}</strong>
    {providerUnavailable || points.length ? <button className="button button-secondary" type="button" onClick={onRetry}>Thử lại</button> : null}
    <span>{points.length ? `${points.length} điểm đã xác minh sẵn sàng cho bản đồ.` : "Hãy chọn địa điểm có dữ liệu định vị hoặc bật quyền vị trí."}</span>
    {routeProvider || routeStatus || routeDistanceMeters || routeDurationSeconds ? <dl><div><dt>Lộ trình</dt><dd>{routeStatus ? statusLabel(routeStatus) : "Đã cập nhật"}</dd></div>{routeDistanceMeters ? <div><dt>Khoảng cách</dt><dd>{(routeDistanceMeters / 1000).toFixed(1)} km</dd></div> : null}{routeDurationSeconds ? <div><dt>Thời lượng</dt><dd>{Math.ceil(routeDurationSeconds / 60)} phút</dd></div> : null}</dl> : null}
  </div>;
}

function LegendDot({ color, label, show }: { color: string; label: string; show: boolean }) {
  return show ? <span><i className={`legend-dot ${color}`} />{label}</span> : null;
}

function parseRoute(value?: string | null): XOnePoint[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((point) => sanitizePoint(point)).filter(isPoint) : [];
  } catch {
    return [];
  }
}

function sanitizePoint(value: unknown): XOnePoint | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  const latitude = candidate.latitude;
  const longitude = candidate.longitude;
  if (candidate.suspicious === true || typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
  return { latitude, longitude, ...(typeof candidate.label === "string" ? { label: candidate.label } : {}) };
}

function isPoint(value: XOnePoint | undefined): value is XOnePoint {
  return Boolean(value);
}

function toLatLng(point: XOnePoint): [number, number] {
  return [point.latitude, point.longitude];
}
