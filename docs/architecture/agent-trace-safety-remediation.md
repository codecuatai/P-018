# Agent trace safety remediation

This note records the issues observed in the supplied 198-event Langfuse export and the implemented controls.

## Observed issues

- All 14 planner root traces lacked user profile, recent messages, and conversation state.
- Food agent traces used `COMPLETED` for an agent turn that only proposed a Gateway-validated next step.
- Composer traces could receive more choices than the UI should expose and could use premature success wording.
- Generation and route observations included raw prompts or raw user messages.
- Gateway keyword classification could override a non-empty typed Agent plan.

## Implemented controls

- Gateway sends up to 20 recent messages plus the actor-scoped user profile and saved addresses.
- Completed tasks remain planner history and cannot be discarded by model output.
- A non-empty typed Agent plan is no longer reclassified by Gateway keyword lists.
- Agent-turn status is separate from domain workflow status: `NEEDS_INPUT`, `PROPOSAL_READY`, or `ERROR`.
- Composer input exposes only bounded public fields, at most three result envelopes and three choices per list.
- Premature success wording is rejected unless an authoritative `booking_confirmed` or `order_confirmed` result exists.
- Observability records message/prompt length and bounded metadata instead of raw user messages or raw prompts on the updated routes.

The Gateway/domain services remain authoritative for confirmation, idempotency, resource versions, prices, availability, and final transaction state.
