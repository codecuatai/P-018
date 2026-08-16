from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException

from src.agents.assistant_graph import assistant_agent, deterministic_plan, model_diagnostics
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
from .dependencies import require_internal_auth

router = APIRouter()
logger = logging.getLogger(__name__)




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
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "detail": "Gateway authentication required."})
    try:
        fast_plan = deterministic_plan(request.message, request.conversation_state)
        if len(fast_plan.tasks) == 1:
            result = {
                "assistant_message": fast_plan.assistant_message,
                "plan": fast_plan.model_dump(),
                "decision_source": "deterministic",
            }
        else:
            result = await assistant_agent.ainvoke(
                {
                    "query": request.message,
                    "conversation_id": request.conversation_id,
                    "messages": request.messages,
                    "conversation_state": request.conversation_state,
                    "authoritative_results": request.authoritative_results,
                    "mode": request.mode,
                }
            )
        return {
            "data": {
                "conversation_id": request.conversation_id,
                "assistant_message": result.get("assistant_message", "Mình sẽ giúp bạn xử lý yêu cầu này."),
                "plan": result.get("plan", {}),
                "decision_source": result.get("decision_source", "deterministic"),
                "model": result.get("model", settings.gemini_model),
                "fallback_model": result.get("fallback_model", settings.gemini_fallback_model),
            },
            "meta": {"request_id": request.correlation_id},
        }
    except Exception:
        logger.exception("Assistant planner execution failed")
        raise HTTPException(status_code=500, detail="Unable to process the assistant request.") from None


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
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "detail": "Gateway authentication required."})
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
            elif result.get("intent") == "search_food" and isinstance(first, dict) and isinstance(first.get("items"), list) and first["items"]:
                item = first["items"][0]
                if isinstance(item, dict):
                    state_updates = {"restaurant_id": (item.get("restaurant") or {}).get("id") or item.get("restaurant_id")}
        if result.get("pending_confirmation") is not None:
            state_updates = {**state_updates, "pending_confirmation_id": result["pending_confirmation"].get("id")}
        response = AgentResponse(
            response_type=result.get("response_type", "text"),
            message=result.get("response", ""),
            response=result.get("response", ""),
            data=result.get("data", {}),
            pending_confirmation=result.get("pending_confirmation"),
            state_updates=state_updates,
            meta={"conversation_id": request.conversation_id, "request_id": request.correlation_id, "tool_calls": result.get("tool_calls", [])},
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
        result = await restaurant_agent.ainvoke(
            {
                "query": request.message,
                "workflow_id": workflow_id,
                "turn_id": request.client_turn_id or uuid4().hex,
                "actor_id": actor_id,
                "intent": previous.get("intent"),
                "slots": previous.get("slots", {}),
                "context": merged_context,
            }
        )
        workflow_store.save(actor_id, workflow_id, {**previous, **request.context, **result, "workflow_id": workflow_id, "actor_id": actor_id})
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
        result = await healthcare_agent.ainvoke(
            {
                "query": request.message,
                "workflow_id": workflow_id,
                "turn_id": request.client_turn_id or uuid4().hex,
                "actor_id": actor_id,
                "intent": previous.get("intent"),
                "slots": previous.get("slots", {}),
                "context": merged_context,
            }
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
        result = await ride_agent.ainvoke(
            {
                "query": request.message,
                "workflow_id": request.workflow_id,
                "turn_id": request.client_turn_id or uuid4().hex,
                "context": request.context,
            }
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
