# Cross-service E2E tests

`test_food_vertical_slice.py` is a real Gateway-through-Agent-through-Food harness with twelve scenarios covering confirmation, payment/recovery, idempotency, refunds, ownership, conversation append concurrency, security, and restart persistence. Set `E2E_GATEWAY_URL` (and optionally `E2E_AGENT_URL`/`E2E_FOOD_URL`) to run it against a live Compose stack; without those variables pytest skips the external-stack checks explicitly.
