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
    QuoteStatus,
    RideError,
    cancel_confirmation_payload,
    confirm_confirmation_payload,
    confirmation_request_payload,
    create_quote,
    next_tracking_status,
    normalized_hash,
    prepare_confirmation_payload,
    quote_request_payload,
    tracking_elapsed,
    tracking_snapshot,
    transition_booking,
    transition_quote,
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
        tariff = self.repository.get_active_tariff(command.vehicle_type.value)
        if tariff is None:
            raise RideError(503, "TARIFF_UNAVAILABLE", "No active tariff is configured for this vehicle type.", retryable=True)
        quote = create_quote(command, tariff)
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
        self._expire_quote_if_needed(quote)
        return quote.snapshot()

    def list_quotes(self, actor_id: str) -> list[dict]:
        quotes = self.repository.list_quotes(actor_id)
        changed = False
        for quote in quotes:
            changed = self._expire_quote_if_needed(quote, commit=False) or changed
        if changed:
            try:
                self.repository.commit()
            except Exception:
                self.repository.rollback()
                raise
        return [quote.snapshot() for quote in quotes]

    def prepare_booking(self, command: PrepareBookingCommand, idempotency_key: str) -> dict:
        operation = "ride.booking.prepare"
        request_hash = normalized_hash(
            {
                "actor_id": command.actor_id,
                "quote_id": command.quote_id,
                "confirmation": confirmation_request_payload(command.confirmation),
            }
        )
        if replay := self._replay(command.actor_id, operation, idempotency_key, request_hash):
            return replay
        quote = self._owned_quote(command.quote_id, command.actor_id)
        if _aware(quote.expires_at) <= utc_now():
            self._expire_quote_if_needed(quote)
            raise RideError(409, "QUOTE_EXPIRED", "The quote has expired; request a new quote.")
        self._validate_confirmation(
            command.confirmation,
            prepare_confirmation_payload(quote, command.actor_id),
        )
        if quote.status != QuoteStatus.QUOTE_CREATED.value:
            raise RideError(409, "QUOTE_NOT_AVAILABLE", "The quote is no longer available for a new booking.")
        now = utc_now()
        booking = Booking(
            id=f"ride_{uuid4().hex[:20]}",
            actor_id=command.actor_id,
            quote_id=quote.id,
            quote_version=quote.quote_version,
            amount=quote.amount,
            currency=quote.currency,
            status=BookingStatus.AWAITING_CONFIRMATION.value,
            resource_version=1,
            payment_reference=None,
            driver=None,
            created_at=now,
            updated_at=now,
            driver_id=None,
            tracking_started_at=None,
        )
        payload = booking.snapshot()
        try:
            self.repository.consume_confirmation(command.confirmation)
            transition_quote(quote, QuoteStatus.AWAITING_CONFIRMATION.value)
            self.repository.save_quote(quote)
            self.repository.save_booking(booking)
            self.repository.record_tracking_event(
                booking.id,
                booking.status,
                0.0,
                None,
            )
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
                "confirmation": confirmation_request_payload(command.confirmation),
            }
        )
        existing = self.repository.get_idempotency(command.actor_id, operation, idempotency_key)
        if existing is not None:
            if not compare_digest(existing.request_hash, request_hash):
                raise RideError(
                    409,
                    "IDEMPOTENCY_CONFLICT",
                    "The idempotency key was already used with a different payload.",
                )
            if existing.response_payload.get("status") != BookingStatus.SEARCHING_DRIVER.value:
                return existing.response_payload
            booking = self._owned_booking(command.booking_id, command.actor_id)
            quote = self._owned_quote(booking.quote_id, command.actor_id)
            return self._complete_driver_search(
                booking,
                quote,
                command.actor_id,
                operation,
                idempotency_key,
                request_hash,
            )
        booking = self._owned_booking(command.booking_id, command.actor_id)
        if booking.status != BookingStatus.AWAITING_CONFIRMATION.value:
            raise RideError(409, "INVALID_BOOKING_STATE", f"Cannot confirm booking in state {booking.status}.")
        self._validate_confirmation(
            command.confirmation,
            confirm_confirmation_payload(booking, command.actor_id, command.payment_reference),
        )
        quote = self._owned_quote(booking.quote_id, command.actor_id)
        if _aware(quote.expires_at) <= utc_now():
            self._expire_quote_if_needed(quote)
            raise RideError(409, "QUOTE_EXPIRED", "The quote has expired; request a new quote.")
        if quote.status != QuoteStatus.AWAITING_CONFIRMATION.value:
            raise RideError(409, "QUOTE_NOT_AVAILABLE", "The quote is no longer awaiting booking confirmation.")
        booking.payment_reference = command.payment_reference
        try:
            self.repository.consume_confirmation(command.confirmation)
            transition_booking(booking, BookingStatus.SEARCHING_DRIVER.value)
            transition_quote(quote, QuoteStatus.CONSUMED.value)
            self.repository.save_quote(quote)
            self.repository.save_booking(booking)
            self.repository.record_tracking_event(
                booking.id,
                booking.status,
                0.0,
                None,
            )
            # Persist the search state before the separate driver-assignment
            # transition. A retry can safely resume from this durable state.
            self._save_idempotency(
                command.actor_id,
                operation,
                idempotency_key,
                request_hash,
                booking.snapshot(),
            )
            self.repository.commit()
        except Exception:
            self.repository.rollback()
            raise
        return self._complete_driver_search(
            booking,
            quote,
            command.actor_id,
            operation,
            idempotency_key,
            request_hash,
        )

    def _complete_driver_search(
        self,
        booking: Booking,
        quote: Quote,
        actor_id: str,
        operation: str,
        idempotency_key: str,
        request_hash: str,
    ) -> dict:
        if booking.status != BookingStatus.SEARCHING_DRIVER.value:
            raise RideError(409, "INVALID_BOOKING_STATE", f"Cannot assign a driver from state {booking.status}.")
        try:
            booking.driver = self.repository.find_and_assign_driver(
                quote.vehicle_type,
                quote.pickup_latitude,
                quote.pickup_longitude,
            )
            booking.driver_id = str(booking.driver.get("id")) if booking.driver else None
            if booking.driver:
                booking.tracking_started_at = utc_now()
                target = BookingStatus.DRIVER_ASSIGNED.value
            else:
                target = BookingStatus.NO_DRIVER.value
            transition_booking(booking, target)
            self.repository.save_booking(booking)
            self.repository.record_tracking_event(
                booking.id,
                booking.status,
                0.0,
                None,
            )
            payload = booking.snapshot()
            self._save_idempotency(actor_id, operation, idempotency_key, request_hash, payload)
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
                "confirmation": confirmation_request_payload(command.confirmation),
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
        try:
            self.repository.consume_confirmation(command.confirmation)
            transition_booking(booking, BookingStatus.CANCELLED.value)
            if booking.driver_id:
                self.repository.release_driver(booking.driver_id)
            self.repository.save_booking(booking)
            self.repository.record_tracking_event(booking.id, booking.status, 0.0, None)
            payload = booking.snapshot()
            self._save_idempotency(command.actor_id, operation, idempotency_key, request_hash, payload)
            self.repository.commit()
            return payload
        except Exception:
            self.repository.rollback()
            raise

    def get_booking(self, booking_id: str, actor_id: str) -> dict:
        return self._owned_booking(booking_id, actor_id).snapshot()

    def list_bookings(self, actor_id: str) -> list[dict]:
        return [booking.snapshot() for booking in self.repository.list_bookings(actor_id)]

    def get_tracking(self, booking_id: str, actor_id: str) -> dict:
        booking = self._owned_booking(booking_id, actor_id)
        quote = self._owned_quote(booking.quote_id, actor_id)
        now = utc_now()
        driver = booking.driver or {}
        eta_seconds = int(driver.get("eta_seconds", 0))
        travel_seconds = max(60, int(quote.route_duration_seconds or quote.duration_minutes * 60))
        elapsed = tracking_elapsed(booking, now)
        changed = False
        for _ in range(4):
            target = next_tracking_status(booking.status, elapsed, eta_seconds, travel_seconds)
            if target is None:
                break
            transition_booking(booking, target)
            if target == BookingStatus.COMPLETED.value and booking.driver_id:
                # Keep the immutable booking snapshot while returning the live
                # synthetic driver to the available pool.
                self.repository.release_driver(booking.driver_id)
            self.repository.save_booking(booking)
            self.repository.record_tracking_event(booking.id, target, 0.0 if target != BookingStatus.COMPLETED.value else 1.0, None)
            changed = True
        if changed:
            try:
                self.repository.commit()
            except Exception:
                self.repository.rollback()
                raise
        # Recalculate after persistence so the API response and authoritative
        # booking record always expose the same lifecycle state.
        return tracking_snapshot(booking, quote, now=now)

    def _owned_quote(self, quote_id: str, actor_id: str) -> Quote:
        quote = self.repository.get_quote(quote_id)
        if quote is None or quote.actor_id != actor_id:
            raise RideError(404, "QUOTE_NOT_FOUND", "Quote not found.")
        return quote

    def _expire_quote_if_needed(self, quote: Quote, *, commit: bool = True) -> bool:
        if quote.status not in {
            QuoteStatus.QUOTE_CREATED.value,
            QuoteStatus.AWAITING_CONFIRMATION.value,
        } or _aware(quote.expires_at) > utc_now():
            return False
        transition_quote(quote, QuoteStatus.EXPIRED.value)
        self.repository.save_quote(quote)
        if commit:
            try:
                self.repository.commit()
            except Exception:
                self.repository.rollback()
                raise
        return True

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
