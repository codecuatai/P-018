# Backend Architecture

NestJS is the public gateway and workflow orchestrator. Its modules establish boundaries for conversation, workflow, confirmation, payment sandbox, tools, audit, and health. Controllers validate/shape transport only; application/workflow services coordinate; typed clients are the only outbound domain access.

The Tool Gateway validates structured agent requests, applies risk/confirmation policy, creates audit/idempotency records, and calls a typed adapter. Gateway owns core workflow and payment state; it never writes a domain booking/order table.

Clients propagate correlation IDs, use bounded timeout/retry policy, and map unavailable/degraded dependencies to safe typed errors. `FoodClient` is a placeholder alongside Agent/Ride/Restaurant/Healthcare clients. Gateway startup is independent of domain availability; a future readiness check must accurately state which dependencies it probes.
