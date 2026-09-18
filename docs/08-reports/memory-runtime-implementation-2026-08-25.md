# Memory runtime implementation: 2026-08-25

Status: IMPLEMENTED_RUNTIME_SLICE

Implemented:

- Core repository contracts for ordered conversation turns and memory retrieval.
- In-memory and PostgreSQL adapters with actor isolation, bounded retrieval,
  expiry filtering, supersession and sensitive-memory rejection.
- Conversation turn writes alongside the existing conversation write transaction
  for the PostgreSQL adapter; the test adapter mirrors ordering semantics.
- Gateway planner context now receives at most eight active, non-sensitive
  retrieved memory projections with provenance.
- Agent prompt rules explicitly treat retrieved memory as contextual hints, not
  authoritative booking/order/payment state.

Verification:

- Gateway TypeScript check passed.
- Memory repository/retrieval tests passed: 4/4.

Remaining operational gate: apply migration 014 on a disposable PostgreSQL
database and run a live conversation round-trip before calling the full memory
rollout production-complete. Model-generated memory candidates are still not
auto-promoted; promotion remains Gateway-validated.
