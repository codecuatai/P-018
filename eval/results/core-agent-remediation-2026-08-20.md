# Core Agent remediation evidence - 2026-08-20

Status: **implementation complete; 10/10 release certification blocked by live gates**.

This report covers the implementation pass rebased onto develop commit `212c263` plus the
uncommitted remediation worktree. It records only synthetic/aggregate evidence.
No private environment file, token, prompt, provider body, internal resource
identifier, production record, or chain-of-thought was read into this report.

## Delivered behavior

- Agent persistence now uses an owned migration, explicit
  `required_postgres|memory` selection, truthful readiness, reconnectable pool,
  and an `extra=forbid` allowlisted metadata record. Runtime DDL and silent
  production memory fallback are absent.
- Food owns transactional idempotency for cart creation, item add/update/remove,
  and voucher apply/remove. Exact replay, changed-payload conflict, concurrency,
  and actor scope are covered in memory and opt-in PostgreSQL tests.
- Agent emits versioned semantic proposals only. Its Gateway execution/domain
  client and the Gateway HTTP execution endpoint were removed. Gateway validates
  and dispatches proposals through typed clients.
- Core A emits `core-a.v1` plus capability-catalog version. Gateway consumes
  capability, DAG, authority/freshness, risk/gate, blocked disposition,
  re-plan directive, and confirmation invalidation. Same-key retry preserves
  the task revision. Dispatch trace tests cover Food, Restaurant, Healthcare,
  and Ride. The temporary unversioned handoff is owned by
  `gateway-conversation`, expires at `2026-12-31T00:00:00Z`, and fails closed
  for partial versioning or after expiry.
- Restaurant structured extraction forbids extra/authoritative fields. The
  centralized Vietnamese confirmation parser rejects negation, questions,
  corrections, and substring ambiguity. Actor-scoped Agent routes require
  constant-time internal auth and matching `X-Actor-Id`.
- Full-state third-party callbacks and the fake post-completion SSE endpoint
  were removed. Telemetry is limited to the safe Agent metadata envelope.
- Agent OpenAPI 1.4 defines the full Core A response with
  `additionalProperties: false`; Gateway OpenAPI 1.4 includes every public Food
  cart mutation and matches the Food idempotency-key bounds.
- A 20-case provider release runner now executes 16 single-domain and four
  multi-domain cases twice, enforcing model use, capability/DAG, slot, risk/gate,
  fallback, and p95 thresholds while writing only aggregate/synthetic case data.

## Verified local gates

| Gate | Result |
| --- | --- |
| Agent tests | `181 passed, 1 skipped` |
| Agent/eval Ruff | pass |
| Gateway Jest | `172 passed, 7 skipped`; `34` suites passed, `2` skipped |
| Gateway lint/build | pass / pass |
| Food tests | `38 passed, 3 skipped` |
| Ride tests | `31 passed` |
| Additional shared/service contract parity | pass |
| Environment validation | `120` root variables / `112` Compose variables |
| Migration parity | pass, `28` files |
| Compose render | pass |
| Agent/Gateway/Food/Ride OpenAPI YAML parse | pass |
| Static DDL/execution/Langfuse/fake-SSE scanners | no forbidden runtime match |

The deterministic compatibility runner loaded all 200 frozen synthetic cases:
tool exactness was `107/200`, domain exactness `65/109`, and planner p95 was
`0.560 ms`. This exposes the conservative fallback's compatibility limit; it is
not labeled as the Core B provider score and does not satisfy the provider gate.

## Blocked release gates

| Gate | Status and safe rerun |
| --- | --- |
| Agent PostgreSQL restart/reconnect/concurrency | `BLOCKED`: no `AGENT_TEST_DATABASE_URL` for an empty disposable database. Use the command in `apps/agent-service/migrations/README.md`. |
| Food/Gateway PostgreSQL suites | `BLOCKED`: their disposable test database variables are absent; the skipped tests were not counted as passes. |
| Provider release set | `BLOCKED_REAL_LLM`: no live Gemini-mode Agent/private internal token was used. Run `python eval/core_agent_provider_release.py --repetitions 2` as documented in `eval/README.md`. |
| Live cross-service E2E | `BLOCKED`: Compose services were healthy when inspected, but their images predate this worktree patch and were not rebuilt; container status is not runtime proof of these changes. |
| Rollback/compatibility exercise | `BLOCKED`: the observed PostgreSQL stack was not established as disposable, so it was not mutated or restarted; no volume was deleted and no migration history was rewritten. |

Because section 14 of the remediation plan requires every live gate, this
worktree must not be presented as certified 10/10 yet. The implementation and
safe runners are present; certification requires the blocked reruns above and a
new sanitized report with their actual results.
