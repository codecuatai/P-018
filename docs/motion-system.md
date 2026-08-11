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

Prefer real product media and scroll-linked focus over decorative diagrams. The
landing uses a reusable `ScrollFocusScene` primitive for meaningful sections.
It maps the section's bounded `useScroll({ target })` progress through
`useTransform()` rather than a one-time `whileInView` reveal:

```text
progress: [0, .22, .5, .78, 1]
opacity:  [.12, .42, 1, .42, .12]
scale:    [.975, .99, 1, .99, .975]
y:        [40, 14, 0, -14, -40]
```

Tune scene height and composition per section. Apply the primitive to a few
meaningful editorial blocks, not every icon, label, or media detail. Motion is
bounded to opacity and transform; it never hijacks scrolling, adds custom
smooth scrolling, or updates React state on every scroll frame.

The hero video is ambient only, muted, looped and decorative--never required
to understand the page. It sits behind a readable overlay and the chat
composer remains the hero's authoritative product object.

Authenticated product views favor immediate state feedback over entrance
animation. Sending, retrying, confirmation and error states are explicit text
or controls first; any animation is secondary.

## Reduced motion

Honour `prefers-reduced-motion` at the CSS root and in `motion/react` client
islands. For `ScrollFocusScene`, keep content at opacity `1`, scale `1`, and
`y=0`. Disable parallax, signal loops, large transforms, animated rail
drawing, rotating prompts, and autoplay hero video; show one static prompt and
the poster or neutral fallback. Keep all functional state visible without
animation.

## Performance guardrails

Do not add GSAP, Lenis, Three.js, particles, Lottie, Rive or a scroll handler
that updates React state every frame for Phase 1. Use viewport reveals or
bounded Motion values only where the relationship genuinely benefits from it.
Keep the animated surface small, avoid forced reflow and test a key
reduced-motion path whenever adding an important visual transition.
