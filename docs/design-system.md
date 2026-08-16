# X-One Design System

This is the canonical visual source for X-One landing, authentication, product
shell and future service surfaces.

## Direction

**Calm Kinetic Concierge** is calm, capable, precise, human and trustworthy.
The Phase 1 landing evolves that direction into a cinematic product editorial:
strong scenes, real product media, clear reading order and controlled depth.
It should feel like X-One is calmly keeping a thread together, not like a
generic AI dashboard or a decorative technology demo.

The X-One four-path junction remains a structural signature when a surface
needs to explain orchestration. It is not a default hero decoration. Landing
surfaces prefer the real Hanoi media, the composer and the service story.

## Colour and type tokens

The only canonical token definitions live in `apps/web/src/app/globals.css`.
Marketing and product CSS should use these semantic names instead of scattering
new hex values through components.

| Token | Value | Role |
| --- | --- | --- |
| `--color-canvas` | `#F5F7F8` | shared porcelain canvas |
| `--color-surface` | `#FFFFFF` | paper/card surface |
| `--color-ink` | `#111827` | primary text |
| `--color-muted` | `#667085` | supporting text |
| `--color-navy` | `#16324F` | structural dark and primary headings |
| `--color-primary` | `#315EF5` | primary action and active route |
| `--color-success` | `#0E8E83` | connected/confirmed state |
| `--color-border` | `#D9E0E7` | quiet visible boundary |
| `--surface-ice` | `#F1F4FF` | supported-services atmosphere |
| `--surface-sand` | `#F7F2EC` | multi-service story atmosphere |
| `--surface-mist` | `#EEF8F6` | map/safety atmosphere |
| `--surface-slate` | `#F1F5F8` | assistant atmosphere |

Domain accents are bounded to the local service media: muted amber for Food,
cobalt for Ride, muted berry for Restaurant and teal for Healthcare. They are
never used as full-section fills or as the only status signal.

Use **Be Vietnam Pro** for headings and prose, with controlled high-density
headlines and roughly 1.5–1.7 body line height. Use **IBM Plex Mono** only for
small status, timestamp or structured utility labels. Inter is not the intended
product face.

## Landing composition

The landing uses this tonal rhythm:

| Scene | Surface |
| --- | --- |
| Hero | white with Hanoi video |
| Supported services | Ice Cobalt |
| How X-One works | white |
| Multi-service story | Warm Sand |
| Map | Mist Teal |
| Safety | white with a Mist Teal panel |
| Assistant | Cool Slate |
| Final CTA | Cool Slate, editorial light scene |
| Footer | minimal legal strip integrated into the final scene |

The marketing header is fixed over the hero inside one transparent positioning
frame containing two independent floating islands: a fit-content brand island
near the page gutter and a navigation/action island near the opposite gutter.
Each surface is approximately 54–60px tall with a restrained white surface,
quiet border, 14–18px backdrop blur and soft tinted shadow. After the page
leaves the top, both islands become only slightly more opaque and raised without
changing shape. The islands never visually connect. Landing anchors account for
the shell offset; mobile keeps the compact brand island and the existing Sheet
menu as a separate island.

The hero begins its meaningful content about 28–44px below the fixed header.
There is no extra kicker above the title. Its video is a full cinematic bleed,
while the title and composer remain the primary readable objects. On desktop
the title is intentionally two lines:

```text
Một yêu cầu.
Nhiều việc được kết nối.
```

The supported-services scene is one asymmetric split: end-user introduction and
active-service copy on the left, with a floating four-slab composition on the
right. The supplied transparent WebP visuals for Food, Ride, Restaurant and
Healthcare sit slightly above pale ice material slabs with varied sizes, poses
and depth. Selection brings one slab forward without changing layout; there is
no orbital wheel or autoplay.

## Landing media contract

Optional public assets live under `apps/web/public/media/`:

