"""Deterministic extraction of ride fields from a user turn."""

from __future__ import annotations

import re


class RideInputParser:
    @staticmethod
    def extract(message: str) -> dict[str, str]:
        fields: dict[str, str] = {}
        route = re.search(
            r"(?:từ|đón tại|đón ở)\s+(.+?)\s+(?:đi\s+)?(?:đến|tới|ra)\s+(.+?)(?:[,.!?]|$)",
            message,
            re.IGNORECASE,
        )
        if route:
            fields["pickup_address"] = RideInputParser.clean_location(route.group(1))
            fields["dropoff_address"] = RideInputParser.clean_location(route.group(2))
        elif match := re.search(r"(?:^|\s)(?:từ|đón tại|đón ở)\s+(.+?)(?:[,.!?]|$)", message, re.IGNORECASE):
            fields["pickup_address"] = RideInputParser.clean_location(match.group(1))
        elif match := re.search(r"(?:^|\s)(?:đến|tới|ra)\s+(.+?)(?:[,.!?]|$)", message, re.IGNORECASE):
            fields["dropoff_address"] = RideInputParser.clean_location(match.group(1))
        elif match := re.search(
            r"(?:\bmuốn\s+)?\bđi\s+(?!từ\b|chơi\b)(.+?)(?=\s+(?:chơi|bằng|đặt\s+xe|gọi\s+xe|hộ\s+tôi|nhé|với)\b|[,.!?]|$)",
            message,
            re.IGNORECASE,
        ):
            fields["dropoff_address"] = RideInputParser.clean_location(match.group(1))
        normalized = message.lower()
        if any(value in normalized for value in ("xe máy", "xe may", "bike")):
            fields["vehicle_type"] = "BIKE"
        elif any(value in normalized for value in ("7 chỗ", "7 cho", "car_7")):
            fields["vehicle_type"] = "CAR_7"
        elif any(value in normalized for value in ("4 chỗ", "4 cho", "car_4")):
            fields["vehicle_type"] = "CAR_4"
        if "save5000" in normalized:
            fields["promo_code"] = "SAVE5000"
        if quote_id := RideInputParser.find_id(message, "quote"):
            fields["latest_quote_id"] = quote_id
        if booking_id := RideInputParser.find_id(message, "ride"):
            fields["latest_booking_id"] = booking_id
        return {name: value for name, value in fields.items() if value}

    @staticmethod
    def clean_location(value: str) -> str:
        return re.sub(r"\s+(?:đi|bằng)\s*$", "", value.strip(" .,!?"), flags=re.IGNORECASE)

    @staticmethod
    def find_id(message: str, prefix: str) -> str | None:
        match = re.search(rf"{prefix}_[a-zA-Z0-9]+", message)
        return match.group(0) if match else None

    @staticmethod
    def is_social(message: str) -> bool:
        normalized = message.lower().strip()
        social = ("xin chào", "chào", "hello", "hi", "cảm ơn", "cam on", "thank", "tạm biệt", "bye")
        ride = ("xe", "đi ", "đón", "đến", "tới", " ra ", "giá", "đặt", "hủy", "chuyến", "tài xế")
        return any(token in normalized for token in social) and not any(token in normalized for token in ride)

