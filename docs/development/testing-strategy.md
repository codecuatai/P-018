# Testing Strategy

Unit tests cover application/domain code; config tests prove fail-fast process settings; API tests cover health/validation; contract tests cover versioned provider/consumer behavior; integration/E2E tests live under root `tests/`; agent evaluations cover intent/slots/tool selection and native/fallback structured-output safety. Default tests use fake LLMs and never call Gemini or a live payment/domain system. Durable Assistant receipt tests cover in-memory claim/replay/conflict semantics, retryable failure, stale lease reclaim, and an optional PostgreSQL integration path. Healthcare tests cover exact-clock matching, daypart behavior, and domain-owned facility responses. The separate live smoke is limited to a small fixed set of public scenarios and reports configured-key/provider/schema status without exposing secrets.

Before a PR, run environment validation, Compose config, Python lint/pytest and package/import checks for changed services, gateway lint/test/build, and web build when affected. Add deterministic tests with every behavior, config, contract, or migration change.

## 2026-08-10 corrective review evidence

- Gateway current corrective checks: Jest `17 passed` suites, `72 passed, 5 skipped` tests; lint and build pass. Demo-auth tests cover development enabled, test disabled, production signed-token rejection, malformed token, and expired token with stable safe errors. Contract tests for shared Address/Food legacy compatibility pass `2/2`.
- Agent Ruff and pytest pass (`103 passed`); Food `22 passed, 3 skipped`; Ride `10 passed`; Restaurant `20 passed, 1 skipped`; Healthcare `21 passed, 1 skipped`.
- A fresh disposable Compose project `xone-phase0-corrective-20260810-1` was built from the current worktree with `.env.example`, dummy values, and `AGENT_MODEL_MODE=deterministic`. All seven containers became healthy; migrations/seeds passed; Gateway live/readiness returned `200/200`; and `python -m pytest tests/e2e -q` passed `31/31` in `166.89s`.
- The E2E-only project used `GATEWAY_AUTH_LOGIN_RATE_LIMIT=1000` because the suite intentionally performs more than five logins from one client IP. The checked-in/default security profile remains `5/60s`; Gateway security tests cover that configured profile. The disposable project and volume were removed after the proof, and the existing `p-018` project/volume was not touched.
- Web `npm ci` and production build pass. npm reports one existing high transitive `nanoid` build-tool advisory; no dependency or lockfile change was made. Browser smoke is `UNVERIFIED`, which is not a Phase 0 acceptance blocker.
- Deterministic acceptance did not call Gemini. The Agent-service Gemini key was not read, printed, copied, or overwritten. Historical live Gemini evidence remains below as historical evidence only.

## 2026-08-09 historical verification evidence

### BASE SUITES

For this evidence-only pass, the four required service commands and their collection commands were each run exactly once from the owning service directory. Exact stdout summaries:

- Food (`services/food-service`): `python -m pytest tests -q` -> `22 passed, 3 skipped, 1 warning in 0.45s`; collection -> `25 tests collected in 0.28s`.
- Ride (`services/ride-service`): `python -m pytest tests -q` -> `10 passed, 1 warning in 0.26s`; collection -> `10 tests collected in 0.01s`.
- Restaurant (`services/restaurant-service`): `python -m pytest tests -q` -> `20 passed, 1 skipped, 1 warning in 1.15s`; collection -> `21 tests collected in 0.80s`.
- Healthcare (`services/healthcare-service`): `python -m pytest tests -q` -> `21 passed, 1 skipped, 23 warnings in 0.94s`; collection -> `22 tests collected in 0.60s`.

These are BASE SUITES counts only. Ruff, targeted PostgreSQL, deterministic public E2E, and live Gemini evidence are separate categories. Previously recorded Agent, Gateway, and Web checks remain unchanged.

The source/count contradiction is resolved. The pass ran from repository root `C:/Users/ADMIN/Personal_proj/AIBuildPhase/P-018` at HEAD `6672e988c4cdd4de19a542a0ab4bacfbad216367`, after capturing the dirty working-tree status. Disk inventory and `git ls-files` agreed for every `test_*.py` under the four service test directories: no test source was untracked, ignored, generated, symlinked outside the root, or collected from outside the root. Ignored entries were bytecode under `__pycache__` only and are not evidence.

`develop.xml` is the source of the lower `21/7/18/18` recount: its directory index names each service `tests/test_config.py`, but its packed file-content section omits all four files. The snapshot itself warns that packed contents may exclude files, so it is not a complete test-source authority. Git proves all four omitted files are tracked at HEAD, and the following omitted node IDs account for the complete `+4/+3/+3/+4` difference:

- Food, tracked `services/food-service/tests/test_config.py`: `test_service_config_reads_process_environment`, `test_service_config_fails_when_token_missing`, `test_invalid_persistence_fails_closed`, `test_production_memory_is_rejected`.
- Ride, tracked `services/ride-service/tests/test_config.py`: `test_service_config_reads_process_environment`, `test_service_config_fails_when_token_missing`, `test_postgresql_url_selects_declared_psycopg_driver`.
- Restaurant, tracked `services/restaurant-service/tests/test_config.py`: `test_service_config_reads_process_environment`, `test_service_config_fails_when_token_missing`, `test_postgresql_url_uses_declared_psycopg_v3_driver`.
- Healthcare, tracked `services/healthcare-service/tests/test_config.py`: `test_postgres_url_uses_installed_psycopg_driver`, `test_department_lookup_folds_accents`, `test_service_config_reads_process_environment`, `test_service_config_fails_when_token_missing`.

