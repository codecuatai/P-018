# Domain services in the P-018 monorepo

`apps/backend` is the Agent/API gateway. It is the only service the browser calls directly.
The Agent calls domain services through HTTP contracts:

```text
Web :3000/5173 -> Agent :8002 -> Ride :8000 -> Payment :8001
```

`apps/services/ride_service` owns quotes, bookings, drivers, fare finalization, and the Ride-owned Payment boundary. `apps/services/payment_service` owns the payment-intent lifecycle and its own database. Neither service imports the other service's database or repository.

For local development:

```powershell
make run-services
make run-backend
make run-web
```

For the full containerized stack:

```powershell
docker compose up --build
```

Container-to-container URLs use service names (`http://ride-service:8000` and `http://payment-service:8001`). Host URLs are only used by the browser or local, non-container development.

Each service has its own database setting and test suite. Do not commit `.env`, SQLite databases, logs, virtual environments, or generated caches.

Live address quotes require GEOAPIFY_API_KEY in the P-018 .env. The service must return a clear 503 when no route provider is configured; it must not invent distance or fare data.
