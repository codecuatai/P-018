# Agent Architecture

The target agent boundary is structured state for intent, slots, workflow selection, tool request, tool-result resume, and safe response. Pydantic schemas constrain API and any future model output. The model adapter must remain isolated; default tests must mock it.

```mermaid
flowchart LR
  Input --> State --> Intent[Intent and slots]
  Intent --> ToolRequest
  ToolRequest --> Gateway
  Gateway --> ToolResult
  ToolResult --> Resume --> Response
```

The Food slice implements this flow in `apps/agent-service/src/agents/graph.py`: configured Gemini uses LangChain's native Pydantic JSON-Schema structured-output path with `include_raw=True`; the graph accepts the validated native object and can recover the provider's raw fenced/plain JSON through a schema-validated decoder. Invalid output safely uses deterministic semantic fallback. `intent.py`, `reference_resolution.py`, and `tool_selection.py` are pure/testable boundaries. Model-supplied resource IDs and model tool calls are discarded. The graph emits bounded, versioned semantic proposals containing capability, workflow/tool-call reference, risk ceiling, and confirmation gate. Authoritative IDs are stripped from proposal arguments. Agent has no Gateway execution or domain client. Gateway validates every proposal, resolves IDs from actor-scoped Core/domain state, and is the only dispatcher. The public response contains no analysis, prompt, or chain-of-thought.

The Core A handoff is versioned as `core-a.v1` and carries the observed
capability-catalog version. Gateway rejects mismatched versions, invalid DAGs,
risk/gate drift, unsupported re-plan directives, and invalid blocked-task
references. `WAIT_AND_RETRY_SAME_KEY` reuses the unchanged task revision;
changed terms advance the revision. `confirmation_invalidated` removes pending
evidence, the public confirmation card, and its action before re-planning.
Gateway requires `planning_decision`, `core-a.v1`, and the exact observed
capability-catalog version on every service turn. Missing, partially versioned,
unversioned, and mismatched handoffs are rejected immediately; there is no
date-based validation bypass or legacy execution fallback.

## Unified assistant planner

`AssistantPlan`, `SemanticTurn`, and `PlanningDecision` carry a bounded
`interaction_mode` plus `discarded_task_refs`. Chitchat and general advisory
turns produce no service task, so Gateway can answer without replaying old
cards while retaining pending state for a later turn. An explicit context
switch can mark eligible unfinished conversation tasks as `DISCARDED`;
dependent conversation tasks are discarded with their prerequisite.
`DISCARDED` is orchestration attention state only, never evidence that a
domain booking, order, reservation, appointment, hold, or payment was
cancelled. Gateway refuses to discard a task backed by an active authoritative
transaction; domain cancellation still uses its typed capability and required
confirmation.

`apps/agent-service/src/agents/assistant_graph.py` is the top-level X-One
planner. It accepts one conversation turn and returns a Pydantic-validated
compatibility `AssistantPlan` plus a typed `SemanticTurn` and
`PlanningDecision`, each bounded to at most four tasks for Ride, Food,
Restaurant, and Healthcare. The compatibility projection may remain for
non-executing consumers, but Gateway orchestration consumes only the versioned
`PlanningDecision`; both Gemini output and deterministic fallback traverse that
typed path. Core A is a deterministic kernel split across
`assistant/contracts.py`, `assistant/understanding/`,
`assistant/planning/`, and `assistant/policy/`; it proposes capabilities but
never dispatches them. It can express a bounded dependency such as Restaurant selection
before a Ride destination, or Healthcare hold before a Ride destination, while
the Gateway—not the Agent—executes typed service calls and confirmation
actions. A Healthcare-dependent Ride contains only the user-provided pickup;
the facility destination is resolved from the authoritative Healthcare result.
Gemini is the primary reasoning path when
`AGENT_MODEL_MODE=gemini` and a key is configured; missing-key, quota/rate-limit and
validation failures use the conservative deterministic planner. The internal
Agent status endpoint exposes only model mode/name, fallback name, key
configured boolean, and last-call diagnostics.

The planner sanitizes model slots before returning them. IDs, prices,
availability, status, and other authoritative resource facts are resolved by
the Gateway from domain results. The Gateway sends the top-level planner only a
planner-safe projection of task references, domains, goals, phases, semantic
slots, and bounded pending-choice summaries; confirmation/workflow/tool IDs,
order/appointment/reservation IDs, provider references, raw authoritative
payloads, and resource versions are excluded. The Gateway supplies the
versioned capability snapshot separately and rejects a typed plan whose
capability, domain, risk, confirmation gate, or dependency reference does not
match that snapshot. A second composition call may
explain sanitized results but cannot change their values.

