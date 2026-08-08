# Cross-service E2E tests

Run the live suite against a running Compose Gateway with:

```bash
E2E_GATEWAY_URL=http://localhost:3000 python -m pytest tests/e2e -q
```

For a non-default Compose project, set `E2E_COMPOSE_PROJECT_NAME` to keep the local SQL and restart helpers aligned with the Gateway stack, for example:

```bash
E2E_GATEWAY_URL=http://localhost:3000 E2E_COMPOSE_PROJECT_NAME=xone_final_qa2 python -m pytest tests/e2e -q
```

The checked-in suites are:

- `test_food_vertical_slice.py`: Gateway → Agent → Food ordering, confirmation, payment/recovery, idempotency, refunds, ownership, security, and restart persistence.
- `test_four_domain_workflows.py`: public Ride two-step confirmation, Restaurant hold/final confirmation, and Healthcare hold/payment/final confirmation/cancel plus expired-hold rejection and slot reuse.

The tests use normal API discovery for domain resources; direct SQL is limited to local test-infrastructure setup/inspection, including Healthcare expiry without waiting for the production TTL. Set `E2E_GATEWAY_URL` and valid local demo credentials through environment variables. If `E2E_GATEWAY_URL` is missing, the live tests may be skipped; `SKIPPED` live E2E is not an acceptance pass.
