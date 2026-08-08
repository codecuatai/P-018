# OpenAPI Contracts

Versioned OpenAPI descriptions belong here. The Restaurant Service business contract is captured in `restaurant-service-v1.yaml`; generated clients must be produced from this contract and never hand-edited.

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
