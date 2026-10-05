import { deviceLocationFromPosition, shouldCaptureCurrentLocation } from "./current-location";

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

  it.each([
    "Đặt xe từ vị trí hiện tại đi sân bay Nội Bài",
    "Từ vị trí hiện tại đến 51 Phố Tam Khương",
    "What is my current location?",
    "Tôi đang ở đâu?",
  ])("recognizes an explicit current-location request: %s", (message) => {
    expect(shouldCaptureCurrentLocation(message)).toBe(true);
  });

  it.each(["Đặt xe đến sân bay Nội Bài", "Nhà tôi ở đâu trong hồ sơ?"]) (
    "does not request device location for unrelated messages: %s",
    (message) => {
      expect(shouldCaptureCurrentLocation(message)).toBe(false);
    },
  );
});
