import { buildRideRebookPath } from "./history-detail";

describe("history detail Ride rebook context", () => {
  it("carries the historical pickup, destination, vehicle, and bounded stopovers into a fresh quote form", () => {
    const path = buildRideRebookPath({
      id: "booking-old",
      quote: {
        pickup_address: "Điểm đón cũ",
        dropoff_address: "Nhà hàng cũ",
        vehicle_type: "BIKE",
        stopovers: [
          { address: "Công viên Nghĩa Đô", latitude: 21.04, longitude: 105.79 },
          { address: "Điểm ghé thứ hai", latitude: 21.05, longitude: 105.8 },
          { address: "Điểm ghé bị bỏ qua", latitude: 21.06, longitude: 105.81 },
        ],
      },
    });

    const url = new URL(path, "https://xone.test");
    expect(url.pathname).toBe("/app/services/ride");
    expect(url.searchParams.get("pickup")).toBe("Điểm đón cũ");
    expect(url.searchParams.get("dropoff")).toBe("Nhà hàng cũ");
    expect(url.searchParams.get("vehicle")).toBe("BIKE");
    expect(JSON.parse(url.searchParams.get("stopovers") ?? "[]")).toEqual([
      { address: "Công viên Nghĩa Đô", latitude: 21.04, longitude: 105.79 },
      { address: "Điểm ghé thứ hai", latitude: 21.05, longitude: 105.8 },
    ]);
    expect(url.searchParams.has("quote_id")).toBe(false);
  });
});
