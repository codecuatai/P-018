# Tool Registry v2 Specification

Status: `IMPLEMENTED_RUNTIME`. The Gateway exposes the validated registry at
`GET /internal/tools/registry-v2`; the machine-readable canonical inventory is
[`packages/contracts/tools/tool-registry-v2.json`](../../packages/contracts/tools/tool-registry-v2.json).
The Agent emits typed proposals and bounded policies; it never calls a domain,
database, payment provider, or final side effect.

## Contract and authority rules

Each inventory entry contains `name`, `domain`, `version`, `risk`,
`argument_schema`, `result_schema`, `idempotency_requirement`,
`confirmation_requirement`, `owner`, and `classification`. A `ToolRequest`
uses `tool_name`; the JSON inventory uses `name` so it can also describe the
canonical alias mapping.

Allowed risks are `READ`, `REVERSIBLE_WRITE`, and `FINANCIAL_OR_FINAL`.
Every write, hold, cancellation, payment acknowledgement, or final action
requires a domain-enforced idempotency key from the first write request.
Financial/final operations require `explicit_gateway_confirmation`. The
registry rejects unknown arguments and model-supplied authoritative IDs,
prices, availability, coordinates, status, payment state, or success claims.
There is no SQL/database tool and no generic executor entry.

## Current inventory

The v2 file contains 47 canonical entries across all four domains:

| Domain | `IMPLEMENTED_AGENT_TOOL` | `IMPLEMENTED_GATEWAY_ACTION` | `IMPLEMENTED_DOMAIN_API` | Total |
| --- | ---: | ---: | ---: | ---: |
| Food | 14 | 1 | 3 | 18 |
| Ride | 1 | 8 | 1 | 10 |
| Restaurant | 4 | 3 | 2 | 9 |
| Healthcare | 4 | 1 | 5 | 10 |
| **Total** | **23** | **13** | **11** | **47** |

The classifications are evidence-based:

- `IMPLEMENTED_AGENT_TOOL`: the Agent policy can propose the canonical tool
  and the Gateway has a bounded executor/domain path.
- `IMPLEMENTED_GATEWAY_ACTION`: the Gateway has the typed action or
  confirmation path, but the Agent does not execute the final operation as a
  free-standing tool.
- `IMPLEMENTED_DOMAIN_API`: the owning service route and schema are present;
  it is not currently an Agent action surface.
- `LEGACY_COMPAT`: an old alias or route retained while callers migrate.
- `DEPRECATED`: not part of the runtime and not an executable alias.

The canonical names are grouped below; the JSON file remains the source of
truth for schemas, risk, owner, idempotency, confirmation, and aliases.

| Domain | Canonical names |
| --- | --- |
| Food | `food.search`, `food.get_restaurant`, `food.list_menu`, `food.get_menu_item`, `food.create_cart`, `food.add_cart_item`, `food.update_cart_item`, `food.remove_cart_item`, `food.quote_delivery`, `food.apply_voucher`, `food.remove_voucher`, `food.preview_order`, `food.prepare_order`, `food.get_order`, `food.list_orders`, `food.track_order`, `food.prepare_cancel_order`, `food.cancel_order` |
| Ride | `ride.quote.create`, `ride.quote.get`, `ride.booking.prepare`, `ride.booking.confirm`, `ride.booking.get`, `ride.booking.list`, `ride.booking.status.get`, `ride.tracking.get`, `ride.booking.cancel.prepare`, `ride.booking.cancel` |
| Restaurant | `restaurant.search`, `restaurant.get`, `restaurant.check_availability`, `restaurant.create_hold`, `restaurant.create_reservation`, `restaurant.update_reservation`, `restaurant.get_reservation`, `restaurant.list_reservations`, `restaurant.cancel_reservation` |
| Healthcare | `healthcare.search_facilities`, `healthcare.get_facility`, `healthcare.list_departments`, `healthcare.list_doctors`, `healthcare.list_slots`, `healthcare.hold_slot`, `healthcare.get_appointment`, `healthcare.list_appointments`, `healthcare.confirm_appointment`, `healthcare.cancel_appointment` |

Legacy Food names such as `view_menu`, `view_menu_item`, `create_cart`,
`add_to_cart`, `preview_order`, and `track_food_order` are compatibility inputs
mapped to the canonical definitions. They are not additional authorities and
must not be added to new model prompts. The parity gate verifies both directions:
every JSON entry has matching runtime metadata, and every runtime-only entry
must be in `TOOL_REGISTRY_COMPATIBILITY` with owner `gateway-tools` and
expiry `2026-12-31`. An unlisted runtime name or an expired allowlist fails
the release test.

## Ride evidence audit

- `ride.quote.create` is Agent-proposable and executes through
  `RideConversationService`/`RideClient`; Ride remains authoritative for the
  tariff, route snapshot, bounded stopovers, expiry, and quote version. A
  stopover change produces a new quote rather than a booking update.
- `ride.booking.prepare` and `ride.booking.confirm` are Gateway actions with
  two explicit confirmations. The final result exposes the Ride booking
  status, including `NO_DRIVER`, rather than inferring success.
- `ride.tracking.get`, booking status/list, and cancellation are represented
  as Gateway/domain capabilities with actor scope and idempotency requirements
  in the canonical inventory.

## Boundary rules

- The Gateway owns the public action/confirmation boundary; a final proposal
  cannot call a domain final endpoint directly.
- Domain services validate again and own IDs, prices, availability, state
  transitions, idempotency, and result status.
- Agent content and tool results are untrusted until schema, policy, and
  domain validation pass. Raw prompts, provider payloads, and chain-of-thought
  are never public response fields.
- Phase 9 ranking and multi-service plan APIs remain Gateway orchestration
  surfaces rather than Agent tools. They accept validated actor-scoped inputs
  and typed domain results; the Agent cannot choose a destination, confirm a
  booking, or mark a workflow successful.

Parity evidence: `apps/api-gateway/test/tools/tool-registry.spec.ts` and
`apps/agent-service/tests/test_agents/test_tool_registry_parity.py`.
