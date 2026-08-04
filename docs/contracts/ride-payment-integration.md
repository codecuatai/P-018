# Integration models and API contract

This document is the local MVP contract for frontend and other services. The source of truth is also available in Swagger:

- Ride: `http://localhost:8000/docs`
- Payment: `http://localhost:8001/docs`

## General conventions

| Rule | Value |
| --- | --- |
| API version | `/v1` |
| JSON format | `snake_case` fields |
| Monetary values | Integer VND only. Never send a float such as `50000.5`. |
| Timestamps | ISO-8601 datetime strings, for example `2026-08-03T18:30:00+07:00` |
| IDs | Server-generated strings: `quote_*`, `ride_*`, `pi_*` |
| Nullable fields | May be `null` when the value is not available yet. |
| API errors | FastAPI JSON: `{ "detail": "..." }` with HTTP 4xx/5xx. |

All state-changing requests should include a unique `Idempotency-Key` header. Repeat the exact logical action with the same key after a timeout; the service returns the previously created resource instead of processing it twice.

```http
Idempotency-Key: 7c7a4ff4-5d9a-4a14-85f9-a8f8a16d1d48
```

Use a different key for a different operation. For example, do not reuse a booking-create key for `complete`.

## Ride Service

Base URL: `http://localhost:8000`

### Endpoints

| Method | Path | Main request model | Response model | Idempotency-Key |
| --- | --- | --- | --- | --- |
| POST | `/v1/rides/quotes` | `QuoteCreate` | `QuoteOut` | No |
| POST | `/v1/rides/quotes/live` | `LiveQuoteCreate` | `LiveQuoteOut` | No |
| POST | `/v1/rides/bookings` | `BookingCreate` | `BookingOut` | Yes |
| GET | `/v1/rides/bookings/{booking_id}` | - | `BookingOut` | No |
| POST | `/v1/rides/bookings/{booking_id}/finalize-fare` | `FinalizeFareInput` | `BookingOut` | Yes |
| POST | `/v1/rides/bookings/{booking_id}/complete` | - | `BookingOut` | Yes |
| POST | `/v1/rides/bookings/{booking_id}/cancel` | - | `BookingOut` | Yes |
| GET | `/v1/audit-logs?limit=100` | - | `AuditLogOut[]` | No |

### `QuoteCreate` - manual quote request

```json
{
  "distance_km": 6,
  "duration_minutes": 14,
  "weather": "CLEAR",
  "promo_code": "SAVE5000",
  "vehicle_type": "CAR_4",
  "demand_level": "AUTO",
  "pickup_time": "2026-08-03T18:30:00+07:00"
}
```

| Field | Type and constraints | Description |
| --- | --- | --- |
| `distance_km` | integer, 1-200 | Route length for a manually supplied quote. |
| `duration_minutes` | integer, 1-600 | Estimated route duration. |
| `weather` | `CLEAR` or `RAIN`; default `CLEAR` | Local simulation input. |
| `promo_code` | string or null | Currently `SAVE5000` discounts 5,000 VND. |
| `vehicle_type` | `BIKE`, `CAR_4`, `CAR_7`; default `CAR_4` | Selects the tariff. |
| `demand_level` | `AUTO`, `LOW`, `NORMAL`, `HIGH`; default `AUTO` | `AUTO` is `HIGH` at 07:00-09:00 and 17:00-20:00 (UTC+7), otherwise `NORMAL`. |
| `pickup_time` | ISO-8601 datetime or null | Used by peak-hour and AUTO demand calculation. |

### `LiveQuoteCreate` - route and weather quote request

Supply either an address or both coordinates for **each** endpoint. Coordinates are preferred after the user drops a map pin.

```json
{
  "pickup_latitude": 21.0069895,
  "pickup_longitude": 105.825101,
  "dropoff_address": "50 Luong The Vinh, Ha Dong, Ha Noi",
  "vehicle_type": "CAR_4",
  "demand_level": "AUTO",
  "promo_code": "SAVE5000"
}
```

| Field group | Type | Required rule |
| --- | --- | --- |
| `pickup_address`, `dropoff_address` | string, 3-300 chars | An address may be supplied for either endpoint. |
| `pickup_latitude`, `pickup_longitude`, `dropoff_latitude`, `dropoff_longitude` | number, valid WGS-84 bounds | If an endpoint has no address, both latitude and longitude are required. |
| `pickup_place_id`, `dropoff_place_id` | string or null | Optional provider place references retained in the quote snapshot. |
| `promo_code`, `vehicle_type`, `demand_level`, `pickup_time` | Same meaning as `QuoteCreate` | Optional/defaulted as above. |

It requires `GEOAPIFY_API_KEY`. The response includes provider-normalized locations, route meters/seconds and current weather. `traffic_level` is currently `FREE_FLOW_PROVIDER`; it is not live congestion data.

### `QuoteOut` - persisted price snapshot

The quote is immutable for a booking and exposes the exact pricing snapshot:

