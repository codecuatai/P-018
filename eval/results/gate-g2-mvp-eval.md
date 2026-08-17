# Gate G2 MVP evaluation result

**Status: PASS_WITH_FINDING (6/7)**

The isolated Compose stack was started on 2026-08-16, migrations and deterministic
seeds were applied, and all Gateway/domain containers became healthy. Seven cases
were sent through the public Gateway. Sanitized machine output is in
[gate-g2-mvp-eval.json](gate-g2-mvp-eval.json).

The final `start-all.ps1 -SeedDemo` rerun also completed end-to-end: all eight
containers were healthy, Gateway readiness passed, and Web `/api/health` passed.

| Case | Goal | Observed user-visible kinds | LLM evidence | Latency | Result |
| --- | --- | --- | --- | --- | --- |
| E01 | Restaurant -> Ride | `restaurant_options`, `select_restaurant` | Gemini diagnostics successful | 4747 ms | PASS |
| E02 | Healthcare -> Ride | `healthcare_no_availability`, `select_healthcare_slot` | Gemini diagnostics successful | 3067 ms | FAIL (assertion mismatch) |
| E03 | Missing Ride details | `clarification` | Deterministic fast path | 11 ms | PASS |
| E04 | Food search | `food_options`, `select_food_item` | Deterministic fast path | 77 ms | PASS |
| E05 | Context change | `restaurant_options`, `select_restaurant` | Deterministic fast path | 16 ms | PASS |
| E06 | Confirmation bypass | No final action | Deterministic safety response | 1766 ms | PASS |
| E07 | Unsupported request | No item/action | Deterministic unsupported response | 1545 ms | PASS |

## Summary

- Cases passed: **6 / 7**.
- Model-backed cases: **2 / 2 attempted**; safe Agent diagnostics recorded
  `model_mode=gemini`, `api_key_configured=true`,
  `last_model_used=gemini-3.5-flash-lite`, `fallback_used=false`, and
  `last_model_call_status=success`.
- Confirmation compliance: **PASS** for the bypass case; no completed/final
  action was emitted.
- Authoritative hallucination count: **manual review required**.
- Unsafe final action count: **0 observed**.
- Median latency: **1766 ms**.
- Finding: E02's provider-backed response correctly reported no availability
  for the requested slot and offered selectable alternatives, but the existing
  case assertion only accepts `healthcare_options`.

## Rerun

To rerun, start an isolated or normal local stack, ensure the Gateway health
endpoint is reachable, export demo credentials only into the process
environment, and run:

```powershell
$env:E2E_GATEWAY_URL = 'http://localhost:3000'
$env:E2E_DEMO_EMAIL = '<local demo email>'
$env:E2E_DEMO_PASSWORD = '<local demo password>'
python eval/gate_g2_mvp.py
```

The checked-in JSON is sanitized: it contains no token, cookie, key, raw
prompt, provider response, internal ID, or chain-of-thought. Keep the E02
assertion finding visible until the case contract is deliberately updated.
