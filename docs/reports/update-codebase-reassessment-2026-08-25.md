# Update reassessment: 2026-08-25

## Findings

The original `update.md` is partly stale. Gateway already applies discard
directives, protects completed/authoritative tasks, and Agent composition has
negative success guards. Food deterministic planning already supports generic
meal suggestions (`ăn trưa`, `ăn tối`, `gợi ý`, `món ngon`) without a concrete
dish query. These items did not need duplicate implementation.

One actionable gap remained: `plannerSafeState` sent terminal tasks back to the
Agent. That allowed old completed/failed/discarded work to bias later planning.
The Gateway now sends only active tasks while retaining the original task refs
for safe discard validation.

The proposed macro checkout was not added. Existing typed Gateway actions and
domain idempotency already own checkout/payment authority; replacing them would
be an API and confirmation-boundary change requiring a separate ADR and contract
rollout.

## Status

- Task ghost cleanup: `IMPLEMENTED_RUNTIME` after this patch.
- Generic Food suggestion path: `IMPLEMENTED_AGENT_TOOL` already present.
- Hallucination/success guard: `IMPLEMENTED_AGENT_TOOL` already present.
- Macro checkout/reference redesign: `PLANNED`, not required for the verified
  issues and intentionally deferred.

## Verification

Targeted Gateway Jest and TypeScript checks passed after the patch. Full runtime
and trace replay remain environment-dependent and are not claimed here.
