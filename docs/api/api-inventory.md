# Canonical API Inventory

This inventory is derived from the checked-in NestJS controllers, FastAPI routers, and OpenAPI files. It describes routes that exist now; roadmap paths without a controller/router are intentionally not listed as implemented. `PUBLIC_CANONICAL` is the supported consumer surface, `INTERNAL` is a private service or health boundary, `LEGACY_COMPAT` is retained for current demos/tests, and `DEPRECATED` is not part of the X-One runtime.

All public product traffic terminates at the Gateway. Public Gateway authentication is the current development-only Bearer demo token. Internal calls use the configured service token and, where a resource is actor-scoped, an actor assertion. Public success responses use `{ data, meta: { request_id } }`; public errors use the RFC-7807-inspired fields documented in [API conventions](api-conventions.md).

## Gateway — public and operational boundary

Source: `apps/api-gateway/src/modules/**`, `apps/api-gateway/src/main.ts`, and the Gateway OpenAPI contracts.

| Owner | Method | Path | Caller | Auth boundary | Classification | Replacement / migration path |
| --- | --- | --- | --- | --- | --- | --- |
| Gateway | GET | `/health/live` | Compose/orchestrator | none; liveness only | `INTERNAL` | Keep as operational probe. |
| Gateway | GET | `/health/ready` | Compose/orchestrator | none; readiness checks Gateway-owned dependencies | `INTERNAL` | Keep as operational probe. |
| Gateway | POST | `/api/v1/auth/login` | Web/mobile | Demo credentials; development/test only | `PUBLIC_CANONICAL` | Same path becomes real Argon2id/session-backed auth in Phase 1; demo auth must fail fast in production. |
| Gateway | GET | `/api/v1/auth/me` | Web/mobile | Bearer demo token | `PUBLIC_CANONICAL` | Same path remains the identity read after real auth is implemented. |
| Gateway | POST | `/api/v1/assistant/chat` | Web/mobile | Bearer token; Gateway calls Agent internally | `PUBLIC_CANONICAL` | Current unified assistant surface. |
| Gateway | POST | `/api/v1/assistant/actions` | Web/mobile | Bearer token plus required `Idempotency-Key`; final actions use Gateway confirmation | `PUBLIC_CANONICAL` | Current executable assistant action surface. |
| Gateway | POST | `/api/v1/conversations/{conversationId}/messages` | Web/mobile | Bearer token; actor scoped in Core | `PUBLIC_CANONICAL` | Existing conversation compatibility surface; new cross-domain consumers should prefer `/api/v1/assistant/chat`. |
| Gateway | GET | `/api/v1/conversations/{conversationId}` | Web/mobile | Bearer token; actor scoped in Core | `PUBLIC_CANONICAL` | Existing conversation read; keep until consumers migrate to the unified response model. |
| Gateway | POST | `/api/v1/confirmations/food-order` | Web/mobile | Bearer token; first/final confirmation evidence in Core | `PUBLIC_CANONICAL` | Food confirmation boundary retained; assistant actions may prepare it. |
| Gateway | POST | `/api/v1/confirmations/food-order-cancellation` | Web/mobile | Bearer token; actor-scoped confirmation | `PUBLIC_CANONICAL` | Food cancellation confirmation boundary retained. |
| Gateway | GET | `/api/v1/confirmations/{confirmationId}` | Web/mobile | Bearer token; actor scoped | `PUBLIC_CANONICAL` | Keep while confirmation UI consumes this resource. |
| Gateway | POST | `/api/v1/confirmations/{confirmationId}/execute` | Web/mobile | Bearer token, idempotency, one-time confirmation | `PUBLIC_CANONICAL` | Keep as the Food final execution boundary. |
| Gateway | POST | `/api/v1/confirmations/{confirmationId}/execute-cancellation` | Web/mobile | Bearer token, idempotency, one-time confirmation | `PUBLIC_CANONICAL` | Keep as the Food cancellation execution boundary. |
| Gateway | GET | `/api/v1/food/orders/{orderId}` | Web/mobile | Bearer token; actor-scoped Food read through Gateway | `PUBLIC_CANONICAL` | Keep; the Gateway remains the only public Food entry point. |
| Gateway | GET | `/api/v1/food/orders/{orderId}/tracking` | Web/mobile | Bearer token; actor-scoped Food read through Gateway | `PUBLIC_CANONICAL` | Keep; domain data remains Food-owned. |
| Gateway | POST | `/api/v1/food/orders/{orderId}/cancel-preview` | Web/mobile | Bearer token; actor-scoped Food read through Gateway | `PUBLIC_CANONICAL` | Keep; final cancellation still requires confirmation. |
| Gateway | POST | `/api/v1/food/orders/{orderId}/cancel-confirmation` | Web/mobile | Bearer token; Gateway confirmation preparation | `PUBLIC_CANONICAL` | Keep; execute through the confirmation boundary. |
| Gateway | GET | `/api/v1/payments/{paymentId}` | Web/mobile | Bearer token; actor-scoped Core read | `PUBLIC_CANONICAL` | Keep for current payment sandbox/readback. |
| Gateway | GET | `/api/v1/payments/{paymentId}/receipt` | Web/mobile | Bearer token; actor-scoped Core read | `PUBLIC_CANONICAL` | Keep for current sandbox receipt surface. |
| Gateway | GET | `/api/v1/payments/{paymentId}/refunds` | Web/mobile | Bearer token; actor-scoped Core read | `PUBLIC_CANONICAL` | Keep for current refund/recovery read surface. |
| Gateway | POST | `/api/v1/chat` | Web/mobile/demo tests | Legacy `X-Actor-Id` development identity; no real auth | `LEGACY_COMPAT` | Migrate Ride consumers to `/api/v1/assistant/chat` and `/api/v1/assistant/actions`; do not remove before tests/demo migrate. |
| Gateway | POST | `/api/v1/workflows/{workflowId}/confirm-service` | Web/mobile/demo tests | Legacy `X-Actor-Id` and Gateway confirmation state | `LEGACY_COMPAT` | Migrate Ride to assistant action descriptors and explicit confirmation. |
| Gateway | POST | `/api/v1/workflows/{workflowId}/confirm-payment` | Web/mobile/demo tests | Legacy `X-Actor-Id` and Gateway payment sandbox | `LEGACY_COMPAT` | Migrate Ride to assistant action descriptors and explicit payment confirmation. |
| Gateway | POST | `/api/v1/restaurant-workflows/chat` | Web/mobile/demo tests | Bearer demo token; Gateway/Agent/domain adapters | `LEGACY_COMPAT` | Migrate to `/api/v1/assistant/chat`; retain explicit confirmation through assistant actions. |
| Gateway | POST | `/api/v1/restaurant-workflows/confirm` | Web/mobile/demo tests | Bearer demo token, confirmation, idempotency | `LEGACY_COMPAT` | Migrate to the `restaurant_confirm` assistant action. |
| Gateway | POST | `/api/v1/healthcare-workflows/chat` | Web/mobile/demo tests | Bearer demo token; Gateway/Agent/domain adapters | `LEGACY_COMPAT` | Migrate to `/api/v1/assistant/chat`; keep Healthcare confirmation/payment gates. |
| Gateway | POST | `/api/v1/healthcare-workflows/payment` | Web/mobile/demo tests | Bearer demo token, idempotency, actor-scoped Healthcare call | `LEGACY_COMPAT` | Migrate to the `healthcare_payment` assistant action. |
| Gateway | POST | `/api/v1/healthcare-workflows/confirm` | Web/mobile/demo tests | Bearer demo token, confirmation, idempotency | `LEGACY_COMPAT` | Migrate to the `healthcare_confirm` assistant action. |
| Gateway | GET | `/internal/tools` | Agent service | `X-Internal-Service-Token` | `INTERNAL` | Agent capability discovery only; never expose to browsers. |
| Gateway | POST | `/internal/tools/execute` | Agent service | Internal token plus actor assertion; transaction tools are blocked | `INTERNAL` | Agent continues to emit proposals; final actions go through public Gateway confirmation. |

