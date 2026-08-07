# OpenAPI Contracts

Versioned OpenAPI descriptions belong here. The Restaurant Service business contract is captured in `restaurant-service-v1.yaml`; generated clients must be produced from this contract and never hand-edited.

The Gateway's first Agent/Restaurant walking slice is `POST /api/v1/restaurant-workflows/chat`. It accepts an authenticated user message and returns the agent's typed read-tool request plus the Restaurant Service result when dispatch succeeds. Final reservation writes remain disabled until confirmation evidence and idempotency orchestration are implemented.

Healthcare uses the same Gateway-only orchestration boundary at
`POST /api/v1/healthcare-workflows/chat`. The agent emits typed department,
slot, hold, cancel, or final-confirmation requests; the Gateway dispatches only
read and reversible requests. Final appointment confirmation remains blocked
until the explicit confirmation/payment evidence flow is connected.

The Ride contracts are captured in `agent-service.v1.yaml`, `ride-service-v1.yaml`,
and `gateway-public.v1.yaml`; they describe the internal typed interpretation and
the two Gateway confirmation boundaries. The current Gateway uses small typed
adapters with runtime response validation. No generated-client toolchain is
configured yet; do not hand-edit generated output when one is introduced.
