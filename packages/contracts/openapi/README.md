# OpenAPI Contracts

Versioned OpenAPI descriptions belong here. The Restaurant Service business contract is captured in `restaurant-service-v1.yaml`; generated clients must be produced from this contract and never hand-edited.

The Gateway's first Agent/Restaurant walking slice is `POST /api/v1/restaurant-workflows/chat`. It accepts an authenticated user message and returns the agent's typed read-tool request plus the Restaurant Service result when dispatch succeeds. Final reservation writes remain disabled until confirmation evidence and idempotency orchestration are implemented.
