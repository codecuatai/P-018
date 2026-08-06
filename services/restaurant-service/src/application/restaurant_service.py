from datetime import datetime, timezone
import uuid
from typing import List, Optional
from src.domain.restaurant import Restaurant, Reservation, ReservationStatus, TableAvailability
from src.repositories.restaurant_repository import RestaurantRepository


class RestaurantApplicationService:
    def __init__(self, repo: Optional[RestaurantRepository] = None):
        self.repo = repo or RestaurantRepository()

    def search_restaurants(
        self,
        location: Optional[str] = None,
        cuisine_type: Optional[str] = None,
        budget_range: Optional[str] = None
    ) -> List[Restaurant]:
        return self.repo.list_restaurants(location=location, cuisine_type=cuisine_type, budget_range=budget_range)

    def get_restaurant(self, restaurant_id: str) -> Optional[Restaurant]:
        return self.repo.get_restaurant_by_id(restaurant_id)

    def check_availability(self, restaurant_id: str, party_size: int, booking_time: str) -> TableAvailability:
        restaurant = self.repo.get_restaurant_by_id(restaurant_id)
        if not restaurant:
            return TableAvailability(
                restaurant_id=restaurant_id,
                booking_time=booking_time,
                party_size=party_size,
                available=False,
                available_tables=0,
                message="Restaurant not found"
            )

        existing_reservations = self.repo.get_active_reservations_for_time(restaurant_id, booking_time)
        booked_guests = sum(r.party_size for r in existing_reservations)
        remaining_capacity = restaurant.total_capacity - booked_guests

        if remaining_capacity >= party_size:
            # Assuming average table size of 4
            available_tables = max(1, remaining_capacity // 4)
            return TableAvailability(
                restaurant_id=restaurant_id,
                booking_time=booking_time,
                party_size=party_size,
                available=True,
                available_tables=available_tables,
                message=f"Table available for party of {party_size}"
            )
        else:
            return TableAvailability(
                restaurant_id=restaurant_id,
                booking_time=booking_time,
                party_size=party_size,
                available=False,
                available_tables=0,
                message=f"Not enough capacity for party of {party_size} at requested time"
            )

    def create_reservation(
        self,
        user_id: str,
        restaurant_id: str,
        party_size: int,
        booking_time: str,
        special_requests: Optional[str] = None,
        idempotency_key: Optional[str] = None
    ) -> Reservation:
        # Check idempotency
        if idempotency_key:
            existing = self.repo.get_reservation_by_idempotency_key(idempotency_key)
            if existing:
                return existing

        restaurant = self.repo.get_restaurant_by_id(restaurant_id)
        if not restaurant:
            raise ValueError(f"Restaurant with ID '{restaurant_id}' not found")

        availability = self.check_availability(restaurant_id, party_size, booking_time)
        if not availability.available:
            raise ValueError(f"Table unavailable: {availability.message}")

        res_id = f"res-{uuid.uuid4().hex[:8]}"
        res_code = f"RST-{uuid.uuid4().hex[:6].upper()}"

        reservation = Reservation(
            id=res_id,
            reservation_code=res_code,
            user_id=user_id,
            restaurant_id=restaurant_id,
            restaurant_name=restaurant.name,
            party_size=party_size,
            booking_time=booking_time,
            status=ReservationStatus.CONFIRMED,
            special_requests=special_requests,
            idempotency_key=idempotency_key,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )

        return self.repo.save_reservation(reservation)

    def get_reservation(self, reservation_id: str) -> Optional[Reservation]:
        return self.repo.get_reservation_by_id(reservation_id)

    def update_reservation(
        self,
        reservation_id: str,
        party_size: Optional[int] = None,
        booking_time: Optional[str] = None,
        special_requests: Optional[str] = None
    ) -> Reservation:
        reservation = self.repo.get_reservation_by_id(reservation_id)
        if not reservation:
            raise ValueError(f"Reservation '{reservation_id}' not found")

        if reservation.status == ReservationStatus.CANCELLED:
            raise ValueError(f"Cannot update cancelled reservation '{reservation_id}'")

        new_party_size = party_size if party_size is not None else reservation.party_size
        new_booking_time = booking_time if booking_time is not None else reservation.booking_time

        # Check availability if time or party size changed
        if new_party_size != reservation.party_size or new_booking_time != reservation.booking_time:
            availability = self.check_availability(reservation.restaurant_id, new_party_size, new_booking_time)
            if not availability.available:
                raise ValueError(f"Cannot update reservation: {availability.message}")

        reservation.party_size = new_party_size
        reservation.booking_time = new_booking_time
        if special_requests is not None:
            reservation.special_requests = special_requests
        reservation.status = ReservationStatus.MODIFIED
        reservation.updated_at = datetime.now(timezone.utc)

        return self.repo.save_reservation(reservation)

    def cancel_reservation(self, reservation_id: str) -> Reservation:
        reservation = self.repo.get_reservation_by_id(reservation_id)
        if not reservation:
            raise ValueError(f"Reservation '{reservation_id}' not found")

        if reservation.status == ReservationStatus.CANCELLED:
            return reservation

        reservation.status = ReservationStatus.CANCELLED
        reservation.updated_at = datetime.now(timezone.utc)
        return self.repo.save_reservation(reservation)
