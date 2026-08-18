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
   `AGENT_MODEL_MODE=gemini`, restart Agent, and use E01 or E02. Those
   multi-domain prompts avoid the ordinary one-task deterministic fast path.
   Verify the internal Agent status from the Compose network without printing
   the internal token, then record only safe fields:
   `model_mode`, `api_key_configured`, `last_model_used`, `fallback_used`, and
   `last_model_call_status`. A case counts as real-LLM evidence only when its
   public result is paired with `decision_source=model` or equivalent safe
   diagnostics showing a successful model call without fallback.

The public Gateway intentionally hides planner diagnostics; do not add
debug-only fields to its public response for evaluation. Do not record tokens,
cookies, API keys, raw prompts, raw provider responses, internal IDs, or chain
of thought. If Docker/the stack or a Gemini credential is unavailable, report
`BLOCKED` or `BLOCKED_REAL_LLM` and preserve the rerun command rather than
inventing output.

The compatibility file [results/report.md](results/report.md) is a concise pointer to this canonical report.



