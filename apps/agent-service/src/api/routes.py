import json
import logging
import os
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse

from src.agents.assistant_graph import assistant_agent, model_diagnostics
from src.agents.graph import agent as food_agent
from src.agents.healthcare_graph import agent as healthcare_agent
from src.agents.restaurant_graph import agent as restaurant_agent
from src.agents.ride_graph import agent as ride_agent
from src.api.dependencies import require_internal_auth
from src.application.workflow_store import workflow_store
from src.config import get_settings
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

router = APIRouter()
logger = logging.getLogger(__name__)


def _langfuse_config(
    user_id: str | None = None,
    session_id: str | None = None,
    trace_name: str = "assistant-chat",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    settings = get_settings()
    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        return None
    try:
        try:
            from langfuse.langchain import CallbackHandler
        except ImportError:
            try:
                from langfuse.callback import CallbackHandler
            except ImportError:
                from langfuse import CallbackHandler

        os.environ.setdefault("LANGFUSE_PUBLIC_KEY", settings.langfuse_public_key)
        os.environ.setdefault("LANGFUSE_SECRET_KEY", settings.langfuse_secret_key)
        os.environ.setdefault("LANGFUSE_BASE_URL", settings.langfuse_base_url or "https://us.cloud.langfuse.com")
        os.environ.setdefault("LANGFUSE_HOST", settings.langfuse_base_url or "https://us.cloud.langfuse.com")

        handler = CallbackHandler()
        config_meta = {
            "langfuse_user_id": user_id,
            "langfuse_session_id": session_id,
            "langfuse_tags": [trace_name],
            **(metadata or {}),
        }
        return {"callbacks": [handler], "metadata": config_meta}
    except Exception as exc:
        logger.warning("Langfuse callback initialization deferred: %s", exc)
        return None


@router.post("/assistant-chat", response_model=None)
async def assistant_chat(
    request: AssistantChatRequest,
    x_internal_service_token: str | None = Header(default=None),
    x_actor_id: str | None = Header(default=None),
) -> dict[str, Any]:
    """Plan one or more X-One tasks; the Gateway remains the side-effect owner."""
    settings = get_settings()
    if (
        not x_internal_service_token
        or x_internal_service_token != settings.internal_service_token
        or not x_actor_id
        or x_actor_id != request.user_id
    ):
        raise HTTPException(
            status_code=401, detail={"code": "UNAUTHORIZED", "detail": "Gateway authentication required."}
        )
    try:
        config = _langfuse_config(
            user_id=request.user_id,
            session_id=request.conversation_id,
            trace_name="assistant-chat",
            metadata={"correlation_id": request.correlation_id, "mode": request.mode},
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
            },
            config=config,
        )
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
            },
            "meta": {"request_id": request.correlation_id},
        }
    except Exception:
        logger.exception("Assistant planner execution failed")
        raise HTTPException(status_code=500, detail="Unable to process the assistant request.") from None


@router.post("/assistant-chat/stream")
async def assistant_chat_stream(
    request: AssistantChatRequest,
    x_internal_service_token: str | None = Header(default=None),
    x_actor_id: str | None = Header(default=None),
) -> StreamingResponse:
    """Stream assistant planning and token deltas via Server-Sent Events (SSE)."""
    settings = get_settings()
    if (
        not x_internal_service_token
        or x_internal_service_token != settings.internal_service_token
        or not x_actor_id
        or x_actor_id != request.user_id
    ):
        raise HTTPException(
            status_code=401, detail={"code": "UNAUTHORIZED", "detail": "Gateway authentication required."}
        )

    async def event_generator():
        try:
            status_payload = {"phase": "planning", "conversation_id": request.conversation_id}
            yield f"event: status\ndata: {json.dumps(status_payload, ensure_ascii=False)}\n\n"

            config = _langfuse_config(
                user_id=request.user_id,
                session_id=request.conversation_id,
                trace_name="assistant-chat-stream",
                metadata={"correlation_id": request.correlation_id, "mode": request.mode},
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
                },
                config=config,
            )

            plan_payload = {
                "conversation_id": request.conversation_id,
                "plan": result.get("plan", {}),
                "semantic_turn": result.get("semantic_turn", {}),
                "planning_decision": result.get("planning_decision", {}),
                "decision_source": result.get("decision_source", "deterministic"),
            }
            yield f"event: plan\ndata: {json.dumps(plan_payload, ensure_ascii=False)}\n\n"

            message = result.get("assistant_message", "Mình sẽ giúp bạn xử lý yêu cầu này.")
            words = message.split(" ")
            for i in range(0, len(words), 3):
                chunk = " ".join(words[i : i + 3]) + (" " if i + 3 < len(words) else "")
                yield f"event: delta\ndata: {json.dumps({'delta': chunk}, ensure_ascii=False)}\n\n"

            finish_payload = {
                "conversation_id": request.conversation_id,
                "assistant_message": message,
                "model": result.get("model", settings.gemini_model),
                "fallback_model": result.get("fallback_model", settings.gemini_fallback_model),
            }
            yield f"event: finish\ndata: {json.dumps(finish_payload, ensure_ascii=False)}\n\n"
        except Exception as exc:
            logger.exception("Assistant stream execution failed: %s", exc)
            yield f"event: error\ndata: {json.dumps({'error': 'Unable to process streaming request.'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/chat", response_model=None)
