import type { DeviceCurrentLocation } from "@/types";

export function shouldCaptureCurrentLocation(message: string): boolean {
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLocaleLowerCase("vi");
  return normalized.includes("vi tri hien tai")
    || normalized.includes("current location")
    || normalized.includes("dang o dau")
    || normalized.includes("vi tri cua toi");
}

export function deviceLocationFromPosition(position: GeolocationPosition, addressText?: string): DeviceCurrentLocation {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    ...(addressText?.trim() ? { address_text: addressText.trim() } : {}),
    ...(Number.isFinite(position.coords.accuracy) ? { accuracy_meters: position.coords.accuracy } : {}),
    captured_at: new Date(position.timestamp).toISOString(),
    source: "device",
  };
}
