import { executeServiceCancellation, isCancellableStatus } from "./cancellation-helpers";
import * as apiClient from "@/lib/api-client";

jest.mock("@/lib/api-client", () => ({
  cancelRestaurantReservation: jest.fn().mockResolvedValue({ status: "CANCELLED" }),
  cancelHealthcareAppointment: jest.fn().mockResolvedValue({ status: "CANCELLED" }),
  cancelRideBooking: jest.fn().mockResolvedValue({ status: "CANCELLED" }),
  prepareFoodCancellation: jest.fn().mockResolvedValue({ confirmation_id: "conf_123" }),
  executeCancellation: jest.fn().mockResolvedValue({ status: "CANCELLED" }),
}));

describe("cancellation helpers", () => {
  test("correctly evaluates cancellable status", () => {
    expect(isCancellableStatus("restaurant_reservation", "CONFIRMED")).toBe(true);
    expect(isCancellableStatus("restaurant_reservation", "CANCELLED")).toBe(false);
    expect(isCancellableStatus("restaurant_reservation", "COMPLETED")).toBe(false);

    expect(isCancellableStatus("healthcare_appointment", "SCHEDULED")).toBe(true);
    expect(isCancellableStatus("healthcare_appointment", "CANCELLED")).toBe(false);

    expect(isCancellableStatus("ride_booking", "IN_TRANSIT")).toBe(false);
    expect(isCancellableStatus("ride_booking", "SEARCHING")).toBe(true);
  });

  test("executes restaurant reservation cancellation", async () => {
    await executeServiceCancellation("restaurant_reservation", { id: "res_01" });
    expect(apiClient.cancelRestaurantReservation).toHaveBeenCalledWith("res_01");
  });

  test("executes healthcare appointment cancellation", async () => {
    await executeServiceCancellation("healthcare_appointment", { id: "101" });
    expect(apiClient.cancelHealthcareAppointment).toHaveBeenCalledWith(101);
  });

  test("executes ride booking cancellation", async () => {
    await executeServiceCancellation("ride_booking", "ride_99");
    expect(apiClient.cancelRideBooking).toHaveBeenCalledWith("ride_99");
  });
});
