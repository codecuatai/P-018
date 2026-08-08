from fastapi import APIRouter, Depends, Header, HTTPException, Request, status

from src.api.auth import require_internal_auth
from src.api.idempotency import require_idempotency_key
from src.api.v1.restaurants import envelope
from src.models.schemas import HoldCreateRequest, ReservationCreateRequest, ReservationUpdateRequest

router = APIRouter(tags=["Reservations"])


@router.post("/reservation-holds", status_code=status.HTTP_201_CREATED)
def create_hold(body: HoldCreateRequest, request: Request, idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"), actor_id=Depends(require_internal_auth)):
    key = require_idempotency_key(idempotency_key)
    try:
        result = request.app.state.restaurant_service.create_hold(actor_id, body.restaurant_id, body.party_size, body.start_at, body.duration_minutes, key)
        return envelope(result, request)
    except ValueError as exc:
        code = str(exc)
        status_code = 409 if code in {"CAPACITY_UNAVAILABLE", "IDEMPOTENCY_PAYLOAD_MISMATCH"} else 422
        raise HTTPException(status_code=status_code, detail=code) from exc


@router.post("/reservations", status_code=status.HTTP_201_CREATED)
def create_reservation(body: ReservationCreateRequest, request: Request, idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"), actor_id=Depends(require_internal_auth)):
    key = require_idempotency_key(idempotency_key)
    try:
        result = request.app.state.restaurant_service.create_reservation(actor_id, body.restaurant_id, body.party_size, body.start_at, body.duration_minutes, body.special_requests, key, body.hold_id)
        return envelope(result, request)
    except ValueError as exc:
        code = str(exc)
        status_code = 409 if code in {"CAPACITY_UNAVAILABLE", "HOLD_INVALID", "HOLD_PAYLOAD_MISMATCH", "IDEMPOTENCY_PAYLOAD_MISMATCH"} else 422
        raise HTTPException(status_code=status_code, detail=code) from exc


@router.get("/reservations/{reservation_id}")
def get_reservation(reservation_id: str, request: Request, actor_id=Depends(require_internal_auth)):
    result = request.app.state.restaurant_service.get_reservation(reservation_id, actor_id)
    if not result:
        raise HTTPException(status_code=404, detail="Reservation not found")
    return envelope(result, request)


@router.patch("/reservations/{reservation_id}")
def update_reservation(reservation_id: str, body: ReservationUpdateRequest, request: Request, idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"), actor_id=Depends(require_internal_auth)):
    key = require_idempotency_key(idempotency_key)
    try:
        result = request.app.state.restaurant_service.update_reservation(
            actor_id,
            reservation_id,
            party_size=body.party_size,
            start_at=body.start_at,
            special_requests=body.special_requests,
            key=key,
            fields_set=body.model_fields_set,
        )
        return envelope(result, request)
    except ValueError as exc:
        code = str(exc)
        status_code = 404 if code == "RESERVATION_NOT_FOUND" else 422 if code in {"PAST_START", "NAIVE_DATETIME", "NO_FIELDS_TO_UPDATE", "PARTY_SIZE_REQUIRED", "START_AT_REQUIRED"} else 409
        raise HTTPException(status_code=status_code, detail=code) from exc


@router.post("/reservations/{reservation_id}/cancel")
def cancel_reservation(reservation_id: str, request: Request, idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"), actor_id=Depends(require_internal_auth)):
    key = require_idempotency_key(idempotency_key)
    try:
        return envelope(request.app.state.restaurant_service.cancel_reservation(actor_id, reservation_id, key), request)
    except ValueError as exc:
        code = str(exc)
        raise HTTPException(status_code=404 if code == "RESERVATION_NOT_FOUND" else 409, detail=code) from exc
