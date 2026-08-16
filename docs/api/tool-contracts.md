# Tool Contracts

A tool is a governed domain capability, not a raw REST endpoint. The Gateway
owns the registry and public execution boundary. The target Agent contract is
the versioned JSON-schema request described by
[`tool-registry-v2.json`](../../packages/contracts/tools/tool-registry-v2.json).
The unified planner emits bounded semantic proposals only. Legacy Food and
vertical workflow compatibility paths still ask the Gateway to execute a
whitelisted read/draft/preview request; they do not call a domain directly or
execute a final action. This is a migration exception, not an authority grant.

The canonical inventory contains 46 entries with the explicit classifications
`IMPLEMENTED_AGENT_TOOL`, `IMPLEMENTED_GATEWAY_ACTION`,
`IMPLEMENTED_DOMAIN_API`, `LEGACY_COMPAT`, and `DEPRECATED`. The Gateway
parity test and Agent policy parity test verify the checked canonical entries
and policy names. The current runtime has additional compatibility entries, so
the check is not yet bidirectional full-registry parity.

| Risk | Example behavior | Confirmation |
| --- | --- | --- |
| `READ` | search, detail, availability, tracking | no |
| `REVERSIBLE_WRITE` | cart update, hold, reservation cancellation | policy-dependent; domain idempotency required |
| `FINANCIAL_OR_FINAL` | order/booking/appointment confirmation or payment | explicit Gateway confirmation required |

The canonical `ToolRequest` requires `tool_name`, `risk_level`, `arguments`,
`workflow_id`, `tool_call_id`, and `schema_version`; write-capable requests
also carry an idempotency key. The registry owns risk and confirmation
metadata, so a model cannot elevate a read into a write or supply authoritative
IDs, prices, availability, coordinates, status, payment, or final-success
claims.

## Domain execution boundaries

Food Agent tools cover discovery, menu/cart, delivery quote, preview, tracking
and confirmation preparation. Food final order/cancellation/refund execution
remains Gateway/Core confirmation work and calls `FoodClient` only after a
fresh authoritative preview, payload/version/amount/currency/expiry binding,
idempotency, and one-time confirmation claim.

Ride has one Agent-proposable quote tool. Booking preparation, final booking,
tracking, status, list, and cancellation are Gateway/domain capabilities. The
Ride domain owns tariff/driver selection, quote and booking transitions,
tracking events, idempotency, and final status; two explicit confirmations are
required before final payment/booking execution.

Restaurant Agent tools cover search, detail, availability and holds. Final
reservation, read/list/cancel operations are represented in the registry, with
the final write still gated by Gateway confirmation and domain idempotency.

Healthcare Agent tools cover departments, slots, holds and cancellation.
Facility/doctor/appointment reads and final confirmation are represented as
domain or Gateway capabilities; payment acknowledgement is a separate
Gateway/domain step between the hold and final confirmation.

Legacy aliases remain `LEGACY_COMPAT` inputs during migration and do not create
a second authority. The Agent never calls a domain service or database and
never confirms on behalf of a user.

## Unified assistant and multi-service plans

The unified Assistant planner may emit semantic task dependencies, but never a
final side effect. A Healthcare-to-Ride plan carries the pickup only; Gateway
obtains the destination, appointment start and facility from Healthcare and
the duration from Ride. Public action descriptors are the only executable
Assistant surface. Core migration `007_core_assistant_action_executions.sql`
records one durable action receipt per actor/conversation/action, while
`011_core_multi_service_workflows.sql` records Gateway orchestration plans and
typed step results. Neither migration becomes authority for a Restaurant,
Healthcare, Ride, or Food booking/order.

Evidence: `apps/api-gateway/test/tools/tool-registry.spec.ts` and
`apps/agent-service/tests/test_agents/test_tool_registry_parity.py`.
