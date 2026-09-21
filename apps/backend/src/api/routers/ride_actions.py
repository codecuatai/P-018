"""Explicit user actions on an active Ride quote."""

from fastapi import APIRouter, HTTPException

from src.application.domains.ride.workflow import ride_workflow
from src.contracts.chat import ChatResponse, RideActionRequest

router = APIRouter()


@router.post("/ride-actions", response_model=ChatResponse)
async def ride_action(request: RideActionRequest) -> ChatResponse:
    try:
        session_id, reply = await ride_workflow.handle_quote_action(
            request.action, request.session_id, request.quote_id
        )
        return ChatResponse(
            response=reply.response,
            analysis=f"agent=ride; action={reply.action.value}",
            session_id=session_id,
            action=reply.action,
            missing_fields=reply.missing_fields,
            data={**reply.data, "route": "ride", "workflow": "ride"},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "ride_action_processing_error",
                "message": "Không thể thực hiện thao tác chuyến xe ở thời điểm này.",
                "exception_type": type(exc).__name__,
            },
        ) from exc



