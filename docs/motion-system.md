# X-One Motion System

Motion clarifies hierarchy, relationship and state. It must never delay an
authenticated task, imply an action completed or make X-One feel theatrical.

## Two separate landing concepts

### 1. Scroll-triggered entrance

`RevealScene` owns the section entrance. `RevealItem` owns local reading order
for headings, service media, steps, copy and media. Both are one-shot by
default for backwards safety; marketing can pass `replayOnReenter={true}` when
the presentation should softly leave and replay on the next viewport entry.
Before a scene approaches the viewport it may be at `opacity: 0`,
`y: 18–30px` and `scale: 0.985–0.995`; that state is not used as a permanent
page-load opacity.

When the scene reaches the viewport, it enters with a smooth premium ease-out
over roughly 450–650ms. Use `whileInView`/`useInView` with
`viewport={{ once: !replayOnReenter, amount: 0.15–0.25 }}` and a restrained
root margin so a one-pixel boundary crossing does not flash content. Replay
uses a second `useInView` reset zone with roughly `150% 0px 150% 0px` margin:
normal viewport exit keeps the active presentation visible, while leaving that
larger zone resets only the animation state. Local items may stagger by roughly
70–100ms. Each section chooses its own order and direction:

- services: intro copy, active service copy, then the four-item floating slab composition;
- how it works: heading, then one coded product preview and three stage controls;
- story: headline first, then a conversation cascade from request to related
  restaurant and ride steps;
- map: mask/scale reveal, persistent base routes, repeated tracer overlays,
  then markers and copy;
- safety: copy first, then checklist rows cascade with a quiet confirmation
  wipe;
- assistant: copy from one side, product signal from the other and one
  underline reveal;
- CTA: text and one large editorial object reveal into a full-height scene.

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

The landing does not wrap every section in `ScrollFocusScene`. Use it only
where gaining or losing focus materially explains the story; the marketing
page uses dedicated media motion for the hero, service composition and map, and
local replay-capable entrance primitives for services, carousel, story, safety,
assistant and CTA.

## Primitive vocabulary

Use only `fade`, `fade-up`, `scale-in`, `stagger`, `line-draw`, `soft-hover`
and restrained `scroll-progress`. Hover movement stays around 2–4px or a
maximum scale of 1.01. Cards do not float continuously. The landing hero may
carry the most expressive composition; authenticated product views prioritize
task state and immediate feedback.

The marketing signature uses purpose-specific motion: the hero video
crossfades to the poster during its final ~420ms, holds the poster for exactly
approximately 2 seconds after `ended`, then restarts from time zero and
crossfades back only after `playing`. Service slabs use a restrained spring
hover/lift and a selected slab settles slightly forward; there is no service
autoplay or rotation.
The How X-One Works preview uses a ~2.2-second auto-advance, visible
previous/next controls and a direction-aware 70px horizontal slide between
labeled stages. The multi-service conversation replays its request, response,
first service, connector, second service and confirmation note when the
landing section re-enters. The Hanoi scene keeps four low-opacity base routes
visible and sends a 1.5-second cobalt tracer over each route with a slight
stagger while visible; tracer work stops outside the viewport. The final object
uses a single 450–650ms rise/scale reveal per landing re-entry and never loops.

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
- show the complete service slab composition without 3D tilt or infinite
  rotation while keeping manual selection available;
- show the first How X-One Works preview without auto-advancing while keeping
  the three manual stage controls and arrows usable, without x movement;
- show the complete Hanoi route scene with base routes only, without tracer
  loops or path drawing;
- show the complete multi-service conversation immediately and keep it readable
  on every replay;
- show the final object and CTA copy immediately without the entrance transform;
- keep the hero on the poster and never invoke the video loop transition.

## Performance guardrails

Do not add GSAP, Lenis, Three.js, particles, Lottie, Rive or a scroll handler
that updates React state every frame. Use viewport reveals, Motion values and
one cleaned-up timer per time-based carousel only where the relationship
genuinely benefits from it. Infinite service/map animation must stop outside
the viewport.
