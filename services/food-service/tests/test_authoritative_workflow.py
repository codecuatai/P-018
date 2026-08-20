import pytest
from src.application.food_service import FoodApplicationService
from src.config import Settings
from src.domain.policies import DomainError, FoodOrderStatus
from src.repositories.food import InMemoryFoodRepository


def make_service(
    repository: InMemoryFoodRepository | None = None,
) -> tuple[InMemoryFoodRepository, FoodApplicationService]:
    repo = repository or InMemoryFoodRepository()
    return repo, FoodApplicationService(
        repo,
        Settings(
            app_env="test",
            persistence="memory",
            service_port=8104,
            database_url="postgresql://test",
            internal_service_token="token",
        ),
        random_value=lambda: 1.0,
    )


@pytest.mark.asyncio
async def test_authoritative_create_order_rejects_catalog_change_without_order_or_redemption() -> None:
    repository, food = make_service()
    cart = await food.create_cart("usr_demo_001", "res_pho_hanoi", "cart-authoritative-key")
    cart = await food.add_item(
        cart["id"],
        {
            "menu_item_id": "item_pho_bo",
            "quantity": 1,
            "selected_options": [{"group_id": "opt_size", "option_id": "regular"}],
        },
        "usr_demo_001",
        "add-authoritative-key",
    )
    preview = await food.preview_order(cart["id"], "addr_demo", "usr_demo_001")
    repository.items["item_pho_bo"]["price"] = 70000
    with pytest.raises(DomainError, match="Báo giá"):
        await food.create_order(
            {
                "cart_id": cart["id"],
                "address_id": "addr_demo",
                "user_id": "usr_demo_001",
                "payment_method": "card",
                "idempotency_key": "authoritative-key",
                "expected_snapshot_hash": preview["snapshot_hash"],
                "expected_cart_version": preview["cart_version"],
                "expected_amount": preview["total"]["amount"],
                "expected_currency": preview["total"]["currency"],
                "expected_quote_version": preview["quote_version"],
            }
        )
    assert repository.orders == {}


@pytest.mark.asyncio
async def test_voucher_reload_and_quote_are_deterministic_without_usage_counter() -> None:
    repository, food = make_service()
    cart = await food.create_cart("usr_demo_001", "res_pho_hanoi", "cart-voucher-reload-key")
    cart = await food.add_item(
        cart["id"],
        {
            "menu_item_id": "item_pho_bo",
            "quantity": 2,
            "selected_options": [{"group_id": "opt_size", "option_id": "large"}],
        },
        "usr_demo_001",
        "add-voucher-reload-key",
    )
    cart = await food.apply_voucher(cart["id"], "XONE50", "usr_demo_001", "apply-voucher-reload-key")
    first = await food.preview_order(cart["id"], "addr_demo", "usr_demo_001")
    second = await food.preview_order(cart["id"], "addr_demo", "usr_demo_001")
    assert first["snapshot_hash"] == second["snapshot_hash"]
    repository.vouchers["XONE50"]["discount_value"] = 20
    changed = await food.preview_order(cart["id"], "addr_demo", "usr_demo_001")
    assert changed["snapshot_hash"] != first["snapshot_hash"]


@pytest.mark.asyncio
async def test_transition_operation_key_is_idempotent_and_rejects_target_reuse() -> None:
    _, food = make_service()
    cart = await food.create_cart("usr_demo_001", "res_pho_hanoi", "cart-transition-key")
    cart = await food.add_item(
        cart["id"],
        {
            "menu_item_id": "item_pho_bo",
            "quantity": 1,
            "selected_options": [{"group_id": "opt_size", "option_id": "regular"}],
        },
        "usr_demo_001",
        "add-transition-key",
    )
    order = await food.create_order(
        {
            "cart_id": cart["id"],
            "address_id": "addr_demo",
            "user_id": "usr_demo_001",
            "payment_method": "card",
            "idempotency_key": "transition-order",
        }
    )
    first = await food.transition_order(order["id"], FoodOrderStatus.PAID.value, "payment", "transition-key")
    retry = await food.transition_order(order["id"], FoodOrderStatus.PAID.value, "payment", "transition-key")
    assert retry["version"] == first["version"]
    with pytest.raises(DomainError, match="target khác"):
        await food.transition_order(order["id"], FoodOrderStatus.PAYMENT_FAILED.value, "payment", "transition-key")


@pytest.mark.asyncio
async def test_driver_is_released_and_timeline_is_event_backed() -> None:
    repository, food = make_service()
    cart = await food.create_cart("usr_demo_001", "res_pho_hanoi", "cart-driver-key")
    cart = await food.add_item(
        cart["id"],
        {
            "menu_item_id": "item_pho_bo",
            "quantity": 1,
            "selected_options": [{"group_id": "opt_size", "option_id": "regular"}],
        },
        "usr_demo_001",
        "add-driver-key",
    )
    order = await food.create_order(
        {
            "cart_id": cart["id"],
            "address_id": "addr_demo",
            "user_id": "usr_demo_001",
            "payment_method": "card",
            "idempotency_key": "driver-order",
        }
    )
    for target in (
        FoodOrderStatus.PAID,
        FoodOrderStatus.RESTAURANT_CONFIRMING,
        FoodOrderStatus.RESTAURANT_ACCEPTED,
        FoodOrderStatus.PREPARING,
        FoodOrderStatus.READY_FOR_PICKUP,
        FoodOrderStatus.DRIVER_ASSIGNED,
        FoodOrderStatus.PICKED_UP,
        FoodOrderStatus.DELIVERING,
        FoodOrderStatus.DELIVERED,
    ):
        await food.transition_order(order["id"], target.value, "test", f"driver-{target.value}")
    assert repository.drivers["drv_001"]["available"] is True
    tracking = await food.tracking(order["id"], "usr_demo_001")
    assert tracking["timeline"][-1]["to_status"] == FoodOrderStatus.DELIVERED.value


@pytest.mark.asyncio
async def test_preview_rejects_redeemed_voucher_and_cart_creation_is_idempotent() -> None:
    repository, food = make_service()
    first = await food.create_cart("usr_demo_001", "res_pho_hanoi", "cart-create-key")
    retry = await food.create_cart("usr_demo_001", "res_pho_hanoi", "cart-create-key")
    assert retry["id"] == first["id"]
    with pytest.raises(DomainError, match="Idempotency"):
        await food.create_cart("usr_demo_001", "res_bun_cha", "cart-create-key")

    cart = await food.add_item(
        first["id"],
        {
            "menu_item_id": "item_pho_bo",
            "quantity": 2,
            "selected_options": [{"group_id": "opt_size", "option_id": "large"}],
        },
        "usr_demo_001",
        "add-create-key",
    )
    await food.apply_voucher(cart["id"], "XONE50", "usr_demo_001", "apply-create-key")
    order = await food.create_order(
        {
            "cart_id": cart["id"],
            "address_id": "addr_demo",
            "user_id": "usr_demo_001",
            "payment_method": "card",
            "idempotency_key": "voucher-order-key",
        }
    )
    assert order["id"]
    with pytest.raises(DomainError, match="Voucher"):
        await food.preview_order(cart["id"], "addr_demo", "usr_demo_001")
    assert repository.vouchers["XONE50"]["used_count"] == 1
