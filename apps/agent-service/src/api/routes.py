import hashlib
import logging
from time import perf_counter
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from src.agents.assistant_graph import assistant_agent, model_diagnostics
from src.agents.graph import agent as food_agent
from src.agents.healthcare_graph import agent as healthcare_agent
from src.agents.restaurant_graph import agent as restaurant_agent
from src.agents.ride_graph import agent as ride_agent
from src.api.dependencies import require_actor, require_internal_auth
from src.application.run_metadata_store import (
    RunMetadata,
    RunMetadataConflictError,
    get_run_metadata_store,
)
from src.config import get_settings
from src.infrastructure.database import AgentPersistenceUnavailableError
from src.models.schemas import (
    AgentResponse,
    AssistantChatRequest,
    ChatRequest,
    ChatResponse,
    HealthcareChatRequest,
    RestaurantChatRequest,
    RideChatRequest,
    RideChatResponse,
)
from src.observability import (
    SafeObservationMetadata,
    format_human_plan_output,
    get_telemetry,
    safe_code,
)

router = APIRouter()

logger = logging.getLogger(__name__)


def _scoped_run_id(correlation_id: str | None, scope: str) -> str:
    """Give each Agent invocation a stable run ID within one correlation chain."""
    base = correlation_id or uuid4().hex
    candidate = f"{base}:{scope}"
    if len(candidate) <= 128:
        return candidate
    digest = hashlib.sha256(base.encode("utf-8")).hexdigest()
    return f"{digest}:{scope}"[:128]


def _capability_names(result: dict[str, Any]) -> list[str]:
    names: list[str] = []
    request = result.get("tool_request")
    if isinstance(request, dict) and isinstance(request.get("tool_name"), str):
        names.append(request["tool_name"])
    for call in result.get("tool_calls", []):
        if not isinstance(call, dict):
            continue
        name = call.get("capability_name") or call.get("name")
        if isinstance(name, str):
            names.append(name)
    decision = result.get("planning_decision")
    if isinstance(decision, dict):
        for task in decision.get("tasks", []):
            if not isinstance(task, dict):
                continue
            for step in task.get("steps", []):
                if not isinstance(step, dict):
                    continue
                name = step.get("capability_id") or step.get("capability")
                if isinstance(name, str):
                    names.append(name)
    return list(dict.fromkeys(names))[:16]


async def _record_run_untraced(
    *,
    actor_id: str,
    workflow_id: str,
    run_id: str,
    phase: str,
    result: dict[str, Any],
    started_at: float,
) -> None:
    try:
        await get_run_metadata_store().record(
            RunMetadata(
                actor_id=actor_id,
                workflow_id=workflow_id,
                run_id=run_id,
                phase=phase,
                capability_names=_capability_names(result),
                latency_ms=max(0, int((perf_counter() - started_at) * 1000)),
                error_code=(
                    str(result["error_code"])[:100]
                    if result.get("error_code") is not None
                    else None
                ),
            )
        )
    except RunMetadataConflictError as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": "RUN_METADATA_CONFLICT", "detail": str(exc)},
        ) from exc
    except AgentPersistenceUnavailableError as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AGENT_PERSISTENCE_UNAVAILABLE",
                "detail": "Required Agent persistence is unavailable.",
            },
        ) from exc


def _http_error_code(error: HTTPException) -> str:
    detail = error.detail
    if isinstance(detail, dict):
        code = safe_code(detail.get("code"))
        if code is not None:
            return code
    return "http_error"


async def _record_run(
    *,
    actor_id: str,
    workflow_id: str,
    run_id: str,
    phase: str,
    result: dict[str, Any],
    started_at: float,
) -> None:
    telemetry = get_telemetry()
    capabilities = _capability_names(result)
    persistence_started_at = perf_counter()
    with telemetry.observation(
        "run_metadata.persist",
        "span",
        SafeObservationMetadata(
            phase=safe_code(phase),
            capability_count=len(capabilities),
            status="started",
        ),
    ) as persistence_observation:
        try:
            await _record_run_untraced(
                actor_id=actor_id,
                workflow_id=workflow_id,
                run_id=run_id,
                phase=phase,
                result=result,
                started_at=started_at,
            )
        except HTTPException as error:
            persistence_observation.update(
                metadata=SafeObservationMetadata(
                    phase=safe_code(phase),
                    capability_count=len(capabilities),
                    status="failed",
                    error_code=_http_error_code(error),
                    latency_ms=max(
                        0,
                        int((perf_counter() - persistence_started_at) * 1000),
                    ),
                )
            )
            raise
        persistence_observation.update(
            metadata=SafeObservationMetadata(
                phase=safe_code(phase),
                capability_count=len(capabilities),
                status="succeeded",
                latency_ms=max(
                    0,
                    int((perf_counter() - persistence_started_at) * 1000),
                ),
            )
        )


