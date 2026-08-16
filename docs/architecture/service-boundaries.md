# Service Boundaries

This is the current responsibility map. Consult [current architecture state](current-state.md) for verification evidence and limitations.

| Component | Owns | Consumers/dependencies | Must not do |
| --- | --- | --- | --- |
| Gateway | public edge/orchestration, workflows, confirmations, payment sandbox, Core identity/session/audit/idempotency evidence | web/mobile; typed internal clients | query domain DBs or embed domain rules |
| Agent | intent, slots, bounded plan/tool proposals, safe language response | gateway only | call domains, pay, confirm, invent availability/prices |
| Ride | ride availability, quotes, holds, bookings/events | gateway | access other DBs |
| Restaurant | dine-in discovery, tables, reservation holds/lifecycle | gateway | own food delivery/orders |
| Healthcare | facilities, departments, doctors, appointment slots/holds, appointments | gateway | access core/payment data |
| Food | merchants, menus, items, order quotes/drafts, orders/items/events | gateway | manage tables/reservations |

Gateway may orchestrate multiple services, but a domain service remains authoritative for its own business invariants and state transitions. Restaurant Service = table reservation. Food Service = menu ordering and food delivery. No booking/order belongs to both services. Domain route prefixes follow the checked-in versioned contracts; current prefixes differ by incremental slice. See [API conventions](../api/api-conventions.md). Contracts, not SQL, carry cross-boundary references and snapshots.

Core/Gateway owns X-One user identity, credentials, session, audit evidence, profile context, saved addresses, conversations, and orchestration state; it does not own a domain booking/order invariant. Food/Ride persist immutable transaction snapshots of Core addresses and never query Core directly. Healthcare owns patient identity, medical data, and actor-to-patient links; the Gateway exposes an actor-scoped public proxy. The current Food address endpoint and development-only Healthcare default patient are compatibility boundaries, not second authorities.

The Agent's current legacy workflow store is process-local. `xone_agent` is
provisioned for its eventual checkpoint/run-metadata boundary, but no Agent
persistence client or migration is wired in the current MVP; Agent state is not
durable across an Agent restart.