The target paths `/api/v1/users/*`, `/api/v1/addresses/*`, `/api/v1/history/*`, and `/api/v1/services/*` have no current Gateway controller and are therefore not implemented or inventoried as runnable endpoints. Their Phase 1/2 contracts must be added before implementation.

## Agent service — private interpretation boundary

Source: `apps/agent-service/src/api/routes.py`, `src/main.py`, and `packages/contracts/openapi/agent-service.v1.yaml`. The Agent never calls a domain service, database, payment provider, or final side effect.

| Owner | Method | Path | Caller | Auth boundary | Classification | Replacement / migration path |
| --- | --- | --- | --- | --- | --- | --- |
| Agent | GET | `/health/live` | Compose/Gateway | none; liveness only | `INTERNAL` | Keep as operational probe. |
| Agent | GET | `/health/ready` | Compose/Gateway | none; safe readiness flag | `INTERNAL` | Keep as operational probe. |
| Agent | GET | `/health` | Legacy standalone probe | none | `LEGACY_COMPAT` | Use `/health/live` or `/health/ready`; retain for old standalone launchers. |
| Agent | POST | `/api/v1/assistant-chat` | Gateway | Internal token plus `X-Actor-Id == user_id` | `INTERNAL` | Current unified planner contract; add/update the matching OpenAPI entry. |
| Agent | POST | `/api/v1/chat` | Gateway | Internal token plus actor assertion | `LEGACY_COMPAT` | Migrate Gateway calls to `/api/v1/assistant-chat`. |
| Agent | POST | `/api/v1/restaurant-chat` | Gateway | Internal token plus actor context | `INTERNAL` | Current typed Restaurant proposal boundary; final action remains Gateway-owned. |
| Agent | POST | `/api/v1/healthcare-chat` | Gateway | Internal token plus actor context | `INTERNAL` | Current typed Healthcare proposal boundary; final action remains Gateway-owned. |
| Agent | POST | `/api/v1/ride-chat` | Gateway | Internal token | `INTERNAL` | Current typed Ride proposal boundary; final action remains Gateway-owned. |
| Agent | GET | `/api/v1/status` | Gateway/ops | Internal token | `INTERNAL` | Safe diagnostics only; never return key, prompt, or provider payload. |

