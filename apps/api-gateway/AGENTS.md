# API Gateway Instructions

Controllers are thin; workflow/application services orchestrate. Access Agent, Ride, Restaurant, Healthcare, and Food only through typed client adapters—never raw `fetch`, cross-domain SQL, or a direct Food database connection. Domain typed clients must cross the repository boundary only through `XONE_SERVICE_MCP_URL`; Agent remains an internal P-018 service. Prisma, if added, is Core-only.

Propagate correlation IDs; map outbound timeout/retry/degraded failures to typed safe errors. A domain remains authoritative for its own state transition even when the gateway orchestrates several calls. Writes receive an idempotency key from the first request; gateway propagation/format validation does not replace domain enforcement. Final/financial confirmation is bound to the actor, action, normalized payload, quote/version, price/currency, expiry, and audit evidence. Validate required process environment at startup without logging values.

When adding a domain service: add a typed client/provider and MCP service mapping, contract/client tests, and documentation; do not add a direct domain URL to the Gateway or make gateway startup depend on that domain's availability.
