---
name: xone-product-design
description: Design, implement, or review X-One frontend surfaces. Use for X-One landing pages, auth UI, product shell, service pages, motion, responsive UI, and design reviews in Next.js App Router, React, or related frontend work.
---

# X-One Product Design

Read `docs/design-system.md` and `docs/motion-system.md` before designing or changing an X-One frontend surface. Treat them as the canonical visual and motion source.

## Build the product, not a generic AI template

- Ground each screen in a real user task and use plain Vietnamese end-user copy.
- Preserve the Calm Kinetic Concierge direction: calm, capable, precise, human, and trustworthy; premium without luxury or sci-fi cues.
- Give each major surface one useful signature element. Prefer real product media and scroll-linked focus over decorative diagrams. Use the X-One service-network/junction language only when a real structural explanation needs it; it is not the default landing hero visual.
- Keep hierarchy intentional: Be Vietnam Pro for reading, IBM Plex Mono only for small structured utility labels, and no Inter fallback as the intended face.
- Use semantic X-One tokens, restrained surfaces, clear borders, and the documented radius scale. Do not add rainbow domain theming.
- Avoid AI-slop: glowing gradients, orbs, blobs, glass everywhere, generic robot branding, fake metrics/testimonials/logos, decorative clutter, or card stacks without information value.

## Implement inclusively and responsively

- Start at 320px, then verify tablet, laptop, desktop, and a reasonable wide layout without horizontal overflow.
- Use semantic landmarks, heading order, native links/buttons/forms, explicit labels, visible keyboard focus, useful `aria-live` feedback, and accessible names for icon controls.
- Respect `prefers-reduced-motion`; preserve functional feedback while removing parallax, loops, and large transforms.
- Use Next.js App Router server components by default and small client islands only for browser state. Use real `next/link`/`next/navigation` destinations and honest loading, empty, error, and planned states. Do not present future capabilities as implemented.

## Apply motion with restraint

- Keep scroll-triggered entrance and scroll-linked focus/exit as two separate concepts. Use `RevealScene`/`RevealItem` for one-time viewport entrances, then `ScrollFocusScene` only for restrained depth after entry.
- Use approximately 450–650ms section entrances, `once: true`, `amount: 0.15–0.25`, and 70–100ms child staggers. Keep leaving-focus content readable; do not pin future sections at low opacity on page load.
- Reuse only the canonical primitives: fade, fade-up, scale-in, stagger, line-draw, soft-hover, and scroll-progress.
- Animate primarily opacity and transform. Keep interaction feedback immediate and do not use `transition: all`.
- Reserve expressive motion for the landing hero and multi-service story; authenticated product screens prioritize clarity and task completion.

## Marketing landing guardrails

- The marketing header is fixed, subtle at the top and lightly raised after scroll; offset content and anchor targets for its height.
- Use the existing hero video/poster/map assets when present. When screenshot assets are absent, render a polished neutral product panel—never `MEDIA SLOT`, a public file path or developer placeholder copy.
- Keep the service scene as exactly four visual cards for Food, Ride, Restaurant and Healthcare. Use bounded accents and tonal surfaces; avoid gradients, blobs, or decorative SVG networks.

### Phase 1 final marketing visual pass

- Use a centered floating navigation shell over the hero; the page must not
  render a full-width white header strip.
- Keep the hero video legible and place contrast treatment only behind the
  copy. The loop uses a poster crossfade near the end of playback and reduced
  motion renders the poster only.
- Use the supplied transparent WebP service media at
  `/media/services/food.webp`, `ride.webp`, `restaurant.webp` and
  `healthcare.webp`. A missing asset keeps the image-first layout intact and
  never exposes a filesystem path or debug placeholder.
- How X-One Works is one auto-sliding, keyboard-accessible carousel with
  exactly three labeled stages. Its previews are coded product UI with real
  X-One copy and confirmation language; do not build generic screenshot
  rectangles or include tool/debug traces.
- The Hanoi scene uses `/media/hanoi-map.webp` plus a small aria-hidden SVG
  route overlay for marketing relationships only. Route paths draw once and
  remain visible; reduced motion shows the complete route immediately.
- Keep eyebrow usage sparse, preserve auth modal behavior and XOneMark, and
  use CSS Modules with small client islands for browser state and motion.

## Review before handoff

- Inspect a rendered screenshot when the environment supports it.
- Ask whether the composition could be reused unchanged by a crypto/AI dashboard, whether surfaces or radii repeat without purpose, and whether the signature element demonstrates actual X-One orchestration.
- Correct generic, inaccessible, misleading, or motion-heavy results before reporting completion.
