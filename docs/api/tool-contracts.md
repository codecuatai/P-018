# Tool Contracts

A tool is a governed domain capability, not a raw REST endpoint. The Tool Registry belongs to the gateway. The agent can only emit the versioned JSON-schema request in `packages/contracts/tools/`; it cannot invoke a tool itself.

The canonical registry specification is [Tool Registry v2](tool-registry-v2.md). It maps the current runtime names, canonical v2 names, all four domains, risk, argument/result schema references, idempotency, confirmation, owner, and implemented-vs-Gateway-only status. Phase 9 recommendation/workflow endpoints are Gateway orchestration APIs, not new Agent tools; the Agent still emits typed proposals and cannot mutate the workflow or domain state directly.

| Risk | Example behavior | Confirmation |
| --- | --- | --- |
| `READ` | search availability | no |
| `REVERSIBLE_WRITE` | hold/reserve | policy-dependent |
| `FINANCIAL_OR_FINAL` | confirm booking/payment | required |

Implemented Food slice lifecycle: agent discovers `GET /internal/tools`, proposes a versioned tool request, and calls `POST /internal/tools/execute` with internal token, actor assertion, and conversation context; Gateway validates complete JSON schemas and rejects invalid arguments and all `transaction` tools. Cart creation scopes its idempotency identity to actor/restaurant/conversation, while retries in the same conversation reuse the same draft. Cart/order/tracking/cancellation tools execute only through typed `FoodClient`. `prepare_food_order_confirmation` and cancellation preparation return confirmation forms. Final execution is only through public confirmation endpoints, bound to actor, fresh authoritative Food preview, payload/version/amount/currency, expiry, idempotency key, and one-time use. Non-Food domain APIs are not skeletons: Restaurant exposes discovery, availability, holds, reservation create/read/update/cancel; Healthcare exposes authoritative department/slot, hold, payment acknowledgement, confirmation, cancellation, and actor-scoped idempotency. Gateway/Agent orchestration is narrower and is documented separately from the domain API surface.
The canonical `ToolRequest` requires `tool_name`, `risk_level`, `arguments`, `workflow_id`, `tool_call_id`, and `schema_version`; write-capable requests also carry an idempotency key. Restaurant tools are `restaurant.search`, `restaurant.check_availability`, `restaurant.create_hold`, and `restaurant.create_reservation`; the last action is prepared by Gateway and executes only after explicit confirmation. The Restaurant domain's read/update/cancel REST operations are implemented but are not currently exposed as Agent final tools. Healthcare tools are `healthcare.list_departments`, `healthcare.list_slots`, `healthcare.hold_slot`, `healthcare.confirm_appointment`, and `healthcare.cancel_appointment`; payment acknowledgement is a domain call between hold and explicit final confirmation. Ride keeps its separate quote/prepare/confirm contract. Production payment/authentication remains out of scope.

The unified Assistant planner may emit semantic task dependencies, but it never
emits a final side effect. In particular, a Healthcare→Ride plan carries the
pickup only; Gateway obtains the destination, appointment start, and facility
from Healthcare and the duration from Ride. The public action descriptors are
the only executable Assistant surface. Core migration
`007_core_assistant_action_executions.sql` records one durable action receipt
per actor/conversation/action so Restaurant, Ride, Healthcare, and Food replay
the same safe response without repeating a domain write. Core migration
`011_core_multi_service_workflows.sql` separately records Gateway orchestration
plans and typed step results; it is not an authority for a Restaurant,
Healthcare, Ride, or Food booking/order.
