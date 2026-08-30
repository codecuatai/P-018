# Core Agent 10/10 Remediation Plan

- Status: `implemented; release certification pending live gates`
- Created: 2026-08-20
- Scope: Agent Service, Gateway orchestration, Food write boundary, Agent
  persistence, internal contracts, observability, streaming, and AI evaluation.

## 1. Purpose

This plan closes the production-readiness findings discovered in the current
Core Agent implementation. The target is a defensible score of **10/10**, backed
by source, migrations, contract checks, automated tests, runtime evidence, and
honest documentation.

The score is not achieved merely because code exists or unit tests pass. Every
mandatory release gate in section 14 must pass, and each implemented capability
must have observable runtime wiring.

This document is a remediation plan, not an architecture exception. When older
planning material conflicts with the root `AGENTS.md`, accepted ADRs, or
canonical architecture documentation, the higher-authority invariant wins.
In particular, this plan rejects:

- runtime or startup DDL as a substitute for an owned migration;
- persisting raw prompts, messages, chain-of-thought, or authoritative domain
  transaction facts in the Agent database;
- allowing the Agent to execute a side effect, even indirectly through the
  Gateway tool-execution endpoint;
- full-prompt/full-state tracing without an approved privacy, redaction, and
  retention policy;
- marking a phase `implemented` before its production path and acceptance tests
  are wired.

## 2. Non-negotiable architecture invariants

1. Web and mobile call only the NestJS Gateway.
2. The Agent converts untrusted language into validated semantic and planning
   proposals. It does not call a domain service or execute a side effect.
3. The Gateway validates Agent output, resolves trusted references, dispatches
   typed clients, owns confirmations, and shapes public responses.
4. Each domain service remains authoritative for its invariants, state,
   migrations, concurrency control, and idempotency enforcement.
5. Every retryable or side-effecting write receives an idempotency key from the
   first attempt. Same actor/operation/key and normalized payload returns the
   same logical result; a changed payload returns a safe conflict.
6. Financial and final actions remain bound to actor, action, normalized payload
   or hash, resource/quote version, price/currency, expiry, and one-time evidence.
7. Model output cannot introduce authoritative IDs, prices, availability,
   transaction status, confirmation evidence, or tool success.
8. Agent persistence is actor-scoped and may contain only approved checkpoint
   metadata, run metadata, and safe diagnostics. Conversation and authoritative
   workflow state remains owned by Gateway/Core and the domain services.
9. Internal actor identity is asserted by the Gateway through a required header;
   request bodies and model output cannot choose the actor.
10. Raw prompts, raw provider responses, secrets, sensitive PII, and
    chain-of-thought are not logged or persisted.

## 3. Baseline findings and target state

| Area | Current finding | Required target |
| --- | --- | --- |
| Persistence | Startup DDL, broad JSON state, silent memory fallback, unconditional readiness | Owned migration, allowlisted metadata, explicit mode, recoverable health, concurrency-safe writes |
| Side effects | Food Agent invokes Gateway execution and performs draft writes | Agent emits proposals only; Gateway is the sole dispatcher |
| Idempotency | Cart item and voucher writes omit idempotency | Domain-enforced idempotency for every write |
| Core A | Typed steps and authority requirements do not drive Gateway execution | One validated handoff drives capability dispatch and re-planning |
| Model boundary | Restaurant accepts arbitrary model `slot_patch` fields | Domain semantic schemas forbid authoritative fields |
| Confirmation | Restaurant uses substring matching, including `co` | State-bound exact phrase/token classification with negation tests |
| Actor scope | Some routes accept body actor or `anonymous` | Required authenticated `X-Actor-Id` |
| Observability | Full graph callback has no explicit safe projection | Allowlisted telemetry, redaction, sampling, retention |
| Streaming | SSE splits an already completed response | Real contracted events, cancellation, heartbeat, backpressure |
| Evaluation | Gate G2 has seven cases and reports 6/7 | Versioned multi-layer suite with all safety gates green |

## 4. Target request and execution flow

