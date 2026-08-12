"use client";

import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";

type Point = { latitude: number; longitude: number };

export function XOneMap({ origin, destination, current, routePolyline, routeProvider, label = "Sơ đồ vị trí" }: { origin?: Point; destination?: Point; current?: Point; routePolyline?: string; routeProvider?: string; label?: string }) {
  const [zoom, setZoom] = useState(1);
  const route = useMemo(() => parseRoute(routePolyline), [routePolyline]);
  const points = [...route, origin, destination, current].filter((point): point is Point => Boolean(point));
  if (!points.length) {
    return <div className="xone-map xone-map-empty" role="img" aria-label={`${label}: chưa có tọa độ được xác nhận`}><span>Tọa độ chưa được xác nhận</span><small>Chọn một kết quả định vị hoặc bật quyền vị trí để X-One hiển thị điểm này.</small></div>;
  }

  const minLat = Math.min(...points.map((point) => point.latitude));
  const maxLat = Math.max(...points.map((point) => point.latitude));
  const minLon = Math.min(...points.map((point) => point.longitude));
  const maxLon = Math.max(...points.map((point) => point.longitude));
  const latSpan = Math.max(maxLat - minLat, 0.002);
  const lonSpan = Math.max(maxLon - minLon, 0.002);
  const project = (point: Point) => ({ x: 12 + ((point.longitude - minLon) / lonSpan) * 76, y: 86 - ((point.latitude - minLat) / latSpan) * 68 });
  const projectedOrigin = origin ? project(origin) : undefined;
  const projectedDestination = destination ? project(destination) : undefined;
  const projectedCurrent = current ? project(current) : undefined;
  const projectedRoute = route.length > 1 ? route.map(project).map((point) => `${point.x},${point.y}`).join(" ") : projectedOrigin && projectedDestination ? `${projectedOrigin.x},${projectedOrigin.y} ${projectedDestination.x},${projectedDestination.y}` : "";

  return <div className="xone-map" role="img" aria-label={`${label}: ${points.length >= 2 ? "điểm đi, điểm đến và vị trí hiện tại" : "tọa độ đã xác nhận"}`}><div className="xone-map-toolbar"><small>{routeProvider ? `Nguồn route: ${routeProvider}` : "Bản đồ tọa độ X-One"}</small><span><button type="button" aria-label="Thu nhỏ bản đồ" onClick={() => setZoom((value) => Math.max(1, value - 0.25))}><Minus size={13} /></button><button type="button" aria-label="Phóng to bản đồ" onClick={() => setZoom((value) => Math.min(2.5, value + 0.25))}><Plus size={13} /></button></span></div><svg viewBox="0 0 100 100" aria-hidden="true"><title>{label}</title><g transform={`translate(${50 - 50 * zoom} ${50 - 50 * zoom}) scale(${zoom})`}><path className="xone-map-grid" d="M10 20H90M10 50H90M10 80H90M20 10V90M50 10V90M80 10V90" />{projectedRoute ? <polyline className="xone-map-route" points={projectedRoute} /> : null}{projectedOrigin ? <circle className="xone-map-origin" cx={projectedOrigin.x} cy={projectedOrigin.y} r="4" /> : null}{projectedDestination ? <circle className="xone-map-destination" cx={projectedDestination.x} cy={projectedDestination.y} r="4" /> : null}{projectedCurrent ? <circle className="xone-map-current" cx={projectedCurrent.x} cy={projectedCurrent.y} r="3.5" /> : null}</g></svg><div className="xone-map-legend"><span><i className="legend-dot origin" />Điểm đi</span>{destination ? <span><i className="legend-dot destination" />Điểm đến</span> : null}{current ? <span><i className="legend-dot current" />Vị trí hiện tại</span> : null}</div><small>{origin && destination ? "Tuyến hiển thị theo tọa độ và route snapshot đã xác nhận." : "Đang hiển thị tọa độ đã xác nhận; bản ghi thiếu geo không được đoán."}</small></div>;
}

function parseRoute(value?: string): Point[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((point): point is Point => typeof point === "object" && point !== null && typeof (point as Record<string, unknown>).latitude === "number" && typeof (point as Record<string, unknown>).longitude === "number");
  } catch { return []; }
}
