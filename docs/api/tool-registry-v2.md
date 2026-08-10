# Tool Registry v2 Specification

Status: **Phase 0 contract/specification only**. This document does not claim that a v2 runtime registry or a new tool executor exists. The current Gateway and Agent bindings remain in their existing bounded adapters; the Agent emits typed proposals and the Gateway validates policy, arguments, actor scope, confirmation, and domain results.

## Required metadata

Every v2 entry has these fields:

```json
{
  "tool_name": "food.search",
  "domain": "food",
  "version": "2",
  "risk": "READ",
  "argument_schema": {"$ref": "#/schemas/FoodSearchArguments"},
  "result_schema": {"$ref": "#/schemas/FoodSearchResult"},
  "idempotency_requirement": "none",
  "confirmation_requirement": "none",
  "owner": "food-service"
}
```

Allowed domains are `food`, `ride`, `restaurant`, and `healthcare`. Allowed risks are `READ`, `REVERSIBLE_WRITE`, and `FINANCIAL_OR_FINAL`. A model response cannot assign or elevate risk, supply authoritative IDs/prices/status, satisfy confirmation, or report final transaction success.

`idempotency_requirement` is `none` only for a read that has no side effect. Every write, hold, cancellation, payment acknowledgement, or final action requires a domain-enforced key from the first write request. `confirmation_requirement` is `none`, `policy-dependent`, or `explicit_gateway_confirmation`; the last value is mandatory for final/financial actions. There is no SQL/database tool and no generic executor entry.

## Current capability map

The v2 names below are the canonical names for future contract use. A legacy alias is a runtime name that currently exists; an alias is not a second authority and must not be added to new model prompts. Statuses are evidence-based: `IMPLEMENTED_RUNTIME` means an Agent proposal has a bounded Gateway/domain execution path; `IMPLEMENTED_GATEWAY_ONLY` means a Gateway client/confirmation path exists but the Agent cannot invoke the operation as a final tool; `IMPLEMENTED_DOMAIN_ONLY` means only the domain route is present; `PROPOSAL_ONLY` means validation/recognition exists but no current executor completes the operation; and `PLANNED_PHASE_4` is reserved for a future capability. A proposal-only name is never an executable alias.

