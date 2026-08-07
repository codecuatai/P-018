from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from math import asin, cos, radians, sin, sqrt


class FoodOrderStatus(StrEnum):
    DRAFT = "DRAFT"
    AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION"
    PAYMENT_PENDING = "PAYMENT_PENDING"
    PAID = "PAID"
    RESTAURANT_CONFIRMING = "RESTAURANT_CONFIRMING"
    RESTAURANT_ACCEPTED = "RESTAURANT_ACCEPTED"
    PREPARING = "PREPARING"
    READY_FOR_PICKUP = "READY_FOR_PICKUP"
    DRIVER_ASSIGNED = "DRIVER_ASSIGNED"
    PICKED_UP = "PICKED_UP"
    DELIVERING = "DELIVERING"
    DELIVERED = "DELIVERED"
    PAYMENT_FAILED = "PAYMENT_FAILED"
    RESTAURANT_REJECTED = "RESTAURANT_REJECTED"
    CANCELLED = "CANCELLED"
    REFUND_PENDING = "REFUND_PENDING"
    REFUNDED = "REFUNDED"


class DomainError(ValueError):
    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code = code
        self.detail = detail


ALLOWED_TRANSITIONS: dict[FoodOrderStatus, set[FoodOrderStatus]] = {
    FoodOrderStatus.DRAFT: {FoodOrderStatus.AWAITING_CONFIRMATION, FoodOrderStatus.PAYMENT_PENDING},
    FoodOrderStatus.AWAITING_CONFIRMATION: {FoodOrderStatus.PAYMENT_PENDING, FoodOrderStatus.CANCELLED},
    FoodOrderStatus.PAYMENT_PENDING: {FoodOrderStatus.PAID, FoodOrderStatus.PAYMENT_FAILED},
    FoodOrderStatus.PAID: {FoodOrderStatus.RESTAURANT_CONFIRMING},
    FoodOrderStatus.RESTAURANT_CONFIRMING: {FoodOrderStatus.RESTAURANT_ACCEPTED, FoodOrderStatus.RESTAURANT_REJECTED, FoodOrderStatus.CANCELLED},
    FoodOrderStatus.RESTAURANT_ACCEPTED: {FoodOrderStatus.PREPARING, FoodOrderStatus.CANCELLED},
    FoodOrderStatus.PREPARING: {FoodOrderStatus.READY_FOR_PICKUP},
    FoodOrderStatus.READY_FOR_PICKUP: {FoodOrderStatus.DRIVER_ASSIGNED},
    FoodOrderStatus.DRIVER_ASSIGNED: {FoodOrderStatus.PICKED_UP},
    FoodOrderStatus.PICKED_UP: {FoodOrderStatus.DELIVERING},
    FoodOrderStatus.DELIVERING: {FoodOrderStatus.DELIVERED},
    FoodOrderStatus.RESTAURANT_REJECTED: {FoodOrderStatus.REFUND_PENDING},
    FoodOrderStatus.CANCELLED: {FoodOrderStatus.REFUND_PENDING},
    FoodOrderStatus.REFUND_PENDING: {FoodOrderStatus.REFUNDED},
}


@dataclass(frozen=True)
class DeliveryConfig:
    base_fee: int = 15000
    per_km_fee: int = 5000
    minimum_fee: int = 15000
    max_distance_km: float = 15.0
    long_distance_threshold_km: float = 5.0
    long_distance_surcharge: int = 5000
    eta_minutes: int = 35


def haversine_km(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
    earth_radius_km = 6371.0
    lat_delta = radians(latitude_b - latitude_a)
    lon_delta = radians(longitude_b - longitude_a)
    value = sin(lat_delta / 2) ** 2 + cos(radians(latitude_a)) * cos(radians(latitude_b)) * sin(lon_delta / 2) ** 2
    return earth_radius_km * 2 * asin(sqrt(value))


def quote_delivery(
    restaurant: dict,
    address: dict,
    config: DeliveryConfig,
) -> dict:
    distance = haversine_km(restaurant["latitude"], restaurant["longitude"], address["latitude"], address["longitude"])
    if distance > config.max_distance_km:
        raise DomainError("DELIVERY_OUT_OF_RANGE", "Địa chỉ giao hàng nằm ngoài bán kính phục vụ.")
    distance_fee = round(distance * config.per_km_fee / 1000) * 1000
    surcharge = config.long_distance_surcharge if distance > config.long_distance_threshold_km else 0
    fee = max(config.minimum_fee, config.base_fee + distance_fee + surcharge)
    return {
        "distance_km": round(distance, 2),
        "fee": {"amount": fee, "currency": "VND"},
        "breakdown": {"base_fee": config.base_fee, "distance_fee": distance_fee, "long_distance_surcharge": surcharge},
        "eta_minutes": config.eta_minutes + round(distance * 2),
    }


def calculate_discount(voucher: dict, subtotal: int, now) -> int:
    expires_at = voucher["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at < now:
        raise DomainError("VOUCHER_EXPIRED", "Voucher đã hết hạn.")
    if subtotal < voucher["minimum_order_amount"]:
        raise DomainError("VOUCHER_NOT_APPLICABLE", "Đơn hàng chưa đạt giá trị tối thiểu của voucher.")
    if voucher["discount_type"] == "fixed":
        discount = voucher["discount_value"]
    else:
        discount = subtotal * voucher["discount_value"] // 100
        if voucher.get("maximum_discount") is not None:
            discount = min(discount, voucher["maximum_discount"])
    return min(max(discount, 0), subtotal)


def validate_transition(current: FoodOrderStatus, target: FoodOrderStatus) -> None:
    if target not in ALLOWED_TRANSITIONS.get(current, set()):
        raise DomainError("INVALID_ORDER_TRANSITION", f"Không thể chuyển đơn từ {current} sang {target}.")


def cancellation_policy(status: FoodOrderStatus) -> dict:
    allowed = status in {
        FoodOrderStatus.DRAFT,
        FoodOrderStatus.AWAITING_CONFIRMATION,
        FoodOrderStatus.PAYMENT_PENDING,
        FoodOrderStatus.PAID,
        FoodOrderStatus.RESTAURANT_CONFIRMING,
        FoodOrderStatus.RESTAURANT_ACCEPTED,
    }
    return {"allowed": allowed, "refund_amount_percent": 100 if allowed else 0, "reason": "Trước khi món bắt đầu được chuẩn bị" if allowed else "Đơn đã bắt đầu chuẩn bị hoặc giao", "policy_version": "food-cancel-v1"}


def choose_restaurant_acceptance(random_value: Callable[[], float], rejection_rate: float) -> bool:
    return random_value() >= rejection_rate
