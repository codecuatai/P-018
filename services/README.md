# Domain Services

Each domain service owns one bounded domain and one logical PostgreSQL database. The common layout is `api` → `application` → `domain`, with repository interfaces/adapters at the persistence edge. Read [AGENTS.md](AGENTS.md) before editing.

## Deployable owners

| Directory | Domain | Container port | Internal API prefix | Database |
| --- | --- | ---: | --- | --- |
| [ride-service/](ride-service/) | Ride quotes and booking simulation | 8101 | `/v1` | `xone_ride` |
| [restaurant-service/](restaurant-service/) | Dine-in table reservations | 8102 | `/v1` | `xone_restaurant` |
| [healthcare-service/](healthcare-service/) | Departments, doctors, appointment slots | 8103 | `/api/v1` | `xone_healthcare` |
| [food-service/](food-service/) | Menus, carts, food orders, delivery | 8104 | `/api/v1` | `xone_food` |

None of the four is published to the host. All are reachable only on the `xone_internal` Compose network under their service name, and every route is gated by `INTERNAL_SERVICE_TOKEN`. The declarations differ slightly: `food-service` declares `expose: ["8104"]`, while `ride-service`, `restaurant-service`, and `healthcare-service` declare neither `ports:` nor `expose:` — under Compose networking they are still reachable container-to-container, so the effect is the same. Only the Gateway calls them.

`healthcare-sandbox/` is **not** one of these. It is an unwired standalone FastAPI mock of an external clinic provider — no Dockerfile, no tests, no migrations, no Compose entry, and no caller in the running stack. See [healthcare-sandbox/README.md](healthcare-sandbox/README.md).

## Running one service alone

Use its `.env.example` as a reference for the process environment, then run its FastAPI entry point. For the complete stack use only root `.env` with Docker Compose — service-level `.env.example` files are never read by Compose.

Run tests from the service directory:

```bash
python -m pytest tests -q
```

## Migrations and seeds

Migration style is **per owner** — there is no single repository-wide convention, so follow the one your service already uses:

| Service | Style | Current revisions |
| --- | --- | --- |
| ride-service | Alembic (`migrations/versions/`) | `20260806_0001_ride_simulation.py` |
| restaurant-service | Alembic (`migrations/versions/`) | `0001` … `0003` |
| healthcare-service | Ordered raw SQL (`migrations/*.sql`) | `001` … `003` |
| food-service | Ordered raw SQL (`migrations/*.sql`) | `001` … `005` |

Every schema change needs a new revision or a new numbered `.sql` file in that service's `migrations/` directory — never an edit to an already-applied one. Add deterministic fixtures under `seeds/` when needed; `scripts/check-migration-parity.py` verifies the PowerShell and Bash migration runners apply the same file set.

Seed content also differs by owner: food-service ships `001_demo_hanoi.sql` plus a CSV importer, restaurant-service and healthcare-service ship Python seeders, and ride-service has no seed data.

## Adding a service

Follow [the new-service checklist](../docs/development/new-service-checklist.md): service skeleton, environment/Compose/database ownership, Gateway client, contracts, tests/CI/scripts, and architecture documentation together in one patch.
