import { act, fireEvent, render, screen } from "@testing-library/react";

import { ServiceBrowse } from "@/features/product/service-browse";
import * as apiClient from "@/lib/api-client";

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/lib/api-client");

const browseServiceMock = apiClient.browseService as jest.MockedFunction<typeof apiClient.browseService>;

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("RestaurantBrowse real-time search", () => {
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
    await flushPromises();

    expect(screen.queryByRole("button", { name: /^Tìm$/ })).not.toBeInTheDocument();
    expect(browseServiceMock).toHaveBeenCalledTimes(1);

    const input = screen.getByLabelText("Tìm theo tên, khu vực hoặc ẩm thực");
    fireEvent.change(input, { target: { value: "Toka" } });
    act(() => jest.advanceTimersByTime(200));
    fireEvent.change(input, { target: { value: "Tokachiya Ramen" } });
    act(() => jest.advanceTimersByTime(299));

    expect(browseServiceMock).toHaveBeenCalledTimes(1);

    act(() => jest.advanceTimersByTime(1));
    await flushPromises();

    expect(browseServiceMock).toHaveBeenCalledTimes(2);
    expect(browseServiceMock).toHaveBeenLastCalledWith("restaurant", "Tokachiya Ramen");
  });

  it("shows the requested empty state after a completed search has no matches", async () => {
    browseServiceMock
      .mockResolvedValueOnce({ items: [{ id: "restaurant-1", name: "Nhà hàng mẫu" }], source: "restaurant-service", partial: false })
      .mockResolvedValueOnce({ items: [], source: "restaurant-service", partial: false });

    render(<ServiceBrowse service="restaurant" />);
    await flushPromises();

    fireEvent.change(screen.getByLabelText("Tìm theo tên, khu vực hoặc ẩm thực"), { target: { value: "Không tồn tại" } });
    act(() => jest.advanceTimersByTime(300));
    await flushPromises();

    expect(screen.getByRole("heading", { name: "Không tìm thấy kết quả phù hợp" })).toBeInTheDocument();
  });
});