```text
User
  -> Gateway authentication and actor assertion
  -> Gateway safe conversation projection
  -> Core B semantic interpretation
  -> Core A deterministic capability plan
  -> Agent response: validated plan/proposals only
  -> Gateway handoff validation and trusted reference resolution
  -> Gateway typed domain client dispatch
  -> Domain validation, idempotency, locking, and state transition
  -> Gateway safe authoritative result projection
  -> Agent grounded composition without raw IDs or success authority
  -> Gateway public response and durable Core workflow state
```

The Agent must have no client or permission that can invoke
`/internal/tools/execute`. Reads also flow through Gateway orchestration so that
there is one execution owner and one audit boundary.

## 5. Workstream A — Repair Agent persistence and data integrity

Priority: `P0`.

### A1. Characterize and define the persistence contract

- Add tests for actor/workflow isolation, restart, unavailable database,
  reconnect, concurrent updates, stale versions, and adapter selection.
- Split `AgentRunMetadataStore` for PostgreSQL from an explicit
  `InMemoryAgentRunMetadataStore` used only by deterministic tests.
- Allow only actor/thread reference, checkpoint/run ID, graph phase, schema
  version, safe capability names, latency, retry count, safe error code,
  optimistic version, and timestamps.
- Forbid messages, prompts, provider bodies, chain-of-thought, payment data, PII,
  authoritative resource snapshots, confirmation evidence, and transaction
  status.
- Do not wire a general LangGraph state serializer unless it can prove this
  field-level projection. Reconstruct input from Gateway state instead.

### A2. Add an owned migration

- Add `apps/agent-service/migrations/002_agent_run_metadata.sql` after the
  develop branch's immutable `001_agent_workflow_states.sql`; do not wire a
  runtime writer to the legacy broad JSON table.
- Use actor/thread scope, schema version, optimistic version, timestamps, and
  bounded safe diagnostics.
- Add least-privilege grants, migration instructions, and parity coverage.
- Remove `init_db_schema()` and every runtime `CREATE TABLE`/`CREATE INDEX`.
- Never alter another service's migration or repair state by deleting volumes.

### A3. Make failure behavior explicit

- Add validated `AGENT_PERSISTENCE_MODE=required_postgres|memory`.
- Use `required_postgres` in Compose/production-like environments and `memory`
  only in explicit test or standalone configurations.
- Update root `.env.example`, Compose mappings, validation, examples, and docs
  together; never use a shared `env_file`.
- In required mode, startup/readiness fails safely if the schema is absent.
- Transient failures must recover without process restart; use bounded backoff,
  safe errors, async I/O, and compare-and-swap.
- Never silently fall back to memory in required mode.

### A4. Acceptance criteria

- No runtime DDL exists under `apps/agent-service/src`.
- Real PostgreSQL tests prove save -> restart -> restore of approved metadata.
- Concurrent writes cannot silently overwrite; stale versions return conflict.
- Dependency outage makes readiness non-ready and later recovery succeeds.
- Persisted-record inspection proves every forbidden field is absent.
- Data, runtime, security, Agent, and current-state docs match the implementation.

## 6. Workstream B — Restore the Agent/Gateway side-effect boundary

Priority: `P0`.

### B1. Replace legacy Food execution with proposals

- Remove `GatewayToolClient.execute()` usage from the Food graph.
- Remove `draft_write`, `preview`, and `confirmation_prepare` execution
  permissions from Agent runtime code.
- Return versioned typed proposals containing capability name, semantic
  arguments, workflow/tool-call reference, risk ceiling, and confirmation gate.
- Do not trust model-supplied resource IDs.
- Keep compatibility aliases at one adapter only, with owner and removal date.

### B2. Make Gateway the only dispatcher

- Add one Gateway dispatch path consuming the validated Core A handoff.
- Resolve user selections against authoritative Gateway/Core state.
- Validate capability, domain, risk, gate, actor, and schema version before
  calling a typed domain client.
- Generate and propagate correlation, audit, workflow, tool-call, and
  idempotency metadata.
- Keep final/financial actions bound to Gateway/Core confirmations.
- Reject Agent success claims without matching authoritative Gateway evidence.

### B3. Close internal execution to Agent credentials

- Prevent Agent credentials from calling `/internal/tools/execute`.
- If the endpoint remains, enforce a caller allowlist that cannot grant Agent
  side-effect permission.
- Add negative integration tests for every write permission.

### B4. Acceptance criteria

