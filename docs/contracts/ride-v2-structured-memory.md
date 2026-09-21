# Ride v2: Structured Memory and Service Contract

## Goal

NaviGo must understand a booking across multiple natural-language turns without
requiring a particular phrase or word order. The AI proposes **structured turn
patches**; deterministic guards decide whether it may call an API. The model
never creates a booking merely because it inferred a likely intention.

`v1` endpoints remain available during migration. New clients use `/v2/rides`.

## Design sources

This contract adapts public ride-platform patterns; it is not an Uber API copy
and does not imply an Uber integration.

- Uber separates available products, request estimates with an expiring fare,
  and the actual ride request.
- Ride creation is asynchronous (`202`) and the returned request has changing
  driver, vehicle, pickup and destination state.
- Webhook delivery can be duplicated and out of order, so consumers dedupe by
  event ID and ignore older resource versions.

## 1. Session memory

### 1.1 Principles

1. Store facts, not a transcript-derived guess.
2. Every value carries provenance: `user`, `geocoder`, `service`, or `system`.
3. A new user correction wins over earlier facts and invalidates dependent
   estimates or confirmation.
4. Execution checks required fields from the service contract, not from a
   phrase-specific regex.
5. Persist compact state in Redis/DB in production; in-memory storage is only
   suitable for a single development worker.

### 1.2 Core models

```json
{
  "session_id": "...",
  "turn": 8,
  "active_domain": "ride",
  "pending_action": "quote",
  "ride": {
    "slots": {
      "pickup": {
        "value": {"address": "Đại học Thủy Lợi"},
        "state": "known",
        "source": "user",
        "confidence": 1.0,
        "updated_turn": 8
      },
      "destination": {
        "value": {"address": "Hồ Gươm"},
        "state": "known",
        "source": "user",
        "confidence": 1.0,
        "updated_turn": 7
      },
      "product_id": {"state": "unknown"},
      "seat_count": {"value": 1, "state": "defaulted", "source": "system"}
    },
    "active_estimate_id": null,
    "active_request_id": null,
    "revision": 3
  }
}
```

`state`: `unknown | known | ambiguous | invalid | defaulted`.

A `TurnPatch` is the only output accepted from language understanding:

```json
{
  "intent": "request_quote",
  "slot_updates": [
    {"slot": "destination", "value": {"address": "Hồ Gươm"}, "confidence": 0.98}
  ],
  "explicit_confirmation": false,
  "corrections": []
}
```

The interpreter receives the compact memory plus recent turns, validates slot
names against the domain schema, and produces this patch. A deterministic
merger applies it. This generalizes across wording; regex remains only as a
low-confidence local fallback when no model is available.

### 1.3 Guards and invalidation

| Operation | Required state |
| --- | --- |
| Resolve location | `pickup.address` or coordinates; same for destination |
| Discover products | resolved pickup coordinates |
| Create estimate | resolved pickup/destination + `product_id` (or explicit default policy) |
| Create request | valid, unexpired `estimate_id` + explicit confirmation + idempotency key |
| Cancel request | active request in a cancellable state + explicit cancellation |

Changing pickup, destination, product, seats, scheduling, promo or payment
selection increments `revision` and clears `active_estimate_id`; a prior “yes”
can never confirm a changed trip.

## 2. Ride lifecycle

```text
COLLECTING
  -> LOCATIONS_RESOLVED
  -> PRODUCTS_AVAILABLE
  -> ESTIMATED (estimate expires)
  -> AWAITING_CONFIRMATION
  -> REQUESTED / MATCHING
  -> DRIVER_ASSIGNED
  -> DRIVER_ARRIVING
  -> IN_PROGRESS
  -> COMPLETED | CANCELLED | FAILED
```

Keep `provider_status` separately from the NaviGo normalized status. The UI
uses normalized status; support/debug uses both.

## 3. API v2

All mutation requests require `Idempotency-Key`; every response carries
`X-Request-Id`. Error bodies use:

```json
{
  "error": {
    "code": "estimate_expired",
    "message": "Báo giá đã hết hạn. Hãy tạo báo giá mới.",
    "retriable": false,
    "details": {"estimate_id": "..."}
  }
}
```

### Location and product discovery

```http
POST /v2/rides/locations:resolve
GET  /v2/rides/products?pickup_latitude=...&pickup_longitude=...
```

`LocationRef` fields:

```json
{
  "address": "string",
  "latitude": 21.0,
  "longitude": 105.0,
  "place_id": "string",
  "provider": "geoapify",
  "country_code": "VNM",
  "instructions": "Cổng chính",
  "formatted_address": "string"
}
```

`RideProduct` fields: `product_id`, `provider_product_id`, `category`,
`display_name`, `capacity`, `baggage_capacity`, `wheelchair_accessible`,
`cash_enabled`, `upfront_fare_enabled`, `image_url`, `availability`.

### Estimate

```http
POST /v2/rides/estimates
```

```json
{
  "pickup": {"place_id": "..."},
  "destination": {"place_id": "..."},
  "product_id": "car_standard",
  "seat_count": 1,
  "pickup_time": "2026-08-06T18:30:00+07:00",
  "promo_code": "SAVE5000",
  "client_context": {"session_id": "...", "locale": "vi-VN"}
}
```

Response contains `estimate_id`, `expires_at`, `currency`, `total`,
`price_components`, `distance_meters`, `duration_seconds`, `pickup_eta_seconds`,
`cancellation_policy`, and an immutable `quote_revision`.

### Request, status, change and cancel

```http
POST   /v2/rides/requests                 # 202 Accepted
GET    /v2/rides/requests/{request_id}
PATCH  /v2/rides/requests/{request_id}    # only allowed before matching
POST   /v2/rides/requests/{request_id}:cancel
GET    /v2/rides/requests/{request_id}/tracking
GET    /v2/rides/requests/{request_id}/receipt
```

Create request body includes `estimate_id`, `rider` (opaque `rider_id`, not
raw credentials), pickup contact/instructions, selected payment method token,
and optional accessibility preferences. The service validates estimate expiry
and revision before creating the request.

`RideRequest` exposes: `request_id`, `status`, `provider_status`,
`product`, `pickup`, `destination`, `driver`, `vehicle`, `driver_location`,
`pickup_eta_seconds`, `destination_eta_seconds`, `payment_status`,
`cancellation`, `created_at`, `updated_at`, `resource_version`.

## 4. Events and webhooks

```http
POST /v2/webhooks/ride-provider
```

Envelope:

```json
{
  "event_id": "evt_...",
  "event_type": "ride.status_changed",
  "occurred_at": "2026-08-06T...Z",
  "request_id": "ride_...",
  "resource_version": 12,
  "provider": "ride_provider",
  "data": {"status": "DRIVER_ASSIGNED", "provider_status": "accepted"}
}
```

Verify the provider signature against the raw request body, dedupe `event_id`,
and apply only an event whose `resource_version` is newer than the stored one.
Return `2xx` only after durable processing. Retry policy belongs to the sender
or queue, never to the chat model.

## 5. Migration

1. Add v2 schemas and service adapters; keep `/v1/rides/*` unchanged.
2. Introduce structured session memory and TurnPatch merger behind a feature
   flag.
3. Make Concierge call v2 estimate/request adapters.
4. Move UI to v2 only after contract tests pass.
5. Deprecate v1 after a compatibility window; do not remove it during demo.
