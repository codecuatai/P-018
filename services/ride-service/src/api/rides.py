from __future__ import annotations

from datetime import UTC, datetime
from secrets import compare_digest
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from src.api.schemas import (
    BookingEnvelope,
    BookingOut,
    CancelBookingRequest,
    ConfirmationRequest,
    ConfirmBookingRequest,
    PrepareBookingRequest,
    QuoteCreate,
    QuoteEnvelope,
    QuoteOut,
    ResponseMeta,
    TrackingEnvelope,
    TrackingOut,
    UpdateBookingStatusRequest,
)
from src.application.ride_service import RideApplication
from src.config import get_settings
from src.domain.ride import (
    CancelBookingCommand,
    ConfirmationEvidence,
    ConfirmBookingCommand,
    PrepareBookingCommand,
    QuoteCommand,
    RideError,
    VehicleType,
)
from src.infrastructure.database import get_session
from src.infrastructure.sqlalchemy_repository import SqlAlchemyRideRepository

router = APIRouter(prefix="/v1", tags=["rides"])


def require_internal_service(
    token: Annotated[str | None, Header(alias="X-Internal-Service-Token")] = None,
) -> None:
    expected = get_settings().internal_service_token
    if token is None or not compare_digest(token, expected):
        raise RideError(401, "INTERNAL_AUTH_FAILED", "Internal service authentication failed.")


def require_actor(actor_id: Annotated[str | None, Header(alias="X-Actor-Id")] = None) -> str:
    if actor_id is None or not 1 <= len(actor_id) <= 128:
        raise RideError(400, "ACTOR_REQUIRED", "X-Actor-Id is required.")
    return actor_id