| Field group | Fields |
| --- | --- |
| Identity | `id`, `created_at`, `tariff_version`, `quote_source` (`MANUAL` or `LIVE`) |
| Route | `distance_km`, `duration_minutes`, `distance_meters`, `duration_seconds` |
| Locations | `pickup_address`, `pickup_latitude`, `pickup_longitude`, `pickup_place_id`, and equivalent `dropoff_*` fields |
| Conditions | `weather`, `weather_source`, `traffic_level`, `demand_level`, `demand_multiplier_bps` |
| Price, all integer VND | `base_fee`, `distance_fee`, `time_fee`, `weather_surcharge`, `peak_surcharge`, `demand_surcharge`, `discount`, `amount` |

Use `amount` as the rider-facing estimate. `distance_km` and `duration_minutes` are rounded up from live routing meters/seconds.

### `BookingCreate`

```json
{
  "quote_id": "quote_abc123",
  "scenario": "HAPPY_PATH"
}
```

| Field | Type | Description |
| --- | --- | --- |
| `quote_id` | string | Existing quote ID. |
| `scenario` | see scenario table; default `HAPPY_PATH` | Local/staging simulation control. Do not expose this in a production client. |
| `payment_method` | string or null | Optional override; otherwise it is selected from the scenario. |

A successful driver assignment creates a Payment Intent and authorizes 120% of `QuoteOut.amount`. The extra headroom allows the final amount to include real duration, waiting and tolls.

### `BookingOut`

| Field group | Fields |
| --- | --- |
| Identity and quote | `id`, `quote_id`, `created_at`, `updated_at`, `currency` |
| Money, integer VND | `amount` (estimate), `authorized_amount` (authorization ceiling), `final_amount` (null until finalized) |
| Payment | `payment_intent_id`, `payment_method`, `status`, `last_error` |
| Driver assignment | `driver_id`, `driver_attempts`, `driver_status`, `driver_eta_seconds`, `driver_latitude`, `driver_longitude`, `driver` |
| Simulation | `scenario` |

`driver` is `null` until a driver is assigned, including `PAYMENT_DECLINED` and `NO_DRIVER`.

### Nested `DriverOut`

```json
{
  "id": "driver_simulated_001",
  "display_name": "Minh Anh",
  "phone_masked": "*** *** 4821",
  "rating": 4.9,
  "total_trips": 1842,
  "avatar_color": "#2563EB",
  "status": "ASSIGNED",
  "vehicle": {
    "type": "CAR_4",
    "make": "Toyota",
    "model": "Vios",
    "color": "Trắng",
    "license_plate": "30H-482.19"
  },
  "eta_seconds": 240,
  "current_location": {"latitude": 21.012, "longitude": 105.794}
}
```

`DriverOut.vehicle.type` is one of `BIKE`, `CAR_4`, `CAR_7`. Driver identities are fixed local fixtures, not real people or live driver availability.

### `FinalizeFareInput`

Call this before `complete` when the trip has ended.

```json
{
  "actual_duration_seconds": 900,
  "gps_points": [
    {"latitude": 21.0069, "longitude": 105.8251, "recorded_at": "2026-08-03T18:35:00+07:00"},
    {"latitude": 21.0120, "longitude": 105.8300, "recorded_at": "2026-08-03T18:50:00+07:00"}
  ],
  "waiting_seconds": 120,
  "toll_fee": 10000
}
```

| Field | Type and constraints | Description |
| --- | --- | --- |
| `actual_duration_seconds` | integer, 1-86,400 | Required actual trip duration. |
| `actual_distance_meters` | integer, 1-2,000,000 or null | Preferred when supplied by a trusted tracker. |
| `gps_points` | list of coordinate objects | If no `actual_distance_meters`, send at least two points; the service calculates haversine distance. |
| `waiting_seconds` | integer, 0-14,400 | Adds tariff waiting fee. |
| `toll_fee` | integer VND, 0-5,000,000 | Adds the supplied toll. |

If `final_amount` is above `authorized_amount`, the API returns HTTP 409. The client must show that additional authorization is required; it must not call `complete` again until this is resolved.

### Ride booking states and simulations

| State / scenario | Meaning for client |
| --- | --- |
| `PENDING_PAYMENT` | Transient state while authorization runs. |
| `PAYMENT_DECLINED` | Do not search a driver; show `last_error`. |
| `NO_DRIVER` | Payment authorization was cancelled; allow a new quote/booking. |
| `DRIVER_ASSIGNED` | Show the nested `driver`, ETA and driver position. |
| `FARE_FINALIZED` | Final amount is ready; call `complete`. |
| `COMPLETED` | Transient state while capture runs. |
| `PAID` | Ride is paid successfully. |
| `PAYMENT_CAPTURE_FAILED` | Capture failed; show `last_error` and retry only under backend policy. |
| `CANCELLED` | Booking was cancelled before capture. |
| `REFUNDED` | A paid booking was refunded. |
| `REFUND_FAILED` | The refund provider simulation failed; show support/retry flow. |

