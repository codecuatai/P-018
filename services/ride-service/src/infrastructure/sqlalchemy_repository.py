from __future__ import annotations

from math import atan2, cos, radians, sin, sqrt
from random import SystemRandom
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.domain.ride import Booking, ConfirmationEvidence, IdempotencyRecord, Quote, normalize_booking_status, utc_now
from src.infrastructure.models import (
    BookingRow,
    ConfirmationConsumptionRow,
    IdempotencyRow,
    QuoteRow,
    RideDriverRow,
    RideTariffRow,
    RideTrackingEventRow,
)


class SqlAlchemyRideRepository:
    def __init__(self, session: Session, choose_candidate=None):
        self.session = session
        self._choose_candidate = choose_candidate or SystemRandom().choice

    def get_active_tariff(self, vehicle_type: str) -> dict[str, Any] | None:
        row = self.session.scalar(
            select(RideTariffRow)
            .where(RideTariffRow.vehicle_type == vehicle_type, RideTariffRow.active.is_(True))
            .order_by(RideTariffRow.created_at.desc())
            .limit(1)
        )
        if row is None:
            return None
        return {
            "id": row.id,
            "vehicle_type": row.vehicle_type,
            "version": row.version,
            "base_fee": row.base_fee,
            "per_km": row.per_km,
            "per_minute": row.per_minute,
            "active": row.active,
        }

    def find_and_assign_driver(
        self,
        vehicle_type: str,
        pickup_latitude: float | None,
        pickup_longitude: float | None,
    ) -> dict[str, Any] | None:
        if pickup_latitude is None or pickup_longitude is None:
            return None
        candidates = self.session.scalars(
            select(RideDriverRow)
            .where(
                RideDriverRow.vehicle_type == vehicle_type,
                RideDriverRow.availability_status == "AVAILABLE",
            )
            .with_for_update()
        ).all()
        eligible = [
            (row, _distance_km(pickup_latitude, pickup_longitude, float(row.latitude), float(row.longitude)))
            for row in candidates
            if _valid_coordinate(float(row.latitude), float(row.longitude))
        ]
        if not eligible:
            return None
        eligible.sort(key=lambda item: (item[1], item[0].id))
        # Deterministic closest-driver matching keeps the local happy path
        # reproducible and makes a real NO_DRIVER result meaningful.
        driver, distance_km = eligible[0]
        driver.availability_status = "ASSIGNED"
        driver.updated_at = utc_now()
        eta_seconds = max(60, min(900, int(round(distance_km / 0.35 * 60))))
        return {
            "id": driver.id,
            "display_name": driver.display_name,
            "phone_masked": driver.phone_masked,
            "rating": float(driver.rating),
            "vehicle_type": driver.vehicle_type,
            "vehicle_model": driver.vehicle_model,
            "vehicle_color": driver.vehicle_color,
            "license_plate": driver.license_plate,
            "vehicle": driver.vehicle,
            "location": {"latitude": float(driver.latitude), "longitude": float(driver.longitude)},
            "eta_seconds": eta_seconds,
            "distance_to_pickup_km": round(distance_km, 3),
        }

    def release_driver(self, driver_id: str) -> None:
        driver = self.session.get(RideDriverRow, driver_id)
        if driver is None:
            return
        if driver.availability_status == "ASSIGNED":
            driver.availability_status = "AVAILABLE"
            driver.updated_at = utc_now()

    def record_tracking_event(
        self,
        booking_id: str,
        status: str,
        progress: float,
        current_location: dict[str, Any] | None,
    ) -> None:
        self.session.add(
            RideTrackingEventRow(
                id=f"track_{uuid4().hex[:24]}",
                booking_id=booking_id,
                status=status,
                progress=progress,
                current_location=current_location,
                occurred_at=utc_now(),
            )
        )

    def get_quote(self, quote_id: str) -> Quote | None:
        row = self.session.get(QuoteRow, quote_id)
        return _quote_from_row(row) if row else None

    def list_quotes(self, actor_id: str) -> list[Quote]:
        rows = self.session.scalars(select(QuoteRow).where(QuoteRow.actor_id == actor_id).order_by(QuoteRow.created_at.desc())).all()
        return [_quote_from_row(row) for row in rows]

    def save_quote(self, quote: Quote) -> None:
        row = self.session.get(QuoteRow, quote.id)
        if row is None:
            self.session.add(QuoteRow(**quote.__dict__))
            return
        for name, value in quote.__dict__.items():
            setattr(row, name, value)

    def get_booking(self, booking_id: str) -> Booking | None:
        row = self.session.get(BookingRow, booking_id)
        return _booking_from_row(row) if row else None

    def list_bookings(self, actor_id: str) -> list[Booking]:
        rows = self.session.scalars(select(BookingRow).where(BookingRow.actor_id == actor_id).order_by(BookingRow.created_at.desc())).all()
        return [_booking_from_row(row) for row in rows]

    def ops_summary(self) -> dict[str, Any]:
        statuses = self.session.query(BookingRow.status, func.count(BookingRow.id)).group_by(BookingRow.status).all()
        by_status = {str(status): int(count) for status, count in statuses}
        available = int(self.session.query(func.count(RideDriverRow.id)).filter(RideDriverRow.availability_status == "AVAILABLE").scalar() or 0)
        drivers = int(self.session.query(func.count(RideDriverRow.id)).scalar() or 0)
        return {"domain": "ride", "counts": {"bookings": sum(by_status.values()), "bookings_by_status": by_status, "drivers": drivers, "available_drivers": available}}

    def ops_transactions(self, limit=20, offset=0) -> dict[str, Any]:
        rows = self.session.scalars(select(BookingRow).order_by(BookingRow.created_at.desc()).offset(offset).limit(limit)).all()
        total = int(self.session.query(func.count(BookingRow.id)).scalar() or 0)
        return {"items": [_booking_from_row(row).snapshot() for row in rows], "total": total, "limit": limit, "offset": offset}

    def ops_dataset_status(self) -> dict[str, Any]:
        count = int(self.session.query(func.count(RideDriverRow.id)).scalar() or 0)
        return {"dataset_version": "SIM_2026_08_V1", "source_name": "local-synthetic-driver-seed", "imported_at": None, "last_verified_at": None, "active": count > 0, "row_count": count, "quality_warnings": [], "rejected_count": 0}

    def save_booking(self, booking: Booking) -> None:
        row = self.session.get(BookingRow, booking.id)
        if row is None:
            self.session.add(BookingRow(**booking.__dict__, driver_snapshot=booking.driver))
            return
        for name, value in booking.__dict__.items():
            setattr(row, name, value)
        row.driver_snapshot = booking.driver

    def get_idempotency(self, actor_id: str, operation: str, key: str) -> IdempotencyRecord | None:
        row = self.session.scalar(
            select(IdempotencyRow).where(
                IdempotencyRow.actor_id == actor_id,
                IdempotencyRow.operation == operation,
                IdempotencyRow.idempotency_key == key,
            )
        )
        if row is None:
            return None
        return IdempotencyRecord(
            actor_id=row.actor_id,
            operation=row.operation,
            key=row.idempotency_key,
            request_hash=row.request_hash,
            response_payload=row.response_payload,
            created_at=row.created_at,
        )

    def save_idempotency(self, record: IdempotencyRecord) -> None:
        row = self.session.scalar(
            select(IdempotencyRow).where(
                IdempotencyRow.actor_id == record.actor_id,
                IdempotencyRow.operation == record.operation,
                IdempotencyRow.idempotency_key == record.key,
            )
        )
        if row is None:
            self.session.add(
                IdempotencyRow(
                    actor_id=record.actor_id,
                    operation=record.operation,
                    idempotency_key=record.key,
                    request_hash=record.request_hash,
                    response_payload=record.response_payload,
                    created_at=record.created_at,
                )
            )
            return
        row.request_hash = record.request_hash
        row.response_payload = record.response_payload

    def is_confirmation_consumed(self, confirmation_id: str) -> bool:
        return self.session.get(ConfirmationConsumptionRow, confirmation_id) is not None

    def consume_confirmation(self, evidence: ConfirmationEvidence) -> None:
        self.session.add(
            ConfirmationConsumptionRow(
                confirmation_id=evidence.confirmation_id,
                actor_id=evidence.actor_id,
                action=evidence.action,
                payload_hash=evidence.payload_hash,
                consumed_at=utc_now(),
            )
        )

    def commit(self) -> None:
        self.session.commit()

    def rollback(self) -> None:
        self.session.rollback()

