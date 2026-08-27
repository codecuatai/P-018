"use client";

import { Minus, Plus, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import { statusLabel } from "@/lib/presentation";

export type XOnePoint = {
  latitude: number;
  longitude: number;
  label?: string;
  suspicious?: boolean;
};

type LeafletMap = import("leaflet").Map;
type LeafletApi = typeof import("leaflet");
type LeafletMarker = import("leaflet").CircleMarker | import("leaflet").Marker;
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
const DRIVER_MOTION_DURATION_MS = 1_250;
const MARKER_STYLES: Record<MarkerKey, { color: string; label: string }> = {
  origin: { color: "#102A43", label: "Điểm đón" },
  destination: { color: "#1F9D68", label: "Điểm đến" },
  current: { color: "#315EF5", label: "Vị trí hiện tại" },
  user: { color: "#315EF5", label: "Vị trí của bạn" },
  driver: { color: "#E07A3F", label: "Tài xế" },
  restaurant: { color: "#E07A3F", label: "Nhà hàng" },
  healthcare: { color: "#A54D86", label: "Cơ sở y tế" },
};
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · <a href="https://www.geoapify.com/">Geoapify</a> · <a href="https://openmaptiles.org/">OpenMapTiles</a>';
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

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
  const markerAnimationRefs = useRef<Partial<Record<MarkerKey, number>>>({});
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

  const hasTargetPoints = !providerUnavailable && mapData.points.length > 0;
  const canRenderMap = hasTargetPoints && mapState !== "error";

  useEffect(() => {
    if (hasTargetPoints && mapState === "error") {
      setMapState("loading");
    }
  }, [hasTargetPoints]);

  useEffect(() => {
    if (!hasTargetPoints || !mapNodeRef.current) {
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
        const configuredStyle = process.env.NEXT_PUBLIC_GEOAPIFY_MAP_STYLE?.trim();
        const style = !configuredStyle || configuredStyle === "osm-bright" ? "osm-bright-smooth" : configuredStyle;
        // Geoapify is optional. Without a usable browser key the map still renders
        // on public OpenStreetMap tiles instead of failing outright.
        const usableKey = browserKey && !browserKey.includes("__PASTE_") ? browserKey : undefined;
        let onOsmTiles = usableKey === undefined;
        const tileUrl = usableKey
          ? `${TILE_BASE_URL}/${encodeURIComponent(style)}/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(usableKey)}`
          : OSM_TILE_URL;
        const tileLayer = L.tileLayer(tileUrl, { attribution: onOsmTiles ? OSM_ATTRIBUTION : TILE_ATTRIBUTION, maxZoom: 19 });
        tileLayerRef.current = tileLayer;
        tileLayer.on("tileerror", () => {
          if (!onOsmTiles) {
            onOsmTiles = true;
            tileLayer.setUrl(OSM_TILE_URL);
            tileLayer.options.attribution = OSM_ATTRIBUTION;
            map.attributionControl?.removeAttribution(TILE_ATTRIBUTION);
            map.attributionControl?.addAttribution(OSM_ATTRIBUTION);
          } else if (!disposed) {
            setMapState("error");
          }
        });
        tileLayer.addTo(map);
        map.whenReady(() => {
          invalidateMapSize(map);
          resizeFrame = window.requestAnimationFrame(() => invalidateMapSize(map));
          resizeTimer = window.setTimeout(() => invalidateMapSize(map), 250);
        });
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
      Object.values(markerAnimationRefs.current).forEach((frame) => { if (frame !== undefined) window.cancelAnimationFrame(frame); });
      markerAnimationRefs.current = {};
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
    // `mapState` is intentionally excluded: changing loading -> ready must not
    // tear down the map before the marker/fit-bounds effect can observe it.
  }, [hasTargetPoints, retryVersion]);

  useEffect(() => {
    const map = mapRef.current;
    const node = mapNodeRef.current;
    if (!map || !node || mapState !== "ready") return;
    let frame: number | undefined;
    const invalidate = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        if (mapRef.current === map) map.invalidateSize({ animate: false });
      });
    };
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(invalidate) : undefined;
    observer?.observe(node);
    window.addEventListener("resize", invalidate);
    invalidate();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", invalidate);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [mapState]);

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

    for (const key of Object.keys(MARKER_STYLES) as MarkerKey[]) {
      const { color, label: markerLabel } = MARKER_STYLES[key];
      const point = mapData.markers[key];
      const existing = markerRefs.current[key];
      if (!point) {
        existing?.remove();
        const frame = markerAnimationRefs.current[key];
        if (frame !== undefined) window.cancelAnimationFrame(frame);
        delete markerAnimationRefs.current[key];
        delete markerRefs.current[key];
        continue;
      }
      const marker = existing ?? (key === "healthcare"
        ? L.marker(toLatLng(point), { icon: L.divIcon({ className: "xone-healthcare-marker", html: '<span aria-hidden="true"></span>', iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(map)
        : L.circleMarker(toLatLng(point), { radius: key === "driver" || key === "current" ? 9 : 8, color: "#FFFFFF", weight: 2, fillColor: color, fillOpacity: 0.95 }).addTo(map));
      if (existing) {
        animateMarker(marker, key, toLatLng(point), markerAnimationRefs, prefersReducedMotion(), key === "driver" ? mapData.route : undefined);
      }
      marker.unbindTooltip();
      marker.bindTooltip(point.label ?? markerLabel, { direction: "top", offset: [0, -6], ...(key === "healthcare" ? { permanent: true, className: "xone-healthcare-tooltip" } : {}) });
      markerRefs.current[key] = marker;
    }

    const fitPoints = [...route, ...["origin", "destination", "user", "restaurant", "healthcare"].map((key) => mapData.markers[key as MarkerKey]).filter(isPoint)];
    const fitKey = fitPoints.map((point) => `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`).join("|");
    if (fitKey && fitKey !== fitKeyRef.current) {
      fitKeyRef.current = fitKey;
      map.fitBounds(L.latLngBounds(fitPoints.map(toLatLng)), { padding: [24, 24], maxZoom: 15 });
    }
  }, [mapData, mapState]);

  return <section className={`xone-map xone-map-${density}`} aria-label={label}>
    <div className="xone-map-toolbar">
      <small>{routeProvider ? "Lộ trình đã được cập nhật" : "Bản đồ vị trí"}</small>
      <span>
        <button type="button" aria-label="Thu nhỏ bản đồ" onClick={() => mapRef.current?.zoomOut()} disabled={!canRenderMap}><Minus size={13} /></button>
        <button type="button" aria-label="Phóng to bản đồ" onClick={() => mapRef.current?.zoomIn()} disabled={!canRenderMap}><Plus size={13} /></button>
      </span>
    </div>
    {canRenderMap ? (
      <>
        <div ref={mapNodeRef} className={`xone-map-leaflet xone-map-leaflet-${density}`} data-map-state={mapState} role="img" aria-label={`${label}: bản đồ nền và các điểm đã xác minh`} />
        {mapState === "loading" && (
          <div className="xone-map-loading-overlay">
            <LoaderCircle className="spinner" size={28} style={{ color: "var(--color-primary-strong)" }} />
            <span style={{ marginTop: "10px", fontSize: "0.75rem", color: "var(--color-navy)", fontWeight: 700 }}>Đang tải bản đồ...</span>
          </div>
        )}
      </>
    ) : <MapFallback label={label} points={mapData.points} providerUnavailable={providerUnavailable} locationDenied={locationDenied} routeProvider={routeProvider} routeStatus={routeStatus} routeDistanceMeters={routeDistanceMeters} routeDurationSeconds={routeDurationSeconds} onRetry={() => { setMapState("loading"); setRetryVersion((value) => value + 1); }} />}
    {mapData.points.length ? <div className="xone-map-legend"><LegendDot marker="origin" label="Điểm đi" show={Boolean(mapData.markers.origin)} /><LegendDot marker="destination" label="Điểm đến" show={Boolean(mapData.markers.destination)} /><LegendDot marker="healthcare" label="Cơ sở khám" show={Boolean(mapData.markers.healthcare)} /><LegendDot marker="current" label="Vị trí hiện tại" show={Boolean(mapData.markers.current || mapData.markers.driver)} /></div> : null}
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
  
  const isErrorWithPoints = providerUnavailable || points.length > 0;

  return <div className="xone-map-fallback" role="img" aria-label={`${label}: ${reason}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "24px 20px", minHeight: "160px" }}>
    <strong style={{ color: "var(--color-navy)", fontSize: "0.85rem" }}>{isErrorWithPoints ? "Hiện chưa tải được bản đồ." : reason}</strong>
    {isErrorWithPoints ? <button className="button button-secondary" type="button" onClick={onRetry} style={{ marginTop: "12px" }}>Thử lại</button> : null}
    <span style={{ marginTop: "8px", color: "var(--color-muted)", fontSize: "0.75rem", maxWidth: "300px" }}>{points.length ? `${points.length} điểm đã xác minh sẵn sàng cho bản đồ.` : "Hãy chọn địa điểm có dữ liệu định vị hoặc bật quyền vị trí."}</span>
    {routeProvider || routeStatus || routeDistanceMeters || routeDurationSeconds ? <dl style={{ marginTop: "16px" }}><div><dt>Lộ trình</dt><dd>{routeStatus ? statusLabel(routeStatus) : "Đã cập nhật"}</dd></div>{routeDistanceMeters ? <div><dt>Khoảng cách</dt><dd>{(routeDistanceMeters / 1000).toFixed(1)} km</dd></div> : null}{routeDurationSeconds ? <div><dt>Thời lượng</dt><dd>{Math.ceil(routeDurationSeconds / 60)} phút</dd></div> : null}</dl> : null}
  </div>;
}

function LegendDot({ marker, label, show }: { marker: MarkerKey; label: string; show: boolean }) {
  return show ? <span><i className="legend-dot" style={{ backgroundColor: MARKER_STYLES[marker].color }} />{label}</span> : null;
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
  const latitude = typeof candidate.latitude === "number" || typeof candidate.latitude === "string" ? Number(candidate.latitude) : NaN;
  const longitude = typeof candidate.longitude === "number" || typeof candidate.longitude === "string" ? Number(candidate.longitude) : NaN;
  if (candidate.suspicious === true || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
  return { latitude, longitude, ...(typeof candidate.label === "string" ? { label: candidate.label } : {}) };
}

function isPoint(value: XOnePoint | undefined): value is XOnePoint {
  return Boolean(value);
}

function toLatLng(point: XOnePoint): [number, number] {
  return [point.latitude, point.longitude];
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function animateMarker(marker: LeafletMarker, key: MarkerKey, target: [number, number], frames: MutableRefObject<Partial<Record<MarkerKey, number>>>, reduceMotion: boolean, route?: XOnePoint[]): void {
  const current = marker.getLatLng();
  const from: [number, number] = [current.lat, current.lng];
  const distance = Math.abs(from[0] - target[0]) + Math.abs(from[1] - target[1]);
  const previousFrame = frames.current[key];
  if (previousFrame !== undefined) window.cancelAnimationFrame(previousFrame);
  if (reduceMotion || distance < 0.000001) {
    marker.setLatLng(target);
    delete frames.current[key];
    return;
  }
  if (route && route.length > 1) {
    animateMarkerOnRoute(marker, key, route, target, frames, reduceMotion);
    return;
  }
  const startedAt = performance.now();
  const duration = key === "driver" ? DRIVER_MOTION_DURATION_MS : 850;
  const tick = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = key === "driver" ? progress : 1 - Math.pow(1 - progress, 3);
    marker.setLatLng([from[0] + (target[0] - from[0]) * eased, from[1] + (target[1] - from[1]) * eased]);
    if (progress < 1) frames.current[key] = window.requestAnimationFrame(tick);
    else delete frames.current[key];
  };
  frames.current[key] = window.requestAnimationFrame(tick);
}

function animateMarkerOnRoute(marker: LeafletMarker, key: MarkerKey, route: XOnePoint[], target: [number, number], frames: MutableRefObject<Partial<Record<MarkerKey, number>>>, reduceMotion: boolean): void {
  const fromRatio = nearestRouteRatio(marker.getLatLng().lat, marker.getLatLng().lng, route);
  const targetRatio = nearestRouteRatio(target[0], target[1], route);
  if (reduceMotion || Math.abs(targetRatio - fromRatio) < 0.000001) {
    marker.setLatLng(toLatLng(pointAlongRoute(route, targetRatio)));
    delete frames.current[key];
    return;
  }
  const startedAt = performance.now();
  const duration = DRIVER_MOTION_DURATION_MS;
  const tick = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const ratio = fromRatio + (targetRatio - fromRatio) * progress;
    marker.setLatLng(toLatLng(pointAlongRoute(route, ratio)));
    if (progress < 1) frames.current[key] = window.requestAnimationFrame(tick);
    else {
      marker.setLatLng(toLatLng(pointAlongRoute(route, targetRatio)));
      delete frames.current[key];
    }
  };
  frames.current[key] = window.requestAnimationFrame(tick);
}

function pointAlongRoute(route: XOnePoint[], ratio: number): XOnePoint {
  if (route.length < 2) return route[0] ?? { latitude: 0, longitude: 0 };
  const bounded = Math.min(1, Math.max(0, ratio));
  const lengths = route.slice(1).map((point, index) => distanceBetween(route[index], point));
  const total = lengths.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return route[0];
  let remaining = total * bounded;
  for (let index = 0; index < lengths.length; index += 1) {
    const segment = lengths[index];
    if (remaining <= segment || index === lengths.length - 1) {
      const start = route[index];
      const end = route[index + 1];
      const segmentRatio = segment > 0 ? remaining / segment : 0;
      return { latitude: start.latitude + (end.latitude - start.latitude) * segmentRatio, longitude: start.longitude + (end.longitude - start.longitude) * segmentRatio };
    }
    remaining -= segment;
  }
  return route[route.length - 1];
}

function nearestRouteRatio(latitude: number, longitude: number, route: XOnePoint[]): number {
  const lengths = route.slice(1).map((point, index) => distanceBetween(route[index], point));
  const total = lengths.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return 0;
  let traversed = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestDistanceAlong = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    const deltaLatitude = end.latitude - start.latitude;
    const deltaLongitude = end.longitude - start.longitude;
    const denominator = deltaLatitude ** 2 + deltaLongitude ** 2;
    const segmentRatio = denominator > 0 ? Math.min(1, Math.max(0, ((latitude - start.latitude) * deltaLatitude + (longitude - start.longitude) * deltaLongitude) / denominator)) : 0;
    const projectedLatitude = start.latitude + deltaLatitude * segmentRatio;
    const projectedLongitude = start.longitude + deltaLongitude * segmentRatio;
    const distance = (latitude - projectedLatitude) ** 2 + (longitude - projectedLongitude) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestDistanceAlong = traversed + lengths[index] * segmentRatio;
    }
    traversed += lengths[index];
  }
  return bestDistanceAlong / total;
}

function distanceBetween(left: XOnePoint, right: XOnePoint): number {
  const latitude = (right.latitude - left.latitude) * 111_000;
  const longitude = (right.longitude - left.longitude) * 111_000 * Math.cos((left.latitude * Math.PI) / 180);
  return Math.sqrt(latitude ** 2 + longitude ** 2);
}
