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

describe("Result disclosure", () => {
  it("shows four Restaurant rows by default and keeps the original action index", () => {
    const options = Array.from({ length: 5 }, (_, index) => ({
      name: `Nhà hàng ${index + 1}`,
      address: `Địa chỉ ${index + 1}`,
      target_index: index,
    }));
    const actions = options.map((_, index) => ({ id: `restaurant-${index}`, kind: "select_restaurant" as const, label: "Chọn nhà hàng này", target_index: index }));
    const onAction = jest.fn();

    render(<AssistantCards response={{ conversation_id: "restaurant-disclosure", message: "", completed: [], items: [{ kind: "restaurant_options", title: "Nhà hàng", options }], actions }} onAction={onAction} />);

    expect(screen.getByText("Nhà hàng 4")).toBeInTheDocument();
    expect(screen.queryByText("Nhà hàng 5")).not.toBeInTheDocument();
    const disclosure = screen.getByRole("button", { name: "Hiện tất cả" });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(disclosure);
    expect(screen.getByText("Nhà hàng 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Thu gọn danh sách$/ })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(within(screen.getByText("Nhà hàng 5").closest(".option-row") as HTMLElement).getByRole("button", { name: "Chọn quán" }));
    expect(onAction).toHaveBeenCalledWith(actions[4]);

    fireEvent.click(screen.getByRole("button", { name: /^Thu gọn danh sách$/ }));
    expect(screen.queryByText("Nhà hàng 5")).not.toBeInTheDocument();
  });

  it("keeps the checked restaurant visible when its requested slot is unavailable", () => {
    render(<AssistantCards response={{
      conversation_id: "restaurant-unavailable",
      message: "",
      completed: [],
      items: [{
        kind: "restaurant_unavailable",
        title: "Quán đã chọn chưa còn bàn",
        restaurant: { name: "Samcheop Topokki", address: "Trần Quốc Hoàn, Cầu Giấy" },
        options: [{ name: "Quán thay thế", address: "Cầu Giấy" }],
        note: "Bạn có thể đổi giờ hoặc chọn quán khác.",
      }],
      actions: [],
    } as AssistantResponse} onAction={jest.fn()} />);

    expect(screen.getAllByText("Quán đã chọn chưa còn bàn")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Nhà hàng đã kiểm tra" })).toHaveTextContent("Samcheop Topokki");
    expect(screen.getByText("Quán thay thế")).toBeInTheDocument();
  });

  it("shows four Food rows by default and binds selection to the original option", () => {
    const options = Array.from({ length: 5 }, (_, index) => ({ name: `Món ${index + 1}`, price: 50000 + index }));
    const actions = options.map((_, index) => ({ id: `food-${index}`, kind: "select_food_item" as const, label: "Chọn món này", target_index: index }));
    const onFoodSelectionChange = jest.fn();

    render(<AssistantCards response={{ conversation_id: "food-disclosure", message: "", completed: [], items: [{ kind: "food_options", title: "Món ăn", options }], actions }} onAction={jest.fn()} onFoodSelectionChange={onFoodSelectionChange} />);

    expect(screen.queryByText("Món 5")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hiện tất cả" }));
    fireEvent.click(screen.getByRole("button", { name: "Tăng Món 5" }));

    expect(onFoodSelectionChange).toHaveBeenCalledWith(expect.objectContaining({ action: actions[4], option: options[4], quantity: 1 }));
  });

  it("shows four Healthcare form rows by default and preserves the slot target index", () => {
    const options = Array.from({ length: 5 }, (_, index) => ({
      doctor: `Bác sĩ ${index + 1}`,
      facility: { name: `Bệnh viện ${index + 1}` },
      department: "Thần kinh",
      start_time: `2099-01-0${index + 1}T09:00:00Z`,
      target_index: index,
    }));
    const actions = options.map((_, index) => ({ id: `health-${index}`, kind: "select_healthcare_slot" as const, label: "Chọn lịch này", target_index: index }));
    const onAction = jest.fn();

    render(<AssistantCards response={{ conversation_id: "healthcare-disclosure", message: "", completed: [], items: [{ kind: "healthcare_options", title: "Lịch khám", options }], actions }} onAction={onAction} />);

    expect(screen.getByText("Bác sĩ 4")).toBeInTheDocument();
    expect(screen.queryByText("Bác sĩ 5")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hiện tất cả" }));
    const fifthDoctor = screen.getByText("Bác sĩ 5").closest("section") as HTMLElement;
    fireEvent.click(within(fifthDoctor).getByRole("button", { name: "Chọn lịch" }));

    expect(onAction).toHaveBeenCalledWith(actions[4]);
  });

  it("keeps an active Food confirmation control visible while options are collapsed", () => {
    const options = Array.from({ length: 5 }, (_, index) => ({ name: `Món xác nhận ${index + 1}`, price: 50000 }));
    render(<AssistantCards response={{ conversation_id: "food-confirmation-disclosure", message: "", completed: [], items: [{ kind: "food_confirmation", title: "Xác nhận đơn", options }], actions: [{ id: "food-confirm", kind: "food_confirm", label: "Xác nhận đơn" }] }} onAction={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Xác nhận thông tin đơn" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hiện tất cả" })).toHaveAttribute("aria-expanded", "false");
  });
});

describe("Ride cancellation card", () => {
  it("shows ordered intermediate stops in the public Ride confirmation card", () => {
    const { container } = render(<AssistantCards response={{
      conversation_id: "conversation-stopover",
      message: "",
      actions: [],
      completed: [],
      items: [{
        kind: "ride_booking",
        title: "Kiểm tra chuyến xe",
        pickup: "Vị trí hiện tại",
        stopovers: [{ address: "Công viên Nghĩa Đô" }, { address: "Hồ Tây" }],
        dropoff: "Nhà hàng đã chọn",
        vehicle: "Xe 4 chỗ",
        amount: 139000,
        currency: "VND",
      }],
    } as AssistantResponse} onAction={jest.fn()} />);

    expect(screen.getByText("ĐIỂM DỪNG 1")).toBeInTheDocument();
    expect(screen.getByText("Công viên Nghĩa Đô")).toBeInTheDocument();
    expect(screen.getByText("ĐIỂM DỪNG 2")).toBeInTheDocument();
    expect(screen.getByText("Hồ Tây")).toBeInTheDocument();
    const card = container.querySelector("article.card-ride");
    const cardText = card?.textContent ?? "";
    expect(cardText.indexOf("Vị trí hiện tại")).toBeLessThan(cardText.indexOf("Công viên Nghĩa Đô"));
    expect(cardText.indexOf("Công viên Nghĩa Đô")).toBeLessThan(cardText.indexOf("Hồ Tây"));
    expect(cardText.indexOf("Hồ Tây")).toBeLessThan(cardText.indexOf("Nhà hàng đã chọn"));
  });

  it("renders the final Ride confirmation fields and dispatches one service action", () => {
    const onAction = jest.fn();
    const response = {
      conversation_id: "conversation-ride-final",
      message: "",
      actions: [{ id: "ride-service", kind: "ride_service", label: "Xác nhận chuyến xe" }],
      completed: [],
      items: [{
        kind: "ride_quote",
        title: "Báo giá chuyến xe",
        pickup: "Vị trí hiện tại, Cầu Giấy",
        stopovers: [{ address: "Công viên Nghĩa Đô" }],
        dropoff: "Số 1 Cầu Giấy, Hà Nội",
        vehicle: "Xe máy",
        amount: 67000,
        currency: "VND",
        duration_minutes: 32,
      }],
    } as AssistantResponse;

    render(<AssistantCards response={response} onAction={onAction} />);

    const card = screen.getByText("Báo giá chuyến xe").closest("article");
    expect(card).toHaveTextContent("Vị trí hiện tại, Cầu Giấy");
    expect(card).toHaveTextContent("Công viên Nghĩa Đô");
    expect(card).toHaveTextContent("Số 1 Cầu Giấy, Hà Nội");
    expect(card).toHaveTextContent("Xe máy");
    expect(card).toHaveTextContent("67.000 đ");
    expect(card).toHaveTextContent("32 phút");
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "Xác nhận chuyến xe" }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(response.actions[0]);
  });

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

  it("shows the old and new reservation terms and dispatches the update action", () => {
    const onAction = jest.fn();
    const response = {
      conversation_id: "conversation-restaurant-update",
      message: "",
      completed: [],
      items: [{
        kind: "restaurant_confirmation",
        title: "Xác nhận đổi giờ đặt bàn",
        operation: "UPDATE",
        resource_id: "reservation-1",
        restaurant: { name: "Nhà hàng Hồ Gươm", location: "Hà Nội" },
        previous_start_at: "2099-01-02T12:00:00+07:00",
        start_at: "2099-01-02T13:00:00+07:00",
        previous_party_size: 2,
        party_size: 3,
        status: "AWAITING_CONFIRMATION",
      }],
      actions: [{ id: "restaurant-update", kind: "restaurant_update", label: "Xác nhận đổi giờ" }],
    } as AssistantResponse;

    render(<AssistantCards response={response} onAction={onAction} />);

    const confirmation = screen
      .getAllByText("Xác nhận đổi giờ đặt bàn")
      .find((element) => element.closest("article") !== null)
      ?.closest("article") as HTMLElement;
    expect(confirmation).toHaveTextContent("Giờ hiện tại");
    expect(confirmation).toHaveTextContent("Giờ mới");
    expect(confirmation).toHaveTextContent("Số khách hiện tại");
    const button = within(confirmation).getByRole("button", { name: "Xác nhận đổi giờ" });
    expect(button).toBeDisabled();
    fireEvent.click(within(confirmation).getByRole("checkbox", { name: "Tôi xác nhận thay đổi đặt bàn ở trên." }));
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

  it("renders a truthful nearby Healthcare alternative without inventing a requested time", () => {
    const response = {
      conversation_id: "conversation-healthcare-alternative",
      message: "",
      items: [{
        kind: "healthcare_options",
        title: "Lịch khám gần nhất",
        note: "Không có đúng khung 10:00; dưới đây là các khung giờ gần nhất còn trống để bạn cân nhắc.",
        options: [{ doctor: "Bác sĩ A", facility: { name: "Bệnh viện A" }, department: "Thần kinh", start_time: "2099-01-01T11:30:00Z", target_index: 0 }],
      }],
      actions: [{ id: "health-alternative", kind: "select_healthcare_slot", label: "Chọn lịch này", target_index: 0 }],
      completed: [],
    } as AssistantResponse;

    render(<AssistantCards response={response} onAction={jest.fn()} />);

    expect(screen.getByText(/Không có đúng khung 10:00/)).toBeInTheDocument();
    expect(screen.getAllByText(/18:30 01\/01\/2099/)).toHaveLength(2);
  });

  it("renders an empty Healthcare result without a selection control", () => {
    render(<AssistantCards response={{
      conversation_id: "conversation-healthcare-empty",
      message: "",
      items: [{
        kind: "healthcare_no_availability",
        title: "Chưa có lịch phù hợp",
        note: "Mình không tìm thấy khung giờ còn trống phù hợp. Hiện chưa có lựa chọn thay thế trong dữ liệu.",
        options: [],
      }],
      actions: [],
      completed: [],
    } as AssistantResponse} onAction={jest.fn()} />);

    expect(screen.getByText(/Hiện chưa có lựa chọn thay thế/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chọn lịch" })).not.toBeInTheDocument();
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

describe("Partial multi-service results and task error details", () => {
  it("renders the completed Restaurant success card before the failed Ride error card", () => {
    const response = {
      conversation_id: "conversation-partial",
      message: "",
      completed: [{
        kind: "reservation",
        title: "Đã đặt bàn thành công",
        restaurant: { name: "Maison Hanoi", location: "12 Hoan Kiem, Ha Noi" },
        reservation_code: "res-1",
        start_at: "2099-01-01T19:00:00+07:00",
        party_size: 2,
        status: "CONFIRMED",
      }],
      items: [{
        kind: "task_error",
        title: "Dịch vụ gặp sự cố",
        note: "Mình chưa thể đặt chuyến xe cho bạn.",
        error_code: "NO_DRIVER",
        retryable: false,
      }],
      actions: [],
    } as AssistantResponse;

    render(<AssistantCards response={response} onAction={jest.fn()} />);

    expect(screen.getByText("Maison Hanoi")).toBeInTheDocument();
    expect(screen.getByText("Đã xác nhận")).toBeInTheDocument();
    expect(screen.getByText(/NO_DRIVER/)).toBeInTheDocument();
    expect(screen.getByText(/Mình chưa thể đặt chuyến xe cho bạn/)).toBeInTheDocument();

    const blocks = Array.from(document.querySelectorAll(".assistant-card, .task-error-notice"));
    expect(blocks.length).toBe(2);
    expect(blocks[0]).toHaveClass("assistant-card", "card-restaurant");
    expect(blocks[1]).toHaveClass("task-error-notice");
  });

  it("shows the failed task's real error note instead of a generic fallback", () => {
    render(<AssistantCards response={{ conversation_id: "conversation", message: "", completed: [], items: [{ kind: "task_error", title: "Không thể đặt chuyến xe", note: "Hiện chưa tìm được tài xế phù hợp.", error_code: "NO_DRIVER", retryable: false }], actions: [] }} onAction={jest.fn()} />);

    expect(screen.getByText(/Không thể đặt chuyến xe/)).toBeInTheDocument();
    expect(screen.getByText(/Hiện chưa tìm được tài xế phù hợp/)).toBeInTheDocument();
    expect(screen.queryByText("Bạn hãy thử lại nhé.")).not.toBeInTheDocument();
  });

  it("retries only the failed task's action from a retryable error card", () => {
    const onAction = jest.fn();
    const response = {
      conversation_id: "conversation-retry",
      message: "",
      completed: [],
      items: [{
        kind: "task_error",
        title: "Dịch vụ gặp sự cố",
        note: "Tạm thời chưa kết nối được dịch vụ xe.",
        error_code: "UPSTREAM_UNAVAILABLE",
        retryable: true,
        action_id: "ride-service-action",
      }],
      actions: [{ id: "ride-service-action", kind: "ride_service", label: "Xác nhận chuyến xe" }],
    } as AssistantResponse;

    render(<AssistantCards response={response} onAction={onAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Thử lại bước này" }));

    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: "ride-service-action", kind: "ride_service" }));
  });
});


describe("Collapsible agent cards in the workflow", () => {
  it("wraps service cards with the reusable toggle and a collapsed summary", () => {
    const onAction = jest.fn();
    const response = {
      conversation_id: "conversation-collapsible",
      message: "",
      completed: [],
      items: [{
        kind: "restaurant_options",
        title: "Nhà hàng phù hợp",
        options: [
          { name: "Quán A", address: "Hà Nội", cuisine: "Việt Nam" },
          { name: "Quán B", address: "Hà Nội", cuisine: "Việt Nam" },
        ],
      }],
      actions: [{ id: "restaurant-0", kind: "select_restaurant", label: "Chọn nhà hàng này", target_index: 0 }],
    } as AssistantResponse;

    render(<AssistantCards response={response} onAction={onAction} />);

    const toggle = screen.getByRole("button", { name: "Thu gọn" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Chọn quán" })).toBeInTheDocument();
    expect(screen.queryByText("2 quán phù hợp")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByRole("button", { name: "Hiện tất cả" })).toBeInTheDocument();
    expect(screen.getByText("2 quán phù hợp")).toBeInTheDocument();
    expect(screen.getByText("Quán A")).toBeInTheDocument();
  });
});
