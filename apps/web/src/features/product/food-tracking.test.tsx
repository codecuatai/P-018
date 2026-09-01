import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockGetFoodTracking = jest.fn();
const mockXOneMap = jest.fn((props: Record<string, unknown>) => <div data-testid="food-tracking-map" data-density={String(props.density)} />);

jest.mock("@/lib/api-client", () => ({
  errorText: (reason: unknown) => reason instanceof Error ? reason.message : String(reason),
  getFoodTracking: (...args: unknown[]) => mockGetFoodTracking(...args),
}));

jest.mock("./xone-map", () => ({
  XOneMap: (props: Record<string, unknown>) => mockXOneMap(props),
}));

import { FoodTrackingPanel } from "./food-tracking";

describe("FoodTrackingPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders a ride-like delivery tracking view and uses verified pickup and delivery points for the map", async () => {
    mockGetFoodTracking.mockResolvedValue({
      order_id: "food-order-1",
      status: "DELIVERING",
      eta_minutes: 12,
      restaurant: { name: "Bánh Mì BB - Food & Drink", address: "88 Ngõ 44 Trần Thái Tông, Cầu Giấy", latitude: 21.0294, longitude: 105.7866 },
      address: { address_text: "181 Nguyễn Trãi, Thanh Xuân, Hà Nội", latitude: 20.9989, longitude: 105.8163 },
      pickup_stops: [{ name: "Bánh Mì BB - Food & Drink", address: "88 Ngõ 44 Trần Thái Tông, Cầu Giấy" }],
      delivery_route: { distance_meters: 5_300, duration_seconds: 720 },
      driver: { name: "Nguyễn Văn Minh", vehicle_type: "Xe máy", license_plate: "29A1-123.45" },
    });

    render(<FoodTrackingPanel orderId="food-order-1" />);

    await waitFor(() => expect(screen.getAllByText("Đang giao").length).toBeGreaterThan(0));
    expect(screen.getByRole("heading", { name: "Trạng thái giao hàng" })).toBeInTheDocument();
    expect(screen.getAllByText("Đang giao").length).toBeGreaterThan(0);
    expect(screen.getByText("Khoảng 12 phút")).toBeInTheDocument();
    expect(screen.getByText("5.3 km")).toBeInTheDocument();
    expect(screen.getByText("Nguyễn Văn Minh")).toBeInTheDocument();
    expect(screen.getByText("Giao đến")).toBeInTheDocument();
    expect(screen.getByTestId("food-tracking-map")).toHaveAttribute("data-density", "active");
    expect(mockXOneMap.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      origin: { latitude: 21.0294, longitude: 105.7866 },
      destination: { latitude: 20.9989, longitude: 105.8163 },
    }));
  });

  it("uses the Ride map-first layout for Food detail and keeps pickup pins visible", async () => {
    mockGetFoodTracking.mockResolvedValue({
      order_id: "food-order-2",
      status: "DELIVERING",
      eta_minutes: 9,
      pickup_stops: [{ name: "Quán A", address: "Cầu Giấy", latitude: 21.034, longitude: 105.79 }],
      address: { address_text: "Thanh Xuân, Hà Nội", latitude: 20.998, longitude: 105.812 },
      delivery_route: {
        origin: { latitude: 21.034, longitude: 105.79 },
        destination: { latitude: 20.998, longitude: 105.812 },
        geometry: [{ latitude: 21.034, longitude: 105.79 }, { latitude: 20.998, longitude: 105.812 }],
      },
    });

    const { container } = render(<FoodTrackingPanel orderId="food-order-2" hideMap polling variant="detail" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Trạng thái giao hàng" })).toBeInTheDocument());
    expect(container.querySelector(".ride-map-detail.food-map-detail")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thông tin đơn" })).toBeInTheDocument();
    expect(mockXOneMap.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      origin: { latitude: 21.034, longitude: 105.79 },
      destination: { latitude: 20.998, longitude: 105.812 },
      stopovers: [{ latitude: 21.034, longitude: 105.79 }],
    }));

    fireEvent.click(screen.getByRole("button", { name: "Thông tin đơn" }));
    expect(screen.getByRole("complementary", { name: "Thông tin đơn giao hàng" })).toHaveTextContent("Địa chỉ giao");
    expect(screen.getByRole("complementary", { name: "Thông tin đơn giao hàng" })).toHaveTextContent("Thanh Xuân, Hà Nội");
  });
});
