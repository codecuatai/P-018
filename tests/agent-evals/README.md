# Agent Evaluations

**This directory is currently empty** — no evaluation suite is checked in.

The deterministic planner checks that exist today live with the Agent, not here:

| Concern | Actual location |
| --- | --- |
| Intent reconciliation | `apps/agent-service/tests/test_agents/test_intent_reconciliation.py` |
| Slot filling / multi-turn context | `apps/agent-service/tests/test_agents/test_multiturn_context.py` |
| Structured-output schema safety | `apps/agent-service/tests/test_agents/test_structured_output.py` |
| Model fallback behavior | `apps/agent-service/tests/test_services/test_llm_fallback.py` |
| Per-domain graphs | `test_assistant_graph.py`, `test_healthcare_graph.py`, `test_restaurant_booking_flow.py`, `test_vertical_flow.py` |

Run them with `pnpm check:agent` from the repository root, or `python -m pytest apps/agent-service/tests -q`.

Add deterministic intent, slot-filling, and tool-selection evaluations here before changing prompts or models. Evaluations must use fake LLMs by default and never call Gemini — see [testing strategy](../../docs/development/testing-strategy.md). Scored/measured product metrics are a separate, currently unbuilt concern; [eval/results/report.md](../../eval/results/report.md) records them as `not measured`.
