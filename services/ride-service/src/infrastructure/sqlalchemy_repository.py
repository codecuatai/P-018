from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.domain.ride import Booking, ConfirmationEvidence, IdempotencyRecord, Quote, utc_now
from src.infrastructure.models import (
    BookingRow,
    ConfirmationConsumptionRow,
    IdempotencyRow,
    QuoteRow,
)


class SqlAlchemyRideRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_quote(self, quote_id: str) -> Quote | None:
        row = self.session.get(QuoteRow, quote_id)
        return _quote_from_row(row) if row else None

    def list_quotes(self, actor_id: str) -> list[Quote]:
        rows = self.session.scalars(select(QuoteRow).where(QuoteRow.actor_id == actor_id).order_by(QuoteRow.created_at.desc())).all()
        return [_quote_from_row(row) for row in rows]

    def save_quote(self, quote: Quote) -> None:
        self.session.add(QuoteRow(**quote.__dict__))

    def get_booking(self, booking_id: str) -> Booking | None:
        row = self.session.get(BookingRow, booking_id)
        return _booking_from_row(row) if row else None

    def list_bookings(self, actor_id: str) -> list[Booking]:
        rows = self.session.scalars(select(BookingRow).where(BookingRow.actor_id == actor_id).order_by(BookingRow.created_at.desc())).all()
        return [_booking_from_row(row) for row in rows]

    def save_booking(self, booking: Booking) -> None:
        row = self.session.get(BookingRow, booking.id)
        if row is None:
            self.session.add(BookingRow(**booking.__dict__))
            return
        for name, value in booking.__dict__.items():
            setattr(row, name, value)

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
        route_snapshot_hash=row.route_snapshot_hash,
        tariff_snapshot=row.tariff_snapshot,
    )


def _booking_from_row(row: BookingRow) -> Booking:
    return Booking(
        id=row.id,
        actor_id=row.actor_id,
        quote_id=row.quote_id,
        quote_version=row.quote_version,
        amount=row.amount,
        currency=row.currency,
        status=row.status,
        resource_version=row.resource_version,
        payment_reference=row.payment_reference,
        driver=row.driver,
        created_at=row.created_at,
        updated_at=row.updated_at,
        driver_id=row.driver_id,
        tracking_started_at=row.tracking_started_at,
    )
