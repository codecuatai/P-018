from datetime import UTC, datetime, timedelta

from src.repositories.restaurant_repository import RestaurantRepository

AVAILABILITY_SNAPSHOT_TTL = timedelta(seconds=30)


def normalized_interval(start_at: datetime, duration_minutes: int):
    if start_at.tzinfo is None or start_at.utcoffset() is None:
        raise ValueError("NAIVE_DATETIME")
    start = start_at.astimezone(UTC)
    if start <= datetime.now(UTC):
        raise ValueError("PAST_START")
    return start, start + timedelta(minutes=duration_minutes)


def normalized_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("NAIVE_DATETIME")
    return value.astimezone(UTC)


class RestaurantApplicationService:
    def __init__(self, repo: RestaurantRepository):
        self.repo = repo

    def search_restaurants(
        self,
        location: str | None = None,
        cuisine_type: str | None = None,
        budget_range: str | None = None,
        limit: int = 50,
        offset: int = 0,
        q: str | None = None,
    ):
        return self.repo.list_restaurants(location, cuisine_type, budget_range, limit, offset, q)

    def get_restaurant(self, restaurant_id):
        return self.repo.get_restaurant_by_id(restaurant_id)

    def check_availability(self, restaurant_id, party_size, start_at, duration_minutes, seating_type=None):
        start, end = normalized_interval(start_at, duration_minutes)
        result = self.repo.availability(restaurant_id, party_size, start, end, seating_type)
        if result is None:
            raise ValueError("RESTAURANT_NOT_FOUND")
        observed_at = datetime.now(UTC)
        snapshot_token = observed_at.strftime("%Y%m%dT%H%M%S%fZ")
        return {
            **result,
            "snapshot_id": f"availability:{restaurant_id}:{snapshot_token}",
            "resource_version": f"availability-v1:{snapshot_token}",
            "observed_at": observed_at,
            "expires_at": observed_at + AVAILABILITY_SNAPSHOT_TTL,
        }

    def create_hold(self, actor_id, restaurant_id, party_size, start_at, duration_minutes, key):
        start, end = normalized_interval(start_at, duration_minutes)
        payload = {"restaurant_id": restaurant_id, "party_size": party_size, "start_at": start.isoformat(), "end_at": end.isoformat()}
        request_hash = self.repo.request_hash(payload)
        return self.repo.create_hold(actor_id, restaurant_id, party_size, start, end, key, request_hash,
            datetime.now(UTC) + timedelta(minutes=10))

    def cancel_hold(self, actor_id, hold_id, key):
        payload = {"hold_id": hold_id, "action": "cancel"}
        return self.repo.cancel_hold(actor_id, hold_id, key, self.repo.request_hash(payload))

    def create_reservation(self, actor_id, restaurant_id, party_size, start_at, duration_minutes, special_requests, key, hold_id=None):
        start, end = normalized_interval(start_at, duration_minutes)
        payload = {"restaurant_id": restaurant_id, "party_size": party_size, "start_at": start.isoformat(), "end_at": end.isoformat(), "special_requests": special_requests, "hold_id": hold_id}
        request_hash = self.repo.request_hash(payload)
        return self.repo.create_reservation(actor_id, restaurant_id, party_size, start, end, special_requests, key, request_hash, hold_id)

    def get_reservation(self, reservation_id, actor_id):
        return self.repo.get_reservation_by_id(reservation_id, actor_id)

    def list_reservations(self, actor_id):
        return self.repo.list_reservations(actor_id)

    def ops_summary(self):
        return self.repo.ops_summary()

    def ops_transactions(self, limit, offset):
        return self.repo.ops_transactions(limit, offset)

    def ops_dataset_status(self):
        return self.repo.ops_dataset_status()

    def update_reservation(
        self,
        actor_id,
        reservation_id,
        party_size=None,
        start_at=None,
        special_requests=None,
        key=None,
        fields_set=None,
    ):
        fields = set(fields_set or ())
        if fields_set is None:
            fields = {
                field
                for field, value in {
                    "party_size": party_size,
                    "start_at": start_at,
                    "special_requests": special_requests,
                }.items()
                if value is not None
            }

        if not fields:
            raise ValueError("NO_FIELDS_TO_UPDATE")
        if "party_size" in fields and party_size is None:
            raise ValueError("PARTY_SIZE_REQUIRED")
        if "start_at" in fields and start_at is None:
            raise ValueError("START_AT_REQUIRED")

        normalized_start = normalized_datetime(start_at) if "start_at" in fields else None
        payload = {"reservation_id": reservation_id, "fields": sorted(fields)}
        if "party_size" in fields:
            payload["party_size"] = party_size
        if "start_at" in fields:
            payload["start_at"] = normalized_start.isoformat() if normalized_start else None
        if "special_requests" in fields:
            payload["special_requests"] = special_requests

        return self.repo.update_reservation(
            actor_id,
            reservation_id,
            party_size,
            normalized_start,
            special_requests,
            fields,
            key,
            self.repo.request_hash(payload),
        )

    def cancel_reservation(self, actor_id, reservation_id, key):
        payload = {"reservation_id": reservation_id, "action": "cancel"}
        return self.repo.cancel_reservation(actor_id, reservation_id, key, self.repo.request_hash(payload))
