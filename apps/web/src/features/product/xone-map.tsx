"use client";

type Point = { latitude: number; longitude: number };

export function XOneMap({ origin, destination, current, label = "Sơ đồ vị trí" }: { origin?: Point; destination?: Point; current?: Point; label?: string }) {
  const points = [origin, destination, current].filter((point): point is Point => Boolean(point));
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

  return <div className="xone-map" role="img" aria-label={`${label}: ${points.length >= 2 ? "điểm đi, điểm đến và vị trí hiện tại" : "tọa độ đã xác nhận"}`}><svg viewBox="0 0 100 100" aria-hidden="true"><path className="xone-map-grid" d="M10 20H90M10 50H90M10 80H90M20 10V90M50 10V90M80 10V90" />{projectedOrigin && projectedDestination ? <line className="xone-map-route" x1={projectedOrigin.x} y1={projectedOrigin.y} x2={projectedDestination.x} y2={projectedDestination.y} /> : null}{projectedOrigin ? <circle className="xone-map-origin" cx={projectedOrigin.x} cy={projectedOrigin.y} r="4" /> : null}{projectedDestination ? <circle className="xone-map-destination" cx={projectedDestination.x} cy={projectedDestination.y} r="4" /> : null}{projectedCurrent ? <circle className="xone-map-current" cx={projectedCurrent.x} cy={projectedCurrent.y} r="3.5" /> : null}</svg><div className="xone-map-legend"><span><i className="legend-dot origin" />Điểm đi</span>{destination ? <span><i className="legend-dot destination" />Điểm đến</span> : null}{current ? <span><i className="legend-dot current" />Vị trí hiện tại</span> : null}</div><small>{origin && destination ? "Tuyến hiển thị theo tọa độ đã xác nhận; vị trí hiện tại đến từ snapshot tracking." : "Đang hiển thị tọa độ đã xác nhận."}</small></div>;
}
