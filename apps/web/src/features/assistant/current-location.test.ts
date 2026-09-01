import { deviceLocationFromPosition } from "./current-location";

describe("assistant current location", () => {
  it("keeps coordinates and capture metadata as structured ephemeral context", () => {
    const position = {
      coords: {
        latitude: 21.0285,
        longitude: 105.8542,
        accuracy: 9,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.parse("2026-08-27T10:00:00+07:00"),
    } as GeolocationPosition;

    expect(deviceLocationFromPosition(position, "  Hồ Gươm, Hà Nội  ")).toEqual({
      latitude: 21.0285,
      longitude: 105.8542,
      accuracy_meters: 9,
      address_text: "Hồ Gươm, Hà Nội",
      captured_at: "2026-08-27T03:00:00.000Z",
      source: "device",
    });
  });
});
