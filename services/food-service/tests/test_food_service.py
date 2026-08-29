import asyncio

import pytest
from src.application.food_service import FoodApplicationService
from src.config import Settings
from src.domain.policies import DomainError
from src.repositories.food import InMemoryFoodRepository


def make_service(repository: InMemoryFoodRepository | None = None) -> FoodApplicationService:
    settings = Settings(
        app_env="test",
        persistence="memory",
        service_port=8104,
        database_url="postgresql://test",
        internal_service_token="token",
    )
    return FoodApplicationService(repository or InMemoryFoodRepository(), settings)


@pytest.mark.asyncio
async def test_cart_total_and_multi_restaurant_pickup_route() -> None:
    food = make_service()
    cart = await food.create_cart("usr_demo_001", "res_pho_hanoi", "cart-total-key")
    cart = await food.add_item(
        cart["id"],
        {
            "menu_item_id": "item_pho_bo",
            "quantity": 2,
            "selected_options": [{"group_id": "opt_size", "option_id": "large"}],
        },
        "usr_demo_001",
        "add-total-pho",
    )
    assert cart["total"] == (65_000 + 15_000) * 2
    cart = await food.add_item(cart["id"], {"menu_item_id": "item_bun_cha", "quantity": 1, "selected_options": []}, "usr_demo_001", "add-total-bun")
    assert {item["restaurant"]["id"] for item in cart["items"]} == {"res_pho_hanoi", "res_bun_cha"}
    preview = await food.preview_order(cart["id"], "addr_demo", "usr_demo_001")
    assert [stop["id"] for stop in preview["delivery"]["pickup_stops"]] == ["res_pho_hanoi", "res_bun_cha"]
    assert preview["total"]["amount"] > cart["total"]


@pytest.mark.asyncio
async def test_cart_items_retain_rich_catalog_fields_through_update_and_reprice() -> None:
    repository = InMemoryFoodRepository()
    repository.items["item_pho_bo"].update(
        {
            "image_url": "https://cdn.example.test/pho-bo.jpg",
            "currency": "VND",
            "category": "Pho",
        }
    )
    food = FoodApplicationService(
        repository,
        Settings(
            app_env="test",
            persistence="memory",
            service_port=8104,
            database_url="postgresql://test",
            internal_service_token="token",
        ),
    )

    cart = await food.create_cart("usr_demo_001", "res_pho_hanoi", "cart-rich-fields-key")
    cart = await food.add_item(
        cart["id"],
        {
            "menu_item_id": "item_pho_bo",
            "quantity": 1,
            "selected_options": [{"group_id": "opt_size", "option_id": "regular"}],
        },
        "usr_demo_001",
        "add-rich",
    )
    cart_item = cart["items"][0]
    assert cart_item["description"] == repository.items["item_pho_bo"]["description"]
    assert cart_item["image_url"] == "https://cdn.example.test/pho-bo.jpg"
    assert cart_item["currency"] == "VND"
    assert cart_item["category"] == "Pho"
    assert cart_item["restaurant"] == {
        "id": "res_pho_hanoi",
        "name": repository.restaurants["res_pho_hanoi"]["name"],
        "address": repository.restaurants["res_pho_hanoi"]["address"],
        "category": repository.restaurants["res_pho_hanoi"]["category"],
        "district": repository.restaurants["res_pho_hanoi"]["district"],
        "latitude": repository.restaurants["res_pho_hanoi"]["latitude"],
        "longitude": repository.restaurants["res_pho_hanoi"]["longitude"],
        "is_open": True,
    }

    repository.items["item_pho_bo"].update(
        {
            "description": "Pho bo tai cap nhat.",
            "image_url": "https://cdn.example.test/pho-bo-v2.jpg",
            "price": 70000,
        }
    )
    updated = await food.update_item(cart["id"], cart_item["id"], {"quantity": 2}, "usr_demo_001", "update-rich")
    updated_item = updated["items"][0]
    assert updated_item["quantity"] == 2
    assert updated_item["selected_options"] == cart_item["selected_options"]
    assert updated_item["description"] == "Pho bo tai cap nhat."
    assert updated_item["image_url"] == "https://cdn.example.test/pho-bo-v2.jpg"
    assert updated["subtotal"] == 140000

    reloaded = await food.get_cart(cart["id"], "usr_demo_001")
    assert reloaded["items"][0]["description"] == "Pho bo tai cap nhat."
    assert reloaded["items"][0]["restaurant"]["address"] == repository.restaurants["res_pho_hanoi"]["address"]