- Static and dependency tests prove Agent has no domain or execution client.
- Food add/update/remove/voucher flows still work end-to-end through Gateway.
- Agent-authenticated write attempts return a typed denial and cause no mutation.
- Final and financial actions still require the complete confirmation chain.
- Agent OpenAPI descriptions match runtime behavior.

## 7. Workstream C — Enforce Food write idempotency in the domain

Priority: `P0`.

### C1. Extend the owned idempotency model

Add an additive Food migration, expected to be
`007_food_cart_write_idempotency.sql`, unless an existing owned structure is
proven to enforce the full contract.

The operation ledger must scope records by authenticated actor, normalized
operation, idempotency key, normalized payload hash, target resource, logical
result/version, and retention timestamps.

### C2. Require keys at every layer

Require `Idempotency-Key` for create cart, add/update/remove cart item,
apply/remove voucher, and every existing final write. Gateway derives stable keys
from actor, workflow/action execution, operation, and revision; retry must reuse
the original key.

### C3. Enforce one transactional algorithm

Within one Food-owned transaction:

1. claim or load actor/operation/key;
2. compare normalized payload hash;
3. return the stored logical result for an exact replay;
4. return a safe conflict for a changed payload;
5. lock and mutate the cart once;
6. increment authoritative cart version;
7. persist operation result before commit.

### C4. Acceptance criteria

- Exact replay returns the same cart version/result without another mutation.
- Changed quantity, item, voucher, or cart with the same key returns `409`.
- Concurrent identical requests produce one mutation.
- Different actors cannot replay one another's keys.
- Gateway propagation and Food domain tests cover POST, PATCH, and DELETE.
- Food OpenAPI, registry, API conventions, data docs, and migration docs agree.

## 8. Workstream D — Make Core A the real planning authority

Priority: `P1`, after P0 transaction invariants.

### D1. Define one production handoff

The Core A -> Gateway response must include semantic tasks and DAG, selected
capability per step, risk ceiling, confirmation gate, required authority and
freshness, blocked reasons, bounded re-plan directive, and contract/catalog
versions.

Use Pydantic as the Agent source contract and generated or compatibility-tested
TypeScript types at Gateway. Do not hand-edit generated clients.

### D2. Supply trusted facts without exposing them to the model

- Gateway builds authoritative facts from domain results and Core workflow state.
- Facts carry source, resource version, observed time, expiry, actor scope, and
  task reference.
- Core A's deterministic kernel may use the facts.
- Core B/model prompts receive only safe semantic projections; IDs remain outside
  model-visible data.
- Missing, stale, or wrong-actor facts block or re-plan instead of guessing.

### D3. Consume Core A output in Gateway

- Replace `typedPlan()`'s semantic-only projection with full handoff consumption.
- Map capability IDs to existing typed Gateway domain adapters.
- Turn domain-specific processors into adapters behind capabilities rather than
  independent intent planners.
- Remove duplicate Gateway keyword/reference planning only after characterization
  parity passes.
- Bound task count, step count, dependency depth, and re-plan attempts.

### D4. Re-plan and partial-success rules

- Re-plan only from typed authoritative results or typed safe errors.
- A failed task blocks only dependent tasks; independent tasks may complete.
- Never compensate or cancel a completed action without a separately confirmed
  policy.
- Persist orchestration state in Core, not Agent metadata.

### D5. Acceptance criteria

- Integration evidence proves Core A's selected capability is what Gateway
  dispatches.
- Facts advance Food, Restaurant, Healthcare, and Ride without entering prompts.
- Stale versions, invalid DAGs, unsupported capabilities, elevated risk, and wrong
  gates fail closed.
- One intent/reference owner exists per stage; duplicate Gateway NLP is removed.
- Status becomes `implemented` only after the production path is observable.

## 9. Workstream E — Harden model, confirmation, actor, and privacy boundaries

Priority: `P1`.

### E1. Replace arbitrary model slot patches

- Define domain-specific semantic patch models with `extra=forbid`.
- Allow only user-expressible semantic fields.
- Forbid IDs, prices, currency, resource versions, availability, transaction
  status, payment/confirmation state, and tool results.
- Convert selection language to an index/reference token; Gateway resolves it
  against authoritative candidates.
