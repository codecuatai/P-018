from datetime import UTC, datetime, timedelta

import pytest
from src.domain.policies import (
    DeliveryConfig,
    DomainError,
    FoodOrderStatus,
    calculate_discount,
    haversine_km,
    quote_delivery,
    validate_transition,
)


def test_haversine_is_zero_for_same_point() -> None:
    assert haversine_km(21.0, 105.8, 21.0, 105.8) == 0


def test_delivery_quote_rounds_and_rejects_out_of_range() -> None:
    restaurant = {"latitude": 21.0285, "longitude": 105.852}
    address = {"latitude": 21.0125, "longitude": 105.848}
    result = quote_delivery(restaurant, address, DeliveryConfig())
    assert result["fee"]["currency"] == "VND"
    with pytest.raises(DomainError, match="ngoài bán kính"):
        quote_delivery(restaurant, {"latitude": 21.2, "longitude": 105.8}, DeliveryConfig(max_distance_km=1))


def test_voucher_fixed_percentage_and_expired() -> None:
    now = datetime.now(UTC)
    assert (
        calculate_discount(
            {
                "discount_type": "fixed",
                "discount_value": 20_000,
                "minimum_order_amount": 1,
                "expires_at": now + timedelta(days=1),
            },
            100_000,
            now,
        )
        == 20_000
    )
    assert (
        calculate_discount(
            {
                "discount_type": "percentage",
                "discount_value": 20,
                "maximum_discount": 30_000,
                "minimum_order_amount": 1,
                "expires_at": now + timedelta(days=1),
            },
            200_000,
            now,
        )
        == 30_000
    )
    with pytest.raises(DomainError, match="hết hạn"):
        calculate_discount(
            {
                "discount_type": "fixed",
                "discount_value": 20_000,
                "minimum_order_amount": 1,
                "expires_at": now - timedelta(seconds=1),
            },
            100_000,
            now,
        )


def test_order_transition_policy() -> None:
    validate_transition(FoodOrderStatus.PAYMENT_PENDING, FoodOrderStatus.PAID)
    with pytest.raises(DomainError, match="Không thể chuyển"):
        validate_transition(FoodOrderStatus.DELIVERED, FoodOrderStatus.PAID)
