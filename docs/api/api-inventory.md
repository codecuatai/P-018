# Canonical API Inventory

This inventory is derived from the checked-in NestJS controllers, FastAPI routers, and OpenAPI files. It describes routes that exist now; roadmap paths without a controller/router are intentionally not listed as implemented. `PUBLIC_CANONICAL` is the supported consumer surface, `INTERNAL` is a private service or health boundary, `LEGACY_COMPAT` is retained for current demos/tests, and `DEPRECATED` is not part of the X-One runtime. Tool capability status is documented separately as `IMPLEMENTED_AGENT_TOOL`, `IMPLEMENTED_GATEWAY_ACTION`, `IMPLEMENTED_DOMAIN_API`, `LEGACY_COMPAT`, or `DEPRECATED`.

All public product traffic terminates at the Gateway. Public Gateway authentication uses a short-lived Bearer JWT kept only in Web memory plus an opaque rotating HttpOnly refresh cookie; development/test demo auth is a compatibility path only. Internal calls use the configured service token and, where a resource is actor-scoped, an actor assertion. Public success responses use `{ data, meta: { request_id } }`; public errors use the RFC-7807-inspired fields documented in [API conventions](api-conventions.md).

## Gateway — public and operational boundary

Source: `apps/api-gateway/src/modules/**`, `apps/api-gateway/src/main.ts`, and the Gateway OpenAPI contracts.