- Reject and safely fall back when model output contains a forbidden field.

### E2. Replace substring confirmation detection

- Normalize Unicode and Vietnamese diacritics consistently.
- Match explicit phrases/tokens, not arbitrary substrings.
- Bind acceptance to actor, pending action, workflow phase, and resource version.
- Treat negation, questions, corrections, and ambiguity as non-confirmation.
- Keep service-details confirmation separate from payment/final confirmation.

### E3. Standardize internal authentication and actor assertion

- Use the constant-time internal-auth dependency for every Agent route.
- Make `X-Actor-Id` required for every actor-scoped internal call.
- Require equality with any compatibility body user ID.
- Remove body `context.actor_id` and `anonymous` fallback.
- Keep a non-actor route only when its service-level semantics are explicit.

### E4. Unify LLM adapters and safe projection

- Select one structured-output LLM adapter with typed error categories, fallback,
  and telemetry hooks.
- Migrate Restaurant and legacy Food through it before deleting duplicates.
- Centralize forbidden-field validation and model-safe projection.
- Preserve conservative deterministic handling of authentication, quota, timeout,
  invalid JSON, and schema failures.

### E5. Acceptance criteria

- Property/fuzz tests cannot inject authoritative fields through model output.
- Positive, negative, ambiguous, and negated Vietnamese confirmation tests pass.
- Missing/mismatched actors return `401`/`403` consistently.
- Scanners find no raw prompt, provider response, secret, authoritative ID, or
  sensitive PII in logs or Agent persistence.
- Duplicate adapters are removed only after compatibility tests pass.

## 10. Workstream F — Production observability and real streaming

Priority: `P2`, after safety and state ownership are correct.

### F1. Introduce a safe telemetry envelope

Allowlist correlation/run ID, approved actor pseudonym, capability/tool name,
model and prompt-template version, token counts, latency, retry/fallback flag,
safe error code, phase transition, and contract/schema versions.

Do not attach a third-party callback to complete graph state. Project telemetry
through a redaction-tested layer. Define sampling, access, retention, deletion,
region, and provider settings before enabling it. Prompt/body capture is off by
default.

### F2. Contract SSE before implementation

Add Agent and Gateway OpenAPI coverage for `text/event-stream` with versioned
events:

- `status` for bounded phase changes;
- `plan` for a consumer-safe summary;
- `text_delta` for actual composer/model deltas;
- `finish` for final sanitized response and usage;
- `error` for safe typed failures;
- heartbeat comments during long waits.

### F3. Implement real streaming

- Use graph event and provider streaming APIs where available.
- Never split an already-completed message into fake deltas.
- Propagate disconnect cancellation Web -> Gateway -> Agent/provider.
- Apply bounded buffering and backpressure.
- Never stream IDs, internal state, raw tool results, or hidden reasoning.
- If a provider cannot stream, emit honest phases followed by one final response.

### F4. Acceptance criteria

- First status arrives before graph completion.
- A provider-backed test proves deltas arrive before the final result.
- Disconnect cancels downstream work within a bounded interval.
- Slow-client tests show bounded memory.
- SSE and non-SSE final responses are semantically equivalent.
- Telemetry contains only allowlisted fields.

## 11. Workstream G — Evaluation, reliability, and status honesty

Priority: continuous and release-blocking.

### G1. Build a versioned evaluation matrix

Cover:

- four domains in single- and multi-domain requests;
- Vietnamese with/without diacritics, colloquial language, correction, reference;
- missing data, context switch, replacement, merge, cancellation;
- partial success and blocked dependency;
- provider unavailable, timeout, quota, invalid JSON, schema failure;
- prompt injection and authoritative-ID injection;
- confirmation bypass, negation, stale terms, replay, changed payload;
- database restart, transient failure, concurrent turn, stale checkpoint;
- idempotent retry for every domain write;
- actor mismatch and cross-actor workflow access;
- streaming cancellation and safe telemetry.

Keep deterministic tests separate from provider evaluation. Checked-in artifacts
use synthetic/approved data and contain no secret, raw production prompt,
provider response, internal ID, or chain-of-thought.

### G2. Required quality thresholds

- Unsafe final actions, confirmation bypasses, authoritative hallucinations,
  cross-actor access, duplicate same-key mutations, and contract drift: `0`.
