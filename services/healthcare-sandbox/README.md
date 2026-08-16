# Healthcare Provider Sandbox (mock — not deployed)

A standalone FastAPI mock of an **external** clinic provider API. It exists so a Healthcare flow can be poked at by hand without a database; it is not part of the X-One runtime.

Status: `skeleton (not deployed)`. See [current architecture state](../../docs/architecture/current-state.md).

## What it is not

- Not in `docker-compose.yml`, not in `.github/workflows/ci-cd.yml`, and not called by the Gateway, the Agent, or any service.
- Not the Healthcare domain boundary. That is [healthcare-service/](../healthcare-service/) on port 8103, which owns `xone_healthcare` and is the only Healthcare authority.
- Not a deployable owner: it has no Dockerfile, no `.env.example`, no tests, no migrations, and no repository layer.

## Contents

Two tracked files:

```
services/healthcare-sandbox/
├── requirements.txt        # fastapi, uvicorn, pydantic — unpinned
└── src/main.py             # the whole mock
```

## Routes

`main.py` declares literal `/api/v1` paths — there is no router prefix and no versioning helper.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/v1/departments` | Returns all 20 hard-coded departments |
| GET | `/api/v1/doctors?department=<name>` | Exact-match filter over 21 hard-coded doctors; required query parameter |
| POST | `/api/v1/slots/hold` | Body `{slot_id, patient_id, symptoms}`; always returns `appointment_id: 9999` |
| POST | `/api/v1/appointments/{appointment_id}/confirm` | Fixed success payload |
| POST | `/api/v1/appointments/{appointment_id}/cancel` | Fixed success payload |
| POST | `/api/v1/payment/webhook` | Body `{appointment_id}`; fixed acknowledgement |

Doctor data is hard-coded with one or two literal slots, then overwritten at import time by a loop that regenerates exactly four slots per doctor from a `2026-10-10 08:00` base. The literal `available_slots` in the source list are therefore dead data — the loop's IDs (`1001`…`1084`) are what the API actually serves. The loop is wrapped in a bare `except Exception: pass`, so a failure there would silently leave the literal slots in place.

## Deliberate divergences from the real services

These are why it cannot be swapped in for `healthcare-service`:

- **No authentication.** There is no `INTERNAL_SERVICE_TOKEN` check and no actor requirement on any route. Every real domain service gates every route. Do not expose this process on a routable interface.
- **CORS is `allow_origins=["*"]` with credentials enabled.**
- **No health endpoints.** `/health/live` and `/health/ready` are absent, so the Compose healthcheck pattern used by every real service would fail against it.
- **Idempotency is a process-local `dict` keyed only by header value** — not scoped by actor, route, or payload, and lost on restart. The same `Idempotency-Key` sent to `hold`, then to `confirm`, replays the *hold* response. Real services scope and persist replay evidence.
- **No persistence.** No database, no migrations, no state transitions.

## What it does follow

Response shape matches the [API conventions](../../docs/api/api-conventions.md): success is `{"data": …, "meta": {"request_id": "cor_…", "timestamp": …}}`, and errors use the RFC-7807-inspired body with `type`, `title`, `status`, `code`, `detail`, `retryable`, `request_id`. Prices are integer VND minor-unit-free amounts consistent with the rest of the platform.

## Running it

```bash
pip install -r requirements.txt
python -m uvicorn src.main:app --reload --port 8113
```

Pick a port that does not collide with the domain services (8101–8104). Bind to loopback only, given there is no auth.