@router.post("/assistant-chat", response_model=None)
async def assistant_chat(
    request: AssistantChatRequest,
    actor_id: str = Depends(require_actor),
) -> dict[str, Any]:
    """Plan one or more X-One tasks; the Gateway remains the side-effect owner."""
    settings = get_settings()
    run_id = _scoped_run_id(request.correlation_id, f"assistant-{request.mode}")
    trace_correlation_id = request.correlation_id or run_id
    started_at = perf_counter()
    telemetry = get_telemetry()
    trace_name = "Assistant: Plan" if request.mode == "plan" else "Assistant: Compose"
    root_metadata = SafeObservationMetadata(
        correlation_id=safe_code(trace_correlation_id, max_length=128),
        route="assistant-chat",
        mode=request.mode,
        app_env=settings.app_env,
        tracing_enabled=telemetry.enabled,
        status="started",
    )
    with telemetry.observation(
        trace_name,
        "agent",
        root_metadata,
        session_id=request.conversation_id,
        user_id=safe_code(request.user_id),
        tags=[f"mode:{request.mode}", f"env:{settings.app_env}"],
        input={
            "mode": request.mode,
            "conversation_id": request.conversation_id,
            "message_length": len(request.message),
        },
    ) as root_observation:
        try:
            with telemetry.observation(
                "request.validate",
                "guardrail",
                SafeObservationMetadata(
                    route="assistant-chat",
                    mode=request.mode,
                    actor_assertion_valid=actor_id == request.user_id,
                    status="started",
                ),
                input={"actor_id": actor_id, "user_id": request.user_id},
            ) as validation_observation:
                if actor_id != request.user_id:
                    validation_observation.update(
                        metadata=SafeObservationMetadata(
                            route="assistant-chat",
                            mode=request.mode,
                            actor_assertion_valid=False,
                            accepted=False,
                            status="failed",
                            error_code="ACTOR_MISMATCH",
                        ),
                        output={"accepted": False, "error": "Actor assertion does not match request body."},
                    )
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail={
                            "code": "ACTOR_MISMATCH",
                            "detail": "Actor assertion does not match the request body.",
                        },
                    )
                validation_observation.update(
                    metadata=SafeObservationMetadata(
                        route="assistant-chat",
                        mode=request.mode,
                        actor_assertion_valid=True,
                        accepted=True,
                        status="succeeded",
                    ),
                    output={"accepted": True, "actor_id": actor_id},
                )

            result = await assistant_agent.ainvoke(
                {
                    "query": request.message,
                    "conversation_id": request.conversation_id,
                    "messages": request.messages,
                    "conversation_state": request.conversation_state,
                    "capability_snapshot": request.capability_snapshot,
                    "authoritative_results": request.authoritative_results,
                    "user_profile": request.user_profile,
                    "mode": request.mode,
                }
            )
            await _record_run(
                actor_id=request.user_id,
                workflow_id=request.conversation_id,
                run_id=run_id,
                phase="COMPOSED" if request.mode == "compose" else "PLANNED",
                result=result,
                started_at=started_at,
            )
            decision = (
                result.get("planning_decision")
                if isinstance(result.get("planning_decision"), dict)
                else {}
            )
            tasks = decision.get("tasks") if isinstance(decision, dict) else []
            task_count = min(len(tasks), 4) if isinstance(tasks, list) else 0
            source = (
                result.get("decision_source")
                if result.get("decision_source") in {"model", "deterministic"}
                else "deterministic"
            )
            degraded = (
                settings.agent_model_mode == "gemini"
                and source == "deterministic"
            )
            interaction_mode = decision.get("interaction_mode")
            if interaction_mode not in {"service", "chitchat", "advisory", "unsupported"}:
                interaction_mode = None
            workflow_relation = decision.get("workflow_relation")
            if workflow_relation not in {
                "SINGLE_TASK",
                "INDEPENDENT_TASKS",
                "DEPENDENT_TASKS",
                "MIXED",
            }:
                workflow_relation = None
            output_summary = format_human_plan_output(decision, result.get("assistant_message"))
            root_observation.update(
                metadata=SafeObservationMetadata(
                    correlation_id=safe_code(trace_correlation_id, max_length=128),
                    route="assistant-chat",
                    mode=request.mode,
                    app_env=settings.app_env,
                    tracing_enabled=telemetry.enabled,
                    decision_source=source,
                    interaction_mode=interaction_mode,
                    workflow_relation=workflow_relation,
                    contract_version=safe_code(decision.get("contract_version")),
                    capability_catalog_version=safe_code(
                        decision.get("capability_catalog_version")
                    ),
                    task_count=task_count,
                    status="degraded" if degraded else "succeeded",
                    latency_ms=max(0, int((perf_counter() - started_at) * 1000)),
                ),
                output=output_summary,
            )
            usage = result.get("usage")
            return {
                "data": {
                    "conversation_id": request.conversation_id,
                    "assistant_message": result.get("assistant_message", "Mình sẽ giúp bạn xử lý yêu cầu này."),
                    "plan": result.get("plan", {}),
                    "semantic_turn": result.get("semantic_turn", {}),
                    "planning_decision": result.get("planning_decision", {}),
                    "decision_source": result.get("decision_source", "deterministic"),
                    "model": result.get("model", settings.gemini_model),
                    "fallback_model": result.get("fallback_model", settings.gemini_fallback_model),
                    "usage": usage,
                },
                "meta": {
                    "request_id": request.correlation_id,
                    "usage": usage,
                },
            }
        except HTTPException as error:
            root_observation.update(
                metadata=SafeObservationMetadata(
                    correlation_id=safe_code(trace_correlation_id, max_length=128),
                    route="assistant-chat",
                    mode=request.mode,
                    app_env=settings.app_env,
                    tracing_enabled=telemetry.enabled,
                    status="failed",
                    error_code=_http_error_code(error),
                    latency_ms=max(0, int((perf_counter() - started_at) * 1000)),
                ),
                output={"error": _http_error_code(error)},
            )
            raise
        except Exception:
            root_observation.update(
                metadata=SafeObservationMetadata(
                    correlation_id=safe_code(trace_correlation_id, max_length=128),
                    route="assistant-chat",
                    mode=request.mode,
                    app_env=settings.app_env,
                    tracing_enabled=telemetry.enabled,
                    status="failed",
                    error_code="agent_execution_failed",
                    latency_ms=max(0, int((perf_counter() - started_at) * 1000)),
                ),
                output={"error": "agent_execution_failed"},
            )
            logger.exception("Assistant planner execution failed")
            raise HTTPException(status_code=500, detail="Unable to process the assistant request.") from None


