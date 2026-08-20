# Gate G2 evaluation

This directory is the canonical evidence location for the small Gate G2 MVP
evaluation. It is not a production benchmark and it does not use fabricated
accuracy, satisfaction, or latency claims.

- [Manual cases](manual-cases.md) defines the seven product/safety scenarios.
- [Result report](results/gate-g2-mvp-eval.md) records the state of the current
  audit run and links to sanitized machine output when an executable stack is
  available.
- `eval/gate_g2_mvp.py` runs the public-Gateway cases and writes only
  sanitized user-visible summaries.
- `eval/core_agent_deterministic.py` reports aggregate compatibility and p95
  latency over the 200 checked-in synthetic cases. It never prints case
  prompts and does not count as the required provider-backed release set.
- `eval/core_agent_provider_release.py` runs a versioned 20-case set twice at
  the typed Agent boundary and enforces provider use, classification/DAG,
  semantic-slot, risk/gate, fallback, and p95 thresholds. Its artifact contains
  synthetic case IDs and aggregate flags only.
- [Core Agent remediation report](results/core-agent-remediation-2026-08-20.md)
  records the deterministic, contract, security, and currently blocked live
  gates for the 2026-08-20 implementation pass.

## Prerequisites and safe rerun

1. Start the stack using the [local-development guide](../docs/development/local-development.md).
   The default template runs deterministic planning; it is valid for the seven
   product/safety cases but is not real-LLM proof.
2. Export local demo credentials into the process environment. Do not place
   credentials in a command transcript, report, or result artifact.
3. Run the public-boundary runner:

   ```powershell
   $env:E2E_GATEWAY_URL = 'http://localhost:3000'
   $env:E2E_DEMO_EMAIL = '<local demo email>'
   $env:E2E_DEMO_PASSWORD = '<local demo password>'
   python eval/gate_g2_mvp.py
   ```

4. For a real-Gemini attempt, put the key only in private root `.env`, set
   `AGENT_MODEL_MODE=gemini`, and restart Agent. The current Agent uses the
   configured provider for planning whenever Gemini mode and a key are both
   present; provider failure falls back conservatively and is reported by the
   safe `decision_source` field.
   Verify the internal Agent status from the Compose network without printing
   the internal token, then record only safe fields:
   `model_mode`, `api_key_configured`, `last_model_used`, `fallback_used`, and
   `last_model_call_status`. A case counts as real-LLM evidence only when its
   public result is paired with `decision_source=model` or equivalent safe
   diagnostics showing a successful model call without fallback.

5. Run the required repeated 20-case provider set with the private internal
   token supplied only through the process environment:

   ```powershell
   $env:E2E_AGENT_URL = 'http://localhost:8100'
   $env:E2E_INTERNAL_SERVICE_TOKEN = '<private local internal token>'
   python eval/core_agent_provider_release.py --repetitions 2
   ```

The public Gateway intentionally hides planner diagnostics; do not add
debug-only fields to its public response for evaluation. Do not record tokens,
cookies, API keys, raw prompts, raw provider responses, internal IDs, or chain
of thought. If Docker/the stack or a Gemini credential is unavailable, report
`BLOCKED` or `BLOCKED_REAL_LLM` and preserve the rerun command rather than
inventing output.

The compatibility file [results/report.md](results/report.md) is a concise pointer to this canonical report.



