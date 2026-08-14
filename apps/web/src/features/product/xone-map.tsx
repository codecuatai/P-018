"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type XOnePoint = {
  latitude: number;
  longitude: number;
  label?: string;
  suspicious?: boolean;
};

type LeafletMap = import("leaflet").Map;

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

  useEffect(() => {
    if (providerUnavailable || !mapData.points.length || !mapNodeRef.current) {
      setMapState(providerUnavailable || !mapData.points.length ? "error" : "loading");
      return;
    }

    let disposed = false;
    let tileLayer: import("leaflet").TileLayer | undefined;
    let resizeFrame: number | undefined;
    let resizeTimer: number | undefined;

    const invalidateMapSize = (map: LeafletMap): void => {
      if (disposed || mapRef.current !== map || !mapNodeRef.current?.isConnected) return;
      try {
        map.invalidateSize({ animate: false });
      } catch {
        // Leaflet can be unmounted between the DOM check and invalidateSize.
      }
    };

    async function createMap(): Promise<void> {
      try {
        const leafletModule = await import("leaflet");
        if (disposed || !mapNodeRef.current) return;
        const L = (leafletModule.default ?? leafletModule) as typeof import("leaflet");
        const map = L.map(mapNodeRef.current, {
          zoomControl: false,
          attributionControl: true,
          preferCanvas: true,
        });
        mapRef.current = map;
        const browserKey = process.env.NEXT_PUBLIC_GEOAPIFY_MAP_API_KEY?.trim();
        const style = process.env.NEXT_PUBLIC_GEOAPIFY_MAP_STYLE?.trim() || "osm-bright";
        if (!browserKey || browserKey.includes("__PASTE_")) throw new Error("map-key-unavailable");
        const tileUrl = `${TILE_BASE_URL}/${encodeURIComponent(style)}/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(browserKey)}`;
        tileLayer = L.tileLayer(tileUrl, { attribution: TILE_ATTRIBUTION, maxZoom: 19 });
        tileLayer.on("tileerror", () => {
          if (!disposed) setMapState("error");
        });
        tileLayer.addTo(map);

        const route = mapData.route.length > 1 ? mapData.route : [];
        if (route.length > 1) {
          L.polyline(route.map(toLatLng), {
            color: "#315EF5",
            weight: 5,
            opacity: 0.86,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(map);
        }

        const markerStyles: Array<[keyof typeof mapData.markers, string, string]> = [
          ["origin", "#102A43", "Điểm đi"],
          ["destination", "#1F9D68", "Điểm đến"],
          ["current", "#315EF5", "Vị trí hiện tại"],
          ["user", "#315EF5", "Vị trí của bạn"],
          ["driver", "#E07A3F", "Tài xế"],
          ["restaurant", "#E07A3F", "Nhà hàng"],
          ["healthcare", "#A54D86", "Cơ sở y tế"],
        ];
        for (const [key, color, markerLabel] of markerStyles) {
          const point = mapData.markers[key];
          if (!point) continue;
          const marker = L.circleMarker(toLatLng(point), {
            radius: key === "current" || key === "driver" ? 8 : 7,
            color: "#FFFFFF",
            weight: 2,
            fillColor: color,
            fillOpacity: 1,
          }).addTo(map);
          marker.bindTooltip(point.label ?? markerLabel, { direction: "top", offset: [0, -6] });
        }

        const bounds = L.latLngBounds(mapData.points.map(toLatLng));
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
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
      tileLayer?.off();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mapData, providerUnavailable, retryVersion]);

  const canRenderMap = mapData.points.length > 0 && !providerUnavailable && mapState !== "error";
  return <section className={`xone-map xone-map-${density}`} aria-label={label}>
    <div className="xone-map-toolbar">
      <small>{routeProvider ? `Lộ trình: ${routeProvider === "geoapify" ? "Geoapify" : "đã xác minh"}` : "Bản đồ nền OpenStreetMap"}</small>
      <span>
        <button type="button" aria-label="Thu nhỏ bản đồ" onClick={() => mapRef.current?.zoomOut()} disabled={!canRenderMap}><Minus size={13} /></button>
        <button type="button" aria-label="Phóng to bản đồ" onClick={() => mapRef.current?.zoomIn()} disabled={!canRenderMap}><Plus size={13} /></button>
      </span>
    </div>
    {canRenderMap ? <div ref={mapNodeRef} className={`xone-map-leaflet xone-map-leaflet-${density}`} data-map-state={mapState} role="img" aria-label={`${label}: bản đồ nền và các điểm đã xác minh`} /> : <MapFallback label={label} points={mapData.points} providerUnavailable={providerUnavailable} locationDenied={locationDenied} routeProvider={routeProvider} routeStatus={routeStatus} routeDistanceMeters={routeDistanceMeters} routeDurationSeconds={routeDurationSeconds} onRetry={() => { setMapState("loading"); setRetryVersion((value) => value + 1); }} />}
    {mapData.points.length ? <div className="xone-map-legend"><LegendDot color="origin" label="Điểm đi" show={Boolean(mapData.markers.origin)} /><LegendDot color="destination" label="Điểm đến" show={Boolean(mapData.markers.destination)} /><LegendDot color="current" label="Vị trí hiện tại" show={Boolean(mapData.markers.current || mapData.markers.driver)} /></div> : null}
    <small>{mapState === "loading" && canRenderMap ? "Đang tải bản đồ nền…" : mapData.markers.origin && mapData.markers.destination ? "Tuyến hiển thị theo lộ trình đã xác minh; tọa độ không hợp lệ không được vẽ." : "Chỉ hiển thị các tọa độ đã được xác minh."}</small>
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
    {routeProvider || routeStatus || routeDistanceMeters || routeDurationSeconds ? <dl><div><dt>Lộ trình</dt><dd>{routeStatus ?? (routeProvider === "geoapify" ? "Geoapify" : "Đã xác minh")}</dd></div>{routeDistanceMeters ? <div><dt>Khoảng cách</dt><dd>{(routeDistanceMeters / 1000).toFixed(1)} km</dd></div> : null}{routeDurationSeconds ? <div><dt>Thời lượng</dt><dd>{Math.ceil(routeDurationSeconds / 60)} phút</dd></div> : null}</dl> : null}
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
