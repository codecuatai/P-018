# Domain services

This directory contains independently deployable domain services used by the Agent.

- `ride_service`: quotes, bookings, driver simulation, and the Ride-owned payment boundary (`:8000`).
- `payment_service`: payment-intent lifecycle (`:8001`).

Run locally from this directory:

```powershell
python -m uvicorn payment_service.main:app --host 127.0.0.1 --port 8001
python -m uvicorn ride_service.main:app --host 127.0.0.1 --port 8000
```

Each service owns its own database. Set `PAYMENT_DATABASE_URL` and `RIDE_DATABASE_URL` rather than sharing `DATABASE_URL`.