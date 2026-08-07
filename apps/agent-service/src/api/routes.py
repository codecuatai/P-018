import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException

from src.application.workflow_store import workflow_store
from src.agents.graph import agent
from src.api.dependencies import require_internal_auth
from src.models.schemas import ChatRequest, ChatResponse

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    x_actor_id: str | None = Header(default=None),
    _auth: None = Depends(require_internal_auth),
) -> ChatResponse:
    """Chat với AI agent."""
    try:
        workflow_id = request.workflow_id or f"wf-{uuid4().hex}"
        actor_id = x_actor_id or str(request.context.get("actor_id", "anonymous"))
        previous = workflow_store.get(actor_id, workflow_id)
        merged_context = {**previous, **request.context}
        # Keep the marker for gateway grounding calls.  Removing it here makes
        # a tool result look like a new user turn and can trigger a duplicate
        # write (or repeat the previous restaurant list).
        if not request.context.get("tool_result_only"):
            merged_context.pop("tool_result_only", None)
        result = await agent.ainvoke({
            "query": request.message,
            "workflow_id": workflow_id,
            "turn_id": request.client_turn_id or uuid4().hex,
            "actor_id": actor_id,
            "intent": previous.get("intent"),
            "slots": previous.get("slots", {}),
            "context": merged_context,
        })
        workflow_store.save(actor_id, workflow_id, {**previous, **request.context, **result, "workflow_id": workflow_id, "actor_id": actor_id})
        return ChatResponse(
            response=result.get("response", ""),
            workflow_id=workflow_id,
            intent=result.get("intent"),
            slots=result.get("slots", {}),
            missing_slots=result.get("missing_slots", []),
            tool_request=result.get("tool_request"),
            status=result.get("status", "COMPLETED"),
        )
    except Exception:
        logger.exception("Agent chat execution failed")
        raise HTTPException(status_code=500, detail="Unable to process the chat request.") from None


@router.get("/status")
async def agent_status(_auth: None = Depends(require_internal_auth)):
    """Kiểm tra trạng thái agent."""
    return {"status": "ready", "agent": "LangGraph Agent v1.0"}