@router.post("/chat", response_model=None)
async def chat(
    request: ChatRequest,
    actor_id: str = Depends(require_actor),
) -> dict[str, Any]:
    """Run the canonical Food conversation graph for the Gateway."""
    settings = get_settings()
    telemetry = get_telemetry()
    if actor_id != request.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACTOR_MISMATCH", "detail": "Actor assertion does not match the request body."},
        )
    run_id = _scoped_run_id(request.correlation_id, "food")
    started_at = perf_counter()
    with telemetry.observation(
        "Food Agent: Chat",
        "agent",
        session_id=request.conversation_id,
        user_id=safe_code(request.user_id),
        tags=["domain:food", f"env:{settings.app_env}"],
        input={"conversation_id": request.conversation_id, "message_length": len(request.message)},
    ) as food_observation:
        try:
            result = await food_agent.ainvoke(
                {
                    "query": request.message,
                    "user_id": request.user_id,
                    "conversation_id": request.conversation_id,
                    "messages": request.messages,
                    "workflow_context": request.workflow_context,
                    "correlation_id": request.correlation_id,
                }
            )
            state_updates = result.get("state_updates", {})
            if not state_updates and result.get("tool_results"):
                first = result["tool_results"][0].get("data", {})
                if result.get("intent") == "create_cart" and isinstance(first, dict) and first.get("id"):
                    state_updates = {"cart_id": first["id"]}
                elif (
                    result.get("intent") == "search_food"
                    and isinstance(first, dict)
                    and isinstance(first.get("items"), list)
                    and first["items"]
                ):
                    item = first["items"][0]
                    if isinstance(item, dict):
                        state_updates = {
                            "restaurant_id": (item.get("restaurant") or {}).get("id") or item.get("restaurant_id")
                        }
            if result.get("pending_confirmation") is not None:
                state_updates = {**state_updates, "pending_confirmation_id": result["pending_confirmation"].get("id")}
            response = AgentResponse(
                response_type=result.get("response_type", "text"),
                message=result.get("response", ""),
                response=result.get("response", ""),
                data=result.get("data", {}),
                pending_confirmation=result.get("pending_confirmation"),
                state_updates=state_updates,
                turn_status=(
                    "NEEDS_INPUT" if result.get("missing_slots") or result.get("missing_options")
                    else "ERROR" if result.get("error")
                    else "PROPOSAL_READY"
                ),
                meta={
                    "conversation_id": request.conversation_id,
                    "request_id": request.correlation_id,
                    "tool_calls": result.get("tool_calls", []),
                },
            )
            await _record_run(
                actor_id=request.user_id,
                workflow_id=request.conversation_id,
                run_id=run_id,
                phase=(
                    "NEEDS_INPUT" if result.get("missing_slots") or result.get("missing_options")
                    else "ERROR" if result.get("error")
                    else "PROPOSAL_READY"
                ),
                result=result,
                started_at=started_at,
            )
            food_observation.update(
                output={
                    "response": result.get("response", ""),
                    "intent": result.get("intent"),
                    "turn_status": response.turn_status,
                }
            )
            return {"data": response.model_dump(), "meta": {"request_id": request.correlation_id}}
        except HTTPException:
            raise
        except Exception:
            logger.exception("Agent chat execution failed")
            raise HTTPException(status_code=500, detail="Unable to process the chat request.") from None


