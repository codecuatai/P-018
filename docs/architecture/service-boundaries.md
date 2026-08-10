# Service Boundaries

This is the target responsibility map, not a claim that every listed interface is implemented. Consult [current architecture state](current-state.md) for evidence and limitations.

| Component | Owns | Consumers/dependencies | Must not do |
| --- | --- | --- | --- |
| Gateway | public BFF, workflows, confirmations, payment sandbox, audit/idempotency, core DB | web/mobile; typed internal clients | query domain DBs or embed domain rules |
| Agent | intent, slots, tool requests, safe language response, agent checkpoints | gateway only | call domains, pay, confirm, invent availability/prices |
| Ride | ride availability, quotes, holds, bookings/events | gateway | access other DBs |
| Restaurant | dine-in discovery, tables, reservation holds/lifecycle | gateway | own food delivery/orders |
| Healthcare | appointments/availability | gateway | access core/payment data |
| Food | merchants, menus, items, order quotes/drafts, orders/items/events | gateway | manage tables/reservations |

Gateway may orchestrate multiple services, but a domain service remains authoritative for its own business invariants and state transitions. Restaurant Service = table reservation. Food Service = menu ordering and food delivery. No booking/order belongs to both services. Domain route prefixes follow the checked-in versioned contracts; current prefixes differ by incremental slice. See [API conventions](../api/api-conventions.md). Contracts, not SQL, carry cross-boundary references and snapshots.

Ownership decisions locked in Phase 0: Core/Gateway owns saved addresses and resolves them through a future contract; Food/Ride persist immutable transaction snapshots. Core owns X-One identity references; Healthcare owns patient identity and medical data. The current Food address endpoint and Healthcare default patient are legacy/demo compatibility boundaries, not exceptions to these ownership rules.
