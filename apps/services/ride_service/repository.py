from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Booking, IdempotencyRecord, Quote


class RideRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_quote(self, quote_id: str) -> Quote | None:
        return await self.session.get(Quote, quote_id)

    async def get_booking(self, booking_id: str) -> Booking | None:
        return await self.session.get(Booking, booking_id)

    async def get_idempotent(self, operation: str, key: str | None) -> Booking | None:
        if not key:
            return None
        record = await self.session.scalar(
            select(IdempotencyRecord).where(IdempotencyRecord.operation == operation, IdempotencyRecord.key == key)
        )
        return await self.get_booking(record.booking_id) if record else None

    async def save_quote(self, quote: Quote) -> Quote:
        self.session.add(quote)
        await self.session.commit()
        await self.session.refresh(quote)
        return quote

    async def save_booking(self, booking: Booking, operation: str | None = None, key: str | None = None) -> Booking:
        self.session.add(booking)
        if operation and key:
            self.session.add(IdempotencyRecord(operation=operation, key=key, booking_id=booking.id))
        await self.session.commit()
        await self.session.refresh(booking)
        return booking