| Owner | Method | Path | Caller | Auth boundary | Classification | Replacement / migration path |
| --- | --- | --- | --- | --- | --- | --- |
| Gateway | GET | `/health/live` | Compose/orchestrator | none; liveness only | `INTERNAL` | Keep as operational probe. |
| Gateway | GET | `/health/ready` | Compose/orchestrator | none; readiness checks Gateway-owned dependencies | `INTERNAL` | Keep as operational probe. |
| Gateway | POST | `/api/v1/auth/register` | Web/mobile | Public; creates Core user, Argon2id credential and initial session atomically | `PUBLIC_CANONICAL` | Real Phase 1 auth; see `gateway-auth-v1.yaml`. |
| Gateway | POST | `/api/v1/auth/login` | Web/mobile | Public; real credential verification, with demo only in development/test | `PUBLIC_CANONICAL` | Real Phase 1 auth; safe invalid-credential error and rate limit. |
| Gateway | POST | `/api/v1/auth/refresh` | Web/mobile | Opaque HttpOnly refresh cookie + trusted Origin/Referer | `PUBLIC_CANONICAL` | Rotates one token generation; replay revokes its family. |
| Gateway | GET | `/api/v1/auth/me` | Web/mobile | Bearer real JWT (or explicit dev/test demo JWT) | `PUBLIC_CANONICAL` | Safe identity read. |
| Gateway | POST | `/api/v1/auth/logout`, `/logout-all` | Web/mobile | Current cookie family / bearer actor plus trusted Origin | `PUBLIC_CANONICAL` | Revokes current family or all actor sessions. |
| Gateway | GET | `/api/v1/auth/sessions` | Web/mobile | Bearer real JWT | `PUBLIC_CANONICAL` | Lists actor-owned active session families only. |
| Gateway | DELETE | `/api/v1/auth/sessions/{sessionId}` | Web/mobile | Bearer real JWT + trusted Origin | `PUBLIC_CANONICAL` | Revokes one actor-owned family. |
| Gateway | POST | `/api/v1/auth/change-password` | Web/mobile | Bearer real JWT + trusted Origin | `PUBLIC_CANONICAL` | Updates Argon2id credential and revokes all sessions. |
| Gateway | POST | `/api/v1/auth/forgot-password`, `/reset-password` | Web/mobile | Public; reset is one-time, expiring and hash-only | `PUBLIC_CANONICAL` | Email delivery remains a configured future seam; dev/test capture is not a production contract. |
| Gateway | POST | `/api/v1/assistant/chat` | Web/mobile | Bearer token; Gateway calls Agent internally | `PUBLIC_CANONICAL` | Current unified assistant surface. |
| Gateway | POST | `/api/v1/assistant/actions` | Web/mobile | Bearer token plus required `Idempotency-Key`; final actions use Gateway confirmation | `PUBLIC_CANONICAL` | Current executable assistant action surface. |
| Gateway | GET, POST | `/api/v1/conversations` | Web/mobile | Bearer token; Core actor scope | `PUBLIC_CANONICAL` | Core-owned conversation list/create. |
| Gateway | POST | `/api/v1/conversations/{conversationId}/messages` | Web/mobile | Bearer token; actor scoped in Core | `PUBLIC_CANONICAL` | Existing conversation compatibility surface; new cross-domain consumers should prefer `/api/v1/assistant/chat`. |
| Gateway | GET, PATCH, DELETE | `/api/v1/conversations/{conversationId}` | Web/mobile | Bearer token; actor scoped in Core | `PUBLIC_CANONICAL` | Read, rename/archive, or delete one Core conversation. |
| Gateway | POST | `/api/v1/conversations/{conversationId}/archive`, `/unarchive` | Web/mobile | Bearer token; actor scoped in Core | `PUBLIC_CANONICAL` | Explicit conversation lifecycle actions. |
| Gateway | GET, PATCH | `/api/v1/users/me` | Web/mobile | Bearer token; Core actor | `PUBLIC_CANONICAL` | Safe profile context; no credential material. |
| Gateway | GET, POST, PATCH, DELETE | `/api/v1/addresses`, `/api/v1/addresses/{id}` | Web/mobile | Bearer token; Core actor scope | `PUBLIC_CANONICAL` | Core saved addresses; domain writes receive immutable snapshots only. |
| Gateway | POST | `/api/v1/addresses/{id}/default`, `/api/v1/addresses/resolve` | Web/mobile | Bearer token; Core actor / location adapter | `PUBLIC_CANONICAL` | Default selection and address resolution. |
| Gateway | POST | `/api/v1/location/geocode`, `/api/v1/location/route` | Web/mobile | Bearer token; configured provider or deterministic safe fallback | `PUBLIC_CANONICAL` | Location adapter; it never becomes booking authority. |
| Gateway | GET, POST | `/api/v1/healthcare/patients`, `/api/v1/healthcare/patients/default` | Web/mobile | Bearer token; Healthcare actor-patient ownership | `PUBLIC_CANONICAL` | Patient link/default selection remains Healthcare-owned. |
| Gateway | GET, POST | `/api/v1/healthcare/patients`, `/api/v1/healthcare/patients/{patientId}/default` | Web/mobile | Bearer token; Gateway actor scope plus Healthcare actor assertion and idempotency for writes | `PUBLIC_CANONICAL` | Healthcare-owned patient links; the Gateway is only the public boundary. |
| Gateway | GET | `/api/v1/services`, `/api/v1/services/catalog`, `/api/v1/services/{service}` | Web/mobile | Bearer token; typed domain clients | `PUBLIC_CANONICAL` | Service Hub entry points, degraded/partial-aware browse. |
| Gateway | GET, POST, PATCH, DELETE | `/api/v1/service-actions/food/**`, `/api/v1/service-actions/restaurant/**`, `/api/v1/service-actions/healthcare/**`, `/api/v1/service-actions/ride/**` | Web/mobile | Bearer token; typed domain clients; idempotency on writes | `PUBLIC_CANONICAL` | Gateway-only browse, cart, hold, slot, and Ride confirmation actions; domain services remain state owners. |
| Gateway | POST | `/api/v1/services/ride/quote` | Web/mobile | Bearer token plus required `Idempotency-Key`; Ride typed client | `PUBLIC_CANONICAL` | Actor-scoped Ride quote. |
| Gateway | POST | `/api/v1/service-actions/ride/prepare` | Web/mobile | Bearer token plus required `Idempotency-Key`; first confirmation evidence | `PUBLIC_CANONICAL` | Creates an `AWAITING_CONFIRMATION` Ride booking projection from the authoritative quote. |
| Gateway | POST | `/api/v1/service-actions/ride/{bookingId}/confirm` | Web/mobile | Bearer token plus required `Idempotency-Key`; final confirmation evidence | `PUBLIC_CANONICAL` | Executes the second confirmation through Ride; status remains domain-authoritative, including `NO_DRIVER`. |
| Gateway | GET | `/api/v1/rides/{bookingId}/tracking` | Web/mobile | Bearer token; actor-scoped Ride typed client | `PUBLIC_CANONICAL` | Pollable tracking snapshot with route/current location. |
| Gateway | GET | `/api/v1/history`, `/api/v1/history/{type}/{id}` | Web/mobile | Bearer token; actor-scoped domain reads | `PUBLIC_CANONICAL` | Unified history with service/status/date filters, pagination, partial dependency reporting and authoritative detail links. |
| Gateway | POST | `/api/v1/recommendations/rank` | Web/mobile | Bearer token; read-only deterministic rank adapter | `PUBLIC_CANONICAL` | V1 ranking by relevance/location/ETA/price/rating; no ML or side effect. |
| Gateway | POST, GET | `/api/v1/workflows/multi-service/plan`, `/api/v1/workflows/multi-service/{workflowId}` | Web/mobile/internal orchestration UI | Bearer token; Core actor scope plus required idempotency for writes | `PUBLIC_CANONICAL` | Durable plan state; selected domain resources remain authoritative. |
| Gateway | POST | `/api/v1/workflows/multi-service/{workflowId}/steps/{stepId}/result` | Typed Gateway/domain workflow caller | Bearer token plus required `Idempotency-Key` | `PUBLIC_CANONICAL` | Applies dependency policy to a typed result; no direct domain SQL. |
| Gateway | POST | `/api/v1/workflows/multi-service/{workflowId}/compensations/{compensationId}/result` | Typed Gateway/domain workflow caller | Bearer token plus required `Idempotency-Key` | `PUBLIC_CANONICAL` | Explicit compensation result; Healthcare is never auto-cancelled by Ride failure. |
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
| Gateway | GET | `/internal/tools/registry-v2` | Agent service | `X-Internal-Service-Token` | `INTERNAL` | Versioned capability registry; validates policy metadata and never exposes domain authority to browsers. |
| Gateway | POST | `/api/v1/chat` | Web/mobile/demo tests | Legacy `X-Actor-Id` development identity; no real auth | `LEGACY_COMPAT` | Migrate Ride consumers to `/api/v1/assistant/chat` and `/api/v1/assistant/actions`; do not remove before tests/demo migrate. |
| Gateway | POST | `/api/v1/workflows/{workflowId}/confirm-service` | Web/mobile/demo tests | Legacy `X-Actor-Id` and Gateway confirmation state | `LEGACY_COMPAT` | Migrate Ride to assistant action descriptors and explicit confirmation. |
| Gateway | POST | `/api/v1/workflows/{workflowId}/confirm-payment` | Web/mobile/demo tests | Legacy `X-Actor-Id` and Gateway payment sandbox | `LEGACY_COMPAT` | Migrate Ride to assistant action descriptors and explicit payment confirmation. |
| Gateway | POST | `/api/v1/restaurant-workflows/chat` | Web/mobile/demo tests | Bearer demo token; Gateway/Agent/domain adapters | `LEGACY_COMPAT` | Migrate to `/api/v1/assistant/chat`; retain explicit confirmation through assistant actions. |
| Gateway | POST | `/api/v1/restaurant-workflows/confirm` | Web/mobile/demo tests | Bearer demo token, confirmation, idempotency | `LEGACY_COMPAT` | Migrate to the `restaurant_confirm` assistant action. |
| Gateway | POST | `/api/v1/healthcare-workflows/chat` | Web/mobile/demo tests | Bearer demo token; Gateway/Agent/domain adapters | `LEGACY_COMPAT` | Migrate to `/api/v1/assistant/chat`; keep Healthcare confirmation/payment gates. |
| Gateway | POST | `/api/v1/healthcare-workflows/payment` | Web/mobile/demo tests | Bearer demo token, idempotency, actor-scoped Healthcare call | `LEGACY_COMPAT` | Migrate to the `healthcare_payment` assistant action. |
| Gateway | POST | `/api/v1/healthcare-workflows/confirm` | Web/mobile/demo tests | Bearer demo token, confirmation, idempotency | `LEGACY_COMPAT` | Migrate to the `healthcare_confirm` assistant action. |
| Gateway | GET | `/internal/tools` | Agent service | `X-Internal-Service-Token` | `INTERNAL` | Agent capability discovery only; never expose to browsers. |

