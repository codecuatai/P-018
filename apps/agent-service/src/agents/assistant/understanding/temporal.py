from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

PRODUCT_TIMEZONE = "Asia/Ho_Chi_Minh"


def _plain(value: str) -> str:
    import unicodedata

    normalized = unicodedata.normalize("NFD", value.casefold())
    return "".join("d" if char == "đ" else char for char in normalized if unicodedata.category(char) != "Mn")


@dataclass(frozen=True)
class TemporalResolution:
    value: datetime | None = None
    past_explicit: bool = False
    ambiguous_past_clock: bool = False


class TemporalContext:
    """Single policy boundary for X-One's local clock and user time expressions."""

    timezone = ZoneInfo(PRODUCT_TIMEZONE)

    @classmethod
    def now(cls) -> datetime:
        return datetime.now(cls.timezone)

    @classmethod
    def today(cls, now: datetime | None = None) -> date:
        return (now or cls.now()).astimezone(cls.timezone).date()

    @classmethod
    def utility_response(cls, text: str, now: datetime | None = None) -> str | None:
        lowered = _plain(text)
        asks_time = any(value in lowered for value in ("may gio", "gio hien tai", "bay gio la may gio"))
        asks_date = any(value in lowered for value in ("hom nay ngay may", "ngay hom nay", "thu may"))
        if not asks_time and not asks_date:
            return None
        current = (now or cls.now()).astimezone(cls.timezone)
        weekdays = ("thứ Hai", "thứ Ba", "thứ Tư", "thứ Năm", "thứ Sáu", "thứ Bảy", "Chủ nhật")
        if asks_time and asks_date:
            return f"Hiện là {current:%H:%M}, {weekdays[current.weekday()]} ngày {current:%d/%m/%Y} (giờ Việt Nam)."
        if asks_time:
            return f"Hiện là {current:%H:%M} (giờ Việt Nam)."
        return f"Hôm nay là {weekdays[current.weekday()]} ngày {current:%d/%m/%Y}."

    @classmethod
    def resolve_clock(cls, text: str, now: datetime | None = None) -> TemporalResolution:
        current = (now or cls.now()).astimezone(cls.timezone)
        lowered = _plain(text)
        explicit_date: date | None = None
        date_match = re.search(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b", lowered)
        if date_match:
            day, month, year = (int(value) for value in date_match.groups())
            if year < 100:
                year += 2000
            try:
                explicit_date = date(year, month, day)
            except ValueError:
                return TemporalResolution()
        elif "hom qua" in lowered:
            explicit_date = current.date() - timedelta(days=1)

        hour_match = re.search(r"\b(\d{1,2})(?:\s*(?:gio|h)|:([0-5]\d))\s*(sang|chieu|toi|trua|am|pm)?", lowered)
        hour: int | None = None
        minute = 0
        if hour_match:
            hour = int(hour_match.group(1))
            minute = int(hour_match.group(2) or 0)
            period = hour_match.group(3)
            if period in {"chieu", "toi", "pm"} and hour < 12:
                hour += 12
            if period == "trua" and hour < 11:
                hour += 12
        elif "sang mai" in lowered:
            hour = 8
        elif "toi nay" in lowered:
            hour = 19
        elif "trua nay" in lowered:
            hour = 12
        if hour is None or hour > 23:
            return TemporalResolution(past_explicit=bool(explicit_date and explicit_date < current.date()))

        day = explicit_date or current.date()
        relative_future = False
        if explicit_date is None and "ngay kia" in lowered:
            day += timedelta(days=2)
            relative_future = True
        elif explicit_date is None and "mai" in lowered:
            day += timedelta(days=1)
            relative_future = True
        candidate = datetime(day.year, day.month, day.day, hour, minute, tzinfo=cls.timezone)
        if candidate <= current:
            if explicit_date is not None or "hom qua" in lowered:
                return TemporalResolution(past_explicit=True)
            if not relative_future:
                return TemporalResolution(ambiguous_past_clock=True)
        return TemporalResolution(value=candidate)
