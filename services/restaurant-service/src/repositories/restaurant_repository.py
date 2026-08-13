import json
import uuid
from datetime import UTC, datetime, timedelta
from hashlib import sha256

from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.infrastructure.database import (
    EventRow,
    HoldRow,
    IdempotencyRecordRow,
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
    _IDEMPOTENCY_PENDING = '{"status":"PENDING"}'

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

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    @classmethod
    def _response_json(cls, payload: dict) -> str:
        def normalize(value):
            if isinstance(value, datetime):
                return cls._as_utc(value).isoformat()
            if isinstance(value, dict):
                return {key: normalize(item) for key, item in value.items()}
            if isinstance(value, list):
                return [normalize(item) for item in value]
            return value

        return json.dumps(normalize(payload), sort_keys=True, separators=(",", ":"))

    @classmethod
    def _decode_idempotency_record(cls, row: IdempotencyRecordRow, request_hash: str) -> dict:
        if row.request_hash != request_hash:
            raise ValueError("IDEMPOTENCY_PAYLOAD_MISMATCH")
        if row.response_json == cls._IDEMPOTENCY_PENDING:
            raise ValueError("IDEMPOTENCY_IN_PROGRESS")
        return json.loads(row.response_json)

    def _claim_idempotency(
        self,
        db: Session,
        actor_id: str,
        operation: str,
        key: str,
        request_hash: str,
    ) -> tuple[dict | None, IdempotencyRecordRow | None]:
        """Claim a lifecycle key before its mutation in the same transaction.

        Flushing the unique record first makes concurrent PostgreSQL requests
        wait on the same actor/operation/key. The winner fills the response
        snapshot and commits the mutation plus evidence atomically; a loser
        rolls back its empty claim and replays the committed snapshot.
        """

        record = db.scalar(
            select(IdempotencyRecordRow)
            .where(
                IdempotencyRecordRow.actor_id == actor_id,
                IdempotencyRecordRow.operation == operation,
                IdempotencyRecordRow.idempotency_key == key,
            )
            .with_for_update()
        )
        if record:
            return self._decode_idempotency_record(record, request_hash), None

        record = IdempotencyRecordRow(
            actor_id=actor_id,
            operation=operation,
            idempotency_key=key,
            request_hash=request_hash,
            response_json=self._IDEMPOTENCY_PENDING,
            created_at=utc_now(),
        )
        db.add(record)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            with self.factory() as retry_db:
                concurrent = retry_db.scalar(
                    select(IdempotencyRecordRow).where(
                        IdempotencyRecordRow.actor_id == actor_id,
                        IdempotencyRecordRow.operation == operation,
                        IdempotencyRecordRow.idempotency_key == key,
                    )
                )
                if concurrent:
                    return self._decode_idempotency_record(concurrent, request_hash), None
            raise ValueError("IDEMPOTENCY_IN_PROGRESS")
        return None, record

    def _complete_idempotency(self, record: IdempotencyRecordRow, response: dict) -> None:
        record.response_json = self._response_json(response)

    def _promote_surviving_create_evidence(self, db: Session, row: ReservationRow) -> None:
        """Copy a still-present pre-0002 create key before lifecycle overwrite."""
        prefix = "create_reservation:"
        if not row.idempotency_key.startswith(prefix):
            return
        raw_key = row.idempotency_key[len(prefix):]
        if not raw_key:
            return
        existing = db.scalar(
            select(IdempotencyRecordRow).where(
                IdempotencyRecordRow.actor_id == row.actor_id,
                IdempotencyRecordRow.operation == "create_reservation",
                IdempotencyRecordRow.idempotency_key == raw_key,
            )
        )
        if existing:
            return
        table = db.get(TableRow, row.table_id)
        restaurant = db.get(RestaurantRow, row.restaurant_id)
        response = self.reservation_dict(row, table, restaurant.name if restaurant else None)
        db.add(
            IdempotencyRecordRow(
                actor_id=row.actor_id,
                operation="create_reservation",
                idempotency_key=raw_key,
                request_hash=row.request_hash,
                response_json=self._response_json(response),
                created_at=row.created_at,
            )
        )
        db.flush()

    @staticmethod
    def _legacy_key(operation: str, key: str) -> str:
        return f"{operation}:{key}"

    def list_restaurants(self, location=None, cuisine_type=None, budget_range=None, query=None, limit=50, offset=0):
        with self.factory() as db:
            stmt = select(RestaurantRow).where(RestaurantRow.active.is_(True)).order_by(RestaurantRow.id)

            # 1. Lọc theo địa điểm
            if location:
                aliases = {
                    "hà nội": ("Hà Nội", "Hanoi"),
                    "ha noi": ("Hà Nội", "Hanoi"),
                    "hồ chí minh": ("Hồ Chí Minh", "Ho Chi Minh", "Saigon"),
                    "ho chi minh": ("Hồ Chí Minh", "Ho Chi Minh", "Saigon"),
                }
                candidates = aliases.get(location.strip().lower(), (location,))
                stmt = stmt.where(or_(*(RestaurantRow.location.ilike(f"%{candidate}%") for candidate in candidates)))
            # Nếu không parse được địa điểm cụ thể nhưng có query thô, fallback tìm kiếm tương đối trên cột location
            elif query:
                stmt = stmt.where(RestaurantRow.location.ilike(f"%{query}%"))

            # 2. Lọc theo loại hình ẩm thực
            if cuisine_type:
                stmt = stmt.where(RestaurantRow.cuisine_type.ilike(f"%{cuisine_type}%"))

            # 3. Lọc theo khoảng giá
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
            row = db.scalar(select(model).where(model.actor_id == actor_id, model.idempotency_key == self._legacy_key(operation, key)))
            if row and row.request_hash != request_hash:
                raise ValueError("IDEMPOTENCY_PAYLOAD_MISMATCH")
            return row

    def create_hold(self, actor_id, restaurant_id, party_size, start_at, end_at, key, request_hash, expires_at):
        with self.factory() as db:
            replay, record = self._claim_idempotency(db, actor_id, "create_hold", key, request_hash)
            if replay is not None:
                return replay

            legacy = db.scalar(
                select(HoldRow).where(
                    HoldRow.actor_id == actor_id,
                    HoldRow.idempotency_key == self._legacy_key("create_hold", key),
                )
            )
            if legacy:
                if legacy.request_hash != request_hash:
                    raise ValueError("IDEMPOTENCY_PAYLOAD_MISMATCH")
                result = self.hold_dict(legacy, db.get(TableRow, legacy.table_id).table_code)
                self._complete_idempotency(record, result)
                db.commit()
                return result

            table = self._available_table(db, restaurant_id, party_size, start_at, end_at)
            if not table:
                raise ValueError("CAPACITY_UNAVAILABLE")
            hold = HoldRow(id=f"hold-{uuid.uuid4().hex[:12]}", actor_id=actor_id, restaurant_id=restaurant_id,
                table_id=table.id, party_size=party_size, start_at=start_at, end_at=end_at, expires_at=expires_at,
                status="ACTIVE", idempotency_key=self._legacy_key("create_hold", key), request_hash=request_hash)
            db.add(hold)
            db.add(EventRow(aggregate_type="hold", aggregate_id=hold.id, event_type="CREATED", actor_id=actor_id, occurred_at=utc_now()))
            result = self.hold_dict(hold, table.table_code)
            self._complete_idempotency(record, result)
            db.commit()
            return result

    @staticmethod
    def hold_dict(row, table_code=None):
        return {"id": row.id, "hold_code": row.id, "actor_id": row.actor_id, "restaurant_id": row.restaurant_id,
                "table_id": row.table_id, "table_code": table_code, "party_size": row.party_size,
                "start_at": RestaurantRepository._as_utc(row.start_at), "end_at": RestaurantRepository._as_utc(row.end_at),
                "expires_at": RestaurantRepository._as_utc(row.expires_at), "status": row.status}

    def create_reservation(self, actor_id, restaurant_id, party_size, start_at, end_at, special_requests, key, request_hash, hold_id=None):
        with self.factory() as db:
            replay, record = self._claim_idempotency(db, actor_id, "create_reservation", key, request_hash)
            if replay is not None:
                return replay

            legacy = db.scalar(
                select(ReservationRow).where(
                    ReservationRow.actor_id == actor_id,
                    ReservationRow.idempotency_key == self._legacy_key("create_reservation", key),
                )
            )
            if legacy:
                if legacy.request_hash != request_hash:
                    raise ValueError("IDEMPOTENCY_PAYLOAD_MISMATCH")
                table = db.get(TableRow, legacy.table_id)
                restaurant = db.get(RestaurantRow, legacy.restaurant_id)
                result = self.reservation_dict(legacy, table, restaurant.name if restaurant else None)
                self._complete_idempotency(record, result)
                db.commit()
                return result

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
                hold_id=hold_id, idempotency_key=self._legacy_key("create_reservation", key), request_hash=request_hash,
                created_at=now, updated_at=now)
            db.add(row)
            db.add(EventRow(aggregate_type="reservation", aggregate_id=row.id, event_type="CREATED", actor_id=actor_id, occurred_at=now))
            restaurant = db.get(RestaurantRow, row.restaurant_id)
            result = self.reservation_dict(row, table, restaurant.name if restaurant else None)
            self._complete_idempotency(record, result)
            db.commit()
            return result

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
                "party_size": row.party_size, "start_at": RestaurantRepository._as_utc(row.start_at),
                "end_at": RestaurantRepository._as_utc(row.end_at), "status": row.status,
                "special_requests": row.special_requests, "created_at": RestaurantRepository._as_utc(row.created_at),
                "updated_at": RestaurantRepository._as_utc(row.updated_at), "resource_version": row.resource_version}

    def find_reservation_idempotency(self, actor_id, key, request_hash):
        with self.factory() as db:
            record = db.scalar(
                select(IdempotencyRecordRow).where(
                    IdempotencyRecordRow.actor_id == actor_id,
                    IdempotencyRecordRow.operation == "create_reservation",
                    IdempotencyRecordRow.idempotency_key == key,
                )
            )
            if record:
                return self._decode_idempotency_record(record, request_hash)
            row = db.scalar(select(ReservationRow).where(ReservationRow.actor_id == actor_id,
                ReservationRow.idempotency_key == self._legacy_key("create_reservation", key)))
            if row and row.request_hash != request_hash:
                raise ValueError("IDEMPOTENCY_PAYLOAD_MISMATCH")
            if not row:
                return None
            table = db.get(TableRow, row.table_id)
            restaurant = db.get(RestaurantRow, row.restaurant_id)
            return self.reservation_dict(row, table, restaurant.name if restaurant else None)

    def update_reservation(self, actor_id, reservation_id, party_size, start_at, special_requests, fields_set, key, request_hash):
        with self.factory() as db:
            replay, record = self._claim_idempotency(db, actor_id, "update_reservation", key, request_hash)
            if replay is not None:
                return replay

            legacy = db.scalar(
                select(ReservationRow).where(
                    ReservationRow.actor_id == actor_id,
                    ReservationRow.idempotency_key == self._legacy_key("update_reservation", key),
                )
            )
            if legacy:
                if legacy.request_hash != request_hash:
                    raise ValueError("IDEMPOTENCY_PAYLOAD_MISMATCH")
                result = self.reservation_dict(legacy, db.get(TableRow, legacy.table_id), db.get(RestaurantRow, legacy.restaurant_id).name)
                self._complete_idempotency(record, result)
                db.commit()
                return result

            row = db.scalar(select(ReservationRow).where(ReservationRow.id == reservation_id, ReservationRow.actor_id == actor_id).with_for_update())
            if not row:
                raise ValueError("RESERVATION_NOT_FOUND")
            if row.status in {"CANCELLED", "COMPLETED", "NO_SHOW"}:
                raise ValueError("INVALID_TRANSITION")

            self._promote_surviving_create_evidence(db, row)

            fields = set(fields_set)
            current_start = self._as_utc(row.start_at)
            current_end = self._as_utc(row.end_at)
            duration_minutes = int((current_end - current_start).total_seconds() // 60)
            new_start = self._as_utc(start_at) if "start_at" in fields and start_at is not None else current_start
            if new_start <= utc_now():
                raise ValueError("PAST_START")
            new_end = new_start + timedelta(minutes=duration_minutes)
            new_party_size = party_size if "party_size" in fields and party_size is not None else row.party_size
            new_special_requests = special_requests if "special_requests" in fields else row.special_requests

            table = self._available_table(db, row.restaurant_id, new_party_size, new_start, new_end, exclude_id=row.id)
            if not table:
                raise ValueError("CAPACITY_UNAVAILABLE")
            row.table_id = table.id
            row.party_size = new_party_size
            row.start_at = new_start
            row.end_at = new_end
            row.special_requests = new_special_requests
            row.status = "MODIFIED"
            row.resource_version += 1
            row.idempotency_key = self._legacy_key("update_reservation", key)
            row.request_hash = request_hash
            row.updated_at = utc_now()
            db.add(EventRow(aggregate_type="reservation", aggregate_id=row.id, event_type="MODIFIED", actor_id=actor_id, occurred_at=utc_now()))
            result = self.reservation_dict(row, table, db.get(RestaurantRow, row.restaurant_id).name)
            self._complete_idempotency(record, result)
            db.commit()
            return result

    def cancel_reservation(self, actor_id, reservation_id, key, request_hash):
        with self.factory() as db:
            replay, record = self._claim_idempotency(db, actor_id, "cancel_reservation", key, request_hash)
            if replay is not None:
                return replay

            legacy = db.scalar(
                select(ReservationRow).where(
                    ReservationRow.actor_id == actor_id,
                    ReservationRow.idempotency_key == self._legacy_key("cancel_reservation", key),
                )
            )
            if legacy:
                if legacy.request_hash != request_hash:
                    raise ValueError("IDEMPOTENCY_PAYLOAD_MISMATCH")
                result = self.reservation_dict(legacy, db.get(TableRow, legacy.table_id), db.get(RestaurantRow, legacy.restaurant_id).name)
                self._complete_idempotency(record, result)
                db.commit()
                return result

            row = db.scalar(select(ReservationRow).where(ReservationRow.id == reservation_id, ReservationRow.actor_id == actor_id).with_for_update())
            if not row:
                raise ValueError("RESERVATION_NOT_FOUND")
            self._promote_surviving_create_evidence(db, row)
            if row.status == "CANCELLED":
                result = self.reservation_dict(row, db.get(TableRow, row.table_id), db.get(RestaurantRow, row.restaurant_id).name)
                self._complete_idempotency(record, result)
                db.commit()
                return result
            if row.status in {"COMPLETED", "NO_SHOW"}:
                raise ValueError("INVALID_TRANSITION")
            row.status = "CANCELLED"
            row.resource_version += 1
            row.idempotency_key = self._legacy_key("cancel_reservation", key)
            row.request_hash = request_hash
            row.updated_at = utc_now()
            db.add(EventRow(aggregate_type="reservation", aggregate_id=row.id, event_type="CANCELLED", actor_id=actor_id, occurred_at=utc_now()))
            result = self.reservation_dict(row, db.get(TableRow, row.table_id), db.get(RestaurantRow, row.restaurant_id).name)
            self._complete_idempotency(record, result)
            db.commit()
            return result