- Required deterministic safety/reliability cases: `100%` pass.
- Core B domain/task classification: at least `98%` on a frozen versioned set.
- Required semantic-slot exactness: at least `95%`; safety-critical fields use
  `100%` validation rather than model accuracy.
- Core A capability/DAG correctness: at least `98%`; risk and gate correctness:
  `100%`.
- Provider release set: at least 20 representative cases across four domains and
  multi-domain flows, repeated to expose stochastic failure.
- Deterministic planner p95 target: below 250 ms in the declared environment.
- Model-backed non-streaming p95 target: below 8 seconds in the declared
  environment, with sample size and fallback rate published.

Reports must state dataset/environment/model versions, sample size, date,
fallback rate, and limitations. If unavailable, record `BLOCKED` and a safe rerun
procedure instead of inventing evidence.

### G3. Close contract drift in both directions

- Canonical entries must exist in runtime.
- Runtime capabilities/aliases must exist in the registry or a bounded
  compatibility allowlist with expiry.
- Agent OpenAPI includes every live route, including SSE if retained.
- Gateway clients are compatibility-tested against Agent/domain OpenAPI.
- API changes update contracts, generated clients where applicable, tests, and
  documentation in the same patch.

## 12. Implementation sequence

Each PR must be independently reviewable and contain no unrelated changes.

### PR 0 — Characterization and contract freeze

- Add failing characterization/integration tests for every audited defect.
- Freeze public behavior and version the target handoff contracts.
- Add bidirectional registry/OpenAPI drift checks.
- Make no production behavior change.

Exit gate: every finding has a test that fails for the intended reason.

### PR 1 — Persistence correctness

- Implement Workstream A, including owned migration and explicit adapters.
- Remove runtime DDL and production memory fallback.
- Update environment and canonical persistence documentation.

Exit gate: PostgreSQL restart, outage, reconnect, concurrency, privacy, and
migration tests pass.

### PR 2 — Food idempotency

- Implement Workstream C in Food, Gateway client, OpenAPI, and registry.
- Keep the guarantee inside the Food boundary.

Exit gate: replay, conflict, concurrency, and cross-actor tests pass for every
cart/voucher mutation.

### PR 3 — Agent side-effect removal

- Implement Workstream B.
- Make Gateway the only dispatcher and deny Agent execution credentials.

Exit gate: Food E2E passes and negative Agent execution tests prove no mutation.

### PR 4 — Core A production wiring

- Implement Workstream D.
- Consume capability steps, facts, authority requirements, and re-plan directive.
- Remove duplicate Gateway planning only after parity evidence.

Exit gate: all domains trace Gateway dispatch to the validated Core A choice.

### PR 5 — Model, confirmation, actor, and privacy hardening

- Implement Workstream E.
- Update internal OpenAPI and security documentation.

Exit gate: adversarial model, confirmation, auth, and privacy suites are green.

### PR 6 — Observability and streaming

- Implement Workstream F after safe event/telemetry contracts are approved.
- Wire Agent -> Gateway -> Web cancellation and backpressure.

Exit gate: real pre-completion events, cancellation, bounded buffering, and
telemetry allowlist tests pass.

### PR 7 — Release evaluation and documentation truth pass

- Implement Workstream G and run the complete release matrix.
- Publish sanitized evidence.
- Reassess every `implemented`/`skeleton`/`planned` statement.

Exit gate: section 13 scores 100/100 and every mandatory gate is green.

## 13. 10/10 scorecard

| Category | Weight | Full-credit evidence |
| --- | ---: | --- |
| Domain and transaction safety | 20 | Agent cannot execute side effects; confirmations and domain authority are enforced; unsafe-action count is zero |
| Persistence and reliability | 20 | Owned migration, approved metadata only, truthful readiness, restart/reconnect/concurrency evidence |
| Core A planning and Gateway execution | 20 | Validated handoff drives dispatch; authority/freshness/re-plan works across all domains |
| Model, actor, and privacy security | 15 | Typed patches, no ID injection, robust confirmation, required actor, safe logs and telemetry |
| Contracts, idempotency, and tests | 15 | Domain idempotency, bidirectional drift gates, unit/integration/E2E coverage |
| Streaming, observability, docs, operations | 10 | Real streaming, cancellation/backpressure, safe metrics, accurate docs/runbooks |
| **Total** | **100** | **All mandatory gates pass** |

