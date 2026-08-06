import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException

from src.agents.graph import agent
from src.config import get_settings
from src.models.schemas import AgentResponse, ChatRequest

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/chat", response_model=None)
async def chat(request: ChatRequest, x_internal_service_token: str | None = Header(default=None), x_actor_id: str | None = Header(default=None)) -> dict[str, Any]:
    """Chat với AI agent."""
    settings = get_settings()
    if x_internal_service_token != settings.internal_service_token or x_actor_id != request.user_id:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "detail": "Gateway authentication required."})
    try:
        result = await agent.ainvoke({"query": request.message, "user_id": request.user_id, "conversation_id": request.conversation_id, "messages": request.messages, "workflow_context": request.workflow_context, "correlation_id": request.correlation_id})
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
        response = AgentResponse(response_type=result.get("response_type", "text"), message=result.get("response", ""), response=result.get("response", ""), data=result.get("data", {}), pending_confirmation=result.get("pending_confirmation"), state_updates=state_updates, meta={"conversation_id": request.conversation_id, "request_id": request.correlation_id, "tool_calls": result.get("tool_calls", [])})
        return {"data": response.model_dump(), "meta": {"request_id": request.correlation_id}}
    except Exception:
        logger.exception("Agent chat execution failed")
        raise HTTPException(status_code=500, detail="Unable to process the chat request.") from None


@router.get("/status")
async def agent_status(x_internal_service_token: str | None = Header(default=None)):
    """Kiểm tra trạng thái agent."""
    if x_internal_service_token != get_settings().internal_service_token:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "detail": "Gateway authentication required."})
    return {"status": "ready", "agent": "LangGraph Agent v1.0"}
