# X-One Motion System

Motion clarifies hierarchy, relationship and state. It must never delay an
authenticated task, imply an action completed or make X-One feel theatrical.

## Two separate landing concepts

### 1. Scroll-triggered entrance

`RevealScene` owns the one-time section entrance. `RevealItem` owns local
reading order for headings, service cards, steps, copy and media. Before a
scene approaches the viewport it may be at `opacity: 0`, `y: 28–40px` and
`scale: 0.985–0.99`; that state is not used as a permanent page-load opacity.

When the scene reaches the viewport, it enters once with a smooth premium
ease-out over roughly 450–650ms. Use `whileInView`/`useInView` with
`viewport={{ once: true, amount: 0.15–0.25 }}`. Local items may stagger by
roughly 70–100ms. Each section chooses its own order and direction:

- services: heading, then four cards;
- how it works: heading, line-draw, then three steps;
- story: copy from left/up, then workflow rows;
- map: media scale-in, route, then markers and copy;
- safety: copy, then confirmation media;
- assistant: media from left and copy from right;
- CTA: simple group reveal.

Use transform and opacity. Do not continuously animate width, height, top,
left, blur, shadow or background position.

### 2. Scroll-linked focus and exit

`ScrollFocusScene` is applied after a scene has entered. It maps the bounded
section progress through Motion values to create restrained focus depth:

```text
progress: [0, .22, .5, .78, 1]
opacity:  [.62, .82, 1, .82, .62]
scale:    [.985, .995, 1, .995, .985]
y:        [16, 6, 0, -8, -16]
```

The center of the scene is fully readable. Leaving focus lowers emphasis only
to a readable 0.62–0.82 range and shifts no more than a few pixels. A scene
does not apply this treatment until its entrance has happened, so future
sections are not stuck at `opacity: 0.12` on initial load. No React state is
updated on every scroll frame.

## Primitive vocabulary

Use only `fade`, `fade-up`, `scale-in`, `stagger`, `line-draw`, `soft-hover`
and restrained `scroll-progress`. Hover movement stays around 2–4px or a
maximum scale of 1.01. Cards do not float continuously. The landing hero may
carry the most expressive composition; authenticated product views prioritize
task state and immediate feedback.

| Context | Duration | Intent |
| --- | ---: | --- |
| Micro feedback | 120–180ms | focus, icon, acknowledgement |
| Button/card feedback | 160–240ms | safe pointer/keyboard response |
| Small reveal | 280–420ms | a local content relationship |
| Section entrance | 450–650ms | reading order |
| Hero sequence | 650–900ms | brand orientation only |

## Reduced motion

Honour `prefers-reduced-motion` at the CSS root and in Motion client islands.
Reduced motion must:

- render the hero poster instead of autoplay video;
- keep the rotating prompt on one static example;
- disable scroll-linked transforms, stagger movement and line drawing;
- show sections and children immediately at full opacity and normal scale;
- preserve every functional label, form, status and confirmation boundary.

## Performance guardrails

Do not add GSAP, Lenis, Three.js, particles, Lottie, Rive or a scroll handler
that updates React state every frame for Phase 1. Use viewport reveals and
bounded Motion values only where the relationship genuinely benefits from it.