| Purpose | Expected path | Fallback |
| --- | --- | --- |
| Hero ambient video | `/media/hero-loop.mp4` | hero poster or neutral media layer |
| Hero poster / reduced-motion frame | `/media/hero-poster.webp` | porcelain neutral layer |
| Service visual — Food | `/media/services/food.webp` | reserved image area with calm label |
| Service visual — Ride | `/media/services/ride.webp` | reserved image area with calm label |
| Service visual — Restaurant | `/media/services/restaurant.webp` | reserved image area with calm label |
| Service visual — Healthcare | `/media/services/healthcare.webp` | reserved image area with calm label |
| Hanoi marketing map | `/media/hanoi-map.webp` | neutral map presentation |
| Optional multi-service capture | `/media/xone-multiservice-example.webp` | text-led relationship story |
| X-One chat capture | `/media/xone-chat-example.webp` | polished neutral product panel |
| X-One confirmation capture | `/media/xone-confirmation-example.webp` | polished neutral product panel |
| Final editorial object | `/media/final/xone-object.webp` | quiet object composition fallback |

`NEXT_PUBLIC_HERO_VIDEO_URL` and `NEXT_PUBLIC_HERO_POSTER_URL` may override
the two hero paths. These are marketing assets only: they do not become
authoritative UI, location state, Maps API integration or product data.

When an optional capture is absent, the public landing must not show `MEDIA
SLOT`, a file path or developer-facing copy. It uses the intended text-led
relationship fallback, and expected local media is checked before rendering so
missing optional files do not create repeated broken-image requests.

## Spacing, shape and elevation

- Use a 4px base spacing scale. Common gaps: 8, 12, 16, 24, 32, 48 and 64px.
- Landing sections use a restrained baseline of roughly `clamp(54px, 6vw,
  88px)` and tune top/bottom rhythm per scene; adjacent scenes should feel
  connected rather than separated by one repeated oversized gap. Mobile scenes
  usually sit in the 48–64px range.
- Use 8px radius for small non-action surfaces, 12px for inputs/cards/forms,
  16px for large panels, and `999px` for action buttons, carousel arrows,
  service selectors and stage controls.
- Borders are light but visible; low-contrast glass panes are not a substitute
  for grouping. Shadows are short, soft and sparse—never coloured glows.
- Icons come from Lucide, normally 16–20px in controls and 20–24px in service
  contexts. An icon supports a label; it is not a mystery control.

## Accessibility and content guardrails

- Build from 320px upward; preserve readable line lengths, tap targets,
  keyboard focus, no horizontal overflow and a visible skip link.
- The map is labelled as a marketing illustration, not live location/tracking.
- The assistant may prepare a choice but cannot claim a booking/payment is
  complete without the Gateway's confirmed result.
- `prefers-reduced-motion` shows the hero poster, stops prompt rotation and
  removes reveal/focus transforms while keeping every content block visible.
- The How X-One Works carousel shows one coded product preview at a time,
  keeps three labeled stage buttons and previous/next controls available,
  advances every approximately 2.2 seconds, pauses on hover/focus, hidden
  document and viewport exit, and disables autoplay under reduced motion.
- The route scene uses the real Hanoi map with a bounded, aria-hidden SVG route
  overlay with persistent base paths and bounded repeated cobalt tracers; it is
  a marketing illustration and never implies live coordinates.
- The multi-service scene is a coded conversation: one natural-language request
  can introduce related restaurant and ride steps while the UI keeps important
  confirmation boundaries visible. It is illustrative and has no side effects.
- The final CTA is a light, full-height editorial scene with one strong cobalt
  `Bắt đầu với X-One` action. Its optional object media is transparent,
  text-free, fills the right side without a max-width container and never
  carries a generated X-One mark.
- Never expose secrets, raw reset tokens, internal workflow state, chain of
  thought or fabricated transaction success in the UI.

## Anti-patterns

Do not use purple/blue AI gradients, mesh backgrounds, glowing orbs, generic
robot marks, chrome-like glassmorphism, stock SaaS dashboard templates, fake
metrics, testimonials/logos, huge text, pills without action meaning,
decorative service networks, fake SVG maps, floating service labels, repeated
fake chat windows, an abrupt dark CTA strip, or `transition: all`. Calm clarity
is more distinctive than visual noise.
