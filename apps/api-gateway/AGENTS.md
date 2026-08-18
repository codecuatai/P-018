# API Gateway Instructions

Controllers are thin; workflow/application services orchestrate. Access Agent, Ride, Restaurant, Healthcare, and Food only through typed client adapters—never raw `fetch`, cross-domain SQL, or a direct Food database connection. Prisma, if added, is Core-only.

Propagate correlation IDs; map outbound timeout/retry/degraded failures to typed safe errors. A domain remains authoritative for its own state transition even when the gateway orchestrates several calls. Writes receive an idempotency key from the first request; gateway propagation/format validation does not replace domain enforcement. Final/financial confirmation is bound to the actor, action, normalized payload, quote/version, price/currency, expiry, and audit evidence. Validate required process environment at startup without logging values.

When adding a domain service: add a typed client/provider and config fixture, explicit Compose mapping, contract/client tests, and documentation; do not make gateway startup depend on that domain's availability.
