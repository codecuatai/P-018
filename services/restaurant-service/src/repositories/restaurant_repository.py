import json
import uuid
from datetime import UTC
from hashlib import sha256

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from src.infrastructure.database import (
    EventRow,
    HoldRow,
    OpeningHourRow,
    ReservationRow,
    RestaurantRow,
    TableRow,
    make_session_factory,
    utc_now,
)

RESTAURANT_SEEDS = (
    ("rest-001", "Le Petit Bistro", "District 1, Ho Chi Minh City", "French", "$$$", 4.8),
    ("rest-002", "Sakura Sushi House", "District 3, Ho Chi Minh City", "Japanese", "$$", 4.6),
    ("rest-003", "Phở & Trà Heritage", "Hoan Kiem, Hanoi", "Vietnamese", "$", 4.9),
    ("rest-004", "Trattoria Bella Italia", "Tay Ho, Hanoi", "Italian", "$$$", 4.7),
)


class RestaurantRepository:
    def __init__(self, database_url: str):
        self.factory = make_session_factory(database_url)

    def seed(self) -> None:
        with self.factory() as db:
            if db.scalar(select(RestaurantRow.id).limit(1)):
                return
            for index, (rid, name, location, cuisine, budget, rating) in enumerate(RESTAURANT_SEEDS):
                restaurant = RestaurantRow(id=rid, name=name, location=location, cuisine_type=cuisine,
                    budget_range=budget, rating=rating, timezone="Asia/Ho_Chi_Minh", active=True)
                db.add(restaurant)
                # Flush the parent before inserting FK children. OpeningHourRow
                # intentionally keeps a scalar FK without an ORM relationship.
                db.flush()
                capacities = (2, 4, 6, 8, 4) if index % 2 == 0 else (2, 4, 4, 6, 8)
                for table_index, capacity in enumerate(capacities, 1):
                    db.add(TableRow(restaurant_id=rid, table_code=f"T{table_index:02d}", capacity=capacity,
                        seating_type="standard", active=True))
                for weekday in range(7):
                    db.add(OpeningHourRow(restaurant_id=rid, weekday=weekday, opens_at="06:00", closes_at="23:00"))
            db.commit()

    @staticmethod
    def request_hash(payload: dict) -> str:
        normalized = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
        return sha256(normalized.encode()).hexdigest()

    def list_restaurants(self, location=None, cuisine_type=None, budget_range=None, limit=50, offset=0):
        with self.factory() as db:
            stmt = select(RestaurantRow).where(RestaurantRow.active.is_(True)).order_by(RestaurantRow.id)
            if location:
                aliases = {
                    "hà nội": ("Hà Nội", "Hanoi"),
                    "ha noi": ("Hà Nội", "Hanoi"),
                    "hồ chí minh": ("Hồ Chí Minh", "Ho Chi Minh", "Saigon"),
                    "ho chi minh": ("Hồ Chí Minh", "Ho Chi Minh", "Saigon"),
                }
                candidates = aliases.get(location.strip().lower(), (location,))
                stmt = stmt.where(or_(*(RestaurantRow.location.ilike(f"%{candidate}%") for candidate in candidates)))
            if cuisine_type:
                stmt = stmt.where(RestaurantRow.cuisine_type.ilike(f"%{cuisine_type}%"))
            if budget_range:
                stmt = stmt.where(RestaurantRow.budget_range == budget_range)
            rows = db.scalars(stmt.offset(offset).limit(limit)).all()
            return [self.restaurant_dict(row) for row in rows]

    def get_restaurant_by_id(self, restaurant_id):
        with self.factory() as db:
            row = db.scalar(select(RestaurantRow).where(RestaurantRow.id == restaurant_id, RestaurantRow.active.is_(True)))
            return self.restaurant_dict(row) if row else None

    @staticmethod
    def restaurant_dict(row):
        return {"id": row.id, "name": row.name, "location": row.location, "cuisine_type": row.cuisine_type,
                "budget_range": row.budget_range, "rating": row.rating, "timezone": row.timezone,
                "description": row.description, "image_url": row.image_url}

    def _available_table(self, db: Session, restaurant_id, party_size, start_at, end_at, seating_type=None, exclude_id=None):
        stmt = select(TableRow).where(TableRow.restaurant_id == restaurant_id, TableRow.active.is_(True), TableRow.capacity >= party_size).order_by(TableRow.capacity, TableRow.id).with_for_update()
        if seating_type:
            stmt = stmt.where(TableRow.seating_type == seating_type)
        for table in db.scalars(stmt).all():
            predicates = [ReservationRow.table_id == table.id, ReservationRow.status.in_(["CONFIRMED", "MODIFIED"]),
                ReservationRow.start_at < end_at, ReservationRow.end_at > start_at]
            if exclude_id:
                predicates.append(ReservationRow.id != exclude_id)
            reserved = db.scalar(select(ReservationRow.id).where(and_(*predicates)))
            held = db.scalar(select(HoldRow.id).where(HoldRow.table_id == table.id, HoldRow.status == "ACTIVE",
                HoldRow.expires_at > utc_now(), HoldRow.start_at < end_at, HoldRow.end_at > start_at))
            if not reserved and not held:
                return table
        return None

    def availability(self, restaurant_id, party_size, start_at, end_at, seating_type=None):
        with self.factory() as db:
            restaurant = db.scalar(select(RestaurantRow).where(RestaurantRow.id == restaurant_id, RestaurantRow.active.is_(True)))
            if not restaurant:
                return None
            table = self._available_table(db, restaurant_id, party_size, start_at, end_at, seating_type)
            return {"restaurant_id": restaurant_id, "start_at": start_at, "end_at": end_at,
                    "party_size": party_size, "available": table is not None,
                    "table_code": table.table_code if table else None, "resource_version": 1}

    def find_idempotent(self, model, actor_id, operation, key, request_hash):
        with self.factory() as db:
            row = db.scalar(select(model).where(model.actor_id == actor_id, model.idempotency_key == f"{operation}:{key}"))
            if row and row.request_hash != request_hash:
                raise ValueError("IDEMPOTENCY_PAYLOAD_MISMATCH")
            return row

    def create_hold(self, actor_id, restaurant_id, party_size, start_at, end_at, key, request_hash, expires_at):
        with self.factory() as db:
            table = self._available_table(db, restaurant_id, party_size, start_at, end_at)
            if not table:
                raise ValueError("CAPACITY_UNAVAILABLE")
            hold = HoldRow(id=f"hold-{uuid.uuid4().hex[:12]}", actor_id=actor_id, restaurant_id=restaurant_id,
                table_id=table.id, party_size=party_size, start_at=start_at, end_at=end_at, expires_at=expires_at,
                status="ACTIVE", idempotency_key=f"create_hold:{key}", request_hash=request_hash)
            db.add(hold)
            db.add(EventRow(aggregate_type="hold", aggregate_id=hold.id, event_type="CREATED", actor_id=actor_id, occurred_at=utc_now()))
            db.commit()
            return self.hold_dict(hold, table.table_code)

    @staticmethod
    def hold_dict(row, table_code=None):
        return {"id": row.id, "hold_code": row.id, "actor_id": row.actor_id, "restaurant_id": row.restaurant_id,
                "table_id": row.table_id, "table_code": table_code, "party_size": row.party_size,
                "start_at": row.start_at, "end_at": row.end_at, "expires_at": row.expires_at, "status": row.status}

    def create_reservation(self, actor_id, restaurant_id, party_size, start_at, end_at, special_requests, key, request_hash, hold_id=None):
        with self.factory() as db:
            table = None
            if hold_id:
                hold = db.scalar(select(HoldRow).where(HoldRow.id == hold_id).with_for_update())
                expires_at = hold.expires_at.replace(tzinfo=UTC) if hold and hold.expires_at.tzinfo is None else hold.expires_at if hold else None
                if not hold or hold.actor_id != actor_id or hold.status != "ACTIVE" or expires_at <= utc_now():
                    raise ValueError("HOLD_INVALID")
                if hold.restaurant_id != restaurant_id or hold.party_size != party_size:
                    raise ValueError("HOLD_PAYLOAD_MISMATCH")
                table = db.get(TableRow, hold.table_id)
                hold.status = "CONSUMED"
            else:
                table = self._available_table(db, restaurant_id, party_size, start_at, end_at)
            if not table:
                raise ValueError("CAPACITY_UNAVAILABLE")
            now = utc_now()
            row = ReservationRow(id=f"res-{uuid.uuid4().hex[:12]}", reservation_code=f"RST-{uuid.uuid4().hex[:8].upper()}",
                actor_id=actor_id, restaurant_id=restaurant_id, table_id=table.id, party_size=party_size,
                start_at=start_at, end_at=end_at, status="CONFIRMED", special_requests=special_requests,
                hold_id=hold_id, idempotency_key=f"create_reservation:{key}", request_hash=request_hash,
                created_at=now, updated_at=now)
            db.add(row)
            db.add(EventRow(aggregate_type="reservation", aggregate_id=row.id, event_type="CREATED", actor_id=actor_id, occurred_at=now))
            db.commit()
            restaurant = db.get(RestaurantRow, row.restaurant_id)
            return self.reservation_dict(row, table, restaurant.name if restaurant else None)

    def get_reservation_by_id(self, reservation_id, actor_id=None):
        with self.factory() as db:
            stmt = select(ReservationRow, TableRow).join(TableRow, TableRow.id == ReservationRow.table_id).where(ReservationRow.id == reservation_id)
            if actor_id:
                stmt = stmt.where(ReservationRow.actor_id == actor_id)
            result = db.execute(stmt).first()
            if not result:
                return None
            restaurant = db.get(RestaurantRow, result[0].restaurant_id)
            return self.reservation_dict(result[0], result[1], restaurant.name if restaurant else None)

    @staticmethod
    def reservation_dict(row, table, restaurant_name=None):
        return {"id": row.id, "reservation_code": row.reservation_code, "actor_id": row.actor_id,
                "restaurant_id": row.restaurant_id, "restaurant_name": restaurant_name, "table_code": table.table_code,
                "party_size": row.party_size, "start_at": row.start_at, "end_at": row.end_at,
                "status": row.status, "special_requests": row.special_requests, "created_at": row.created_at,
                "updated_at": row.updated_at, "resource_version": row.resource_version}

    def find_reservation_idempotency(self, actor_id, key, request_hash):
        with self.factory() as db:
            row = db.scalar(select(ReservationRow).where(ReservationRow.actor_id == actor_id,
                ReservationRow.idempotency_key == f"create_reservation:{key}"))
            if row and row.request_hash != request_hash:
                raise ValueError("IDEMPOTENCY_PAYLOAD_MISMATCH")
            if not row:
                return None
            table = db.get(TableRow, row.table_id)
            restaurant = db.get(RestaurantRow, row.restaurant_id)
            return self.reservation_dict(row, table, restaurant.name if restaurant else None)

    def update_reservation(self, actor_id, reservation_id, party_size, start_at, end_at, special_requests, key, request_hash):
        with self.factory() as db:
            row = db.scalar(select(ReservationRow).where(ReservationRow.id == reservation_id, ReservationRow.actor_id == actor_id).with_for_update())
            if not row:
                raise ValueError("RESERVATION_NOT_FOUND")
            if row.status in {"CANCELLED", "COMPLETED", "NO_SHOW"}:
                raise ValueError("INVALID_TRANSITION")
            existing = db.scalar(select(ReservationRow).where(ReservationRow.actor_id == actor_id, ReservationRow.idempotency_key == f"update_reservation:{key}"))
            if existing:
                if existing.request_hash != request_hash:
                    raise ValueError("IDEMPOTENCY_PAYLOAD_MISMATCH")
                table = db.get(TableRow, existing.table_id)
                restaurant = db.get(RestaurantRow, existing.restaurant_id)
                return self.reservation_dict(existing, table, restaurant.name if restaurant else None)
            table = self._available_table(db, row.restaurant_id, party_size, start_at, end_at, exclude_id=row.id)
            if not table:
                raise ValueError("CAPACITY_UNAVAILABLE")
            row.table_id = table.id
            row.party_size = party_size
            row.start_at = start_at
            row.end_at = end_at
            row.special_requests = special_requests
            row.status = "MODIFIED"
            row.resource_version += 1
            row.idempotency_key = f"update_reservation:{key}"
            row.request_hash = request_hash
            row.updated_at = utc_now()
            db.add(EventRow(aggregate_type="reservation", aggregate_id=row.id, event_type="MODIFIED", actor_id=actor_id, occurred_at=utc_now()))
            db.commit()
            return self.reservation_dict(row, table, db.get(RestaurantRow, row.restaurant_id).name)

    def cancel_reservation(self, actor_id, reservation_id, key, request_hash):
        with self.factory() as db:
            row = db.scalar(select(ReservationRow).where(ReservationRow.id == reservation_id, ReservationRow.actor_id == actor_id).with_for_update())
            if not row:
                raise ValueError("RESERVATION_NOT_FOUND")
            if row.status == "CANCELLED":
                return self.reservation_dict(row, db.get(TableRow, row.table_id), db.get(RestaurantRow, row.restaurant_id).name)
            if row.status in {"COMPLETED", "NO_SHOW"}:
                raise ValueError("INVALID_TRANSITION")
            row.status = "CANCELLED"
            row.resource_version += 1
            row.idempotency_key = f"cancel_reservation:{key}"
            row.request_hash = request_hash
            row.updated_at = utc_now()
            db.add(EventRow(aggregate_type="reservation", aggregate_id=row.id, event_type="CANCELLED", actor_id=actor_id, occurred_at=utc_now()))
            db.commit()
            return self.reservation_dict(row, db.get(TableRow, row.table_id), db.get(RestaurantRow, row.restaurant_id).name)
