import { StrictMode } from "react";

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { ServiceBrowse } from "@/features/product/service-browse";
import * as apiClient from "@/lib/api-client";

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/lib/api-client");
jest.mock("./xone-map", () => ({
  XOneMap: ({ label }: { label?: string }) => <div data-testid="xone-map">{label ?? "Bản đồ"}</div>,
}));

const browseServiceMock = apiClient.browseService as jest.MockedFunction<typeof apiClient.browseService>;
const getRestaurantDetailMock = apiClient.getRestaurantDetail as jest.MockedFunction<typeof apiClient.getRestaurantDetail>;
const getFoodRestaurantMock = apiClient.getFoodRestaurant as jest.MockedFunction<typeof apiClient.getFoodRestaurant>;
const getFoodMenuMock = apiClient.getFoodMenu as jest.MockedFunction<typeof apiClient.getFoodMenu>;
const listSavedAddressesMock = apiClient.listSavedAddresses as jest.MockedFunction<typeof apiClient.listSavedAddresses>;
const listFavoritesMock = apiClient.listFavorites as jest.MockedFunction<typeof apiClient.listFavorites>;
const listHealthcareDoctorsMock = apiClient.listHealthcareDoctors as jest.MockedFunction<typeof apiClient.listHealthcareDoctors>;
const listHealthcarePatientsMock = apiClient.listHealthcarePatients as jest.MockedFunction<typeof apiClient.listHealthcarePatients>;
const autocompleteAddressMock = apiClient.autocompleteAddress as jest.MockedFunction<typeof apiClient.autocompleteAddress>;

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

  describe("Restaurant search and catalog-backed details", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      browseServiceMock.mockResolvedValue({
        items: [{ id: "restaurant-1", name: "Nhà hàng mẫu" }],
        source: "restaurant-service",
        partial: false,
      });
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it("removes the submit button and fetches only the latest query after 300 ms", async () => {
      render(<ServiceBrowse service="restaurant" />);
      await act(async () => { await Promise.resolve(); });

      expect(screen.queryByRole("button", { name: /^Tìm$/ })).not.toBeInTheDocument();
      expect(browseServiceMock).toHaveBeenCalledTimes(1);

      const input = screen.getByLabelText("Tìm theo tên, khu vực hoặc ẩm thực");
      fireEvent.change(input, { target: { value: "Toka" } });
      act(() => jest.advanceTimersByTime(200));
      fireEvent.change(input, { target: { value: "Tokachiya Ramen" } });
      act(() => jest.advanceTimersByTime(299));

      expect(browseServiceMock).toHaveBeenCalledTimes(1);

      act(() => jest.advanceTimersByTime(1));
      await act(async () => { await Promise.resolve(); });

      expect(browseServiceMock).toHaveBeenCalledTimes(2);
      expect(browseServiceMock).toHaveBeenLastCalledWith("restaurant", "Tokachiya Ramen");
    });

    it("shows the requested empty state after a completed search has no matches", async () => {
      browseServiceMock
        .mockResolvedValueOnce({ items: [{ id: "restaurant-1", name: "Nhà hàng mẫu" }], source: "restaurant-service", partial: false })
        .mockResolvedValueOnce({ items: [], source: "restaurant-service", partial: false });

      render(<ServiceBrowse service="restaurant" />);
      await act(async () => { await Promise.resolve(); });

      fireEvent.change(screen.getByLabelText("Tìm theo tên, khu vực hoặc ẩm thực"), { target: { value: "Không tồn tại" } });
      act(() => jest.advanceTimersByTime(300));
      await act(async () => { await Promise.resolve(); });

      expect(screen.getByRole("heading", { name: "Không tìm thấy kết quả phù hợp" })).toBeInTheDocument();
    });
  });

  it("renders a catalog-backed restaurant address with its verified map point", async () => {
    browseServiceMock.mockResolvedValue({
      items: [{ id: "rest-cg-1", name: "Lẩu Cầu Giấy" }],
      source: "restaurant-service",
      partial: false,
    });
    getRestaurantDetailMock.mockResolvedValue({
      id: "rest-cg-1",
      name: "Lẩu Cầu Giấy",
      address: "Số 1 Cầu Giấy, Hà Nội",
      location: "Cầu Giấy",
      district: "Cầu Giấy",
      city: "Hà Nội",
      latitude: 21.035,
      longitude: 105.795,
    });

    render(<ServiceBrowse service="restaurant" />);
    fireEvent.click(await screen.findByRole("button", { name: "Xem và giữ bàn" }));

    await waitFor(() => expect(getRestaurantDetailMock).toHaveBeenCalledWith("rest-cg-1"));
    expect(await screen.findByRole("heading", { name: "Lẩu Cầu Giấy" })).toBeInTheDocument();
    expect(screen.getByText(/Số 1 Cầu Giấy, Hà Nội/)).toBeInTheDocument();
    expect(screen.getByTestId("xone-map")).toHaveTextContent("Vị trí địa điểm");
  });

  describe("Ride address autocomplete", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it("debounces the latest query, filters unresolved results, and preserves the selected point", async () => {
      const validCandidates = Array.from({ length: 6 }, (_, index) => ({
        address_text: `Số ${index + 1} Cầu Giấy, Hà Nội`,
        latitude: 21.03 + index / 1000,
        longitude: 105.79 + index / 1000,
        confidence: 0.9,
      }));
      autocompleteAddressMock.mockResolvedValue({
        provider: "geoapify",
        query: "VinUni",
        suggestions: [{ address_text: "Không có tọa độ", latitude: null, longitude: null, confidence: 0.2 }, ...validCandidates],
      });

      render(<ServiceBrowse service="ride" />);
      const pickup = screen.getByLabelText("Điểm đi");
      fireEvent.change(pickup, { target: { value: "Vi" } });
      act(() => jest.advanceTimersByTime(299));
      expect(autocompleteAddressMock).not.toHaveBeenCalled();

      fireEvent.change(pickup, { target: { value: "VinUni" } });
      act(() => jest.advanceTimersByTime(300));
      await act(async () => { await Promise.resolve(); });

      expect(autocompleteAddressMock).toHaveBeenCalledTimes(1);
      expect(autocompleteAddressMock).toHaveBeenCalledWith("VinUni");
      const listbox = screen.getByRole("listbox", { name: "Gợi ý điểm đi" });
      expect(within(listbox).getAllByRole("option")).toHaveLength(5);
      expect(within(listbox).queryByText("Không có tọa độ")).not.toBeInTheDocument();

      fireEvent.click(within(listbox).getByRole("option", { name: "Số 1 Cầu Giấy, Hà Nội" }));
      expect(pickup).toHaveValue("Số 1 Cầu Giấy, Hà Nội");
      expect(screen.queryByRole("listbox", { name: "Gợi ý điểm đi" })).not.toBeInTheDocument();
    });

    it("ignores a stale response after the user changes the address query", async () => {
      type AutocompleteResponse = Awaited<ReturnType<typeof apiClient.autocompleteAddress>>;
      let resolveFirst: ((value: AutocompleteResponse) => void) | undefined;
      let resolveSecond: ((value: AutocompleteResponse) => void) | undefined;
      autocompleteAddressMock.mockImplementation((query) => new Promise((resolve) => {
        if (query === "Vin") resolveFirst = resolve;
        else resolveSecond = resolve;
      }));

      render(<ServiceBrowse service="ride" />);
      const pickup = screen.getByLabelText("Điểm đi");
      fireEvent.change(pickup, { target: { value: "Vin" } });
      act(() => jest.advanceTimersByTime(300));
      fireEvent.change(pickup, { target: { value: "VinUni" } });
      act(() => jest.advanceTimersByTime(300));
      expect(autocompleteAddressMock).toHaveBeenCalledTimes(2);

      await act(async () => {
        resolveFirst?.({ provider: "geoapify", query: "Vin", suggestions: [{ address_text: "Kết quả cũ", latitude: 21, longitude: 105, confidence: 0.8 }] });
        await Promise.resolve();
      });
      expect(screen.queryByText("Kết quả cũ")).not.toBeInTheDocument();

      await act(async () => {
        resolveSecond?.({ provider: "geoapify", query: "VinUni", suggestions: [{ address_text: "Kết quả mới", latitude: 21.01, longitude: 105.81, confidence: 0.9 }] });
        await Promise.resolve();
      });
      expect(screen.getByRole("option", { name: "Kết quả mới" })).toBeInTheDocument();
    });
  });
});
