# Cross-service E2E tests

This is the cross-service layer: it drives the real Gateway together with Agent,
Ride, Restaurant, Healthcare and Food, and reaches into the stack with
`docker compose exec`/`restart`. It requires the Docker Compose runtime and does
not work against the direct-process runtime (`scripts/local-dev.ps1`).

Run the suite against a running Compose Gateway with:

```bash
E2E_GATEWAY_URL=http://localhost:3000 python -m pytest tests/e2e -q
```

From the root workspace, the equivalent script is `corepack pnpm
test:e2e:crossservice`. It is deliberately not named `test:e2e`, which in
`apps/web` means the Playwright browser suite.

`scripts/local-acceptance.ps1` runs this suite as a mandatory step and derives
the environment below from its `-EnvFile`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `E2E_GATEWAY_URL` | unset | Published Gateway base URL. Required. |
| `E2E_REQUIRE_GATEWAY` | unset | When truthy, a missing `E2E_GATEWAY_URL` is a `UsageError` instead of an all-skip pass. |
| `E2E_COMPOSE_PROJECT_NAME` | `p-018` | Keeps the SQL/restart helpers aligned with the Gateway stack. |
| `E2E_COMPOSE_ENV_FILE` | `.env.example` | Env file passed to `docker compose`. |
| `E2E_DEMO_EMAIL` / `E2E_DEMO_PASSWORD` | `.env.example` demo values | Local demo login. |
| `E2E_TOKEN_TTL_SECONDS` | `600` | Access-token cache lifetime. |

For a non-default Compose project:

```bash
E2E_GATEWAY_URL=http://localhost:3000 E2E_COMPOSE_PROJECT_NAME=xone_final_qa2 python -m pytest tests/e2e -q
```

The checked-in suites are:

- `test_food_vertical_slice.py`: Gateway → Agent → Food ordering, confirmation, payment/recovery, idempotency, refunds, ownership, security, and restart persistence.
- `test_four_domain_workflows.py`: public Ride two-step confirmation, Restaurant hold/final confirmation, and Healthcare hold/payment/final confirmation/cancel plus expired-hold rejection and slot reuse.
- `test_unified_assistant.py`: one unified Gateway Assistant chat/actions surface for Food, Ride, Restaurant, and Healthcare, including action replay/staleness, authoritative Food payment, prerequisite-gated Ride handoff, and Food-plus-Healthcare choice ambiguity.

Shared fixtures live in `_helpers.py`, imported absolutely (`from _helpers import
...`). This directory has no `__init__.py`, so under pytest's default `prepend`
import mode a relative import such as `from .conftest import ...` fails
collection with "attempted relative import with no known parent package".
`_helpers` also owns the access-token cache that keeps a full-suite run inside
the Gateway's per-IP login limiter.

The tests use normal API discovery for domain resources; direct SQL is limited to
local test-infrastructure setup/inspection, including Healthcare expiry without
waiting for the production TTL. If `E2E_GATEWAY_URL` is missing the live tests
skip, and `SKIPPED` live E2E is not an acceptance pass — set
`E2E_REQUIRE_GATEWAY=1` in any run that claims acceptance.
