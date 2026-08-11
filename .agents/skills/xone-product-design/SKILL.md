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

- Keep scroll-triggered entrance and scroll-linked focus/exit as two separate concepts. Use `RevealScene`/`RevealItem` for viewport entrances, with `replayOnReenter` opt-in on marketing sections, then `ScrollFocusScene` only for restrained depth after entry.
- Use approximately 450–650ms section entrances, `once: !replayOnReenter`, `amount: 0.15–0.25`, a restrained root margin, and 70–100ms child staggers. Replay-capable landing content softly fades/shifts inactive outside the viewport; do not pin future sections at low opacity on page load.
- Reuse only the canonical primitives: fade, fade-up, scale-in, stagger, line-draw, soft-hover, and scroll-progress.
- Animate primarily opacity and transform. Keep interaction feedback immediate and do not use `transition: all`.
- Reserve expressive motion for the landing hero and multi-service story; authenticated product screens prioritize clarity and task completion.

## Marketing landing guardrails

- The marketing header is fixed, subtle at the top and lightly raised after scroll; offset content and anchor targets for its height.
- Use the existing hero video/poster/map assets when present. When screenshot assets are absent, render a polished neutral product panel—never `MEDIA SLOT`, a public file path or developer placeholder copy.
- Keep the service scene as exactly four selectable visual items for Food, Ride, Restaurant and Healthcare in an asymmetric floating-slab composition. Use bounded accents and tonal surfaces; avoid orbit wheels, continuous rotation, gradients, blobs, or decorative SVG networks.

### Phase 1 final marketing visual pass

- Use one fixed positioning frame with two independent floating navigation
  islands over the hero: a brand island near the left gutter and a
  navigation/action island near the right gutter. The page must not render a
  full-width white header strip or visually connect the islands.
- Keep the hero video legible and place contrast treatment only behind the
  copy. The lifecycle is playing → poster → 2-second poster hold → restart at
  time zero → crossfade after `playing`; reduced motion renders the poster only.
- Use the supplied transparent WebP service media at
  `/media/services/food.webp`, `ride.webp`, `restaurant.webp` and
  `healthcare.webp`. A missing asset keeps the image-first layout intact and
  never exposes a filesystem path or debug placeholder. Compose the assets as
  four varied pale material slabs with restrained perspective, selection settle
  and keyboard activation; there is no autoplay or orbital rotation. Reduced
  motion removes the 3D tilt while keeping selection available.
- How X-One Works is one auto-sliding, keyboard-accessible horizontal carousel
  with exactly three labeled stages, a ~2.2-second timer, and visible previous /
  next controls. Its previews are coded product UI with real X-One copy and
  confirmation language; do not build generic screenshot rectangles or include
  tool/debug traces. Hover, focus, hidden-document state, viewport exit and
  reduced motion pause auto-advance.
- The multi-service story uses a replay-capable coded conversation cascade to show
  one request carrying related restaurant and ride steps. It must keep the
  confirmation boundary visible and must not imply autonomous execution or
  produce tool/debug UI.
- The Hanoi scene uses `/media/hanoi-map.webp` plus a small aria-hidden SVG
  route overlay for marketing relationships only. Use at most four visibly
  curved base route paths plus cobalt tracers, keep the base paths visible,
  repeat tracer motion only while visible, and show the static base scene under
  reduced motion.
- The final CTA is a light full-height editorial scene in the same tonal family
  as the preceding section. Use `/media/final/xone-object.webp` when present,
  replay the object reveal when the landing scene re-enters, keep one primary
  cobalt pill CTA, omit the final login action, and integrate only a minimal
  legal footer strip.
- Keep eyebrow usage sparse, preserve auth modal behavior and XOneMark, and
  use CSS Modules with small client islands for browser state and motion.

### Phase 1 motion-family checklist

Assign one motion family per major section: hero media lifecycle and prompt;
service slab selection settle plus physical hover; horizontal carousel;
replay-capable multi-service conversation cascade; map mask plus persistent
base routes and repeated tracers; safety row cascade; assistant split reveal
plus underline; and final object reveal. Do not wrap the whole landing in a
repeated `ScrollFocusScene`. Reserve that primitive for a specific focus
relationship, and use `RevealItem`/`whileInView` with explicit replay opt-in for
simple entrances.

## Review before handoff

- Inspect a rendered screenshot when the environment supports it.
- Ask whether the composition could be reused unchanged by a crypto/AI dashboard, whether surfaces or radii repeat without purpose, and whether the signature element demonstrates actual X-One orchestration.
- Correct generic, inaccessible, misleading, or motion-heavy results before reporting completion.
