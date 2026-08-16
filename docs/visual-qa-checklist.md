# X-One Visual QA Checklist

Use this checklist after UI changes. A browser screenshot or local Playwright run is evidence for layout; unit/type checks alone are not visual acceptance.

## Required surfaces

- Authenticated `/app` assistant with no internal assistant-command text.
- App shell desktop, tablet, and mobile navigation; logo mark and wordmark stay on one line.
- Ride quote, confirmation, searching-driver, assigned-driver, active ride, terminal, and map fallback states.
- Food menu/customizer/cart, Restaurant detail, Healthcare browse/detail/booking, profile/history.
- Loading, empty, partial, error, retry, and no-image states for every changed surface.

## Viewports and checks

- 320×800, 390×844, 768×1024, 1024×768, and 1440×900.
- No horizontal overflow; headings, buttons, labels, and status text remain readable.
- Keyboard tab order, visible focus, accessible names, `aria-live`, and reduced-motion mode.
- Map container has an explicit size, real OpenStreetMap attribution, verified markers only, and an honest fallback when tiles fail.
- Confirm network calls remain Gateway-only and no browser console error is introduced.
