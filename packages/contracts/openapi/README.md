# OpenAPI Contracts

Versioned OpenAPI descriptions live here. Generated clients must be produced from these contracts and never hand-edited.

## Checked-in contracts

`gateway-auth-v1.yaml` is the Phase 1 public authentication contract for registration, login, JWT refresh, current identity, logout, actor-scoped session management and password recovery. It documents that refresh tokens are cookie-only, opaque values; browser callers use the Gateway directly and no Next.js BFF or generated Web client exists. The hand-owned Web transport adapter is intentionally small and must stay transport-only.

`shared-primitives.v1.yaml` is the Phase 0 source for `GeoPoint`, `Money`, `Address`, `OpeningHours`, `Rating`, `ImageRef`, `DatasetSource`, `CurrentLocation`, `PaginationMeta`, `TimestampRange`, and the public success/list/error envelope shapes. Domain contracts may refine these shapes but must not silently change their meaning.

The Gateway's Restaurant walking slice is `POST /api/v1/restaurant-workflows/chat` followed by `POST /api/v1/restaurant-workflows/confirm`. The first request may prepare a hold and a pending final confirmation; only the explicit confirmation endpoint can call `POST /v1/reservations`, with actor/workflow validation and the original idempotency key.

Note the inconsistent naming — some files use `-v1`, some use `.v1`. Reference them exactly as listed:

| File | Describes |
| --- | --- |
| `gateway-v1.yaml` | The public Gateway surface, including the unified `POST /api/v1/assistant/chat` and `POST /api/v1/assistant/actions` |
| `gateway-public.v1.yaml` | Public Gateway confirmation boundaries |
| `gateway-food-vertical-slice.yaml` | The Gateway side of the Food ordering slice |
| `food-vertical-slice.yaml` | The Food service boundary |
| `restaurant-service-v1.yaml` | The Restaurant service business contract |
| `healthcare-service-v1.yaml` | The Healthcare service boundary |
| `ride-service.v1.yaml` | The Ride service boundary |
| `agent-service.v1.yaml` | The Agent's internal typed interpretation surface |

Ride's two Gateway confirmation boundaries are described across `agent-service.v1.yaml`, `ride-service.v1.yaml`, and `gateway-public.v1.yaml`.

## Orchestration boundaries these contracts encode

**Restaurant** — `POST /api/v1/restaurant-workflows/chat` then `POST /api/v1/restaurant-workflows/confirm`. The first request may prepare a hold and a pending final confirmation; only the explicit confirmation endpoint can call `POST /v1/reservations`, with actor/workflow validation and the original idempotency key.

**Healthcare** — same Gateway-only boundary at `POST /api/v1/healthcare-workflows/chat`. The Agent emits typed department, slot, hold, cancel, or final-confirmation requests; the Gateway dispatches only read and reversible requests. A held appointment is paid through `POST /api/v1/healthcare-workflows/payment`, then final confirmation is stored and executed only through `POST /api/v1/healthcare-workflows/confirm`.

## Generated clients

No generated-client toolchain is configured. `packages/generated-ts-clients/` contains only a README because the Gateway uses small hand-owned typed adapters with runtime response validation. When a toolchain is introduced, do not hand-edit its output.

## Tool schemas are not REST

`packages/contracts/tools/` is a sibling directory, not part of this one. `tool-request.schema.json` is the canonical cross-language ToolRequest shape — `tool_name`, `risk_level`, `arguments`, `workflow_id`, `tool_call_id`, `schema_version`, and optional `idempotency_key` — with `ride-tool-request.schema.json` narrowing it for Ride. The Agent, Gateway, and domain contracts must not add actor credentials or executed results to that request. See [tool contracts](../../../docs/api/tool-contracts.md).
