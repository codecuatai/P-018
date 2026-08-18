# Web Application Instructions

Call only the public API Gateway; never call an internal service or database, expose server credentials, or hand-edit generated clients. `localStorage` and optimistic UI are not authoritative for booking/payment, especially final or financial actions.

Do not log tokens, sensitive PII, payment data, or raw sensitive responses. Public flows need loading, empty, error, and retry states; confirmation UI must show the action, material data, and consequences. Do not claim a backend capability is ready while its documented status is `planned` or `skeleton`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
