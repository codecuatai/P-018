"""HTTP endpoints for the Concierge Graph and runtime capability discovery."""

from fastapi import APIRouter, HTTPException

from src.application.domains.registry import workflow_registry
from src.application.orchestration.graph import concierge_graph
from src.contracts.chat import AgentAction, ChatRequest, ChatResponse

router = APIRouter()


def _unexpected_agent_error(exc: Exception) -> HTTPException:
    """Return diagnostic information for this response only; do not persist it."""
    return HTTPException(
        status_code=500,
        detail={
            "code": "concierge_processing_error",
            "message": "Concierge Graph không thể xử lý yêu cầu ở thời điểm này.",
            "exception_type": type(exc).__name__,
        },
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    try:
        result = await concierge_graph.ainvoke({"query": request.message, "session_id": request.session_id})
        return ChatResponse(
            response=result.get("response", ""),
            analysis=result.get("analysis", ""),
            session_id=result["session_id"],
            action=AgentAction(result.get("action", AgentAction.HELP.value)),
            missing_fields=result.get("missing_fields", []),
            data=result.get("data", {}),
        )
    except Exception as exc:
        raise _unexpected_agent_error(exc) from exc


@router.get("/status")
async def agent_status():
    return {
        "status": "ready",
        "architecture": "single_concierge_graph",
        "workflows": workflow_registry.capabilities,
        "connected_domains": workflow_registry.connected_domains,
        "rag_enabled": False,
    }