Every typed Core A step is explicitly either `CAPABILITY` or
`WAIT_FOR_CONFIRMATION`. A capability step must name an implemented Gateway
snapshot capability and match its domain, risk ceiling, and confirmation gate.
A waiting step names no capability and is valid only for the matching explicit
service-details, payment, or cancellation confirmation phase. It is never a
dispatch instruction. Gateway validates this shape again because Agent output,
including deterministic and model-derived output, is untrusted.

Gateway treats its persisted task graph as untrusted runtime state too. It
rejects duplicate, self-referential, and dangling task dependencies before
propagating a failure through a bounded worklist of dependents. This preserves
the one-way `BLOCKED` transition without relying on an open-ended retry loop.

Agent proposal IDs are deterministic trace references over workflow,
correlation, capability, semantic arguments, and proposal index. They are not
trusted idempotency keys. Gateway derives the downstream execution identity
from actor-scoped persisted task state, its revision, and the proposal index;
the domain still enforces exact replay and changed-payload conflict.

Slot normalization is domain-specific: Ride accepts only bounded addresses and
`BIKE`/`CAR_4`/`CAR_7`; Restaurant and Healthcare require timezone-aware
`start_at` values and bounded party/symptom fields; Healthcare dayparts are
bounded semantic preferences and explicit clock times remain exact; Food
accepts bounded query, location, and delivery preference fields. The adapter records the configured
primary/fallback, actual last model, fallback usage, call time, and safe status
for `/api/v1/status`; it never reports keys or raw prompts.

Unambiguous constraints parsed directly from the current user turn remain
authoritative over model guesses: an explicit Ride vehicle type cannot be
changed by the model, and an explicit Healthcare relative daypart such as
`tomorrow_morning` cannot be dropped. Response composition receives only the
planner-safe task projection and sanitized authoritative results, not the raw
user message. Gateway additionally rejects a composed final-success claim for
any domain whose task has not reached `COMPLETED`.

Heuristic location parsing is bounded independently of the API message limit:
it examines at most 512 input characters and emits at most 160 location
characters. These heuristics only propose semantic slots; authoritative place
resolution remains a Gateway/domain responsibility.

Agent migration `002_agent_run_metadata.sql` stores only actor/workflow/run identifiers, phase, schema version, bounded capability names, latency/retry/safe-error diagnostics, payload hash, optimistic version, and timestamps. A single Gateway correlation chain may invoke planning, a vertical agent, and composition; Agent derives a stable route/phase-scoped run identifier for each invocation so those distinct records cannot collide while the original correlation identifier remains unchanged in tracing. Migration `001_agent_workflow_states.sql` is retained as immutable develop-branch history, but no runtime component writes its broad JSON table. Required PostgreSQL mode has no memory fallback and readiness checks the allowlisted metadata schema. Explicit memory mode exists only for tests/standalone use. Raw chain-of-thought, prompts, messages, provider bodies, authoritative transaction facts, payment data, and confirmation evidence are rejected by the metadata schema. Conversation and domain workflow state is reconstructed from Gateway/Core and domain authority; it is not Agent-owned.

Optional Langfuse v4 tracing uses an Agent-owned, metadata-only adapter. It
auto-enables only when both `LANGFUSE_SECRET_KEY` and
`LANGFUSE_PUBLIC_KEY` are present; `LANGFUSE_BASE_URL` selects the
credential-free HTTPS endpoint. Manual observations cover the Assistant run,
request validation, planner route, model generation, Core A validation,
bounded task/capability decisions, composition, fallback, and run-metadata
persistence. The adapter never sets observation input/output, user/session
identity, prompt, completion, graph state, semantic slots, authoritative
results, or arbitrary exception text. It exports only SDK-owned spans through
an isolated tracer provider and applies a second export-stage denylist before
delivery. LangChain/LangGraph callbacks are not attached. Export failure is
non-authoritative and does not change an Agent response; FastAPI shutdown
performs a bounded telemetry flush.

User messages, provider responses, retrieved documents, and tool results are untrusted data—not system instructions or authorization. External text cannot grant tool permission. Validate tool output against its schema, apply policy/code before sensitive actions, redact secrets/sensitive data in logs, and do not retain raw prompt/conversation content indefinitely until a retention policy exists.
