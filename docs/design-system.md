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

Domain accents are bounded to local service cards: muted amber for Food,
cobalt for Ride, muted berry for Restaurant and teal for Healthcare. They are
never used as full-card fills or as the only status signal.

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
| CTA | Deep Navy |
| Footer | darker Navy |

The marketing header is fixed over the hero inside a centered floating shell:
approximately 58–64px tall, 14–18px from the viewport edge, with a restrained
white surface, quiet border, backdrop blur and soft tinted shadow. After the
page leaves the top, the shell becomes slightly more opaque and raised without
changing shape. Landing anchors account for the shell offset; mobile keeps a
compact shell with the existing Sheet menu.

The hero begins its meaningful content about 28–44px below the fixed header.
Its video is a full cinematic bleed, while the title and composer remain the
authoritative readable objects. On desktop the title is intentionally two
lines:

```text
Một yêu cầu.
Nhiều việc được kết nối.
```

The supported-services scene is one four-card image-first gallery, not a
duplicate section. Cards use a white/off-white surface, a 14px maximum radius,
a quiet border, sparse shadow and transparent WebP visuals for Food, Ride,
Restaurant and Healthcare. Domain accents stay local to a small detail; icons
do not replace the supplied category artwork.

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

`NEXT_PUBLIC_HERO_VIDEO_URL` and `NEXT_PUBLIC_HERO_POSTER_URL` may override
the two hero paths. These are marketing assets only: they do not become
authoritative UI, location state, Maps API integration or product data.

When an optional capture is absent, the public landing must not show `MEDIA
SLOT`, a file path or developer-facing copy. It uses the intended text-led
relationship fallback, and expected local media is checked before rendering so
missing optional files do not create repeated broken-image requests.

## Spacing, shape and elevation

- Use a 4px base spacing scale. Common gaps: 8, 12, 16, 24, 32, 48 and 64px.
- Use 8px radius for small controls, 12px for inputs/cards/forms and 16px for
  large panels. Service cards cap at 14px.
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
  keeps three labeled stage buttons available, pauses on hover/focus and
  disables autoplay under reduced motion.
- The route scene uses the real Hanoi map with a bounded, aria-hidden SVG route
  overlay; it is a marketing illustration and never implies live coordinates.
- Never expose secrets, raw reset tokens, internal workflow state, chain of
  thought or fabricated transaction success in the UI.

## Anti-patterns

Do not use purple/blue AI gradients, mesh backgrounds, glowing orbs, generic
robot marks, chrome-like glassmorphism, stock SaaS dashboard templates, fake
metrics, testimonials/logos, huge text, excessive pills, decorative service
networks, fake SVG maps, floating service labels, repeated fake chat windows,
or `transition: all`. Calm clarity is more distinctive than visual noise.