The checked-in `gateway-v1.yaml` documents the Phase 2–9 Gateway additions above. A route may still be runtime-dependent on a domain service or external location provider; that is reported as a degraded/partial response or an explicit unverified runtime check, not as fabricated data. The current live acceptance exercised the public Food, Ride, Restaurant and Healthcare transactions, including idempotent replay and actor-scoped history.

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
| POST | `/v1/quotes` | Internal token, actor assertion, idempotency; validates `passenger_count` against Ride-owned versioned capacity policy | `INTERNAL` |
| GET | `/v1/quotes/{quote_id}` | Internal token plus actor assertion | `INTERNAL` |
| POST | `/v1/bookings:prepare` | Internal token, actor assertion, idempotency, first confirmation evidence bound to passenger/capacity snapshot | `INTERNAL` |
| POST | `/v1/bookings/{booking_id}:confirm` | Internal token, actor assertion, idempotency, final confirmation evidence bound to passenger/capacity snapshot | `INTERNAL` |
| POST | `/v1/bookings/{booking_id}:cancel` | Internal token, actor assertion, idempotency, cancellation evidence | `INTERNAL` |
| GET | `/v1/bookings/{booking_id}` | Internal token plus actor assertion | `INTERNAL` |
| GET | `/v1/bookings/{booking_id}/tracking` | Internal token plus actor assertion | `INTERNAL` |

### Restaurant service

