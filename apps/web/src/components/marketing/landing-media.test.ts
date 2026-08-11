import { LANDING_MEDIA } from "@/components/marketing/landing-media";
import { hasLandingMedia } from "@/components/marketing/landing-media-availability";

describe("landing media contract", () => {
  it("uses transparent WebP service paths", () => {
    expect(LANDING_MEDIA.serviceFood).toBe("/media/services/food.webp");
    expect(LANDING_MEDIA.serviceRide).toBe("/media/services/ride.webp");
    expect(LANDING_MEDIA.serviceRestaurant).toBe("/media/services/restaurant.webp");
    expect(LANDING_MEDIA.serviceHealthcare).toBe("/media/services/healthcare.webp");
    expect(LANDING_MEDIA.finalObject).toBe("/media/final/xone-object.webp");
  });

  it("does not depend on how-it-works screenshot assets", () => {
    expect(Object.values(LANDING_MEDIA).some((path) => path.includes("how-it-works"))).toBe(false);
  });

  it("fails closed when an optional final object asset is unavailable", () => {
    expect(hasLandingMedia("/media/final/not-supplied.webp")).toBe(false);
    expect(hasLandingMedia("https://example.com/final-object.webp")).toBe(false);
  });
});
