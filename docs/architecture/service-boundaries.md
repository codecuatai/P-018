# Service Boundaries

| Component | Owns | Consumers/dependencies | Must not do |
| --- | --- | --- | --- |
| Gateway | public BFF, workflows, confirmations, payment sandbox, audit/idempotency, core DB | web/mobile; typed internal clients | query domain DBs or embed domain rules |
| Agent | intent, slots, tool requests, safe language response, agent checkpoints | gateway only | call domains, pay, confirm, invent availability/prices |
| Ride | ride availability, quotes, holds, bookings/events | gateway | access other DBs |
| Restaurant | dine-in discovery, tables, reservation holds/lifecycle | gateway | own food delivery/orders |
| Healthcare | appointments/availability | gateway | access core/payment data |
| Food | merchants, menus, items, order quotes/drafts, orders/items/events | gateway | manage tables/reservations |

Restaurant Service = table reservation. Food Service = menu ordering and food delivery. No booking/order belongs to both services. Domain APIs use `/v1`; gateway public APIs use `/api/v1`; contracts, not SQL, carry cross-boundary references and snapshots.