async def chat(
    request: ChatRequest,
    x_internal_service_token: str | None = Header(default=None),
    x_actor_id: str | None = Header(default=None),
) -> dict[str, Any]:
    """Run the canonical Food conversation graph for the Gateway."""
    settings = get_settings()
    if (
        not x_internal_service_token
        or x_internal_service_token != settings.internal_service_token
        or not x_actor_id
        or x_actor_id != request.user_id
    ):
        raise HTTPException(
            status_code=401, detail={"code": "UNAUTHORIZED", "detail": "Gateway authentication required."}
        )
    try:
        config = _langfuse_config(
            user_id=request.user_id,
            session_id=request.conversation_id,
            trace_name="food-chat",
            metadata={"correlation_id": request.correlation_id},
        )
        result = await food_agent.ainvoke(
            {
                "query": request.message,
                "user_id": request.user_id,
                "conversation_id": request.conversation_id,
                "messages": request.messages,
                "workflow_context": request.workflow_context,
                "correlation_id": request.correlation_id,
            },
            config=config,
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
            meta={
                "conversation_id": request.conversation_id,
                "request_id": request.correlation_id,
                "tool_calls": result.get("tool_calls", []),
            },
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
    x_actor_id: str | None = Header(default=None),
    _auth: None = Depends(require_internal_auth),
) -> dict[str, Any]:
    """Return typed Restaurant tool requests through a separate agent contract."""
    workflow_id = request.workflow_id or f"wf-{uuid4().hex}"
    actor_id = x_actor_id or str(request.context.get("actor_id", "anonymous"))
    previous = workflow_store.get(actor_id, workflow_id)
    merged_context = {**previous, **request.context}
    if not request.context.get("tool_result_only"):
        # A rendered read result remains authoritative for the next user turn,
        # but it must not force the agent into result-only response mode.
        merged_context.pop("tool_result_only", None)
    try:
        config = _langfuse_config(
            user_id=actor_id,
            session_id=workflow_id,
            trace_name="restaurant-chat",
        )
        result = await restaurant_agent.ainvoke(
            {
                "query": request.message,
                "workflow_id": workflow_id,
                "turn_id": request.client_turn_id or uuid4().hex,
                "actor_id": actor_id,
                "intent": previous.get("intent"),
                "slots": previous.get("slots", {}),
                "context": merged_context,
            },
            config=config,
        )
        workflow_store.save(
            actor_id,
            workflow_id,
            {**previous, **request.context, **result, "workflow_id": workflow_id, "actor_id": actor_id},
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
        return {"data": response.model_dump(), "meta": {"request_id": None}}
    except Exception:
        logger.exception("Restaurant agent execution failed")
        raise HTTPException(status_code=500, detail="Unable to process the restaurant workflow.") from None


@router.post("/healthcare-chat", response_model=None)
async def healthcare_chat(
    request: HealthcareChatRequest,
    x_actor_id: str | None = Header(default=None),
    _auth: None = Depends(require_internal_auth),
) -> dict[str, Any]:
    """Return typed Healthcare tool requests without calling the Healthcare service."""
    workflow_id = request.workflow_id or f"wf-{uuid4().hex}"
    actor_id = x_actor_id or str(request.context.get("actor_id", "anonymous"))
    previous = workflow_store.get(actor_id, workflow_id)
    merged_context = {
        **previous.get("context", {}),
        "slots": {**previous.get("slots", {}), **request.context.get("slots", {})},
        **request.context,
    }
    if not request.context.get("tool_result_only"):
        # Keep the last authoritative tool result for the next user turn. This
        # is what lets a confirmation answer resolve the held resource without
        # asking the user to repeat an internal ID.
        merged_context.pop("tool_result_only", None)
    try:
        config = _langfuse_config(
            user_id=actor_id,
            session_id=workflow_id,
            trace_name="healthcare-chat",
        )
        result = await healthcare_agent.ainvoke(
            {
                "query": request.message,
                "workflow_id": workflow_id,
                "turn_id": request.client_turn_id or uuid4().hex,
                "actor_id": actor_id,
                "intent": previous.get("intent"),
                "slots": previous.get("slots", {}),
                "context": merged_context,
            },
            config=config,
        )
        workflow_store.save(
            actor_id,
            workflow_id,
            {**previous, **result, "context": merged_context, "workflow_id": workflow_id, "actor_id": actor_id},
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
        return {"data": response.model_dump(), "meta": {"request_id": None}}
    except Exception:
        logger.exception("Healthcare agent execution failed")
        raise HTTPException(status_code=500, detail="Unable to process the healthcare workflow.") from None


@router.post("/ride-chat", response_model=None)
async def ride_chat(
    request: RideChatRequest,
    _auth: None = Depends(require_internal_auth),
) -> dict[str, Any]:
    """Return a deterministic Ride state patch and typed tool request."""
    try:
        config = _langfuse_config(
            session_id=request.workflow_id,
            trace_name="ride-chat",
        )
        result = await ride_agent.ainvoke(
            {
                "query": request.message,
                "workflow_id": request.workflow_id,
                "turn_id": request.client_turn_id or uuid4().hex,
                "context": request.context,
            },
            config=config,
        )
        response = RideChatResponse(
            response=result.get("response", ""),
            workflow_id=request.workflow_id,
            intent=result.get("intent", "help"),
            missing_fields=result.get("missing_fields", []),
            state_patch=result.get("state_patch", {}),
            tool_request=result.get("tool_request"),
        )
        return {"data": response.model_dump(), "meta": {"request_id": None}}
    except Exception:
        logger.exception("Ride agent execution failed")
        raise HTTPException(status_code=500, detail="Unable to process the ride workflow.") from None


@router.get("/status")
async def agent_status(_auth: None = Depends(require_internal_auth)) -> dict[str, Any]:
    """Check agent readiness without exposing provider details."""
    return {"status": "ready", "agent": "LangGraph Agent v1.0", **model_diagnostics()}
