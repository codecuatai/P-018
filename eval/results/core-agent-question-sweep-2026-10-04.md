# Core Agent question sweep — 2026-10-04

Scope: 100 synthetic questions over the running Agent API, 20 per group. Two first attempts were retried with unique correlation IDs; both passed. Results are invariant checks, not a human semantic-quality score.

| Group | Cases | Passed |
|---|---:|---:|
| service | 20 | 20 |
| complex | 20 | 20 |
| ambiguous | 20 | 20 |
| nonsense | 20 | 20 |
| safety | 20 | 20 |

## Runtime and trace checks

- Executions: 102; Gemini model decisions: 99; deterministic fallback or transport outcomes: 1.
- Docker Agent API: no HTTP 5xx during the sweep; stack remained healthy.
- Langfuse: 104 traces, 713 observations, 104 generations, 102 generations with usage; zero observation input/output and zero user/session identity fields.
- Trace hierarchy included root, request validation, planner route, Core A validation/task, persistence, model generation, and fallback observations.
- Langfuse also returned SDK resource/scope metadata keys; they contained only instrumentation metadata fields and no observation I/O or identity fields.

## Findings fixed

- Langfuse adapter now drops observation input/output and user/session identity even if a caller supplies them.
- Restored the removed deterministic Core Agent fallback, temporal helpers, and safety reconciliation; one clear restaurant request omitted by Gemini now falls back to the bounded deterministic plan.
- Sweep retries now use unique correlation IDs to avoid duplicate run-metadata conflicts.

## Test status

- Focused Core Agent and observability tests: 106 passed. Ruff: passed.
- Deterministic benchmark: 200 cases, 130 tool-exact and 93/109 expected domains.
- Full Agent suite: 250 passed, 47 failed, 1 skipped. Remaining failures are in legacy domain-specific confirmation, food, restaurant, healthcare, ride and API-route tests; the suite is not fully green.
