import json
import re
import unicodedata
import uuid
from datetime import UTC, datetime, timedelta
from hashlib import sha256

from sqlalchemy import and_, func, or_, select, text
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


class RestaurantRepository:
    _IDEMPOTENCY_PENDING = '{"status":"PENDING"}'

    def __init__(self, database_url: str):
        self.factory = make_session_factory(database_url)

    @staticmethod
    def _active_dataset_version(db: Session) -> str | None:
        try:
            return db.execute(
                text(
                    "SELECT dataset_version FROM catalog_dataset_versions WHERE domain='restaurant' AND is_active=TRUE ORDER BY imported_at DESC, dataset_version DESC LIMIT 1"
                )
            ).scalar_one_or_none()
        except Exception:
            # Older unit-test schemas do not include the optional provenance registry.
            db.rollback()
            return None

    @classmethod
    def _active_restaurant_statement(cls, db: Session):
        version = cls._active_dataset_version(db)
        stmt = select(RestaurantRow).where(RestaurantRow.active.is_(True))
        return stmt.where(RestaurantRow.dataset_version == version) if version else stmt

    def seed(self) -> None:
        with self.factory() as db:
            restaurants = list(db.scalars(self._active_restaurant_statement(db).order_by(RestaurantRow.id)))
            # Imported catalog rows are authoritative.  Add only the minimal
            # deterministic booking resources that an imported row may lack.
            # This keeps seed idempotent and makes real catalog records bookable
            # without replacing or mutating their imported identity.
            for index, restaurant in enumerate(restaurants):
                table_count = db.scalar(select(func.count(TableRow.id)).where(TableRow.restaurant_id == restaurant.id))
                if not table_count:
                    capacities = (2, 4, 6, 8, 4) if index % 2 == 0 else (2, 4, 4, 6, 8)
                    for table_index, capacity in enumerate(capacities, 1):
                        db.add(
                            TableRow(
                                restaurant_id=restaurant.id,
                                table_code=f"T{table_index:02d}",
                                capacity=capacity,
                                seating_type="standard",
                                active=True,
                            )
                        )

                hour_count = db.scalar(
                    select(func.count(OpeningHourRow.id)).where(OpeningHourRow.restaurant_id == restaurant.id)
                )
                if not hour_count:
                    for weekday in range(7):
                        db.add(
                            OpeningHourRow(
                                restaurant_id=restaurant.id,
                                weekday=weekday,
                                opens_at="06:00",
                                closes_at="23:00",
                            )
                        )
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
        raw_key = row.idempotency_key[len(prefix) :]
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
        response = self.reservation_dict(row, table, restaurant)
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

    @staticmethod
    def _fold_search_text(value: str) -> str:
        normalized = unicodedata.normalize("NFD", value.casefold())
        return "".join(char for char in normalized if unicodedata.category(char) != "Mn")

    @classmethod
    def _is_generated_discovery_placeholder(cls, row: RestaurantRow) -> bool:
        """Keep OSM placeholders for provenance/ops, but hide them from discovery."""
        folded_name = cls._fold_search_text(row.name).strip()
        return re.fullmatch(r"nha hang osm #[0-9]+", folded_name) is not None

    @classmethod
    def _matches_cuisine_query(cls, row: RestaurantRow, query: str) -> bool:
        """Search the authoritative display fields, including imported provenance."""
        tokens = [token for token in cls._fold_search_text(query).split() if token]
        if not tokens:
            return True
        searchable = cls._fold_search_text(
            " ".join(
                value
                for value in (
                    row.name,
                    row.cuisine_type,
                    row.description,
                    row.provenance_json,
                )
                if value
            )
        )
        return all(token in searchable for token in tokens)

    def list_restaurants(self, location=None, cuisine_type=None, budget_range=None, limit=50, offset=0):
        with self.factory() as db:
            stmt = self._active_restaurant_statement(db).order_by(RestaurantRow.id)
            if location:
                aliases = {
                    "hà nội": ("Hà Nội", "Hanoi"),
                    "ha noi": ("Hà Nội", "Hanoi"),
                    "hồ chí minh": ("Hồ Chí Minh", "Ho Chi Minh", "Saigon"),
                    "ho chi minh": ("Hồ Chí Minh", "Ho Chi Minh", "Saigon"),
                    "vinuni": ("Gia Lâm", "Gia Lam", "Hà Nội", "Hanoi"),
                }
                candidates = aliases.get(location.strip().lower(), (location,))
                stmt = stmt.where(or_(*(RestaurantRow.location.ilike(f"%{candidate}%") for candidate in candidates)))
            if budget_range:
                stmt = stmt.where(RestaurantRow.budget_range == budget_range)
            rows = [
                row
                for row in db.scalars(stmt).all()
                if not self._is_generated_discovery_placeholder(row)
                and (not cuisine_type or self._matches_cuisine_query(row, cuisine_type))
            ]
            # Prefer restaurants with an actual image without changing the
            # relative order of records in either group.
            rows.sort(key=lambda row: not isinstance(row.image_url, str) or not row.image_url.strip())
            total = len(rows)
            paginated_rows = rows[offset : offset + limit]
            return [self.restaurant_dict(row) for row in paginated_rows], total

    def get_restaurant_by_id(self, restaurant_id):
        with self.factory() as db:
            row = db.scalar(self._active_restaurant_statement(db).where(RestaurantRow.id == restaurant_id))
            return self.restaurant_dict(row) if row else None

    def ops_summary(self):
        with self.factory() as db:
            reservations = db.scalars(select(ReservationRow)).all()
            statuses: dict[str, int] = {}
            for row in reservations:
                statuses[row.status] = statuses.get(row.status, 0) + 1
            return {
                "domain": "restaurant",
                "counts": {
                    "restaurants": int(
                        db.scalar(select(func.count()).select_from(self._active_restaurant_statement(db).subquery()))
                        or 0
                    ),
                    "reservations": len(reservations),
                    "reservations_by_status": statuses,
                },
            }

    def ops_transactions(self, limit=20, offset=0):
        with self.factory() as db:
            stmt = (
                select(ReservationRow, TableRow)
                .join(TableRow, TableRow.id == ReservationRow.table_id)
                .order_by(ReservationRow.updated_at.desc())
                .offset(offset)
                .limit(limit)
            )
            rows = db.execute(stmt).all()
            items = [self.reservation_dict(row, table, db.get(RestaurantRow, row.restaurant_id)) for row, table in rows]
            total = int(db.scalar(select(func.count(ReservationRow.id))) or 0)
            return {"items": items, "total": total, "limit": limit, "offset": offset}

    def ops_dataset_status(self):
        with self.factory() as db:
            try:
                version = (
                    db.execute(
                        text(
                            "SELECT dataset_version,source_manifest,imported_at,is_active,status FROM catalog_dataset_versions WHERE domain='restaurant' AND is_active=TRUE ORDER BY imported_at DESC, dataset_version DESC LIMIT 1"
                        )
                    )
                    .mappings()
                    .first()
                )
            except Exception:
                db.rollback()
                version = None
            rows = db.scalars(self._active_restaurant_statement(db)).all()
            manifest = version["source_manifest"] if version else {}
            return {
                "dataset_version": version["dataset_version"] if version else None,
                "source_name": manifest.get("source_name") if isinstance(manifest, dict) else None,
                "imported_at": version["imported_at"].isoformat() if version and version["imported_at"] else None,
                "last_verified_at": manifest.get("last_verified_at") if isinstance(manifest, dict) else None,
                "active": bool(rows),
                "row_count": len(rows),
                "quality_warnings": manifest.get("quality_warnings", []) if isinstance(manifest, dict) else [],
                "rejected_count": manifest.get("rejected_count", 0) if isinstance(manifest, dict) else 0,
            }

    @staticmethod
    def restaurant_dict(row):
        provenance = {}
        if row.provenance_json:
            try:
                provenance = (
                    row.provenance_json if isinstance(row.provenance_json, dict) else json.loads(row.provenance_json)
                )
            except (TypeError, json.JSONDecodeError):
                provenance = {}
        catalog = provenance.get("catalog", provenance) if isinstance(provenance, dict) else {}
        return {
            "id": row.id,
            "name": row.name,
            "location": row.location,
            "cuisine_type": row.cuisine_type,
            "cuisine_tags": catalog.get("cuisine_tags", []),
            "budget_range": row.budget_range,
            "price_level": catalog.get("price_level") or row.budget_range,
            "rating": row.rating,
            "review_count": catalog.get("review_count"),
            "timezone": row.timezone,
            "description": row.description,
            "phone": catalog.get("phone"),
            "website": catalog.get("website"),
            "opening_hours": catalog.get("opening_hours"),
            "image_url": row.image_url,
            **({"address": row.address} if row.address else {}),
            **({"ward": row.ward} if row.ward else {}),
            **({"district": row.district} if row.district else {}),
            **({"city": row.city} if row.city else {}),
            **(
                {"latitude": row.latitude, "longitude": row.longitude}
                if row.latitude is not None and row.longitude is not None
                else {}
            ),
            **({"coordinate_status": row.coordinate_status} if row.coordinate_status else {}),
        }

    def _available_table(
        self, db: Session, restaurant_id, party_size, start_at, end_at, seating_type=None, exclude_id=None
    ):
        stmt = (
            select(TableRow)
            .where(TableRow.restaurant_id == restaurant_id, TableRow.active.is_(True), TableRow.capacity >= party_size)
            .order_by(TableRow.capacity, TableRow.id)
            .with_for_update()
        )
        if seating_type:
            stmt = stmt.where(TableRow.seating_type == seating_type)
        for table in db.scalars(stmt).all():
            predicates = [
                ReservationRow.table_id == table.id,
                ReservationRow.status.in_(["CONFIRMED", "MODIFIED"]),
                ReservationRow.start_at < end_at,
                ReservationRow.end_at > start_at,
            ]
            if exclude_id:
                predicates.append(ReservationRow.id != exclude_id)
            reserved = db.scalar(select(ReservationRow.id).where(and_(*predicates)))
            held = db.scalar(
                select(HoldRow.id).where(
                    HoldRow.table_id == table.id,
                    HoldRow.status == "ACTIVE",
                    HoldRow.expires_at > utc_now(),
                    HoldRow.start_at < end_at,
                    HoldRow.end_at > start_at,
                )
            )
            if not reserved and not held:
                return table
        return None

    def availability(self, restaurant_id, party_size, start_at, end_at, seating_type=None):
        with self.factory() as db:
            restaurant = db.scalar(
                select(RestaurantRow).where(RestaurantRow.id == restaurant_id, RestaurantRow.active.is_(True))
            )
            if not restaurant:
                return None
            table = self._available_table(db, restaurant_id, party_size, start_at, end_at, seating_type)
            return {
                "restaurant_id": restaurant_id,
                "start_at": start_at,
                "end_at": end_at,
                "party_size": party_size,
                "available": table is not None,
                "table_code": table.table_code if table else None,
                "resource_version": 1,
            }

    def find_idempotent(self, model, actor_id, operation, key, request_hash):
        with self.factory() as db:
            row = db.scalar(
                select(model).where(
                    model.actor_id == actor_id, model.idempotency_key == self._legacy_key(operation, key)
                )
            )
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
            hold = HoldRow(
                id=f"hold-{uuid.uuid4().hex[:12]}",
                actor_id=actor_id,
                restaurant_id=restaurant_id,
                table_id=table.id,
                party_size=party_size,
                start_at=start_at,
                end_at=end_at,
                expires_at=expires_at,
                status="ACTIVE",
                idempotency_key=self._legacy_key("create_hold", key),
                request_hash=request_hash,
            )
            db.add(hold)
            db.add(
                EventRow(
                    aggregate_type="hold",
                    aggregate_id=hold.id,
                    event_type="CREATED",
                    actor_id=actor_id,
                    occurred_at=utc_now(),
                )
            )
            result = self.hold_dict(hold, table.table_code)
            self._complete_idempotency(record, result)
            db.commit()
            return result

    def cancel_hold(self, actor_id, hold_id, key, request_hash):
        with self.factory() as db:
            replay, record = self._claim_idempotency(db, actor_id, "cancel_hold", key, request_hash)
            if replay is not None:
                return replay

            hold = db.scalar(
                select(HoldRow)
                .where(HoldRow.id == hold_id, HoldRow.actor_id == actor_id)
                .with_for_update()
            )
            if not hold:
                raise ValueError("HOLD_NOT_FOUND")
            if hold.status != "ACTIVE":
                raise ValueError("HOLD_NOT_ACTIVE")

            hold.status = "CANCELLED"
            hold.resource_version += 1
            hold.idempotency_key = self._legacy_key("cancel_hold", key)
            hold.request_hash = request_hash
            result = self.hold_dict(hold, db.get(TableRow, hold.table_id).table_code)
            db.add(
                EventRow(
                    aggregate_type="hold",
                    aggregate_id=hold.id,
                    event_type="CANCELLED",
                    actor_id=actor_id,
                    occurred_at=utc_now(),
                )
            )
            self._complete_idempotency(record, result)
            db.commit()
            return result

    @staticmethod
    def hold_dict(row, table_code=None):
        return {
            "id": row.id,
            "hold_code": row.id,
            "actor_id": row.actor_id,
            "restaurant_id": row.restaurant_id,
            "table_id": row.table_id,
            "table_code": table_code,
            "party_size": row.party_size,
            "start_at": RestaurantRepository._as_utc(row.start_at),
            "end_at": RestaurantRepository._as_utc(row.end_at),
            "expires_at": RestaurantRepository._as_utc(row.expires_at),
            "status": row.status,
            "resource_version": row.resource_version,
        }

    def create_reservation(
        self, actor_id, restaurant_id, party_size, start_at, end_at, special_requests, key, request_hash, hold_id=None
    ):
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
                result = self.reservation_dict(legacy, table, restaurant)
                self._complete_idempotency(record, result)
                db.commit()
                return result

            table = None
            if hold_id:
                hold = db.scalar(select(HoldRow).where(HoldRow.id == hold_id).with_for_update())
                expires_at = (
                    hold.expires_at.replace(tzinfo=UTC)
                    if hold and hold.expires_at.tzinfo is None
                    else hold.expires_at
                    if hold
                    else None
                )
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
            row = ReservationRow(
                id=f"res-{uuid.uuid4().hex[:12]}",
                reservation_code=f"RST-{uuid.uuid4().hex[:8].upper()}",
                actor_id=actor_id,
                restaurant_id=restaurant_id,
                table_id=table.id,
                party_size=party_size,
                start_at=start_at,
                end_at=end_at,
                status="CONFIRMED",
                special_requests=special_requests,
                hold_id=hold_id,
                idempotency_key=self._legacy_key("create_reservation", key),
                request_hash=request_hash,
                created_at=now,
                updated_at=now,
            )
            db.add(row)
            db.add(
                EventRow(
                    aggregate_type="reservation",
                    aggregate_id=row.id,
                    event_type="CREATED",
                    actor_id=actor_id,
                    occurred_at=now,
                )
            )
            restaurant = db.get(RestaurantRow, row.restaurant_id)
            result = self.reservation_dict(row, table, restaurant)
            self._complete_idempotency(record, result)
            db.commit()
            return result

    def get_reservation_by_id(self, reservation_id, actor_id=None):
        with self.factory() as db:
            stmt = (
                select(ReservationRow, TableRow)
                .join(TableRow, TableRow.id == ReservationRow.table_id)
                .where(ReservationRow.id == reservation_id)
            )
            if actor_id:
                stmt = stmt.where(ReservationRow.actor_id == actor_id)
            result = db.execute(stmt).first()
            if not result:
                return None
            restaurant = db.get(RestaurantRow, result[0].restaurant_id)
            return self.reservation_dict(result[0], result[1], restaurant)

    def list_reservations(self, actor_id):
        with self.factory() as db:
            stmt = (
                select(ReservationRow, TableRow)
                .join(TableRow, TableRow.id == ReservationRow.table_id)
                .where(ReservationRow.actor_id == actor_id)
                .order_by(ReservationRow.start_at.desc())
            )
            result = db.execute(stmt).all()
            return [
                self.reservation_dict(row, table, db.get(RestaurantRow, row.restaurant_id)) for row, table in result
            ]

    @staticmethod
    def reservation_dict(row, table, restaurant=None):
        restaurant_name = restaurant.name if restaurant else None
        address = (restaurant.address or restaurant.location) if restaurant else None
        restaurant_snapshot = (
            {
                "name": restaurant.name,
                "address": address,
                "city": restaurant.city,
                "district": restaurant.district,
                "ward": restaurant.ward,
                "cuisine": restaurant.cuisine_type,
                "rating": restaurant.rating,
                "price_level": restaurant.budget_range,
                "image_url": restaurant.image_url,
                **(
                    {"latitude": restaurant.latitude, "longitude": restaurant.longitude}
                    if restaurant.latitude is not None and restaurant.longitude is not None
                    else {}
                ),
                **({"coordinate_status": restaurant.coordinate_status} if restaurant.coordinate_status else {}),
            }
            if restaurant
            else None
        )
        return {
            "id": row.id,
            "reservation_code": row.reservation_code,
            "actor_id": row.actor_id,
            "restaurant_id": row.restaurant_id,
            "restaurant_name": restaurant_name,
            **({"address": address} if address else {}),
            **({"image_url": restaurant.image_url} if restaurant and restaurant.image_url else {}),
            **({"restaurant": restaurant_snapshot} if restaurant_snapshot else {}),
            "table_code": table.table_code,
            "party_size": row.party_size,
            "start_at": RestaurantRepository._as_utc(row.start_at),
            "end_at": RestaurantRepository._as_utc(row.end_at),
            "status": row.status,
            "special_requests": row.special_requests,
            "created_at": RestaurantRepository._as_utc(row.created_at),
            "updated_at": RestaurantRepository._as_utc(row.updated_at),
            "resource_version": row.resource_version,
        }

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
            row = db.scalar(
                select(ReservationRow).where(
                    ReservationRow.actor_id == actor_id,
                    ReservationRow.idempotency_key == self._legacy_key("create_reservation", key),
                )
            )
            if row and row.request_hash != request_hash:
                raise ValueError("IDEMPOTENCY_PAYLOAD_MISMATCH")
            if not row:
                return None
            table = db.get(TableRow, row.table_id)
            restaurant = db.get(RestaurantRow, row.restaurant_id)
            return self.reservation_dict(row, table, restaurant)

    def update_reservation(
        self, actor_id, reservation_id, party_size, start_at, special_requests, fields_set, key, request_hash
    ):
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
                result = self.reservation_dict(
                    legacy, db.get(TableRow, legacy.table_id), db.get(RestaurantRow, legacy.restaurant_id)
                )
                self._complete_idempotency(record, result)
                db.commit()
                return result

            row = db.scalar(
                select(ReservationRow)
                .where(ReservationRow.id == reservation_id, ReservationRow.actor_id == actor_id)
                .with_for_update()
            )
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
            db.add(
                EventRow(
                    aggregate_type="reservation",
                    aggregate_id=row.id,
                    event_type="MODIFIED",
                    actor_id=actor_id,
                    occurred_at=utc_now(),
                )
            )
            result = self.reservation_dict(row, table, db.get(RestaurantRow, row.restaurant_id))
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
                result = self.reservation_dict(
                    legacy, db.get(TableRow, legacy.table_id), db.get(RestaurantRow, legacy.restaurant_id)
                )
                self._complete_idempotency(record, result)
                db.commit()
                return result

            row = db.scalar(
                select(ReservationRow)
                .where(ReservationRow.id == reservation_id, ReservationRow.actor_id == actor_id)
                .with_for_update()
            )
            if not row:
                raise ValueError("RESERVATION_NOT_FOUND")
            self._promote_surviving_create_evidence(db, row)
            if row.status == "CANCELLED":
                result = self.reservation_dict(
                    row, db.get(TableRow, row.table_id), db.get(RestaurantRow, row.restaurant_id)
                )
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
            db.add(
                EventRow(
                    aggregate_type="reservation",
                    aggregate_id=row.id,
                    event_type="CANCELLED",
                    actor_id=actor_id,
                    occurred_at=utc_now(),
                )
            )
            result = self.reservation_dict(
                row, db.get(TableRow, row.table_id), db.get(RestaurantRow, row.restaurant_id)
            )
            self._complete_idempotency(record, result)
            db.commit()
            return result
