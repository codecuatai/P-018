from fastapi import APIRouter, HTTPException

from src.agents.conversation import ride_concierge
from src.agents.graph import agent
from src.models.conversation import AgentAction
from src.models.schemas import ChatRequest, ChatResponse, RideActionRequest

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Process one user turn while retaining its conversation session."""
    try:
        result = await agent.ainvoke({"query": request.message, "session_id": request.session_id})
        return ChatResponse(
            response=result.get("response", ""),
            analysis=result.get("analysis", ""),
            session_id=result["session_id"],
            action=AgentAction(result.get("action", AgentAction.HELP.value)),
            missing_fields=result.get("missing_fields", []),
            data=result.get("data", {}),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Agent could not process this message") from exc


@router.post("/ride-actions", response_model=ChatResponse)
async def ride_action(request: RideActionRequest) -> ChatResponse:
    """Confirm or dismiss the quote currently displayed in the browser."""
    try:
        session_id, reply = await ride_concierge.handle_quote_action(
            request.action, request.session_id, request.quote_id
        )
        return ChatResponse(
            response=reply.response,
            analysis=f"action={reply.action.value}",
            session_id=session_id,
            action=reply.action,
            missing_fields=reply.missing_fields,
            data=reply.data,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Ride action could not be processed") from exc


@router.get("/status")
async def agent_status():
    """Return runtime configuration without exposing provider secrets."""
    return {"status": "ready", "agent": "Ride Concierge / LangGraph", "provider": "groq"}
