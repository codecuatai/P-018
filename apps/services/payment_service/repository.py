from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import IdempotencyRecord, PaymentIntent


class PaymentRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, intent_id: str) -> PaymentIntent | None:
        return await self.session.get(PaymentIntent, intent_id)

    async def get_idempotent(self, operation: str, key: str | None) -> PaymentIntent | None:
        if not key:
            return None
        record = await self.session.scalar(
            select(IdempotencyRecord).where(IdempotencyRecord.operation == operation, IdempotencyRecord.key == key)
        )
        return await self.get(record.payment_intent_id) if record else None

    async def save(self, intent: PaymentIntent, operation: str | None = None, key: str | None = None) -> PaymentIntent:
        self.session.add(intent)
        if operation and key:
            self.session.add(IdempotencyRecord(operation=operation, key=key, payment_intent_id=intent.id))
        await self.session.commit()
        await self.session.refresh(intent)
        return intent