## Domain services — private REST boundaries

These routes are not browser-facing. The Gateway is the runtime caller and each service owns its database and state transition.

### Food service

| Method | Path | Auth boundary | Classification |
| --- | --- | --- | --- |
| GET | `/health/live` | none; liveness | `INTERNAL` |
| GET | `/health/ready` | none; checked repository/worker readiness | `INTERNAL` |
| GET | `/api/v1/restaurants` | Internal token | `INTERNAL` |
| GET | `/api/v1/restaurants/{restaurant_id}` | Internal token | `INTERNAL` |
| GET | `/api/v1/restaurants/{restaurant_id}/menu` | Internal token | `INTERNAL` |
| GET | `/api/v1/menu-items/{menu_item_id}` | Internal token | `INTERNAL` |
| GET | `/api/v1/food/search` | Internal token | `INTERNAL` |
| GET | `/api/v1/addresses` | Internal token plus actor assertion | `INTERNAL` |
| POST | `/api/v1/carts` | Internal token plus actor assertion and idempotency | `INTERNAL` |
| GET | `/api/v1/carts/{cart_id}` | Internal token plus actor assertion | `INTERNAL` |
| POST | `/api/v1/carts/{cart_id}/items` | Internal token plus actor assertion | `INTERNAL` |
| PATCH | `/api/v1/carts/{cart_id}/items/{cart_item_id}` | Internal token plus actor assertion | `INTERNAL` |
| DELETE | `/api/v1/carts/{cart_id}/items/{cart_item_id}` | Internal token plus actor assertion | `INTERNAL` |
| POST | `/api/v1/carts/{cart_id}/voucher` | Internal token plus actor assertion | `INTERNAL` |
| DELETE | `/api/v1/carts/{cart_id}/voucher` | Internal token plus actor assertion | `INTERNAL` |
| POST | `/api/v1/delivery/quote` | Internal token plus actor assertion | `INTERNAL` |
| POST | `/api/v1/orders/preview` | Internal token plus actor assertion | `INTERNAL` |
| POST | `/api/v1/orders` | Internal token plus actor assertion; final Gateway confirmation/idempotency | `INTERNAL` |
| GET | `/api/v1/orders/{order_id}` | Internal token plus actor assertion | `INTERNAL` |
| GET | `/api/v1/orders/{order_id}/tracking` | Internal token plus actor assertion | `INTERNAL` |
| POST | `/api/v1/orders/{order_id}/cancel-preview` | Internal token plus actor assertion | `INTERNAL` |
| POST | `/api/v1/orders/{order_id}/cancel` | Internal token plus actor assertion and idempotency | `INTERNAL` |
| POST | `/api/v1/internal/orders/{order_id}/transition` | Internal token; Gateway recovery worker only | `INTERNAL` |