@pytest.mark.asyncio
async def test_rich_cart_fields_do_not_bypass_actor_scoping_or_cart_idempotency() -> None:
    repository = InMemoryFoodRepository()
    food = FoodApplicationService(
        repository,
        Settings(
            app_env="test",
            persistence="memory",
            service_port=8104,
            database_url="postgresql://test",
            internal_service_token="token",
        ),
    )
    cart = await food.create_cart("usr_demo_001", "res_pho_hanoi", "cart-rich-actor-key")
    with pytest.raises(DomainError, match="user hiện tại"):
        await food.add_item(
            cart["id"],
            {
                "menu_item_id": "item_pho_bo",
                "quantity": 1,
                "selected_options": [{"group_id": "opt_size", "option_id": "regular"}],
            },
            "usr_two",
            "add-wrong-actor",
        )

    retry = await food.create_cart("usr_demo_001", "res_pho_hanoi", "cart-rich-actor-key")
    assert retry["id"] == cart["id"]
    with pytest.raises(DomainError, match="nhà hàng khác"):
        await food.create_cart("usr_demo_001", "res_bun_cha", "cart-rich-actor-key")


@pytest.mark.asyncio
async def test_required_option_and_preview() -> None:
    food = make_service()
    cart = await food.create_cart("usr_demo_001", "res_pho_hanoi", "cart-required-option-key")
    with pytest.raises(DomainError, match="Kích thước"):
        await food.add_item(
            cart["id"],
            {"menu_item_id": "item_pho_bo", "quantity": 1, "selected_options": []},
            "usr_demo_001",
            "add-missing-option",
        )
    await food.add_item(
        cart["id"],
        {
            "menu_item_id": "item_pho_bo",
            "quantity": 1,
            "selected_options": [{"group_id": "opt_size", "option_id": "regular"}],
        },
        "usr_demo_001",
        "add-valid-option",
    )
    preview = await food.preview_order(cart["id"], "addr_demo", "usr_demo_001")
    assert preview["snapshot_hash"]
    assert preview["total"]["amount"] > preview["subtotal"]


@pytest.mark.asyncio
async def test_core_saved_address_is_received_as_an_immutable_food_snapshot() -> None:
    food = make_service()
    cart = await food.create_cart("usr_demo_001", "res_pho_hanoi", "cart-core-address-key")
    await food.add_item(
        cart["id"],
        {
            "menu_item_id": "item_pho_bo",
            "quantity": 1,
            "selected_options": [{"group_id": "opt_size", "option_id": "regular"}],
        },
        "usr_demo_001",
        "add-core-address",
    )
    snapshot = {
        "user_id": "usr_demo_001",
        "address_text": "25 Le Dai Hanh, Hai Ba Trung, Ha Noi",
        "label": "Nha rieng",
        "district": "Hai Ba Trung",
        "latitude": 21.0125,
        "longitude": 105.848,
        "source": "geocoded",
    }
    preview = await food.preview_order(cart["id"], "core_addr_home", "usr_demo_001", snapshot)
    assert preview["address"]["id"] == "core_addr_home"
    assert preview["address"]["address"] == "25 Le Dai Hanh, Hai Ba Trung, Ha Noi"
    assert preview["address"]["latitude"] == 21.0125
    order = await food.create_order(
        {
            "cart_id": cart["id"],
            "address_id": "core_addr_home",
            "address_snapshot": snapshot,
            "user_id": "usr_demo_001",
            "idempotency_key": "order-core-address-key",
            "payment_method": "card",
            "expected_snapshot_hash": preview["snapshot_hash"],
            "expected_cart_version": preview["cart_version"],
            "expected_amount": preview["total"]["amount"],
            "expected_currency": preview["total"]["currency"],
            "expected_quote_version": preview["quote_version"],
        }
    )
    assert order["address"]["address"] == "25 Le Dai Hanh, Hai Ba Trung, Ha Noi"