Simulation values: `HAPPY_PATH`, `DRIVER_CANCEL_ONCE`, `NO_DRIVER`, `PAYMENT_DECLINED`, `CAPTURE_FAILED`, `CAPTURE_TIMEOUT_BUT_SUCCEEDED`.

For `CAPTURE_TIMEOUT_BUT_SUCCEEDED`, Payment persists `CAPTURED` then returns HTTP 504. Ride Service automatically reconciles the Payment Intent and returns `PAID`. A direct Payment client receiving 504 must GET the intent before retrying.

## Payment Service

Base URL: `http://localhost:8001`

The frontend should normally call Ride Service only. Ride calls Payment Service server-to-server. Use this API directly only for a back-office or payment integration.

| Method | Path | Request model | Response model | Idempotency-Key |
| --- | --- | --- | --- | --- |
| POST | `/v1/payment-intents` | `PaymentIntentCreate` | `PaymentIntentOut` | Yes |
| GET | `/v1/payment-intents/{intent_id}` | - | `PaymentIntentOut` | No |
| POST | `/v1/payment-intents/{intent_id}/authorize` | - | `PaymentIntentOut` | Yes |
| POST | `/v1/payment-intents/{intent_id}/capture` | optional `CaptureRequest` | `PaymentIntentOut` | Yes |
| POST | `/v1/payment-intents/{intent_id}/cancel` | - | `PaymentIntentOut` | Yes |
| POST | `/v1/payment-intents/{intent_id}/refund` | - | `PaymentIntentOut` | Yes |

### `PaymentIntentCreate`

```json
{
  "resource_type": "RIDE_BOOKING",
  "resource_id": "ride_abc123",
  "amount": 50000,
  "currency": "VND",
  "payment_method": "pm_success"
}
```

| Field | Type and constraints | Description |
| --- | --- | --- |
| `resource_type` | string, 1-50 chars | Generic owner type; Ride uses `RIDE_BOOKING`. |
| `resource_id` | string, 1-40 chars | ID in the owner system. |
| `amount` | positive integer VND | Maximum amount that may be captured. |
| `currency` | 3-character string; default `VND` | MVP currently uses VND. |
| `payment_method` | string; default `pm_success` | Local provider simulation token. |

`CaptureRequest` is optional. Omit the body to capture the whole authorized amount, or send:

```json
{"amount": 42000}
```

The capture amount must be positive and cannot exceed `PaymentIntentOut.amount`.

### `PaymentIntentOut`

| Field | Description |
| --- | --- |
| `id` | Payment Intent ID, prefixed `pi_`. |
| `resource_type`, `resource_id` | Generic resource reference supplied at creation. |
| `amount` | Authorized maximum, integer VND. |
| `captured_amount` | Actual captured VND, null before a successful capture. |
| `currency`, `payment_method` | Creation inputs. |
| `status`, `last_error` | Current payment state and provider reason when present. |
| `created_at`, `updated_at` | ISO-8601 timestamps. |

Payment statuses are `PENDING`, `AUTHORIZED`, `DECLINED`, `CAPTURED`, `CAPTURE_FAILED`, `CANCELLED`, and `REFUNDED`.

### Local payment tokens

| Token | Effect |
| --- | --- |
| `pm_success` | Authorize/capture/refund succeeds. |
| `pm_declined` | Authorize returns `DECLINED`. |
| `pm_capture_failed` | Capture returns `CAPTURE_FAILED`. |
| `pm_capture_timeout_succeeded` | Capture persists `CAPTURED`, then endpoint returns HTTP 504. Reconcile with GET. |
| `pm_refund_failed` | Refund leaves the intent captured and adds `last_error`. Ride maps this to booking `REFUND_FAILED`. |

## Browser access and CORS

Ride allows these local browser origins by default: `http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:5173`, `http://127.0.0.1:5173`.

Set `RIDE_CORS_ORIGINS` as a comma-separated list before starting Ride when the frontend uses another origin:

```powershell
$env:RIDE_CORS_ORIGINS = "http://localhost:4200,http://127.0.0.1:4200"
uvicorn apps.ride_service.main:app --port 8000
```

Payment has no browser CORS configuration because it is designed for the Ride Service, not direct browser calls.

## Minimal frontend flow

```text
POST /v1/rides/quotes/live (or /quotes)
-> POST /v1/rides/bookings with Idempotency-Key
-> GET /v1/rides/bookings/{id} while showing the driver
-> POST /finalize-fare with Idempotency-Key when trip ends
-> POST /complete with Idempotency-Key
-> GET booking and display PAID / failure state
```

On a local machine, the browser calls the Agent at `http://localhost:8002`; the Agent calls Ride at `http://localhost:8000`; Ride calls Payment at `http://127.0.0.1:8001`. In Docker Compose, use the service names `ride-service` and `payment-service`. The two databases remain separate: `ride.db` and `payment.db`.