def require_idempotency_key(
    key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> str:
    if key is None or not 1 <= len(key) <= 128:
        raise RideError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.")
    return key


def application(session: Session) -> RideApplication:
    return RideApplication(SqlAlchemyRideRepository(session))


@router.post(
    "/quotes",
    response_model=QuoteEnvelope,
    status_code=201,
    dependencies=[Depends(require_internal_service)],
)
def create_quote(
    payload: QuoteCreate,
    request: Request,
    actor_id: Annotated[str, Depends(require_actor)],
    idempotency_key: Annotated[str, Depends(require_idempotency_key)],
    session: Annotated[Session, Depends(get_session)],
) -> QuoteEnvelope:
    result = application(session).create_quote(
        QuoteCommand(
            actor_id=actor_id,
            pickup_address=payload.pickup_address,
            dropoff_address=payload.dropoff_address,
            vehicle_type=VehicleType(payload.vehicle_type),
            promo_code=payload.promo_code,
            pickup_time=payload.pickup_time,
            passenger_count=payload.passenger_count,
            pickup_latitude=payload.pickup_latitude,
            pickup_longitude=payload.pickup_longitude,
            dropoff_latitude=payload.dropoff_latitude,
            dropoff_longitude=payload.dropoff_longitude,
            route_provider=payload.route_provider,
            route_distance_meters=payload.route_distance_meters,
            route_duration_seconds=payload.route_duration_seconds,
            route_geometry=payload.route_geometry,
            route_snapshot_hash=payload.route_snapshot_hash,
            stopovers=[item.model_dump() for item in payload.stopovers],
        ),
        idempotency_key,
    )
    return QuoteEnvelope(data=QuoteOut.model_validate(result), meta=_meta(request))


@router.get(
    "/quotes",
    dependencies=[Depends(require_internal_service)],
)
def list_quotes(
    request: Request,
    actor_id: Annotated[str, Depends(require_actor)],
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, object]:
    return {"data": {"items": [QuoteOut.model_validate(value) for value in application(session).list_quotes(actor_id)]}, "meta": _meta(request).model_dump(mode="json")}


@router.get(
    "/quotes/{quote_id}",
    response_model=QuoteEnvelope,
    dependencies=[Depends(require_internal_service)],
)
def get_quote(
    quote_id: str,
    request: Request,
    actor_id: Annotated[str, Depends(require_actor)],
    session: Annotated[Session, Depends(get_session)],
) -> QuoteEnvelope:
    result = application(session).get_quote(quote_id, actor_id)
    return QuoteEnvelope(data=QuoteOut.model_validate(result), meta=_meta(request))


@router.post(
    "/bookings:prepare",
    response_model=BookingEnvelope,
    status_code=201,
    dependencies=[Depends(require_internal_service)],
)
def prepare_booking(
    payload: PrepareBookingRequest,
    request: Request,
    actor_id: Annotated[str, Depends(require_actor)],
    idempotency_key: Annotated[str, Depends(require_idempotency_key)],
    session: Annotated[Session, Depends(get_session)],
) -> BookingEnvelope:
    result = application(session).prepare_booking(
        PrepareBookingCommand(
            actor_id=actor_id,
            quote_id=payload.quote_id,
            confirmation=_confirmation(payload.confirmation),
        ),
        idempotency_key,
    )
    return BookingEnvelope(data=BookingOut.model_validate(result), meta=_meta(request))


@router.post(
    "/bookings/{booking_id}:confirm",
    response_model=BookingEnvelope,
    dependencies=[Depends(require_internal_service)],
)
def confirm_booking(
    booking_id: str,
    payload: ConfirmBookingRequest,
    request: Request,
    actor_id: Annotated[str, Depends(require_actor)],
    idempotency_key: Annotated[str, Depends(require_idempotency_key)],
    session: Annotated[Session, Depends(get_session)],
) -> BookingEnvelope:
    result = application(session).confirm_booking(
        ConfirmBookingCommand(
            actor_id=actor_id,
            booking_id=booking_id,
            payment_reference=payload.payment_reference,
            confirmation=_confirmation(payload.confirmation),
        ),
        idempotency_key,
    )
    return BookingEnvelope(data=BookingOut.model_validate(result), meta=_meta(request))


@router.post(
    "/bookings/{booking_id}:cancel",
    response_model=BookingEnvelope,
    dependencies=[Depends(require_internal_service)],
)
def cancel_booking(
    booking_id: str,
    payload: CancelBookingRequest,
    request: Request,
    actor_id: Annotated[str, Depends(require_actor)],
    idempotency_key: Annotated[str, Depends(require_idempotency_key)],
    session: Annotated[Session, Depends(get_session)],
) -> BookingEnvelope:
    result = application(session).cancel_booking(
        CancelBookingCommand(
            actor_id=actor_id,
            booking_id=booking_id,
            confirmation=_confirmation(payload.confirmation),
        ),
        idempotency_key,
    )
    return BookingEnvelope(data=BookingOut.model_validate(result), meta=_meta(request))



@router.patch(
    "/bookings/{booking_id}:status",
    response_model=BookingEnvelope,
    dependencies=[Depends(require_internal_service)],
)
def update_booking_status(
    booking_id: str,
    payload: UpdateBookingStatusRequest,
    request: Request,
    actor_id: Annotated[str, Depends(require_actor)],
    idempotency_key: Annotated[str, Depends(require_idempotency_key)],
    session: Annotated[Session, Depends(get_session)],
) -> BookingEnvelope:
    result = application(session).update_status(
        booking_id=booking_id,
        actor_id=actor_id,
        target_status=payload.status,
        idempotency_key=idempotency_key,
    )
    return BookingEnvelope(data=BookingOut.model_validate(result), meta=_meta(request))


@router.get(
    "/bookings/{booking_id}",
    response_model=BookingEnvelope,
    dependencies=[Depends(require_internal_service)],
)
def get_booking(
    booking_id: str,
    request: Request,
    actor_id: Annotated[str, Depends(require_actor)],
    session: Annotated[Session, Depends(get_session)],
) -> BookingEnvelope:
    result = application(session).get_booking(booking_id, actor_id)
    return BookingEnvelope(data=BookingOut.model_validate(result), meta=_meta(request))


@router.get(
    "/bookings/{booking_id}/tracking",
    response_model=TrackingEnvelope,
    dependencies=[Depends(require_internal_service)],
)
def get_tracking(
    booking_id: str,
    request: Request,
    actor_id: Annotated[str, Depends(require_actor)],
    session: Annotated[Session, Depends(get_session)],
) -> TrackingEnvelope:
    return TrackingEnvelope(data=TrackingOut.model_validate(application(session).get_tracking(booking_id, actor_id)), meta=_meta(request))


@router.get(
    "/bookings",
    dependencies=[Depends(require_internal_service)],
)
def list_bookings(
    request: Request,
    actor_id: Annotated[str, Depends(require_actor)],
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, object]:
    return {"data": {"items": [BookingOut.model_validate(value) for value in application(session).list_bookings(actor_id)]}, "meta": _meta(request).model_dump(mode="json")}


@router.get("/internal/ops/summary", dependencies=[Depends(require_internal_service)])
def ops_summary(session: Annotated[Session, Depends(get_session)]) -> dict[str, object]:
    return {"data": SqlAlchemyRideRepository(session).ops_summary()}


@router.get("/internal/ops/dataset-status", dependencies=[Depends(require_internal_service)])
def ops_dataset_status(session: Annotated[Session, Depends(get_session)]) -> dict[str, object]:
    return {"data": SqlAlchemyRideRepository(session).ops_dataset_status()}


@router.get("/internal/ops/transactions", dependencies=[Depends(require_internal_service)])
def ops_transactions(session: Annotated[Session, Depends(get_session)], limit: int = 20, offset: int = 0) -> dict[str, object]:
    return {"data": SqlAlchemyRideRepository(session).ops_transactions(min(max(limit, 1), 100), max(offset, 0))}


def _confirmation(value: ConfirmationRequest) -> ConfirmationEvidence:
    return ConfirmationEvidence(**value.model_dump())


def _meta(request: Request) -> ResponseMeta:
    return ResponseMeta(request_id=request.state.correlation_id, timestamp=datetime.now(UTC))