@pytest.mark.asyncio
async def test_quote_hash_ignores_catalog_provenance_but_keeps_commercial_terms() -> None:
    repository = InMemoryFoodRepository()
    food = FoodApplicationService(
        repository,
        Settings(
            app_env="test",
            persistence="memory",
            service_port=8104,
            database_url="postgresql://test",
            internal_service_token="token",
        ),
    )
    cart = await food.create_cart("usr_demo_001", "res_pho_hanoi", "cart-provenance-key")
    await food.add_item(
        cart["id"],
        {
            "menu_item_id": "item_pho_bo",
            "quantity": 1,
            "selected_options": [{"group_id": "opt_size", "option_id": "regular"}],
        },
        "usr_demo_001",
        "add-provenance",
    )

    first = await food.preview_order(cart["id"], "addr_demo", "usr_demo_001")
    repository.restaurants["res_pho_hanoi"]["source_metadata"] = {"imported_at": "changed"}
    repository.items["item_pho_bo"]["source_metadata"] = {"source": "changed"}
    unchanged = await food.preview_order(cart["id"], "addr_demo", "usr_demo_001")
    repository.items["item_pho_bo"]["price"] += 1_000
    changed = await food.preview_order(cart["id"], "addr_demo", "usr_demo_001")

    assert unchanged["snapshot_hash"] == first["snapshot_hash"]
    assert changed["snapshot_hash"] != first["snapshot_hash"]


@pytest.mark.asyncio
async def test_order_and_voucher_are_atomic_and_idempotent() -> None:
    repository = InMemoryFoodRepository()
    food = FoodApplicationService(
        repository,
        Settings(
            app_env="test",
            persistence="memory",
            service_port=8104,
            database_url="postgresql://test",
            internal_service_token="token",
        ),
    )
    cart = await food.create_cart("usr_demo_001", "res_pho_hanoi", "cart-voucher-key")
    cart = await food.add_item(
        cart["id"],
        {
            "menu_item_id": "item_pho_bo",
            "quantity": 2,
            "selected_options": [{"group_id": "opt_size", "option_id": "large"}],
        },
        "usr_demo_001",
        "add-order",
    )
    cart = await food.apply_voucher(cart["id"], "XONE50", "usr_demo_001", "voucher-order")
    order = await food.create_order(
        {
            "cart_id": cart["id"],
            "address_id": "addr_demo",
            "user_id": "usr_demo_001",
            "idempotency_key": "order-key-001",
            "payment_method": "card",
        }
    )
    retry = await food.create_order(
        {
            "cart_id": cart["id"],
            "address_id": "addr_demo",
            "user_id": "usr_demo_001",
            "idempotency_key": "order-key-001",
            "payment_method": "card",
        }
    )
    assert retry["id"] == order["id"]
    assert repository.vouchers["XONE50"]["used_count"] == 1
    assert len(repository.order_events[order["id"]]) == 1


@pytest.mark.asyncio
async def test_concurrent_voucher_redemption_has_one_winner() -> None:
    repository = InMemoryFoodRepository()
    repository.vouchers["XONE50"]["usage_limit"] = 1
    repository.addresses["addr_two"] = {**repository.addresses["addr_demo"], "id": "addr_two", "user_id": "usr_two"}
    settings = Settings(
        app_env="test",
        persistence="memory",
        service_port=8104,
        database_url="postgresql://test",
        internal_service_token="token",
    )
    first = FoodApplicationService(repository, settings)
    second = FoodApplicationService(repository, settings)
    carts = []
    for user in ("usr_demo_001", "usr_two"):
        cart = await first.create_cart(user, "res_pho_hanoi", f"cart-concurrent-{user}")
        carts.append(
            await first.add_item(
                cart["id"],
                {
                    "menu_item_id": "item_pho_bo",
                    "quantity": 2,
                    "selected_options": [{"group_id": "opt_size", "option_id": "large"}],
                },
                user,
                f"add-concurrent-{user}",
            )
        )
        await first.apply_voucher(carts[-1]["id"], "XONE50", user, f"voucher-concurrent-{user}")

    async def place(service: FoodApplicationService, cart: dict, user: str, address: str, key: str) -> str:
        try:
            await service.create_order(
                {
                    "cart_id": cart["id"],
                    "address_id": address,
                    "user_id": user,
                    "idempotency_key": key,
                    "payment_method": "card",
                }
            )
            return "ok"
        except Exception as exc:
            return getattr(exc, "code", type(exc).__name__)

    result = await asyncio.gather(
        place(first, carts[0], "usr_demo_001", "addr_demo", "order-key-a"),
        place(second, carts[1], "usr_two", "addr_two", "order-key-b"),
    )
    assert result.count("ok") == 1
    assert repository.vouchers["XONE50"]["used_count"] == 1
    assert len(repository.orders) == 1


