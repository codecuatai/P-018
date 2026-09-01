import { render, screen } from "@testing-library/react";

import { XOneMap } from "./xone-map";

describe("XOneMap", () => {
  it("renders an honest no-coordinate fallback instead of a schematic map", () => {
    const { container } = render(<XOneMap label="Điểm giao hàng" />);

    expect(screen.getByText("Chưa có tọa độ đã xác minh.")).toBeInTheDocument();
    expect(container.querySelector(".xone-map-leaflet")).not.toBeInTheDocument();
  });

  it("filters invalid and suspicious default points", () => {
    const { container } = render(
      <XOneMap
        origin={{ latitude: 21.0285, longitude: 105.8542, suspicious: true }}
        destination={{ latitude: 400, longitude: 999 }}
        routePolyline='[{"latitude":null,"longitude":105.9}]'
      />,
    );

    expect(screen.getByText("Chưa có tọa độ đã xác minh.")).toBeInTheDocument();
    expect(container.querySelector(".xone-map-leaflet")).not.toBeInTheDocument();
  });

  it("keeps route facts visible when a basemap provider is unavailable", () => {
    render(
      <XOneMap
        origin={{ latitude: 21.0285, longitude: 105.8048 }}
        destination={{ latitude: 21.0301, longitude: 105.8122 }}
        providerUnavailable
        routeProvider="deterministic-haversine"
        routeStatus="ESTIMATED"
        routeDistanceMeters={1200}
        routeDurationSeconds={480}
      />,
    );

    expect(screen.getByText("Hiện chưa tải được bản đồ.")).toBeInTheDocument();
    expect(screen.getByText("1.2 km")).toBeInTheDocument();
    expect(screen.getByText("8 phút")).toBeInTheDocument();
  });

  it("uses the same destination color in the legend as the map marker", () => {
    render(
      <XOneMap
        destination={{ latitude: 21.0301, longitude: 105.8122 }}
        providerUnavailable
      />,
    );

    const legend = screen.getByText("Điểm đến").parentElement;
    expect(legend?.querySelector(".legend-dot")).toHaveStyle({ backgroundColor: "#1F9D68" });
  });

  it("labels a Healthcare facility distinctly from a generic destination", () => {
    render(<XOneMap healthcare={{ latitude: 21.0301, longitude: 105.8122, label: "Bệnh viện A" }} providerUnavailable />);

    expect(screen.getByText("Cơ sở khám")).toBeInTheDocument();
  });

  it("renders restaurant details without tracking chrome", () => {
    const { container } = render(
      <XOneMap
        restaurant={{ latitude: 21.0301, longitude: 105.8122, label: "Nhà hàng A" }}
        providerUnavailable
        variant="location-detail"
      />,
    );

    expect(container.querySelector(".xone-map-location-detail")).toBeInTheDocument();
    expect(screen.queryByText("Bản đồ vị trí")).not.toBeInTheDocument();
    expect(screen.queryByText("Điểm đến")).not.toBeInTheDocument();
  });

  it("explains a denied location permission without inventing a marker", () => {
    render(<XOneMap locationDenied label="Vị trí hiện tại" />);

    expect(screen.getByText("Quyền vị trí chưa được cấp; không tự đoán tọa độ.")).toBeInTheDocument();
  });
});
