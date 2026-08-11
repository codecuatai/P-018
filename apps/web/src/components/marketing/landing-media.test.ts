import { LANDING_MEDIA } from "@/components/marketing/landing-media";

describe("landing media contract", () => {
  it("uses transparent WebP service paths", () => {
    expect(LANDING_MEDIA.serviceFood).toBe("/media/services/food.webp");
    expect(LANDING_MEDIA.serviceRide).toBe("/media/services/ride.webp");
    expect(LANDING_MEDIA.serviceRestaurant).toBe("/media/services/restaurant.webp");
    expect(LANDING_MEDIA.serviceHealthcare).toBe("/media/services/healthcare.webp");
  });

  it("does not depend on how-it-works screenshot assets", () => {
    expect(Object.values(LANDING_MEDIA).some((path) => path.includes("how-it-works"))).toBe(false);
  });
});