@pytest.mark.asyncio
async def test_preview_reprices_current_catalog_after_cart_creation() -> None:
    repository = InMemoryFoodRepository()
    food = FoodApplicationService(
        repository,
        Settings(
            app_env="test",
            persistence="memory",
            service_port=8104,
            database_url="postgresql://test",
            internal_service_token="token",
        ),
    )
    cart = await food.create_cart("usr_demo_001", "res_pho_hanoi", "cart-reprice-key")
    await food.add_item(
        cart["id"],
        {
            "menu_item_id": "item_pho_bo",
            "quantity": 1,
            "selected_options": [{"group_id": "opt_size", "option_id": "regular"}],
        },
        "usr_demo_001",
        "add-reprice",
    )
    repository.items["item_pho_bo"]["price"] = 70000
    preview = await food.preview_order(cart["id"], "addr_demo", "usr_demo_001")
    assert preview["subtotal"] == 70000


@pytest.mark.asyncio
async def test_addresses_are_actor_scoped_and_cart_creation_is_idempotent_under_concurrency() -> None:
    repository = InMemoryFoodRepository()
    food = FoodApplicationService(
        repository,
        Settings(
            app_env="test",
            persistence="memory",
            service_port=8104,
            database_url="postgresql://test",
            internal_service_token="token",
        ),
    )
    results = await asyncio.gather(
        *[food.create_cart("usr_demo_001", "res_pho_hanoi", "same-cart-key") for _ in range(20)]
    )
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
async def test_search_keeps_accented_dish_terms_distinct() -> None:
    food = make_service()
    results = await food.search(keyword="phở bò")
    assert [result["item"]["name"] for result in results] == ["Phở bò tái"]


@pytest.mark.asyncio
async def test_menu_pagination_keeps_authoritative_total_beyond_default_page() -> None:
    repository = InMemoryFoodRepository()
    repository.items = {
        item_id: item
        for item_id, item in repository.items.items()
        if item["restaurant_id"] != "res_pho_hanoi"
    }
    for index in range(136):
        item_id = f"item_pho_regression_{index:03d}"
        repository.items[item_id] = {
            "id": item_id,
            "restaurant_id": "res_pho_hanoi",
            "name": f"Phở bò món {index + 1}",
            "description": "Món regression có thể đặt.",
            "category": "Phở",
            "price": 65_000,
            "currency": "VND",
            "available": True,
            "option_groups": [],
        }

    food = make_service(repository)
    first_page = await food.menu("res_pho_hanoi", limit=100, offset=0)
    second_page = await food.menu("res_pho_hanoi", limit=100, offset=100)

    assert first_page["total"] == 136
    assert first_page["limit"] == 100
    assert first_page["offset"] == 0
    assert len(first_page["items"]) == 100
    assert first_page["items"][0]["id"] == "item_pho_regression_000"
    assert first_page["items"][-1]["id"] == "item_pho_regression_099"
    assert second_page["total"] == 136
    assert second_page["limit"] == 100
    assert second_page["offset"] == 100
    assert len(second_page["items"]) == 36
    assert second_page["items"][0]["id"] == "item_pho_regression_100"
    assert second_page["items"][-1]["id"] == "item_pho_regression_135"
