# Core Agent Langfuse tracing evidence — 2026-08-20

Status: `PASS_LOCAL_AND_LIVE`

## Implemented boundary

- Langfuse Python SDK is pinned to `4.14.4`.
- Agent configuration uses exactly `LANGFUSE_SECRET_KEY`,
  `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_BASE_URL`.
- Empty keys select the no-op adapter; partial keys and credentialed/insecure
  endpoints fail typed configuration validation.
- Manual observations cover Assistant run, request validation, model
  generation, planner route, Core A validation, bounded task decisions,
  composition, fallback and allowlisted metadata persistence.
- LangChain/LangGraph full-state callbacks are not attached.
- Pydantic `extra=forbid` metadata contracts, SDK-only span filtering, and
  export-stage masking prevent arbitrary payload export.

## Verification

| Gate | Result |
|---|---|
| Agent pytest | `195 passed, 1 skipped` |
| Focused observability/config/Core A/API | `47 passed` |
| Ruff | pass |
| Python compile | pass |
| Dependency consistency | pass |
| Agent Docker image build | pass |
| Environment validation | `123` root variables / `115` Compose variables |
| Migration parity | `28` files |
| Compose render | pass |
| Deterministic evaluation | `200` cases; tool exact `107`; domain `65/109`; planner p95 `2.077 ms` |
| Live Langfuse ingest | pass |
| Remote privacy/hierarchy check | pass |

## Live trace proof

- Safe correlation ID:
  `langfuse-smoke-371d4da084ce4133962aa9b9841fe4ec`
- Trace visibility: private.
- Observations: `6`.
- Names:
  `agent.core_a.run`, `request.validate`, `model.generate.plan`,
  `planner.route`, `core_a.validate`, `core_a.task`.
- Model generations: `1`.
- Provider token usage: present.
- Root/observation input and output: absent.
- Prompt references/content: absent.
- User/session identity: absent.
- Raw status/error message: absent.

The remote verification queried only the synthetic trace and printed
boolean/count/name evidence. It did not print credentials or trace payloads.

## Security hygiene

- Root and standalone examples contain blank Langfuse key fields only.
- Real credentials were not read or printed during repository inspection.
- The tracked `h.json` trace export was removed after reference checks.
- Local trace-export patterns are ignored.
- A regression scanner checks tracked files for Langfuse secret-key patterns
  without printing matched values.

## Limitation

The live proof is synthetic and non-PII. It verifies the production adapter,
real provider generation span, token usage, remote ingestion and privacy
shape; it is not evidence for production traffic volume, retention policy or
dashboard access governance.
