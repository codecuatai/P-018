from fastapi import APIRouter, HTTPException, status
from src.application.restaurant_service import RestaurantApplicationService
from src.models.schemas import (
    ReservationCreateRequest,
    ReservationResponse,
    ReservationUpdateRequest,
)

router = APIRouter(prefix="/reservations", tags=["Reservations"])
_service = RestaurantApplicationService()


@router.post("", response_model=ReservationResponse, status_code=status.HTTP_201_CREATED)
def create_reservation(request: ReservationCreateRequest):
    try:
        reservation = _service.create_reservation(
            user_id=request.user_id,
            restaurant_id=request.restaurant_id,
            party_size=request.party_size,
            booking_time=request.booking_time,
            special_requests=request.special_requests,
            idempotency_key=request.idempotency_key
        )
        return ReservationResponse(**reservation.model_dump())
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err)
        )


@router.get("/{reservation_id}", response_model=ReservationResponse)
def get_reservation(reservation_id: str):
    reservation = _service.get_reservation(reservation_id)
    if not reservation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reservation '{reservation_id}' not found"
        )
    return ReservationResponse(**reservation.model_dump())


@router.put("/{reservation_id}", response_model=ReservationResponse)
def update_reservation(reservation_id: str, request: ReservationUpdateRequest):
    try:
        reservation = _service.update_reservation(
            reservation_id=reservation_id,
            party_size=request.party_size,
            booking_time=request.booking_time,
            special_requests=request.special_requests
        )
        return ReservationResponse(**reservation.model_dump())
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err)
        )


@router.delete("/{reservation_id}", response_model=ReservationResponse)
def cancel_reservation(reservation_id: str):
    try:
        reservation = _service.cancel_reservation(reservation_id)
        return ReservationResponse(**reservation.model_dump())
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err)
        )