Therefore repository BASE SUITES are `25/10/21/22` collected, not the incomplete snapshot recount. No test was changed to reconcile the count.

### TARGETED POSTGRESQL

Food PostgreSQL integration passed `3/3`; Gateway Core PostgreSQL integration passed `5/5`. These targeted counts were run against disposable databases and are separate from BASE SUITES totals; they are not summed into them.

### DETERMINISTIC PUBLIC E2E

`python -m pytest tests/e2e --collect-only -q` was run in that historical pass and collected `31 tests`. Its recorded deterministic disposable stack passed `31 passed in 164.95s`, zero skipped. The current corrective run and result are recorded above and supersede this historical runtime proof for the current worktree.

### LIVE GEMINI SMOKE

Safe Agent status after live calls: primary `gemini-3.5-flash-lite`, structured invocation, call status `success`, fallback `false`; no key, prompt, or provider payload was recorded. Public Agent returned HTTP 200 with `decision_source=model`; the forced fallback probe recovered on `gemini-3.1-flash-lite`; and the public Gateway Food two-turn probe returned HTTP 201 twice. The five demo-critical live flows produced `4/5` assertion passes: Food full order, Restaurant explicit confirmation, Healthcare-to-Ride handoff, and Food/Healthcare ambiguity passed; the Healthcare symptom flow had an assertion-only first-step mismatch, classified C with no product state/action bug. Food's one permitted rerun followed a local disposable-container DNS/configuration correction.

The earlier live-provider E2E was `25 passed, 6 failed` and is not deterministic acceptance evidence. It remains classified as `3 B/transient` and `3 C/assertion-only`; no failure was classified D or E. Categories are A=provider quota/rate limit, B=provider temporary/network/timeout, C=model wording/assertion nondeterminism only, D=invalid structured plan with deterministic safety recovery, E=actual orchestration/state/action bug, and F=unknown. The safe prior diagnostics are:

| Test | HTTP | Safe category | decision_source | last_model_used | fallback |
|---|---:|---|---|---|---|
| `test_payment_failure_converges_without_receipt` | unknown | B — ReadTimeout | not captured | not captured | not captured |
| `test_restart_preserves_order_payment_and_conversation` | unknown | B — ReadTimeout | not captured | not captured | not captured |
| `test_healthcare_public_flow_reconciles_expiry_and_reuses_slots` | unknown | C — assertion only | not captured | not captured | not captured |
| `test_unified_assistant_preserves_restaurant_confirmation_when_food_is_added` | 503 | B — temporary unavailable | not captured | not captured | not captured |
| `test_unified_assistant_preserves_bike_vehicle_type` | unknown | C — assertion only | not captured | not captured | not captured |
| `test_unified_b_food_completion_exposes_only_authoritative_payment` | unknown | C — assertion only | not captured | not captured | not captured |

No prior failure was classified D or E from the safe evidence. `llm.py` centrally omits `temperature`, `top_p`, and `top_k` for Gemini 3 names (with or without `models/`); Restaurant uses the shared model builder. Keep the live smoke limited and never log secrets or provider payloads.

The root lockfile was regenerated with `corepack pnpm install --lockfile-only`; the exact Gateway frozen install then passed. The first Web `npm ci` hit a stale generated junction under `apps/web/node_modules`; that untracked dependency directory was verified as non-source, removed, and `npm ci` plus the production build passed from a clean dependency state. The tracked manifests and lockfile are now synchronized. In this code-freeze pass, the direct frozen Gateway install and Web `npm ci` were rerun and passed; npm printed one existing high-severity audit advisory, with no install/lockfile failure; no lockfile was regenerated.

### NPM HIGH-SEVERITY ADVISORY CLASSIFICATION

From `apps/web`, both `npm audit --json` and `npm audit --omit=dev --json` reported one high advisory: transitive `nanoid@3.3.16` through root dependency `vite@6.4.3 -> postcss@8.5.25 -> nanoid@3.3.16`. The advisory is GHSA-2v37-7h3g-55p8, affects `<3.3.17`, and concerns a custom generator looping when its size is zero. `nanoid` is not direct (`isDirect=false`); npm reports `fixAvailable=true`. Non-breaking patched `3.3.17` and `3.3.18` releases exist and satisfy PostCSS's current `^3.3.16` range.

The production-class audit still sees the package because Vite is declared under `dependencies`, making Vite, PostCSS, and Nanoid `dev=false` in the lockfile. Deployment inspection shows the chain is nevertheless build tooling only: the multi-stage Web image runs Vite in the builder and copies only static `dist` output into the final Nginx image; neither Web source nor built browser assets contain `nanoid`, `postcss`, `customAlphabet`, or `customRandom`. PostCSS's installed call site invokes `nanoid(6)` with a constant nonzero size. The vulnerable zero-size custom-generator path is therefore neither shipped in the browser/final image nor reachable in this deployment. Because `npm audit --omit=dev` does report the manifest-classified build dependency, this pass does not claim that command returned zero high findings. No dependency or lockfile was changed, consistent with the instruction not to patch a non-runtime advisory during code freeze.

The additive Restaurant proof also ran on an ephemeral PostgreSQL container: legacy `create_reservation:*` rows were inserted at revision 0001, upgraded through 0002 and 0003, runtime promotion was exercised before update/cancel, both original create keys replayed to the same two reservation IDs, the reservation count remained 2, and a second `alembic upgrade head` was a no-op. The temporary container had no volume and was removed after the proof.
