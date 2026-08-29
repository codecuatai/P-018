# Service Boundaries

This is the current responsibility map. Consult [current architecture state](current-state.md) for verification evidence and limitations.

| Component | Owns | Consumers/dependencies | Must not do |
| --- | --- | --- | --- |
| Gateway | public edge/orchestration, workflows, confirmations, payment sandbox, Core identity/session/audit/idempotency evidence | web/mobile; typed internal clients | query domain DBs or embed domain rules |
| Agent | intent, slots, bounded plan/tool proposals, safe language response | gateway only | call domains, pay, confirm, invent availability/prices |
| Ride | ride availability, route/stopover quotes, holds, bookings/events | gateway | access other DBs |
| Restaurant | dine-in discovery, tables, reservation holds/lifecycle | gateway | own food delivery/orders |
| Healthcare | appointments/availability | gateway | access core/payment data |
| Food | merchants, menus, items, order quotes/drafts, orders/items/events | gateway | manage tables/reservations |

Gateway may orchestrate multiple services, but a domain service remains authoritative for its own business invariants and state transitions. Restaurant Service = table reservation. Food Service = menu ordering and food delivery. No booking/order belongs to both services. Domain route prefixes follow the checked-in versioned contracts; current prefixes differ by incremental slice. See [API conventions](../api/api-conventions.md). Contracts, not SQL, carry cross-boundary references and snapshots.

Core/Gateway owns X-One user identity, credentials, session, audit evidence, profile context, saved addresses, conversations, and orchestration state; it does not own a domain booking/order invariant. Food/Ride persist immutable transaction snapshots of Core addresses and never query Core directly. Healthcare owns patient identity, medical data, and actor-to-patient links; the Gateway exposes an actor-scoped public proxy. The current Food address endpoint and development-only Healthcare default patient are compatibility boundaries, not second authorities.

Ride alone resolves a bounded intermediate stop and owns the resulting route,
tariff, expiry and quote snapshot. Gateway may pass a validated semantic
request and compose the pickup-to-stop-to-destination route from typed Location
results, but it does not calculate a price or alter a booking directly. Adding
or changing a stop before final confirmation produces a new Ride quote and
invalidates the prior service-details confirmation.

Agent uses `xone_agent` only for allowlisted run metadata through its owned
`002_agent_run_metadata.sql` migration. It does not persist conversation or
authoritative domain state. Agent emits typed proposals only; the internal
Gateway HTTP execution route has been removed, and Gateway's in-process typed
dispatcher resolves actor-scoped references and owns all domain calls.

For the unified Assistant, Gateway is also responsible for shaping the public
response from the typed domain result (including the ConfirmationService
`tool_result` wrapper); it does not treat a model response or wrapper metadata
as Restaurant/Ride authority. A ready Restaurant task may be dispatched while
its dependent Ride task remains `NEEDS_INFO`, after which the authoritative
Restaurant result unlocks the next Ride step. A material Ride stopover change
is a new quote/action boundary: Ride owns route, price, expiry and snapshot,
while Gateway only coordinates the typed request and invalidates the previous
confirmation action.
