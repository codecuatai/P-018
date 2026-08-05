# API Gateway Instructions

Controllers are thin; workflow/application services orchestrate. Access Agent, Ride, Restaurant, Healthcare, and Food only through typed client adapters—never raw `fetch`, cross-domain SQL, or a direct Food database connection. Prisma, if added, is Core-only.

Propagate correlation IDs; map outbound timeout/retry/degraded failures to typed safe errors. Writes require idempotency; final/financial actions require confirmation and audit. Validate required process environment at startup without logging values.

When adding a domain service: add a typed client/provider and config fixture, explicit Compose mapping, contract/client tests, and documentation; do not make gateway startup depend on that domain's availability.