def _quote_from_row(row: QuoteRow) -> Quote:
    return Quote(
        id=row.id,
        actor_id=row.actor_id,
        status=row.status,
        pickup_address=row.pickup_address,
        dropoff_address=row.dropoff_address,
        vehicle_type=row.vehicle_type,
        distance_km=row.distance_km,
        duration_minutes=row.duration_minutes,
        base_fee=row.base_fee,
        distance_fee=row.distance_fee,
        time_fee=row.time_fee,
        peak_surcharge=row.peak_surcharge,
        discount=row.discount,
        amount=row.amount,
        currency=row.currency,
        tariff_version=row.tariff_version,
        quote_version=row.quote_version,
        expires_at=row.expires_at,
        created_at=row.created_at,
        pickup_latitude=row.pickup_latitude,
        pickup_longitude=row.pickup_longitude,
        dropoff_latitude=row.dropoff_latitude,
        dropoff_longitude=row.dropoff_longitude,
        route_provider=row.route_provider,
        route_distance_meters=row.route_distance_meters,
        route_duration_seconds=row.route_duration_seconds,
        route_polyline=row.route_polyline,
        route_geometry=row.route_geometry,
        route_snapshot_hash=row.route_snapshot_hash,
        tariff_snapshot=row.tariff_snapshot,
        passenger_count=row.passenger_count,
        capacity_policy_version=row.capacity_policy_version,
    )


def _booking_from_row(row: BookingRow) -> Booking:
    return Booking(
        id=row.id,
        actor_id=row.actor_id,
        quote_id=row.quote_id,
        quote_version=row.quote_version,
        amount=row.amount,
        currency=row.currency,
        status=normalize_booking_status(row.status),
        resource_version=row.resource_version,
        payment_reference=row.payment_reference,
        driver=row.driver_snapshot or row.driver,
        created_at=row.created_at,
        updated_at=row.updated_at,
        driver_id=row.driver_id,
        tracking_started_at=row.tracking_started_at,
        passenger_count=row.passenger_count,
        capacity_policy_version=row.capacity_policy_version,
    )


def _valid_coordinate(latitude: float, longitude: float) -> bool:
    return -90 <= latitude <= 90 and -180 <= longitude <= 180


def _distance_km(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
    d_lat = radians(latitude_b - latitude_a)
    d_lon = radians(longitude_b - longitude_a)
    value = sin(d_lat / 2) ** 2 + cos(radians(latitude_a)) * cos(radians(latitude_b)) * sin(d_lon / 2) ** 2
    return 6371 * 2 * atan2(sqrt(value), sqrt(1 - value))
