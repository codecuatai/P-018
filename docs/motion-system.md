# X-One Motion System

Motion clarifies hierarchy, relationship and state. It must never delay an
authenticated task, imply an action completed or make X-One feel theatrical.

## Hierarchy and primitives

Use a small vocabulary only: `fade`, `fade-up`, `scale-in`, `stagger`,
`line-draw`, `soft-hover` and restrained `scroll-progress`. Prefer `opacity`
and `transform`; never continuously animate layout, blur or shadow.

| Context | Duration | Intent |
| --- | ---: | --- |
| Micro feedback | 120--180ms | focus, icon, acknowledgement |
| Button/card feedback | 160--240ms | safe pointer/keyboard response |
| Small reveal | 280--420ms | a local content relationship |
| Section reveal | 350--500ms | reading order |
| Hero sequence | 650--900ms | brand orientation only |

Use a soft ease-out for entry and a crisp ease-out for interaction. Do not put
multiple bouncing/elastic eases on a single screen. A hover may shift roughly
2--4px or scale to 1.01; cards do not float continuously.

## Landing sequence

The hero may sequence mark -> eyebrow -> headline -> supporting copy -> CTA ->
four-path network. The network may draw rails and send a low-frequency signal
between existing service nodes. Section reveals occur once when useful to
reading; they do not replay on every scroll. The optional hero video is ambient
only, muted and decorative--never required to understand the page.

Authenticated product views favor immediate state feedback over entrance
animation. Sending, retrying, confirmation and error states are explicit text
or controls first; any animation is secondary.

## Reduced motion

Honour `prefers-reduced-motion` at the CSS root and in `motion/react` client
islands. Replace movement with a static/opacity result where useful. Disable
parallax, signal loops, large transforms, animated rail drawing and autoplay
hero video. Keep all functional state visible without animation.

## Performance guardrails

Do not add GSAP, Lenis, Three.js, particles, Lottie, Rive or a scroll handler
that updates React state every frame for Phase 1. Use viewport reveals or
bounded Motion values only where the relationship genuinely benefits from it.
Keep the animated surface small, avoid forced reflow and test a key
reduced-motion path whenever adding an important visual transition.