| Method | Path | Auth boundary | Classification |
| --- | --- | --- | --- |
| GET | `/health/live` | none; liveness | `INTERNAL` |
| GET | `/health/ready` | none; readiness | `INTERNAL` |
| GET | `/v1/restaurants` | Internal token plus actor assertion | `INTERNAL` |
| GET | `/v1/restaurants/{restaurant_id}` | Internal token plus actor assertion | `INTERNAL` |
| POST | `/v1/restaurants/{restaurant_id}/availability` | Internal token plus actor assertion; 30-second snapshot identity/version/expiry | `INTERNAL` |
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
| GET | `/api/v1/facilities/{facility_source_id:path}` | Internal token; Healthcare-owned active catalog lookup, including slash-bearing source IDs | `INTERNAL` |
| GET | `/api/v1/doctors` | Internal token | `INTERNAL` |
| POST | `/api/v1/slots/hold` | Internal token, actor assertion, idempotency | `INTERNAL` |
| GET | `/api/v1/appointments/{appointment_id}` | Internal token plus actor assertion | `INTERNAL` |
| POST | `/api/v1/payment/webhook` | Internal token, actor assertion, idempotency; local acknowledgement only | `INTERNAL` |
| POST | `/api/v1/appointments/{appointment_id}/confirm` | Internal token, actor assertion, idempotency, Gateway confirmation | `INTERNAL` |
| POST | `/api/v1/appointments/{appointment_id}/cancel` | Internal token, actor assertion, idempotency | `INTERNAL` |

## Legacy/deprecated non-runtime surface

`services/healthcare-sandbox/src/main.py` contains a standalone mock with `/api/v1/departments`, `/api/v1/doctors`, `/api/v1/slots/hold`, `/api/v1/appointments/{appointment_id}/confirm`, `/api/v1/appointments/{appointment_id}/cancel`, and `/api/v1/payment/webhook`. It is not wired into Compose or Gateway and is classified `DEPRECATED`; use `services/healthcare-service` through Gateway for any current flow. It must not be read as a second Healthcare owner.

The legacy Food address route remains a private domain compatibility endpoint; the canonical saved-address API is the actor-scoped Gateway resource above. All new public browser callers must use Gateway routes and the `gateway-v1.yaml` contract.

## Product/Ops and Admin Gateway routes (2026-08-13)

| Owner | Method | Path | Caller | Auth boundary | Classification | Replacement / migration path |
| --- | --- | --- | --- | --- | --- | --- |
| Gateway | GET, POST | `/api/v1/notifications`, `/api/v1/notifications/unread-count` | Web/mobile | Bearer actor scope; event/reminder projection is idempotent | `PUBLIC_CANONICAL` | Durable Core notification center. |
| Gateway | POST | `/api/v1/notifications/{id}/read`, `/api/v1/notifications/read-all` | Web/mobile | Bearer actor scope | `PUBLIC_CANONICAL` | Actor-owned read state only. |
| Gateway | GET, POST, DELETE | `/api/v1/favorites`, `/api/v1/favorites/{id}` | Web/mobile | Bearer actor scope; owning-domain resource validation | `PUBLIC_CANONICAL` | Core stores references; the domain remains authoritative. |
| Gateway | GET, POST | `/api/v1/feedback/mine`, `/api/v1/feedback` | Web/mobile | Bearer actor scope; completed-resource ownership validation | `PUBLIC_CANONICAL` | Product feedback, not Agent evaluation. |
| Gateway | GET, POST | `/api/v1/support/tickets`, `/api/v1/support/tickets/{id}/messages` | Web/mobile | Bearer actor scope and linked-resource validation | `PUBLIC_CANONICAL` | Durable Core support timeline. |
| Gateway | POST | `/api/v1/reorders/{food|ride|restaurant|healthcare}/{resourceId}` | Web/mobile | Bearer actor scope; fresh current-domain validation | `PUBLIC_CANONICAL` | Preparation only; never replays old price, hold or final action. |
| Gateway | GET | `/api/v1/admin/summary`, `/users`, `/transactions`, `/payments`, `/workflows` | Admin Web | Server-side AdminGuard | `PUBLIC_CANONICAL` | Operational reads assembled through typed domain clients. |
| Gateway | GET | `/api/v1/admin/datasets`, `/system-health`, `/support-tickets` | Admin Web | Server-side AdminGuard | `PUBLIC_CANONICAL` | Dataset freshness and dependency health are explicit. |
| Gateway | PATCH | `/api/v1/admin/support-tickets/{id}` | Admin Web | Server-side AdminGuard plus required idempotency key | `PUBLIC_CANONICAL` | Same-payload replay returns the same ticket without a second audit side effect. |
