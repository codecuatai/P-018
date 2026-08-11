---
name: xone-product-design
description: Design, implement, or review X-One frontend surfaces. Use for X-One landing pages, auth UI, product shell, service pages, motion, responsive UI, and design reviews in Next.js App Router, React, or related frontend work.
---

# X-One Product Design

Read `docs/design-system.md` and `docs/motion-system.md` before designing or changing an X-One frontend surface. Treat them as the canonical visual and motion source.

## Build the product, not a generic AI template

- Ground each screen in a real user task and use plain Vietnamese end-user copy.
- Preserve the Calm Kinetic Concierge direction: calm, capable, precise, human, and trustworthy; premium without luxury or sci-fi cues.
- Give each major surface one useful signature element. Prefer the X-One service-network/junction language when orchestration is the subject.
- Keep hierarchy intentional: Be Vietnam Pro for reading, IBM Plex Mono only for small structured utility labels, and no Inter fallback as the intended face.
- Use semantic X-One tokens, restrained surfaces, clear borders, and the documented radius scale. Do not add rainbow domain theming.
- Avoid AI-slop: glowing gradients, orbs, blobs, glass everywhere, generic robot branding, fake metrics/testimonials/logos, decorative clutter, or card stacks without information value.

## Implement inclusively and responsively

- Start at 320px, then verify tablet, laptop, desktop, and a reasonable wide layout without horizontal overflow.
- Use semantic landmarks, heading order, native links/buttons/forms, explicit labels, visible keyboard focus, useful `aria-live` feedback, and accessible names for icon controls.
- Respect `prefers-reduced-motion`; preserve functional feedback while removing parallax, loops, and large transforms.
- Use Next.js App Router server components by default and small client islands only for browser state. Use real `next/link`/`next/navigation` destinations and honest loading, empty, error, and planned states. Do not present future capabilities as implemented.

## Apply motion with restraint

- Reuse only the canonical primitives: fade, fade-up, scale-in, stagger, line-draw, soft-hover, and scroll-progress.
- Animate primarily opacity and transform. Keep interaction feedback immediate and do not use `transition: all`.
- Reserve expressive motion for the landing hero and multi-service story; authenticated product screens prioritize clarity and task completion.

## Review before handoff

- Inspect a rendered screenshot when the environment supports it.
- Ask whether the composition could be reused unchanged by a crypto/AI dashboard, whether surfaces or radii repeat without purpose, and whether the signature element demonstrates actual X-One orchestration.
- Correct generic, inaccessible, misleading, or motion-heavy results before reporting completion.
