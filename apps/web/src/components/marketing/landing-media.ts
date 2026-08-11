export const LANDING_MEDIA = {
  heroVideo: process.env.NEXT_PUBLIC_HERO_VIDEO_URL || "/media/hero-loop.webm",
  heroPoster: process.env.NEXT_PUBLIC_HERO_POSTER_URL || "/media/hero-poster.webp",
  serviceFood: "/media/services/food.webp",
  serviceRide: "/media/services/ride.webp",
  serviceRestaurant: "/media/services/restaurant.webp",
  serviceHealthcare: "/media/services/healthcare.webp",
  hanoiMap: "/media/hanoi-map.webp",
  finalObject: "/media/final/xone-object.webp",
  xoneChatExample: "/media/xone-chat-example.webp",
  xoneConfirmationExample: "/media/xone-confirmation-example.webp",
  xoneMultiService: "/media/xone-multiservice-example.webp",
} as const;

export type LandingMediaKey = keyof typeof LANDING_MEDIA;
