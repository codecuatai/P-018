import type { DeviceCurrentLocation } from "@/types";

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
