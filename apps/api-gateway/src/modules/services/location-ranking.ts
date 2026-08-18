import { JsonObject } from '../../clients/service.clients';

type Origin = { latitude: number; longitude: number };

export function rankByDistance(items: JsonObject[], origin?: Origin): JsonObject[] {
  if (!origin || !validPoint(origin.latitude, origin.longitude)) return items;
  return items
    .map((item, index) => {
      const latitude = numberValue(item.latitude);
      const longitude = numberValue(item.longitude);
      const usable = item.coordinate_status !== 'suspicious_default' && latitude !== undefined && longitude !== undefined && validPoint(latitude, longitude);
      return {
        item,
        index,
        distance: usable ? haversineKm(origin.latitude, origin.longitude, latitude!, longitude!) : undefined,
      };
    })
    .sort((left, right) => {
      if (left.distance === undefined && right.distance === undefined) return left.index - right.index;
      if (left.distance === undefined) return 1;
      if (right.distance === undefined) return -1;
      return left.distance - right.distance || left.index - right.index;
    })
    .map(({ item, distance }) => distance === undefined ? item : { ...item, distance_km: Number(distance.toFixed(2)) });
}

export function haversineKm(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (latitudeB - latitudeA) * radians;
  const longitudeDelta = (longitudeB - longitudeA) * radians;
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA * radians) * Math.cos(latitudeB * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function validPoint(latitude: number, longitude: number): boolean {
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}
