# Tool Contracts

A tool is a governed domain capability, not a raw REST endpoint. The Tool Registry belongs to the gateway. The agent can only emit the versioned JSON-schema request in `packages/contracts/tools/`; it cannot invoke a tool itself.

| Risk | Example behavior | Confirmation |
| --- | --- | --- |
| `READ` | search availability | no |
| `REVERSIBLE_WRITE` | hold/reserve | policy-dependent |
| `FINANCIAL_OR_FINAL` | confirm booking/payment | required |

Implemented Food slice lifecycle: agent discovers `GET /internal/tools`, proposes a versioned tool request, and calls `POST /internal/tools/execute` with internal token, actor assertion, and conversation context; Gateway validates complete JSON schemas and rejects invalid arguments and all `transaction` tools. Cart creation scopes its idempotency identity to actor/restaurant/conversation, while retries in the same conversation reuse the same draft. Cart/order/tracking/cancellation tools execute only through typed `FoodClient`. `prepare_food_order_confirmation` and cancellation preparation return confirmation forms. Final execution is only through public confirmation endpoints, bound to actor, fresh authoritative Food preview, payload/version/amount/currency, expiry, idempotency key, and one-time use. The remaining non-Food domains remain skeletons.
