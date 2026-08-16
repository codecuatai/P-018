import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockUseReducedMotion = jest.fn(() => false);

jest.mock("motion/react", () => ({
  ...jest.requireActual("motion/react"),
  useReducedMotion: () => mockUseReducedMotion(),
}));

import { SERVICE_DEFINITIONS, ServiceComposition } from "@/components/marketing/service-composition";

describe("ServiceComposition", () => {
  beforeEach(() => mockUseReducedMotion.mockReturnValue(false));

  it("renders exactly four selectable service slabs with no orbit or autoplay", () => {
    render(<ServiceComposition />);

    expect(SERVICE_DEFINITIONS).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: /Chọn dịch vụ/ })).toHaveLength(4);
    expect(document.querySelector("[data-service-composition]")).toHaveAttribute("data-service-autoplay", "false");
    expect(document.querySelector("[data-service-composition]")).toHaveAttribute("data-service-orbit", "false");
    expect(screen.queryByText("Tự chuyển nhẹ quanh X-One")).not.toBeInTheDocument();
    expect(screen.queryByText("Đang xem")).not.toBeInTheDocument();
    expect(screen.queryByText("Chọn một thẻ để xem X-One giữ mạch việc của bạn.")).not.toBeInTheDocument();
  });

  it("selects a slab and updates the consumer-facing copy with active semantics", async () => {
    render(<ServiceComposition />);
    const restaurant = screen.getByRole("button", { name: "Chọn dịch vụ Nhà hàng" });

    fireEvent.click(restaurant);

    expect(restaurant).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByText("Tìm nhà hàng, chọn thời gian và giữ bàn trước khi xác nhận.")).toBeInTheDocument());
    expect(document.querySelector("[data-selected-service]"))
      .toHaveAttribute("data-selected-service", "restaurant");
  });

  it("keeps reduced-motion service selection available without 3D poses", async () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<ServiceComposition />);
    const healthcare = screen.getByRole("button", { name: "Chọn dịch vụ Lịch khám" });

    fireEvent.click(healthcare);

    expect(healthcare).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByText("Tìm cơ sở, bác sĩ và khung giờ phù hợp để đặt lịch.")).toBeInTheDocument());
  });
});