@router.post("/restaurant-chat", response_model=None)
async def restaurant_chat(
    request: RestaurantChatRequest,
    actor_id: str = Depends(require_actor),
) -> dict[str, Any]:
    """Return typed Restaurant tool requests through a separate agent contract."""
    settings = get_settings()
    telemetry = get_telemetry()
    workflow_id = request.workflow_id or f"wf-{uuid4().hex}"
    run_id = request.client_turn_id or uuid4().hex
    started_at = perf_counter()
    context = dict(request.context)
    with telemetry.observation(
        "Restaurant Agent: Chat",
        "agent",
        session_id=workflow_id,
        user_id=safe_code(actor_id),
        tags=["domain:restaurant", f"env:{settings.app_env}"],
        input={"workflow_id": workflow_id, "message_length": len(request.message)},
    ) as rest_observation:
        try:
            result = await restaurant_agent.ainvoke(
                {
                    "query": request.message,
                    "workflow_id": workflow_id,
                    "turn_id": run_id,
                    "actor_id": actor_id,
                    "intent": context.get("intent"),
                    "slots": context.get("slots", {}),
                    "context": context,
                }
            )
            await _record_run(
                actor_id=actor_id,
                workflow_id=workflow_id,
                run_id=run_id,
                phase=str(result.get("status", "COMPLETED")),
                result=result,
                started_at=started_at,
            )
            response = ChatResponse(
                response=result.get("response", ""),
                workflow_id=workflow_id,
                intent=result.get("intent"),
                slots=result.get("slots", {}),
                missing_slots=result.get("missing_slots", []),
                tool_request=result.get("tool_request"),
                status=result.get("status", "COMPLETED"),
            )
            rest_observation.update(
                output={
                    "response": result.get("response", ""),
                    "intent": result.get("intent"),
                    "status": result.get("status", "COMPLETED"),
                }
            )
            return {"data": response.model_dump(), "meta": {"request_id": None}}
        except HTTPException:
            raise
        except Exception:
            logger.exception("Restaurant agent execution failed")
            raise HTTPException(status_code=500, detail="Unable to process the restaurant workflow.") from None