| tool_name | domain | version | risk | argument_schema | result_schema | idempotency_requirement | confirmation_requirement | owner | status | legacy alias |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| `food.search` | food | 2 | READ | `FoodSearchArguments` | `FoodSearchResult` | none | none | food-service | `IMPLEMENTED_RUNTIME` | `search_food` |
| `food.menu.get` | food | 2 | READ | `FoodMenuArguments` | `FoodMenuResult` | none | none | food-service | `IMPLEMENTED_RUNTIME` | `view_menu` |
| `food.menu_item.get` | food | 2 | READ | `FoodMenuItemArguments` | `FoodMenuItemResult` | none | none | food-service | `IMPLEMENTED_RUNTIME` | `view_menu_item` |
| `food.address.list` | food | 2 | READ | `FoodAddressListArguments` | `FoodAddressListResult` | none | none | food-service | `IMPLEMENTED_RUNTIME` | `list_food_delivery_addresses` |
| `food.cart.get` | food | 2 | READ | `FoodCartArguments` | `FoodCartResult` | none | none | food-service | `IMPLEMENTED_RUNTIME` | `get_food_cart` |
| `food.cart.create` | food | 2 | REVERSIBLE_WRITE | `FoodCartCreateArguments` | `FoodCartResult` | required at domain boundary | policy-dependent | food-service | `IMPLEMENTED_RUNTIME` | `create_cart` |
| `food.cart.item.add` | food | 2 | REVERSIBLE_WRITE | `FoodCartItemArguments` | `FoodCartResult` | required at domain boundary | policy-dependent | food-service | `IMPLEMENTED_RUNTIME` | `add_to_cart` |
| `food.cart.item.update` | food | 2 | REVERSIBLE_WRITE | `FoodCartItemUpdateArguments` | `FoodCartResult` | required at domain boundary | policy-dependent | food-service | `IMPLEMENTED_RUNTIME` | `update_food_cart_item` |
| `food.cart.item.remove` | food | 2 | REVERSIBLE_WRITE | `FoodCartItemRemoveArguments` | `FoodCartResult` | required at domain boundary | policy-dependent | food-service | `IMPLEMENTED_RUNTIME` | `remove_food_cart_item` |
| `food.cart.voucher.apply` | food | 2 | REVERSIBLE_WRITE | `FoodVoucherArguments` | `FoodCartResult` | required at domain boundary | policy-dependent | food-service | `IMPLEMENTED_RUNTIME` | `apply_voucher` |
| `food.cart.voucher.remove` | food | 2 | REVERSIBLE_WRITE | `FoodCartArguments` | `FoodCartResult` | required at domain boundary | policy-dependent | food-service | `IMPLEMENTED_RUNTIME` | `remove_food_voucher` |
| `food.delivery.quote` | food | 2 | READ | `FoodDeliveryQuoteArguments` | `FoodDeliveryQuoteResult` | none | none | food-service | `IMPLEMENTED_RUNTIME` | `quote_delivery` |
| `food.order.preview` | food | 2 | READ | `FoodOrderPreviewArguments` | `FoodOrderPreviewResult` | none | none | food-service | `IMPLEMENTED_RUNTIME` | `preview_order` |
| `food.order.get` | food | 2 | READ | `FoodOrderArguments` | `FoodOrderResult` | none | none | food-service | `IMPLEMENTED_RUNTIME` | `get_food_order` |
| `food.order.track` | food | 2 | READ | `FoodOrderArguments` | `FoodTrackingResult` | none | none | food-service | `IMPLEMENTED_RUNTIME` | `track_food_order` |
| `food.order.cancel.preview` | food | 2 | READ | `FoodOrderArguments` | `FoodCancellationPreviewResult` | none | none | food-service | `IMPLEMENTED_RUNTIME` | `preview_food_order_cancellation` |
| `food.order.confirm.prepare` | food | 2 | FINANCIAL_OR_FINAL | `FoodOrderPreviewArguments` | `ConfirmationForm` | required at confirmation boundary | explicit_gateway_confirmation | gateway/Core + food-service | `IMPLEMENTED_RUNTIME` | `prepare_food_order_confirmation` |
| `food.order.cancel.confirm.prepare` | food | 2 | FINANCIAL_OR_FINAL | `FoodOrderArguments` | `ConfirmationForm` | required at confirmation boundary | explicit_gateway_confirmation | gateway/Core + food-service | `IMPLEMENTED_RUNTIME` | `prepare_food_order_cancellation_confirmation` |
| `food.order.confirm` | food | 2 | FINANCIAL_OR_FINAL | `FoodOrderConfirmationArguments` | `FoodOrderResult` | required | explicit_gateway_confirmation | gateway/Core + food-service | `IMPLEMENTED_GATEWAY_ONLY` | `execute_food_order` |
| `food.order.cancel` | food | 2 | REVERSIBLE_WRITE | `FoodOrderCancellationArguments` | `FoodOrderResult` | required | explicit_gateway_confirmation | gateway/Core + food-service | `IMPLEMENTED_GATEWAY_ONLY` | `execute_food_order_cancellation` |
| `food.refund.execute` | food | 2 | FINANCIAL_OR_FINAL | `FoodRefundArguments` | `RefundResult` | required | explicit_gateway_confirmation or recovery claim | gateway/Core + food-service | `IMPLEMENTED_GATEWAY_ONLY` | `execute_food_refund` |
| `ride.quote.create` | ride | 2 | READ | `RideQuoteArguments` | `RideQuoteResult` | required at domain boundary | none | ride-service | `IMPLEMENTED_RUNTIME` | — |
| `ride.quote.get` | ride | 2 | READ | `RideQuoteGetArguments` | `RideQuoteResult` | none | none | ride-service | `IMPLEMENTED_GATEWAY_ONLY` | — |
| `ride.booking.prepare` | ride | 2 | REVERSIBLE_WRITE | `RideBookingPrepareArguments` | `RideBookingResult` | required | explicit service-details confirmation | ride-service + Gateway | `IMPLEMENTED_GATEWAY_ONLY` | — |
| `ride.booking.get` | ride | 2 | READ | `RideBookingGetArguments` | `RideBookingResult` | none | none | ride-service + Gateway | `IMPLEMENTED_GATEWAY_ONLY` | `ride.booking.status.get` (proposal-only; not executed by current Ride conversation) |
| `ride.booking.confirm` | ride | 2 | FINANCIAL_OR_FINAL | `RideBookingConfirmArguments` | `RideBookingResult` | required | explicit_gateway_confirmation | ride-service + Gateway | `IMPLEMENTED_GATEWAY_ONLY` | — |
| `ride.booking.cancel.prepare` | ride | 2 | REVERSIBLE_WRITE | `RideBookingCancelArguments` | `RideCancellationProposal` | none | explicit_gateway_confirmation | Gateway ToolRegistry | `PROPOSAL_ONLY` | — |
| `ride.booking.cancel` | ride | 2 | REVERSIBLE_WRITE | `RideBookingCancelArguments` | `RideBookingResult` | required | policy-dependent | ride-service | `IMPLEMENTED_DOMAIN_ONLY` | — |
| `restaurant.search` | restaurant | 2 | READ | `RestaurantSearchArguments` | `RestaurantSearchResult` | none | none | restaurant-service | `IMPLEMENTED_RUNTIME` | — |
| `restaurant.get` | restaurant | 2 | READ | `RestaurantGetArguments` | `RestaurantResult` | none | none | restaurant-service | `IMPLEMENTED_RUNTIME` | — |
| `restaurant.check_availability` | restaurant | 2 | READ | `RestaurantAvailabilityArguments` | `RestaurantAvailabilityResult` | none | none | restaurant-service | `IMPLEMENTED_RUNTIME` | — |
| `restaurant.create_hold` | restaurant | 2 | REVERSIBLE_WRITE | `RestaurantHoldArguments` | `RestaurantHoldResult` | required | policy-dependent | restaurant-service | `IMPLEMENTED_RUNTIME` | — |
| `restaurant.create_reservation` | restaurant | 2 | FINANCIAL_OR_FINAL | `RestaurantReservationArguments` | `RestaurantReservationResult` | required | explicit_gateway_confirmation | restaurant-service + Gateway | `IMPLEMENTED_GATEWAY_ONLY` | — |
| `healthcare.list_departments` | healthcare | 2 | READ | `HealthcareDepartmentArguments` | `HealthcareDepartmentResult` | none | none | healthcare-service | `IMPLEMENTED_RUNTIME` | — |
| `healthcare.list_slots` | healthcare | 2 | READ | `HealthcareSlotArguments` | `HealthcareSlotResult` | none | none | healthcare-service | `IMPLEMENTED_RUNTIME` | — |
| `healthcare.hold_slot` | healthcare | 2 | REVERSIBLE_WRITE | `HealthcareHoldArguments` | `HealthcareAppointmentResult` | required | policy-dependent | healthcare-service | `IMPLEMENTED_RUNTIME` | — |
| `healthcare.payment.acknowledge` | healthcare | 2 | FINANCIAL_OR_FINAL | `HealthcarePaymentArguments` | `HealthcarePaymentResult` | required | explicit Gateway payment step | healthcare-service + Gateway | `IMPLEMENTED_GATEWAY_ONLY` | — |
| `healthcare.confirm_appointment` | healthcare | 2 | FINANCIAL_OR_FINAL | `HealthcareAppointmentArguments` | `HealthcareAppointmentResult` | required | explicit_gateway_confirmation | healthcare-service + Gateway | `IMPLEMENTED_GATEWAY_ONLY` | — |
| `healthcare.cancel_appointment` | healthcare | 2 | REVERSIBLE_WRITE | `HealthcareAppointmentArguments` | `HealthcareAppointmentResult` | required | policy-dependent | healthcare-service | `IMPLEMENTED_RUNTIME` | — |

