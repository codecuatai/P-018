import asyncio

import pytest
from src.application.food_service import FoodApplicationService
from src.config import Settings
from src.domain.policies import DomainError
from src.repositories.food import InMemoryFoodRepository


def make_service() -> FoodApplicationService:
    settings = Settings(app_env="test", persistence="memory", service_port=8104, database_url="postgresql://test", internal_service_token="token")
    return FoodApplicationService(InMemoryFoodRepository(), settings)


@pytest.mark.asyncio
async def test_cart_total_and_cross_restaurant_protection() -> None:
    food = make_service()
    cart = await food.create_cart("usr_demo_001", "res_pho_hanoi", "cart-total-key")
    cart = await food.add_item(cart["id"], {"menu_item_id": "item_pho_bo", "quantity": 2, "selected_options": [{"group_id": "opt_size", "option_id": "large"}]})
    assert cart["total"] == (65_000 + 15_000) * 2
    with pytest.raises(DomainError, match="một nhà hàng"):
        await food.add_item(cart["id"], {"menu_item_id": "item_bun_cha", "quantity": 1, "selected_options": []})


@pytest.mark.asyncio
async def test_required_option_and_preview() -> None:
    food = make_service()
    cart = await food.create_cart("usr_demo_001", "res_pho_hanoi", "cart-required-option-key")
    with pytest.raises(DomainError, match="Kích thước"):
        await food.add_item(cart["id"], {"menu_item_id": "item_pho_bo", "quantity": 1, "selected_options": []})
    await food.add_item(cart["id"], {"menu_item_id": "item_pho_bo", "quantity": 1, "selected_options": [{"group_id": "opt_size", "option_id": "regular"}]})
    preview = await food.preview_order(cart["id"], "addr_demo", "usr_demo_001")
    assert preview["snapshot_hash"]
    assert preview["total"]["amount"] > preview["subtotal"]


@pytest.mark.asyncio
async def test_order_and_voucher_are_atomic_and_idempotent() -> None:
    repository = InMemoryFoodRepository()
    food = FoodApplicationService(repository, Settings(app_env="test", persistence="memory", service_port=8104, database_url="postgresql://test", internal_service_token="token"))
    cart = await food.create_cart("usr_demo_001", "res_pho_hanoi", "cart-voucher-key")
    cart = await food.add_item(cart["id"], {"menu_item_id": "item_pho_bo", "quantity": 2, "selected_options": [{"group_id": "opt_size", "option_id": "large"}]})
    cart = await food.apply_voucher(cart["id"], "XONE50")
    order = await food.create_order({"cart_id": cart["id"], "address_id": "addr_demo", "user_id": "usr_demo_001", "idempotency_key": "order-key-001", "payment_method": "card"})
    retry = await food.create_order({"cart_id": cart["id"], "address_id": "addr_demo", "user_id": "usr_demo_001", "idempotency_key": "order-key-001", "payment_method": "card"})
    assert retry["id"] == order["id"]
    assert repository.vouchers["XONE50"]["used_count"] == 1
    assert len(repository.order_events[order["id"]]) == 1


@pytest.mark.asyncio
async def test_concurrent_voucher_redemption_has_one_winner() -> None:
    repository = InMemoryFoodRepository()
    repository.vouchers["XONE50"]["usage_limit"] = 1
    repository.addresses["addr_two"] = {**repository.addresses["addr_demo"], "id": "addr_two", "user_id": "usr_two"}
    settings = Settings(app_env="test", persistence="memory", service_port=8104, database_url="postgresql://test", internal_service_token="token")
    first = FoodApplicationService(repository, settings)
    second = FoodApplicationService(repository, settings)
    carts = []
    for user in ("usr_demo_001", "usr_two"):
        cart = await first.create_cart(user, "res_pho_hanoi", f"cart-concurrent-{user}")
        carts.append(await first.add_item(cart["id"], {"menu_item_id": "item_pho_bo", "quantity": 2, "selected_options": [{"group_id": "opt_size", "option_id": "large"}]}))
        await first.apply_voucher(carts[-1]["id"], "XONE50")

    async def place(service: FoodApplicationService, cart: dict, user: str, address: str, key: str) -> str:
        try:
            await service.create_order({"cart_id": cart["id"], "address_id": address, "user_id": user, "idempotency_key": key, "payment_method": "card"})
            return "ok"
        except Exception as exc:
            return getattr(exc, "code", type(exc).__name__)

    result = await asyncio.gather(place(first, carts[0], "usr_demo_001", "addr_demo", "order-key-a"), place(second, carts[1], "usr_two", "addr_two", "order-key-b"))
    assert result.count("ok") == 1
    assert repository.vouchers["XONE50"]["used_count"] == 1
    assert len(repository.orders) == 1


@pytest.mark.asyncio
async def test_preview_reprices_current_catalog_after_cart_creation() -> None:
    repository = InMemoryFoodRepository()
    food = FoodApplicationService(repository, Settings(app_env="test", persistence="memory", service_port=8104, database_url="postgresql://test", internal_service_token="token"))
    cart = await food.create_cart("usr_demo_001", "res_pho_hanoi", "cart-reprice-key")
    await food.add_item(cart["id"], {"menu_item_id": "item_pho_bo", "quantity": 1, "selected_options": [{"group_id": "opt_size", "option_id": "regular"}]})
    repository.items["item_pho_bo"]["price"] = 70000
    preview = await food.preview_order(cart["id"], "addr_demo", "usr_demo_001")
    assert preview["subtotal"] == 70000


@pytest.mark.asyncio
async def test_addresses_are_actor_scoped_and_cart_creation_is_idempotent_under_concurrency() -> None:
    repository = InMemoryFoodRepository()
    food = FoodApplicationService(repository, Settings(app_env="test", persistence="memory", service_port=8104, database_url="postgresql://test", internal_service_token="token"))
    results = await asyncio.gather(*[food.create_cart("usr_demo_001", "res_pho_hanoi", "same-cart-key") for _ in range(20)])
    assert len({value["id"] for value in results}) == 1
    assert len(repository.carts) == 1
    assert len(await food.list_addresses("usr_demo_001", "Nhà riêng")) == 1
    assert await food.list_addresses("usr_two") == []


@pytest.mark.asyncio
async def test_search_folds_accents_and_accepts_city_address_filter() -> None:
    food = make_service()
    results = await food.search(keyword="pho bo", district="ha noi")
    assert [result["item"]["name"] for result in results] == ["Phở bò tái"]
    assert [result["item"]["name"] for result in await food.search(keyword="pho ga")] == ["Phở gà"]


@pytest.mark.asyncio
async def test_search_resolves_catalog_managed_location_alias_and_bounds_results() -> None:
    food = make_service()
    food.repository.restaurants["res_pho_hanoi"]["district"] = "Gia Lâm"
    food.repository.location_aliases = [{"aliases": ["North Campus", "Northern University"], "district": "Gia Lâm"}]
    first = await food.search(keyword="pho", district="North Campus", limit=1)
    second = await food.search(keyword="pho", district="Northern University", limit=1)
    assert len(first) == 1
    assert second == first
    assert first[0]["restaurant"]["district"] == "Gia Lâm"