@router.post("/healthcare-chat", response_model=None)
async def healthcare_chat(
    request: HealthcareChatRequest,
    actor_id: str = Depends(require_actor),
) -> dict[str, Any]:
    """Return typed Healthcare tool requests without calling the Healthcare service."""
    settings = get_settings()
    telemetry = get_telemetry()
    workflow_id = request.workflow_id or f"wf-{uuid4().hex}"
    run_id = request.client_turn_id or uuid4().hex
    started_at = perf_counter()
    context = dict(request.context)
    with telemetry.observation(
        "Healthcare Agent: Chat",
        "agent",
        session_id=workflow_id,
        user_id=safe_code(actor_id),
        tags=["domain:healthcare", f"env:{settings.app_env}"],
        input={"workflow_id": workflow_id, "message_length": len(request.message)},
    ) as health_observation:
        try:
            result = await healthcare_agent.ainvoke(
                {
                    "query": request.message,
                    "workflow_id": workflow_id,
                    "turn_id": run_id,
                    "actor_id": actor_id,
                    "intent": context.get("intent"),
                    "slots": context.get("slots", {}),
                    "context": context,
                }
            )
            await _record_run(
                actor_id=actor_id,
                workflow_id=workflow_id,
                run_id=run_id,
                phase=str(result.get("status", "COMPLETED")),
                result=result,
                started_at=started_at,
            )
            response = ChatResponse(
                response=result.get("response", ""),
                workflow_id=workflow_id,
                intent=result.get("intent"),
                slots=result.get("slots", {}),
                missing_slots=result.get("missing_slots", []),
                tool_request=result.get("tool_request"),
                status=result.get("status", "COMPLETED"),
            )
            health_observation.update(
                output={
                    "response": result.get("response", ""),
                    "intent": result.get("intent"),
                    "status": result.get("status", "COMPLETED"),
                }
            )
            return {"data": response.model_dump(), "meta": {"request_id": None}}
        except HTTPException:
            raise
        except Exception:
            logger.exception("Healthcare agent execution failed")
            raise HTTPException(status_code=500, detail="Unable to process the healthcare workflow.") from None


@router.post("/ride-chat", response_model=None)
async def ride_chat(
    request: RideChatRequest,
    actor_id: str = Depends(require_actor),
) -> dict[str, Any]:
    """Return a deterministic Ride state patch and typed tool request."""
    settings = get_settings()
    telemetry = get_telemetry()
    run_id = request.client_turn_id or uuid4().hex
    started_at = perf_counter()
    with telemetry.observation(
        "Ride Agent: Chat",
        "agent",
        session_id=request.workflow_id,
        user_id=safe_code(actor_id),
        tags=["domain:ride", f"env:{settings.app_env}"],
        input={"workflow_id": request.workflow_id, "message_length": len(request.message)},
    ) as ride_observation:
        try:
            result = await ride_agent.ainvoke(
                {
                    "query": request.message,
                    "workflow_id": request.workflow_id,
                    "turn_id": run_id,
                    "context": request.context,
                }
            )
            await _record_run(
                actor_id=actor_id,
                workflow_id=request.workflow_id,
                run_id=run_id,
                phase="IN_PROGRESS" if result.get("tool_request") else "NEEDS_INFO",
                result=result,
                started_at=started_at,
            )
            response = RideChatResponse(
                response=result.get("response", ""),
                workflow_id=request.workflow_id,
                intent=result.get("intent", "help"),
                missing_fields=result.get("missing_fields", []),
                state_patch=result.get("state_patch", {}),
                tool_request=result.get("tool_request"),
            )
            ride_observation.update(
                output={
                    "response": result.get("response", ""),
                    "intent": result.get("intent", "help"),
                    "has_tool_request": bool(result.get("tool_request")),
                }
            )
            return {"data": response.model_dump(), "meta": {"request_id": None}}
        except HTTPException:
            raise
        except Exception:
            logger.exception("Ride agent execution failed")
            raise HTTPException(status_code=500, detail="Unable to process the ride workflow.") from None


@router.get("/status")
async def agent_status(_auth: None = Depends(require_internal_auth)) -> dict[str, Any]:
    """Check agent readiness without exposing provider details."""
    return {"status": "ready", "agent": "LangGraph Agent v1.0", **model_diagnostics()}

