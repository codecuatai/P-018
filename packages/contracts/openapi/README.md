# OpenAPI Contracts

Versioned OpenAPI descriptions belong here. The Restaurant Service business contract is captured in `restaurant-service-v1.yaml`; generated clients must be produced from this contract and never hand-edited.

`gateway-auth-v1.yaml` is the Phase 1 public authentication contract for
registration, login, JWT refresh, current identity, logout, actor-scoped
session management and password recovery. It documents that refresh tokens are
cookie-only, opaque values; browser callers use the Gateway directly and no
Next.js BFF or generated Web client exists. The hand-owned Web transport
adapter is intentionally small and must stay transport-only.

`shared-primitives.v1.yaml` is the Phase 0 source for `GeoPoint`, `Money`, `Address`, `OpeningHours`, `Rating`, `ImageRef`, `DatasetSource`, `CurrentLocation`, `PaginationMeta`, `TimestampRange`, and the public success/list/error envelope shapes. Domain contracts may refine these shapes but must not silently change their meaning.

The Gateway's Restaurant walking slice is `POST /api/v1/restaurant-workflows/chat` followed by `POST /api/v1/restaurant-workflows/confirm`. The first request may prepare a hold and a pending final confirmation; only the explicit confirmation endpoint can call `POST /v1/reservations`, with actor/workflow validation and the original idempotency key.

Healthcare uses the same Gateway-only orchestration boundary at
`POST /api/v1/healthcare-workflows/chat`. The agent emits typed department,
slot, hold, cancel, or final-confirmation requests; the Gateway dispatches only
read and reversible requests. A held appointment is paid through the existing
Healthcare payment acknowledgement endpoint, then final confirmation is stored
and executed only through `POST /api/v1/healthcare-workflows/confirm`.

The Ride contracts are captured in `agent-service.v1.yaml`, `ride-service-v1.yaml`,
and `gateway-public.v1.yaml`; they describe the internal typed interpretation and
the two Gateway confirmation boundaries. The current Gateway uses small typed
adapters with runtime response validation. No generated-client toolchain is
configured yet; do not hand-edit generated output when one is introduced.

`tool-request.schema.json` is the canonical cross-language ToolRequest shape:
`tool_name`, `risk_level`, `arguments`, `workflow_id`, `tool_call_id`,
`schema_version`, and optional `idempotency_key`. The Agent, Gateway, and
domain contracts must not add actor credentials or executed results to that
request.
