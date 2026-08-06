# Food Vertical Slice

The public client calls the NestJS Gateway. The Gateway calls Food through `FoodClient`; the Agent calls only the Gateway Tool API. Food owns catalog, cart, quote, order, driver, and status-event invariants. Gateway owns demo JWT auth, confirmation records, sandbox payment, audit metadata, and orchestration. No component accesses another service's database.

The flow is: Agent discovery and read/draft/preview tools → authoritative Food preview → Gateway confirmation bound to actor, snapshot hash, quote version, cart version, amount/currency, expiry → PostgreSQL atomic confirmation claim → idempotent order/voucher transaction → sandbox payment → Food-validated status transitions. Restaurant rejection and cancellation are handled by the Gateway reconciliation worker and trigger one persisted refund before Food reaches `REFUNDED`.

There is no COD, live payment, real map, production auth, broker, Redis, or frontend integration in this slice. Docker/E2E and live Gemini checks are environment-dependent and must be reported separately from static or unit checks.
