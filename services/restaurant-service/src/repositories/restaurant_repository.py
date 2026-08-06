from typing import List, Optional, Dict
import threading
from src.domain.restaurant import Restaurant, Reservation, ReservationStatus


class RestaurantRepository:
    def __init__(self):
        self._lock = threading.Lock()
        self._restaurants: Dict[str, Restaurant] = {
            "rest-001": Restaurant(
                id="rest-001",
                name="Le Petit Bistro",
                location="District 1, Ho Chi Minh City",
                cuisine_type="French",
                budget_range="$$$",
                rating=4.8,
                total_capacity=50,
                opening_hours="11:00 - 22:30",
                description="Authentic French dining experience in downtown."
            ),
            "rest-002": Restaurant(
                id="rest-002",
                name="Sakura Sushi House",
                location="District 3, Ho Chi Minh City",
                cuisine_type="Japanese",
                budget_range="$$",
                rating=4.6,
                total_capacity=40,
                opening_hours="10:30 - 22:00",
                description="Fresh Omakase and traditional Japanese cuisine."
            ),
            "rest-003": Restaurant(
                id="rest-003",
                name="Phở & Trà Heritage",
                location="Hoan Kiem, Hanoi",
                cuisine_type="Vietnamese",
                budget_range="$",
                rating=4.9,
                total_capacity=80,
                opening_hours="06:00 - 23:00",
                description="Traditional northern Vietnamese dining and specialty teas."
            ),
            "rest-004": Restaurant(
                id="rest-004",
                name="Trattoria Bella Italia",
                location="Tay Ho, Hanoi",
                cuisine_type="Italian",
                budget_range="$$$",
                rating=4.7,
                total_capacity=60,
                opening_hours="11:30 - 22:00",
                description="Wood-fired pizzas and homemade pasta with lake views."
            )
        }
        self._reservations: Dict[str, Reservation] = {}
        self._idempotency_map: Dict[str, str] = {}  # idempotency_key -> reservation_id

    def list_restaurants(
        self,
        location: Optional[str] = None,
        cuisine_type: Optional[str] = None,
        budget_range: Optional[str] = None
    ) -> List[Restaurant]:
        with self._lock:
            results = list(self._restaurants.values())
            if location:
                loc_lower = location.lower()
                results = [r for r in results if loc_lower in r.location.lower()]
            if cuisine_type:
                c_lower = cuisine_type.lower()
                results = [r for r in results if c_lower in r.cuisine_type.lower()]
            if budget_range:
                results = [r for r in results if r.budget_range == budget_range]
            return results

    def get_restaurant_by_id(self, restaurant_id: str) -> Optional[Restaurant]:
        with self._lock:
            return self._restaurants.get(restaurant_id)

    def get_reservation_by_idempotency_key(self, key: str) -> Optional[Reservation]:
        with self._lock:
            res_id = self._idempotency_map.get(key)
            if res_id:
                return self._reservations.get(res_id)
            return None

    def save_reservation(self, reservation: Reservation) -> Reservation:
        with self._lock:
            self._reservations[reservation.id] = reservation
            if reservation.idempotency_key:
                self._idempotency_map[reservation.idempotency_key] = reservation.id
            return reservation

    def get_reservation_by_id(self, reservation_id: str) -> Optional[Reservation]:
        with self._lock:
            return self._reservations.get(reservation_id)

    def get_active_reservations_for_time(self, restaurant_id: str, booking_time: str) -> List[Reservation]:
        with self._lock:
            return [
                r for r in self._reservations.values()
                if r.restaurant_id == restaurant_id
                and r.booking_time == booking_time
                and r.status != ReservationStatus.CANCELLED
            ]
