from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

PRODUCT_TIMEZONE = "Asia/Ho_Chi_Minh"


class TemporalContext:
    """Authoritative product timezone and clock; language interpretation belongs to the LLM."""

    timezone = ZoneInfo(PRODUCT_TIMEZONE)

    @classmethod
    def now(cls) -> datetime:
        return datetime.now(cls.timezone)

    @classmethod
    def today(cls, now: datetime | None = None) -> date:
        return (now or cls.now()).astimezone(cls.timezone).date()
