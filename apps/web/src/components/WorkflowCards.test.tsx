import { fireEvent, render, screen, within } from "@testing-library/react";

import { AssistantCards, FoodCartDock } from "./WorkflowCards";
import type { AssistantAction, AssistantResponse } from "../types";

jest.mock("../features/product/ride-tracking-cache", () => ({
  useRideTracking: () => ({}),
}));

describe("FoodCartDock", () => {
  it("shows only the local total and confirmation action above the composer", () => {
    const onConfirm = jest.fn();

    render(<FoodCartDock total={125000} onConfirm={onConfirm} />);

    expect(screen.getByRole("region", { name: "Tổng tiền đơn món ăn" })).toHaveTextContent("Tạm tính");
    expect(screen.getByRole("region", { name: "Tổng tiền đơn món ăn" })).toHaveTextContent("125.000 đ");
    expect(screen.queryByText("Phở bò")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps food quantities local at zero until the user confirms", () => {
    const onAction = jest.fn();
    const onFoodSelectionChange = jest.fn();
    const response = {
      conversation_id: "food-local-selection",
      message: "",
      completed: [],
      items: [{ kind: "food_options", title: "Món phù hợp", options: [{ name: "Phở bò", price: 65000, restaurant: "Quán Phở" }] }],
      actions: [{ id: "food-0", kind: "select_food_item", label: "Chọn món này", target_index: 0 }],
    } as AssistantResponse;

    render(<AssistantCards response={response} onAction={onAction} onFoodSelectionChange={onFoodSelectionChange} />);

    expect(screen.getByRole("spinbutton", { name: "Nhập số lượng Phở bò" })).toHaveValue(0);
    fireEvent.click(screen.getByRole("button", { name: "Tăng Phở bò" }));

    expect(onAction).not.toHaveBeenCalled();
    expect(onFoodSelectionChange).toHaveBeenCalledWith(expect.objectContaining({ action: response.actions[0], quantity: 1 }));
  });
});

describe("Ride cancellation card", () => {
  it("keeps the cancellation control inside the Ride card", () => {
    const response = {
      conversation_id: "conversation-1",
      message: "",
      items: [{
        kind: "ride_booking",
        title: "Chuyến xe đã cập nhật",
        resource_id: "booking-1",
        status: "AWAITING_CONFIRMATION",
        pickup: "VinUni",
        dropoff: "Hồ Gươm",
        vehicle: "Xe 4 chỗ",
        amount: 139000,
        currency: "VND",
      }],
      actions: [],
      completed: [],
    } as AssistantResponse;

    render(<AssistantCards response={response} onAction={() => undefined} />);

    const button = screen.getByRole("button", { name: "Hủy chuyến" });
    const card = button.closest("article");
    expect(card).toHaveClass("assistant-card", "card-ride");
    expect(card).toContainElement(button);
  });
});

describe("Restaurant selection and confirmation", () => {
  it("keeps Restaurant detail map-first and lets the user select from its information panel", () => {
    const onAction = jest.fn();
    const response = {
      conversation_id: "conversation-restaurant",
      message: "",
      completed: [],
      items: [{
        kind: "restaurant_options",
        title: "Nhà hàng phù hợp",
        options: [{
          name: "Nhà hàng Hồ Gươm",
          address: "Hà Nội",
          cuisine: "Việt Nam",
          description: "Không gian ấm cúng.",
          rating: 4.8,
        }],
      }],
      actions: [{ id: "restaurant-0", kind: "select_restaurant", label: "Chọn nhà hàng này", target_index: 0 }],
    } as AssistantResponse;

    render(<AssistantCards response={response} onAction={onAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Xem chi tiết" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Thông tin nhà hàng" }));

    expect(within(dialog).getByText("Hằng ngày: 08:00–22:00")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Chọn nhà hàng này" }));

    expect(onAction).toHaveBeenCalledWith(response.actions[0]);
  });

  it("requires an explicit acknowledgement before confirming the held table", () => {
    const onAction = jest.fn();
    const response = {
      conversation_id: "conversation-restaurant-confirmation",
      message: "",
      completed: [],
      items: [{
        kind: "restaurant_confirmation",
        title: "Mình đã tạm giữ bàn",
        restaurant: { name: "Nhà hàng Hồ Gươm", location: "Hà Nội" },
        party_size: 2,
        start_at: "2099-01-02T12:00:00+07:00",
        status: "AWAITING_CONFIRMATION",
      }],
      actions: [{ id: "restaurant-confirm", kind: "restaurant_confirm", label: "Xác nhận đặt bàn" }],
    } as AssistantResponse;

    render(<AssistantCards response={response} onAction={onAction} />);

    const confirmation = screen.getByRole("region", { name: "Xác nhận đặt bàn" });
    const button = within(confirmation).getByRole("button", { name: "Xác nhận đặt bàn" });
    expect(button).toBeDisabled();
    fireEvent.click(within(confirmation).getByRole("checkbox", { name: "Tôi xác nhận thông tin đặt bàn ở trên." }));
    fireEvent.click(button);

    expect(onAction).toHaveBeenCalledWith(response.actions[0]);
  });
});

describe("Healthcare slot card", () => {
  it("binds the selected doctor time to its authoritative action id", () => {
    const response = {
      conversation_id: "conversation-healthcare",
      message: "",
      items: [{
        kind: "healthcare_options",
        title: "Bác sĩ và lịch còn trống",
        options: [
          { doctor: "Bác sĩ A", facility: { name: "Bệnh viện A", address: "1 Test Street" }, department: "Thần kinh", start_time: "2099-01-02T09:00:00Z", price: 120000 },
          { doctor: "Bác sĩ A", facility: { name: "Bệnh viện A", address: "1 Test Street" }, department: "Thần kinh", start_time: "2099-01-02T10:00:00Z", price: 120000 },
          { doctor: "Bác sĩ B", facility: { name: "Bệnh viện B", address: "2 Test Street" }, department: "Thần kinh", start_time: "2099-01-02T11:00:00Z", price: 150000 },
        ],
      }],
      actions: [
        { id: "health-slot-0", kind: "select_healthcare_slot", label: "Chọn lịch này", target_index: 0 },
        { id: "health-slot-1", kind: "select_healthcare_slot", label: "Chọn lịch này", target_index: 1 },
        { id: "health-slot-2", kind: "select_healthcare_slot", label: "Chọn lịch này", target_index: 2 },
      ],
      completed: [],
    } as AssistantResponse;
    const onAction = jest.fn();

    render(<AssistantCards response={response} onAction={onAction} />);

    const doctorGroup = screen.getByText("Bác sĩ A").closest("section");
    expect(doctorGroup).not.toBeNull();
    fireEvent.change(within(doctorGroup as HTMLElement).getByRole("combobox", { name: "Khung giờ của Bác sĩ A" }), { target: { value: "1" } });
    fireEvent.click(within(doctorGroup as HTMLElement).getByRole("button", { name: "Chọn lịch" }));

    expect(onAction).toHaveBeenCalledWith(response.actions[1]);
  });

  it("links a missing patient profile error to the Healthcare profile screen", () => {
    render(<AssistantCards response={{ conversation_id: "conversation", message: "", actions: [], completed: [], items: [{ kind: "task_error", title: "Lựa chọn chưa hoàn tất", note: "Bạn cần liên kết hồ sơ.", error_code: "PATIENT_LINK_REQUIRED", retryable: false }] }} onAction={jest.fn()} />);

    expect(screen.getByRole("link", { name: "Liên kết hồ sơ người bệnh" })).toHaveAttribute("href", "/app/profile?section=patients");
  });

  it("lets an unpaid appointment select a different offered time", () => {
    const onAction = jest.fn();
    render(<AssistantCards response={{ conversation_id: "conversation", message: "", completed: [], items: [{ kind: "appointment", title: "Đã tạm giữ", doctor: "Bác sĩ A", department: "Thần kinh", start_time: "2099-01-02T09:00:00Z", price: 120000, status: "DRAFT", facility: { name: "Bệnh viện A", address: "1 Test Street" }, alternative_slots: [{ doctor: "Bác sĩ A", start_time: "2099-01-02T10:00:00Z", price: 120000, target_index: 3 }] }], actions: [{ id: "health-change-3", kind: "select_healthcare_slot", label: "Chọn lịch này", target_index: 3 }, { id: "health-payment", kind: "healthcare_payment", label: "Xác nhận thanh toán" }] }} onAction={onAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Đổi khung giờ" }));
    fireEvent.click(screen.getByRole("button", { name: "Giữ lịch mới" }));

    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: "health-change-3" }));
  });

  it("lets an unpaid appointment release its hold before payment", () => {
    const onAction = jest.fn();
    render(<AssistantCards response={{ conversation_id: "conversation", message: "", completed: [], items: [{ kind: "appointment", title: "Đã tạm giữ", doctor: "Bác sĩ A", start_time: "2099-01-02T09:00:00Z", price: 120000, status: "DRAFT", facility: { name: "Bệnh viện A", address: "1 Test Street" } }], actions: [{ id: "health-cancel", kind: "healthcare_cancel", label: "Hủy giữ chỗ" }] }} onAction={onAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Hủy giữ chỗ" }));

    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: "health-cancel", kind: "healthcare_cancel" }));
  });
});
