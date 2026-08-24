from __future__ import annotations

import asyncio
from time import perf_counter
from uuid import uuid4

from src.agents.assistant_graph import assistant_agent
from src.config import get_settings
from src.observability.contracts import SafeObservationMetadata
from src.observability.telemetry import (
    initialize_telemetry,
    shutdown_telemetry,
)


async def run_smoke() -> int:
    """Submit one synthetic metadata-only Core A trace."""

    settings = get_settings()
    if not settings.langfuse_configured:
        print("Langfuse smoke skipped: key pair is not configured.")
        return 2

    telemetry = initialize_telemetry(settings)
    correlation_id = f"langfuse-smoke-{uuid4().hex}"
    started_at = perf_counter()
    with telemetry.observation(
        "agent.core_a.run",
        "agent",
        SafeObservationMetadata(
            correlation_id=correlation_id,
            route="assistant-chat",
            mode="plan",
            app_env=settings.app_env,
            tracing_enabled=True,
            status="started",
        ),
    ) as root_observation:
        with telemetry.observation(
            "request.validate",
            "guardrail",
            SafeObservationMetadata(
                route="assistant-chat",
                mode="plan",
                actor_assertion_valid=True,
                accepted=True,
                status="succeeded",
            ),
        ):
            pass
        result = await assistant_agent.ainvoke(
            {
                "query": "đặt xe máy từ Hồ Gươm đến Văn Miếu",
                "conversation_id": "langfuse-smoke",
                "messages": [],
                "conversation_state": {},
                "authoritative_results": [],
                "user_profile": {},
                "mode": "plan",
            }
        )
        decision = result["planning_decision"]
        source = result.get("decision_source", "deterministic")
        degraded = settings.agent_model_mode == "gemini" and source == "deterministic"
        root_observation.update(
            metadata=SafeObservationMetadata(
                correlation_id=correlation_id,
                route="assistant-chat",
                mode="plan",
                app_env=settings.app_env,
                tracing_enabled=True,
                decision_source=source,
                interaction_mode=decision["interaction_mode"],
                workflow_relation=decision["workflow_relation"],
                contract_version=decision["contract_version"],
                capability_catalog_version=decision[
                    "capability_catalog_version"
                ],
                task_count=len(decision["tasks"]),
                status="degraded" if degraded else "succeeded",
                latency_ms=max(0, int((perf_counter() - started_at) * 1000)),
            )
        )
    telemetry.flush()
    await shutdown_telemetry()
    print(f"Langfuse smoke trace submitted: correlation_id={correlation_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run_smoke()))
