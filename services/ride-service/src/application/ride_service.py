from __future__ import annotations

from datetime import UTC, datetime
from secrets import compare_digest
from uuid import uuid4

from src.domain.ride import (
    Booking,
    BookingStatus,
    CancelBookingCommand,
    ConfirmationEvidence,
    ConfirmBookingCommand,
    IdempotencyRecord,
    PrepareBookingCommand,
    Quote,
    QuoteCommand,
    RideError,
    cancel_confirmation_payload,
    confirm_confirmation_payload,
    create_simulated_quote,
    normalized_hash,
    prepare_confirmation_payload,
    quote_request_payload,
    simulated_driver,
    utc_now,
)
from src.repositories.ride import RideRepository


class RideApplication:
    def __init__(self, repository: RideRepository):
        self.repository = repository

    def create_quote(self, command: QuoteCommand, idempotency_key: str) -> dict:
        operation = "ride.quote.create"
        request_hash = normalized_hash(quote_request_payload(command))
        if replay := self._replay(command.actor_id, operation, idempotency_key, request_hash):
            return replay
        quote = create_simulated_quote(command)
        payload = quote.snapshot()
        try:
            self.repository.save_quote(quote)
            self._save_idempotency(command.actor_id, operation, idempotency_key, request_hash, payload)
            self.repository.commit()
            return payload
        except Exception:
            self.repository.rollback()
            raise

    def get_quote(self, quote_id: str, actor_id: str) -> dict:
        quote = self._owned_quote(quote_id, actor_id)
        return quote.snapshot()

    def prepare_booking(self, command: PrepareBookingCommand, idempotency_key: str) -> dict:
        operation = "ride.booking.prepare"
        request_hash = normalized_hash(
            {
                "actor_id": command.actor_id,
                "quote_id": command.quote_id,
                "confirmation": command.confirmation.__dict__,
            }
        )
        if replay := self._replay(command.actor_id, operation, idempotency_key, request_hash):
            return replay
        quote = self._owned_quote(command.quote_id, command.actor_id)
        if _aware(quote.expires_at) <= utc_now():
            raise RideError(409, "QUOTE_EXPIRED", "The quote has expired; request a new quote.")
        self._validate_confirmation(
            command.confirmation,
            prepare_confirmation_payload(quote, command.actor_id),
        )
        now = utc_now()
        booking = Booking(
            id=f"ride_{uuid4().hex[:20]}",
            actor_id=command.actor_id,
            quote_id=quote.id,
            quote_version=quote.quote_version,
            amount=quote.amount,
            currency=quote.currency,
            status=BookingStatus.AWAITING_PAYMENT_CONFIRMATION.value,
            resource_version=1,
            payment_reference=None,
            driver=None,
            created_at=now,
            updated_at=now,
        )
        payload = booking.snapshot()
        try:
            self.repository.consume_confirmation(command.confirmation)
            self.repository.save_booking(booking)
            self._save_idempotency(command.actor_id, operation, idempotency_key, request_hash, payload)
            self.repository.commit()
            return payload
        except Exception:
            self.repository.rollback()
            raise

    def confirm_booking(self, command: ConfirmBookingCommand, idempotency_key: str) -> dict:
        operation = "ride.booking.confirm"
        request_hash = normalized_hash(
            {
                "actor_id": command.actor_id,
                "booking_id": command.booking_id,
                "payment_reference": command.payment_reference,
                "confirmation": command.confirmation.__dict__,
            }
        )
        if replay := self._replay(command.actor_id, operation, idempotency_key, request_hash):
            return replay
        booking = self._owned_booking(command.booking_id, command.actor_id)
        if booking.status != BookingStatus.AWAITING_PAYMENT_CONFIRMATION.value:
            raise RideError(409, "INVALID_BOOKING_STATE", f"Cannot confirm booking in state {booking.status}.")
        self._validate_confirmation(
            command.confirmation,
            confirm_confirmation_payload(booking, command.actor_id, command.payment_reference),
        )
        booking.payment_reference = command.payment_reference
        booking.driver = simulated_driver(self._owned_quote(booking.quote_id, command.actor_id).vehicle_type)
        booking.status = BookingStatus.DRIVER_ASSIGNED.value
        booking.resource_version += 1
        booking.updated_at = utc_now()
        payload = booking.snapshot()
        try:
            self.repository.consume_confirmation(command.confirmation)
            self.repository.save_booking(booking)
            self._save_idempotency(command.actor_id, operation, idempotency_key, request_hash, payload)
            self.repository.commit()
            return payload
        except Exception:
            self.repository.rollback()
            raise

    def cancel_booking(self, command: CancelBookingCommand, idempotency_key: str) -> dict:
        operation = "ride.booking.cancel"
        request_hash = normalized_hash(
            {
                "actor_id": command.actor_id,
                "booking_id": command.booking_id,
                "confirmation": command.confirmation.__dict__,
            }
        )
        if replay := self._replay(command.actor_id, operation, idempotency_key, request_hash):
            return replay
        booking = self._owned_booking(command.booking_id, command.actor_id)
        if booking.status == BookingStatus.CANCELLED.value:
            raise RideError(409, "INVALID_BOOKING_STATE", "The booking is already cancelled.")
        self._validate_confirmation(
            command.confirmation,
            cancel_confirmation_payload(booking, command.actor_id),
        )
        booking.status = BookingStatus.CANCELLED.value
        booking.resource_version += 1
        booking.updated_at = utc_now()
        payload = booking.snapshot()
        try:
            self.repository.consume_confirmation(command.confirmation)
            self.repository.save_booking(booking)
            self._save_idempotency(command.actor_id, operation, idempotency_key, request_hash, payload)
            self.repository.commit()
            return payload
        except Exception:
            self.repository.rollback()
            raise

    def get_booking(self, booking_id: str, actor_id: str) -> dict:
        return self._owned_booking(booking_id, actor_id).snapshot()

    def _owned_quote(self, quote_id: str, actor_id: str) -> Quote:
        quote = self.repository.get_quote(quote_id)
        if quote is None or quote.actor_id != actor_id:
            raise RideError(404, "QUOTE_NOT_FOUND", "Quote not found.")
        return quote

    def _owned_booking(self, booking_id: str, actor_id: str) -> Booking:
        booking = self.repository.get_booking(booking_id)
        if booking is None or booking.actor_id != actor_id:
            raise RideError(404, "BOOKING_NOT_FOUND", "Booking not found.")
        return booking

    def _validate_confirmation(
        self,
        evidence: ConfirmationEvidence,
        expected_payload: dict,
    ) -> None:
        now = utc_now()
        if evidence.actor_id != expected_payload["actor_id"]:
            raise RideError(409, "CONFIRMATION_MISMATCH", "Confirmation actor does not match the request.")
        if evidence.action != expected_payload["action"]:
            raise RideError(409, "CONFIRMATION_MISMATCH", "Confirmation action does not match the request.")
        if evidence.quote_version != expected_payload["quote_version"]:
            raise RideError(409, "CONFIRMATION_MISMATCH", "Confirmation quote version is stale.")
        if evidence.amount != expected_payload["amount"] or evidence.currency != expected_payload["currency"]:
            raise RideError(409, "CONFIRMATION_MISMATCH", "Confirmation price does not match the request.")
        issued_at = _aware(evidence.issued_at)
        expires_at = _aware(evidence.expires_at)
        if expires_at <= issued_at or issued_at > now or expires_at <= now:
            raise RideError(409, "CONFIRMATION_EXPIRED", "Confirmation is not currently valid.")
        expected_hash = normalized_hash(expected_payload)
        if not compare_digest(evidence.payload_hash, expected_hash):
            raise RideError(409, "CONFIRMATION_MISMATCH", "Confirmation payload does not match the request.")
        if self.repository.is_confirmation_consumed(evidence.confirmation_id):
            raise RideError(409, "CONFIRMATION_ALREADY_USED", "Confirmation evidence has already been consumed.")

    def _replay(
        self,
        actor_id: str,
        operation: str,
        key: str,
        request_hash: str,
    ) -> dict | None:
        record = self.repository.get_idempotency(actor_id, operation, key)
        if record is None:
            return None
        if not compare_digest(record.request_hash, request_hash):
            raise RideError(
                409,
                "IDEMPOTENCY_CONFLICT",
                "The idempotency key was already used with a different payload.",
            )
        return record.response_payload

    def _save_idempotency(
        self,
        actor_id: str,
        operation: str,
        key: str,
        request_hash: str,
        response_payload: dict,
    ) -> None:
        self.repository.save_idempotency(
            IdempotencyRecord(
                actor_id=actor_id,
                operation=operation,
                key=key,
                request_hash=request_hash,
                response_payload=response_payload,
                created_at=utc_now(),
            )
        )


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