### Ride service

| Method | Path | Auth boundary | Classification |
| --- | --- | --- | --- |
| GET | `/health/live` | none; liveness | `INTERNAL` |
| GET | `/health/ready` | none; readiness | `INTERNAL` |
| POST | `/v1/quotes` | Internal token, actor assertion, idempotency | `INTERNAL` |
| GET | `/v1/quotes/{quote_id}` | Internal token plus actor assertion | `INTERNAL` |
| POST | `/v1/bookings:prepare` | Internal token, actor assertion, idempotency, first confirmation evidence | `INTERNAL` |
| POST | `/v1/bookings/{booking_id}:confirm` | Internal token, actor assertion, idempotency, final confirmation evidence | `INTERNAL` |
| POST | `/v1/bookings/{booking_id}:cancel` | Internal token, actor assertion, idempotency, cancellation evidence | `INTERNAL` |
| GET | `/v1/bookings/{booking_id}` | Internal token plus actor assertion | `INTERNAL` |

### Restaurant service

| Method | Path | Auth boundary | Classification |
| --- | --- | --- | --- |
| GET | `/health/live` | none; liveness | `INTERNAL` |
| GET | `/health/ready` | none; readiness | `INTERNAL` |
| GET | `/v1/restaurants` | Internal token plus actor assertion | `INTERNAL` |
| GET | `/v1/restaurants/{restaurant_id}` | Internal token plus actor assertion | `INTERNAL` |
| POST | `/v1/restaurants/{restaurant_id}/availability` | Internal token plus actor assertion | `INTERNAL` |
| POST | `/v1/reservation-holds` | Internal token, actor assertion, idempotency | `INTERNAL` |
| POST | `/v1/reservations` | Internal token, actor assertion, idempotency, Gateway confirmation | `INTERNAL` |
| GET | `/v1/reservations/{reservation_id}` | Internal token plus actor assertion | `INTERNAL` |
| PATCH | `/v1/reservations/{reservation_id}` | Internal token, actor assertion, idempotency | `INTERNAL` |
| POST | `/v1/reservations/{reservation_id}/cancel` | Internal token, actor assertion, idempotency | `INTERNAL` |

### Healthcare service

| Method | Path | Auth boundary | Classification |
| --- | --- | --- | --- |
| GET | `/health/live` | none; liveness | `INTERNAL` |
| GET | `/health/ready` | none; readiness | `INTERNAL` |
| GET | `/api/v1/departments` | Internal token | `INTERNAL` |
| GET | `/api/v1/doctors` | Internal token | `INTERNAL` |
| POST | `/api/v1/slots/hold` | Internal token, actor assertion, idempotency | `INTERNAL` |
| GET | `/api/v1/appointments/{appointment_id}` | Internal token plus actor assertion | `INTERNAL` |
| POST | `/api/v1/payment/webhook` | Internal token, actor assertion, idempotency; local acknowledgement only | `INTERNAL` |
| POST | `/api/v1/appointments/{appointment_id}/confirm` | Internal token, actor assertion, idempotency, Gateway confirmation | `INTERNAL` |
| POST | `/api/v1/appointments/{appointment_id}/cancel` | Internal token, actor assertion, idempotency | `INTERNAL` |

## Legacy/deprecated non-runtime surface

`services/healthcare-sandbox/src/main.py` contains a standalone mock with `/api/v1/departments`, `/api/v1/doctors`, `/api/v1/slots/hold`, `/api/v1/appointments/{appointment_id}/confirm`, `/api/v1/appointments/{appointment_id}/cancel`, and `/api/v1/payment/webhook`. It is not wired into Compose or Gateway and is classified `DEPRECATED`; use `services/healthcare-service` through Gateway for any current flow. It must not be read as a second Healthcare owner.

No `/api/v1/users/*`, `/api/v1/addresses/*` saved-address Gateway resource, `/api/v1/history/*`, or `/api/v1/services/*` implementation exists yet. These remain planned Phase 1/2 surfaces and are excluded from the runnable inventory until their contracts, owner, auth, and tests exist.
