from uuid import uuid4

from fastapi import HTTPException

from .models import PaymentIntent
from .repository import PaymentRepository
from .schemas import PaymentIntentCreate


class ProviderTimeoutError(Exception):
    """The provider completed capture but its response was lost."""


ProviderTimeout = ProviderTimeoutError


class PaymentService:
    def __init__(self, repository: PaymentRepository):
        self.repository = repository

    async def create(self, data: PaymentIntentCreate, key: str | None) -> PaymentIntent:
        replay = await self.repository.get_idempotent("create", key)
        if replay:
            return replay
        intent = PaymentIntent(id=f"pi_{uuid4().hex[:20]}", **data.model_dump())
        return await self.repository.save(intent, "create", key)

    async def get(self, intent_id: str) -> PaymentIntent:
        intent = await self.repository.get(intent_id)
        if not intent:
            raise HTTPException(404, "Payment intent not found")
        return intent

    async def authorize(self, intent_id: str, key: str | None) -> PaymentIntent:
        replay = await self.repository.get_idempotent("authorize", key)
        if replay:
            return replay
        intent = await self.get(intent_id)
        if intent.status in {"AUTHORIZED", "CAPTURED", "REFUNDED"}:
            return intent
        if intent.status == "CANCELLED":
            raise HTTPException(409, "Cancelled payment cannot be authorized")
        if intent.payment_method == "pm_declined":
            intent.status, intent.last_error = "DECLINED", "Card declined by simulated provider"
        else:
            intent.status, intent.last_error = "AUTHORIZED", None
        return await self.repository.save(intent, "authorize", key)

    async def capture(self, intent_id: str, key: str | None, amount: int | None = None) -> PaymentIntent:
        replay = await self.repository.get_idempotent("capture", key)
        if replay:
            if replay.payment_method == "pm_capture_timeout_succeeded" and replay.status == "CAPTURED":
                raise ProviderTimeout()
            return replay
        intent = await self.get(intent_id)
        if intent.status == "CAPTURED":
            return intent
        if intent.status != "AUTHORIZED":
            raise HTTPException(409, "Only authorized payments can be captured")
        capture_amount = amount or intent.amount
        if capture_amount > intent.amount:
            raise HTTPException(409, "Capture amount exceeds authorized amount")
        if intent.payment_method == "pm_capture_failed":
            intent.status, intent.last_error = "CAPTURE_FAILED", "Capture rejected by simulated provider"
            return await self.repository.save(intent, "capture", key)
        intent.status, intent.last_error, intent.captured_amount = "CAPTURED", None, capture_amount
        saved = await self.repository.save(intent, "capture", key)
        if intent.payment_method == "pm_capture_timeout_succeeded":
            raise ProviderTimeout()
        return saved

    async def cancel(self, intent_id: str, key: str | None) -> PaymentIntent:
        replay = await self.repository.get_idempotent("cancel", key)
        if replay:
            return replay
        intent = await self.get(intent_id)
        if intent.status == "CAPTURED":
            raise HTTPException(409, "Captured payment must be refunded")
        intent.status = "CANCELLED"
        return await self.repository.save(intent, "cancel", key)

    async def refund(self, intent_id: str, key: str | None) -> PaymentIntent:
        replay = await self.repository.get_idempotent("refund", key)
        if replay:
            return replay
        intent = await self.get(intent_id)
        if intent.status == "REFUNDED":
            return intent
        if intent.status != "CAPTURED":
            raise HTTPException(409, "Only captured payments can be refunded")
        if intent.payment_method == "pm_refund_failed":
            intent.last_error = "Refund rejected by simulated provider"
            return await self.repository.save(intent, "refund", key)
        intent.status, intent.last_error = "REFUNDED", None
        return await self.repository.save(intent, "refund", key)
