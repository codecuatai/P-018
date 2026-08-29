import { StrictMode } from "react";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ServiceBrowse } from "@/features/product/service-browse";
import * as apiClient from "@/lib/api-client";

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/lib/api-client");

const browseServiceMock = apiClient.browseService as jest.MockedFunction<typeof apiClient.browseService>;
const getFoodRestaurantMock = apiClient.getFoodRestaurant as jest.MockedFunction<typeof apiClient.getFoodRestaurant>;
const getFoodMenuMock = apiClient.getFoodMenu as jest.MockedFunction<typeof apiClient.getFoodMenu>;
const listSavedAddressesMock = apiClient.listSavedAddresses as jest.MockedFunction<typeof apiClient.listSavedAddresses>;
const listFavoritesMock = apiClient.listFavorites as jest.MockedFunction<typeof apiClient.listFavorites>;
const listHealthcareDoctorsMock = apiClient.listHealthcareDoctors as jest.MockedFunction<typeof apiClient.listHealthcareDoctors>;
const listHealthcarePatientsMock = apiClient.listHealthcarePatients as jest.MockedFunction<typeof apiClient.listHealthcarePatients>;

describe("ServiceBrowse pagination and healthcare loading", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listSavedAddressesMock.mockResolvedValue({ items: [] });
    listFavoritesMock.mockResolvedValue({ items: [] });
    getFoodRestaurantMock.mockResolvedValue({ id: "restaurant-1", name: "Phở Gánh Phố Cổ", address: "12 Hàng Trống" });
  });

  it("keeps a 136-item Food menu discoverable through server pagination", async () => {
    browseServiceMock.mockResolvedValue({
      items: [{ id: "restaurant-1", name: "Phở Gánh Phố Cổ", address: "12 Hàng Trống" }],
      total: 1,
      page: 1,
      limit: 5,
      total_pages: 1,
      source: "food-service",
      partial: false,
    });
    getFoodMenuMock.mockImplementation(async (id, pagination) => {
      const offset = pagination?.offset ?? 0;
      const limit = pagination?.limit ?? 6;
      return {
        items: Array.from({ length: Math.min(limit, 136 - offset) }, (_, index) => ({
          id: `menu-${offset + index + 1}`,
          name: `Phở bò món ${offset + index + 1}`,
          price: 65_000,
        })),
        total: 136,
        limit,
        offset,
        restaurant_id: id,
      };
    });

    render(<ServiceBrowse service="food" />);
    fireEvent.click(await screen.findByRole("button", { name: "Xem thực đơn" }));

    await waitFor(() => expect(getFoodMenuMock).toHaveBeenCalledWith("restaurant-1", { limit: 6, offset: 0 }));
    expect(screen.getByText(/136 món/)).toBeInTheDocument();

    for (let page = 2; page <= 23; page += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Sau" }));
      await waitFor(() => expect(getFoodMenuMock).toHaveBeenLastCalledWith("restaurant-1", { limit: 6, offset: (page - 1) * 6 }));
    }

    expect(screen.getByText("Phở bò món 136")).toBeInTheDocument();
  });

  it("loads Healthcare departments and patients once under strict-mode rerender and keeps future slots", async () => {
    browseServiceMock.mockResolvedValue({
      items: [{ id: "department-1", name: "Nội khoa" }],
      total: 1,
      page: 1,
      limit: 100,
      total_pages: 1,
      source: "healthcare-service",
      partial: false,
    });
    listHealthcarePatientsMock.mockResolvedValue({ items: [{ id: 7, name: "Nguyễn An", phone: "0900000000", relationship: "self", is_default: true }] });
    listHealthcareDoctorsMock.mockResolvedValue([{ id: "doctor-1", name: "BS. Tương lai", available_slots: [{ id: 101, start_time: "2099-08-29T09:00:00+07:00", facility: { name: "Phòng khám X-One" } }] }]);

    const view = render(<StrictMode><ServiceBrowse service="healthcare" /></StrictMode>);
    view.rerender(<StrictMode><ServiceBrowse service="healthcare" /></StrictMode>);

    await waitFor(() => expect(screen.getByText("BS. Tương lai")).toBeInTheDocument());
    expect(browseServiceMock).toHaveBeenCalledTimes(1);
    expect(listHealthcarePatientsMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/29\/08\/2099/)).toBeInTheDocument();
  });

  it("shows a truthful no-slot state when Healthcare returns no future slots", async () => {
    browseServiceMock.mockResolvedValue({ items: [{ id: "department-1", name: "Nội khoa" }], total: 1, page: 1, limit: 100, total_pages: 1, source: "healthcare-service", partial: false });
    listHealthcarePatientsMock.mockResolvedValue({ items: [] });
    listHealthcareDoctorsMock.mockResolvedValue([{ id: "doctor-1", name: "BS. Hết lịch", available_slots: [] }]);

    render(<ServiceBrowse service="healthcare" />);

    expect(await screen.findByRole("heading", { name: "Chưa có khung giờ" })).toBeInTheDocument();
  });
});