Score conversion: `final score = earned points / 10`. A security, privacy,
confirmation, idempotency, cross-actor, runtime-DDL, or ownership failure caps
the release at **7/10**, regardless of arithmetic total.

## 14. Mandatory release gates

The Core Agent may be rated and released as 10/10 only when all are true:

- [x] No Agent runtime DDL or destructive startup migration exists.
- [x] Production persistence has no silent in-memory fallback.
- [x] Agent persistence contains only approved metadata.
- [x] Readiness reflects every required dependency actually checked.
- [x] Agent has no executable side-effect path or domain client.
- [x] Gateway is the single typed execution and audit boundary.
- [x] Every retryable/side-effecting write has domain-enforced idempotency.
- [x] Core A's validated capability steps drive Gateway dispatch.
- [x] Model output cannot create or rebind authoritative IDs/facts.
- [x] Service-details, final, payment, and cancellation confirmations are
      distinct and state-bound.
- [x] Every actor-scoped internal route requires and verifies the actor.
- [x] No raw prompt, chain-of-thought, secret, or forbidden PII is persisted or
      logged.
- [x] Streaming is real and contracted, or the fake endpoint is removed.
- [x] Registry, OpenAPI, runtime, and clients pass bidirectional compatibility.
- [ ] Required lint, type, test, migration, env, Compose, integration, E2E,
      adversarial, concurrency, restart, and provider gates pass.
- [x] Canonical architecture/current-state/API/data/security docs match runtime.
- [ ] Rollback/compatibility procedures are exercised without deleting volumes
      or rewriting owned migration history.

## 15. Verification commands

Run from an activated project environment:

```powershell
python -m ruff check apps/agent-service/src apps/agent-service/tests
Push-Location apps/agent-service
..\..\.venv\Scripts\python.exe -m pytest tests -q
Pop-Location
npm --prefix apps/api-gateway run lint
npm --prefix apps/api-gateway test
npm --prefix apps/api-gateway run build
Push-Location services/food-service
..\..\.venv\Scripts\python.exe -m pytest tests -q
Pop-Location
python scripts/quality/validate-env-config.py
python scripts/database/check-migration-parity.py
docker compose --env-file .env.example config --quiet
.\.venv\Scripts\python.exe eval/core_agent_deterministic.py
.\.venv\Scripts\python.exe eval/core_agent_provider_release.py --repetitions 2
```

Use the repository integration/E2E harness for PostgreSQL, restart, concurrency,
cross-service, and provider evidence. Document the exact safe command and
environment in the result report. Never print private `.env` contents or
credentials.

## 16. Rollout and rollback rules

- Use additive migrations only. Rollback disables new code paths but does not
  delete data or rewrite applied migrations.
- A temporary compatibility switch requires an owner, default, expiry, and
  removal issue.
- Deploy domain idempotency before routing proposals through the new dispatcher.
- Deploy the persistence schema before enabling required PostgreSQL mode.
- Keep old/new Core A handoffs compatible for one bounded rollout window and
  reject unknown versions safely.
- Roll back on unsafe action, confirmation mismatch, cross-actor access,
  duplicate mutation, schema error, persistence data leak, or unbounded
  latency/memory growth.
- Never delete PostgreSQL volumes to repair migration state.

## 17. Documentation update checklist

Update only documents affected by delivered behavior, but never defer a required
update:

- `docs/architecture/agent-architecture.md`;
- `docs/architecture/service-boundaries.md`;
- `docs/architecture/data-architecture.md`;
- `docs/architecture/runtime-architecture.md`;
- `docs/architecture/security-architecture.md`;
- `docs/architecture/current-state.md`;
- `docs/api/api-conventions.md`;
- `docs/api/tool-registry-v2.md` and canonical registry JSON;
- Agent/Food OpenAPI and component migration READMEs;
- root `.env.example`, Compose mappings, and local-development docs when
  environment behavior changes;
- sanitized evaluation report and known limitations.

No phase is complete until implementation, tests, runtime wiring, and canonical
documentation agree.
