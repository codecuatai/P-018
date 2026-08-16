# Contract Tests

**This directory is currently empty** — no cross-service contract test is checked in here.

Contract coverage that exists today is service-owned, sitting next to each provider:

- `services/food-service/tests/test_contract_parity.py`
- `services/restaurant-service/tests/test_contract_parity.py`
- `services/healthcare-service/tests/test_contract_parity.py`

Each checks its implementation against the versioned description in `packages/contracts/openapi/`. Ride has no parity test yet.

Add provider/consumer contract tests here only when a check genuinely spans two owners and cannot live with either one. A tool schema in `packages/contracts/tools/` is a capability contract, not a REST endpoint, and is verified separately — see [tool contracts](../../docs/api/tool-contracts.md).
