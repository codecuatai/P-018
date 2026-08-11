export const LANDING_MEDIA = {
  heroVideo: process.env.NEXT_PUBLIC_HERO_VIDEO_URL || "/media/hero-loop.mp4",
  heroPoster: process.env.NEXT_PUBLIC_HERO_POSTER_URL || "/media/hero-poster.webp",
  hanoiMap: "/media/hanoi-map.webp",
  xoneChatExample: "/media/xone-chat-example.webp",
  xoneConfirmationExample: "/media/xone-confirmation-example.webp",
} as const;

export type LandingMediaKey = keyof typeof LANDING_MEDIA;
