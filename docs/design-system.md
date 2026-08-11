# X-One Design System

This is the canonical visual source for X-One landing, authentication, product
shell and future service surfaces.

## Direction

**Calm Kinetic Concierge** is calm, capable, precise, human and trustworthy.
It makes a multi-step task feel coordinated without becoming futuristic
theatre. The X-One four-path junction is the recognisable signature whenever a
surface communicates orchestration; it is a structural diagram, not a glowing
AI decoration.

## Colour and type tokens

| Token | Value | Role |
| --- | --- | --- |
| `--background` | `#F5F7F8` | porcelain page canvas |
| `--surface` | `#FFFFFF` | paper/card surface |
| `--foreground` | `#111827` | primary text |
| `--muted` | `#667085` | supporting text |
| `--border` | `#D9E0E7` | clear, quiet boundaries |
| `--navy` | `#16324F` | structural dark, footer and contrast |
| `--primary` | `#315EF5` | primary action / active navigation |
| `--success` | `#0E8E83` | connected or successful state |
| Food accent | muted amber | bounded Food context |
| Ride accent | restrained cobalt | bounded Ride context |
| Restaurant accent | muted berry | bounded Restaurant context |
| Healthcare accent | teal | bounded Healthcare context |

Accents label a local context; a screen never uses all four as decoration.
Status must never rely on colour alone.

Use **Be Vietnam Pro** for headings and prose, with controlled high-density
headlines and roughly 1.5--1.7 body line height. Use **IBM Plex Mono** only for
small status, timestamp or structured utility labels. Inter is not the intended
product face.

## Spacing, shape and elevation

- Use a 4px base spacing scale. Common gaps: 8, 12, 16, 24, 32, 48 and 64px.
- Use 8px radius for small controls, 12px for inputs/cards/forms and 16px for
  large panels. Do not create a random radius per component.
- Borders are light but visible; low-contrast glass panes are not a substitute
  for grouping. Shadows are short, soft and sparse--never coloured glows.
- Icons come from Lucide, normally 16--20px in controls and 20--24px in
  service contexts. An icon supports a label; it is not a mystery control.

## Layout and responsive rules

Build from 320px upward. Use a centred landing/product container, readable
line lengths and generous section rhythm rather than a dense wall of cards.
Desktop navigation may be horizontal; mobile uses the same real links inside a
Radix Sheet. Preserve 44px-ish tap targets, keyboard focus, no horizontal
overflow and a visible skip link. Collapse multi-column layouts before text or
actions become cramped.

The landing is a composed editorial sequence: navigation, clear two/three-line
hero, four distinct service blocks, three steps, one multi-service story,
truthful map illustration, safety/confirmation explanation, assistant preview,
CTA and simple footer. Product surfaces prioritize task state, then available
actions, then supporting context.

## Component philosophy

Use semantic HTML first and compose the local shadcn-style primitives for
buttons, inputs, labels, cards, Sheet, AlertDialog, separators and skeletons.
Use real `next/link` navigation, native labels, visible focus, `aria-live`
feedback, safe errors, loading/empty states and direct language. A button must
perform a real in-scope action; an unavailable Phase 2 capability is shown as
an honest planned state, never a mock CRUD flow.

## Accessibility and content guardrails

- Maintain readable contrast, visible focus and programmatic labels.
- Honour reduced motion; functional status never depends on movement.
- Never expose secrets, raw reset tokens, internal workflow state, chain of
  thought or fabricated transaction success in the UI.
- The vector map is labelled as an illustration, not location/tracking.
- The assistant may prepare a choice but cannot claim a booking/payment is
  complete without the Gateway's confirmed result.

## Anti-patterns

Do not use purple/blue AI gradients, mesh backgrounds, glowing orbs, generic
robot marks, chrome-like glassmorphism, stock SaaS dashboard templates, fake
metrics, testimonials/logos, huge text, excessive pills, gratuitous card grids,
or `transition: all`. Do not use every rounded element as an invitation to
float or animate. Calm clarity is more distinctive than visual noise.