No Phase 4 capability is registered as implemented in this Phase 0 spec. A future entry must be labelled `PLANNED_PHASE_4`, have all required metadata, and remain unavailable to runtime validation until its owner, OpenAPI contract, tests, idempotency, and confirmation policy exist.

## Ride evidence audit

- `ride.quote.create` is emitted by `apps/agent-service/src/agents/ride_graph.py`, validated by `apps/api-gateway/src/modules/tools/tool-registry.ts`, and executed through `RideConversationService` and `RideClient`.
- `ride.booking.prepare` and `ride.booking.confirm` are performed by Gateway confirmation endpoints and `RideClient`; the Agent does not directly execute either final domain operation.
- `ride.booking.cancel` exists as an authoritative Ride route and application operation, but no current Gateway client/confirmation path exposes it to the Agent; it is therefore `IMPLEMENTED_DOMAIN_ONLY`.
- `ride.booking.cancel.prepare` is accepted as a Gateway proposal shape only. It is not an alias for `ride.booking.cancel`, and this Phase 0 task does not add a cancellation workflow or rewrite the runtime registry.

## Boundary rules

- The Gateway owns the public action/confirmation boundary; a final tool proposal cannot call a domain final endpoint directly.
- Domain services validate the request again and remain authoritative for IDs, prices, availability, state transitions, idempotency, and result status.
- The Agent may use legacy aliases only while the Gateway maintains the compatibility adapter. It never receives database credentials and never creates authoritative IDs, prices, availability, or success status.
- Tool results are untrusted data until schema validation and policy checks pass. Raw provider/tool payloads, prompts, and chain-of-thought are not public response fields.
