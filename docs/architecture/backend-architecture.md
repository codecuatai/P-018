# Backend Architecture

NestJS is the public gateway and workflow orchestrator. Its checked-in modules are `audit`, `auth`, `confirmation`, `conversation`, `core`, `health`, `payment`, `tools`, and `workflow` — each establishing one boundary. Controllers validate/shape transport only; application/workflow services coordinate; typed clients are the only outbound domain access. The gateway may orchestrate multiple services, but it never becomes the authority for a domain business invariant or state transition.

The Tool Gateway validates structured agent requests, applies risk/confirmation policy, creates audit/idempotency records, and calls a typed adapter. Gateway owns core workflow and payment state; it never writes a domain booking/order table.

Clients propagate correlation IDs, use bounded timeout/retry policy, and map unavailable/degraded dependencies to safe typed errors. `FoodClient` is an implemented typed adapter alongside Agent/Ride/Restaurant/Healthcare clients. Gateway startup is independent of domain availability.

Health probes state exactly what they check. `GET /health/live` returns process liveness only. `GET /health/ready` awaits `WorkflowService.checkReadiness()` for the core database plus `isWorkerHealthy()`, and on success reports `database: connected`, `workflow_worker: healthy`, and `confirmation_recovery_worker: healthy`; otherwise it returns 503 with code `NOT_READY`. It deliberately does **not** probe the Agent or any domain service, so a ready Gateway does not imply a ready domain.
