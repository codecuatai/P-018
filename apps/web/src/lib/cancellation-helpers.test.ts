import { canRateStatus, executeServiceCancellation, isCancellableStatus } from "./cancellation-helpers";
import * as apiClient from "@/lib/api-client";

jest.mock("@/lib/api-client", () => ({
  cancelRestaurantReservation: jest.fn().mockResolvedValue({ status: "CANCELLED" }),
  cancelHealthcareAppointment: jest.fn().mockResolvedValue({ status: "CANCELLED" }),
  cancelRideBooking: jest.fn().mockResolvedValue({ status: "CANCELLED" }),
  prepareFoodCancellation: jest.fn().mockResolvedValue({ confirmation_id: "conf_123" }),
  executeCancellation: jest.fn().mockResolvedValue({ status: "CANCELLED" }),
}));

describe("cancellation and rating helpers", () => {
  test("correctly evaluates cancellable status", () => {
    expect(isCancellableStatus("restaurant_reservation", "CONFIRMED")).toBe(true);
    expect(isCancellableStatus("restaurant_reservation", "CANCELLED")).toBe(false);
    expect(isCancellableStatus("restaurant_reservation", "COMPLETED")).toBe(false);

    expect(isCancellableStatus("healthcare_appointment", "SCHEDULED")).toBe(true);
    expect(isCancellableStatus("healthcare_appointment", "CANCELLED")).toBe(false);

    expect(isCancellableStatus("ride_booking", "IN_TRANSIT")).toBe(false);
    expect(isCancellableStatus("ride_booking", "SEARCHING")).toBe(true);
  });

  test("correctly evaluates rating eligibility based on completed status", () => {
    // Restaurant reservation rating eligibility: CONFIRMED or HELD must NOT allow rating
    expect(canRateStatus("CONFIRMED", "restaurant_reservation")).toBe(false);
    expect(canRateStatus("HELD", "restaurant_reservation")).toBe(false);
    expect(canRateStatus("COMPLETED", "restaurant_reservation")).toBe(true);
    expect(canRateStatus("SEATED", "restaurant_reservation")).toBe(false);
    expect(canRateStatus("SEATED", "restaurant_reservation", { start_at: "2099-01-01T19:00:00Z" })).toBe(false);
    expect(canRateStatus("SEATED", "restaurant_reservation", { start_at: "2020-01-01T19:00:00Z" })).toBe(true);

    // Healthcare appointment rating eligibility: PAYMENT_CONFIRMED or SCHEDULED must NOT allow rating
    expect(canRateStatus("PAYMENT_CONFIRMED", "healthcare_appointment")).toBe(false);
    expect(canRateStatus("CONFIRMED", "healthcare_appointment")).toBe(false);
    expect(canRateStatus("SCHEDULED", "healthcare_appointment")).toBe(false);
    expect(canRateStatus("COMPLETED", "healthcare_appointment")).toBe(true);

    // Ride booking rating eligibility
    expect(canRateStatus("CONFIRMED", "ride_booking")).toBe(false);
    expect(canRateStatus("COMPLETED", "ride_booking")).toBe(true);

    // Food order rating eligibility
    expect(canRateStatus("PREPARING", "food_order")).toBe(false);
    expect(canRateStatus("DELIVERED", "food_order")).toBe(true);
  });

  test("executes restaurant reservation cancellation", async () => {
    await executeServiceCancellation("restaurant_reservation", { id: "res_01" });
    expect(apiClient.cancelRestaurantReservation).toHaveBeenCalledWith("res_01");
  });

  test("executes restaurant reservation cancellation using fallbackId when resource has no id property", async () => {
    await executeServiceCancellation("restaurant_reservation", { reservation_code: "RES-99" }, "res-28045295bbfd");
    expect(apiClient.cancelRestaurantReservation).toHaveBeenCalledWith("res-28045295bbfd");
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
