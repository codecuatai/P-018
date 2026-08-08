# Tool Contracts

A tool is a governed domain capability, not a raw REST endpoint. The Tool Registry belongs to the gateway. The agent can only emit the versioned JSON-schema request in `packages/contracts/tools/`; it cannot invoke a tool itself.

| Risk | Example behavior | Confirmation |
| --- | --- | --- |
| `READ` | search availability | no |
| `REVERSIBLE_WRITE` | hold/reserve | policy-dependent |
| `FINANCIAL_OR_FINAL` | confirm booking/payment | required |

Implemented Food slice lifecycle: agent discovers `GET /internal/tools`, proposes a versioned tool request, and calls `POST /internal/tools/execute` with internal token, actor assertion, and conversation context; Gateway validates complete JSON schemas and rejects invalid arguments and all `transaction` tools. Cart creation scopes its idempotency identity to actor/restaurant/conversation, while retries in the same conversation reuse the same draft. Cart/order/tracking/cancellation tools execute only through typed `FoodClient`. `prepare_food_order_confirmation` and cancellation preparation return confirmation forms. Final execution is only through public confirmation endpoints, bound to actor, fresh authoritative Food preview, payload/version/amount/currency, expiry, idempotency key, and one-time use. The remaining non-Food domains remain skeletons.
The canonical `ToolRequest` requires `tool_name`, `risk_level`, `arguments`, `workflow_id`, `tool_call_id`, and `schema_version`; write-capable requests also carry an idempotency key. Restaurant tools are `restaurant.search`, `restaurant.check_availability`, `restaurant.create_hold`, and `restaurant.create_reservation`; the last action is prepared by Gateway and executes only after explicit confirmation. Healthcare tools are `healthcare.list_departments`, `healthcare.list_slots`, `healthcare.hold_slot`, `healthcare.confirm_appointment`, and `healthcare.cancel_appointment`; payment acknowledgement is a domain call between hold and explicit final confirmation. Ride keeps its separate quote/prepare/confirm contract. Restaurant and Healthcare are implemented local slices, not skeletons, while production payment/authentication remains out of scope.
