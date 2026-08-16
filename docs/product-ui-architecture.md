# X-One Product UI Architecture

This document defines the authenticated product shell and the reusable workspace patterns for the Web client. It is a presentation contract, not a second domain model: authoritative booking, payment, profile, and service state still comes from the Gateway and its owning domain service.

## Shell and workspace geometry

- The desktop shell uses a compact 224–240px navigation rail and a fluid content column. The rail is sticky, keyboard navigable, and never owns service state.
- The content column is organized as `page header → primary workspace → supporting context`. A page may use a single column for a focused transaction or a two-column workspace when the context changes the next action.
- A `ContextRail` is a reusable right-side region for current task, authoritative snapshot, next action, and recovery/help. It is not a duplicate navigation menu and it must not invent data absent from the API response.
- The assistant workspace uses `main conversation + ContextRail`; service workspaces use `primary service surface + ContextRail` when a live quote, booking, cart, appointment, or ride is active.

## ContextRail modes

`ContextRail` accepts an explicit mode and data state:

- `idle`: short orientation and one useful next action.
- `active`: current entity/transaction snapshot, status, and the next permitted action.
- `tracking`: live ride status, ETA, driver/map facts, refresh timestamp, and terminal-state notice.
- `recovery`: honest error/partial state, retry action, and a safe way back.

On tablet the rail becomes a top or bottom context section after the primary task. On narrow mobile it is a collapsible `details` region or a clearly labeled section; critical status and actions remain visible without requiring expansion.

## Entity, detail, and transaction anatomy

- Entity list: search/filter controls, result count or cursor state, one stable result row/card, and an explicit empty/error/loading state.
- Entity detail: identity and trust metadata first, verified location/media when available, then domain-specific facts and actions.
- Transaction: authoritative snapshot, two explicit confirmations where required, payment/side-effect state, receipt, and recovery path. Buttons are disabled only while the relevant request is in flight.
- Live status: state label, last update, bounded refresh behavior, terminal state, and source/authority note. Polling stops in terminal states and pauses while the document is hidden.

## Visual and interaction rules

- Use Be Vietnam Pro for product text and IBM Plex Mono only for eyebrow/status utility text. Use the existing semantic color tokens; do not introduce gradients, glass panels, or decorative orbs into authenticated surfaces.
- Prefer quiet surfaces, 1px borders, restrained radius, and one primary action per region. Status must be communicated by text plus color, never color alone.
- Real images require a source, purpose, accessible alternative, and a fallback. A missing image produces a useful placeholder or omission, never a fabricated business fact.
- Maps render only verified coordinates and route snapshots. A failed tile provider falls back to route facts and coordinates; it never draws a schematic replacement.
- Motion is limited to state transitions, loading feedback, and progressive disclosure. Respect `prefers-reduced-motion` and avoid animation that implies a domain transition before the API confirms it.

## Responsive and accessibility contract

- The baseline target is 320px wide. Layouts must not require horizontal scrolling, and controls retain touch-sized hit areas.
- Every form control has a visible label or an explicit accessible name. Every icon-only action has a label. Focus order follows the task order; `aria-live` is reserved for status updates.
- Loading, empty, partial, error, and success states are designed as first-class content. Skeletons preserve the final layout and do not suggest data that has not arrived.
- Visual QA checks the authenticated shell at 320, 390, 768, 1024, and 1440px, plus keyboard focus and reduced-motion behavior.
