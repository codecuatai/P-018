import asyncio

import pytest
from fastapi.testclient import TestClient
from src.application.food_service import FoodApplicationService
from src.config import Settings, get_settings
from src.domain.policies import DomainError
from src.main import app
from src.repositories.food import InMemoryFoodRepository


def make_service() -> tuple[InMemoryFoodRepository, FoodApplicationService]:
    repository = InMemoryFoodRepository()
    settings = Settings(
        app_env="test",
        persistence="memory",
        service_port=8104,
        database_url="postgresql://test",
        internal_service_token="token",
    )
    return repository, FoodApplicationService(repository, settings)


def item_payload(quantity: int = 1) -> dict:
    return {
        "menu_item_id": "item_pho_bo",
        "quantity": quantity,
        "selected_options": [
            {"group_id": "opt_size", "option_id": "regular"}
        ],
    }


@pytest.mark.asyncio
async def test_exact_replay_is_one_logical_cart_mutation() -> None:
    repository, food = make_service()
    cart = await food.create_cart(
        "usr_demo_001", "res_pho_hanoi", "cart-write-replay"
    )

    first, replay = await asyncio.gather(
        food.add_item(
            cart["id"], item_payload(), "usr_demo_001", "add-replay"
        ),
        food.add_item(
            cart["id"], item_payload(), "usr_demo_001", "add-replay"
        ),
    )

    assert replay == first
    assert first["version"] == 1
    assert len(first["items"]) == 1
    assert len(repository.cart_write_operations) == 1


@pytest.mark.asyncio
async def test_changed_payload_with_same_key_is_rejected() -> None:
    _, food = make_service()
    cart = await food.create_cart(
        "usr_demo_001", "res_pho_hanoi", "cart-write-conflict"
    )
    await food.add_item(
        cart["id"], item_payload(), "usr_demo_001", "add-conflict"
    )

    with pytest.raises(DomainError) as error:
        await food.add_item(
            cart["id"],
            item_payload(quantity=2),
            "usr_demo_001",
            "add-conflict",
        )

    assert error.value.code == "IDEMPOTENCY_KEY_REUSED"


@pytest.mark.asyncio
async def test_remove_replay_succeeds_after_item_is_gone() -> None:
    _, food = make_service()
    cart = await food.create_cart(
        "usr_demo_001", "res_pho_hanoi", "cart-remove-replay"
    )
    cart = await food.add_item(
        cart["id"], item_payload(), "usr_demo_001", "add-before-remove"
    )
    item_id = cart["items"][0]["id"]

    removed = await food.remove_item(
        cart["id"], item_id, "usr_demo_001", "remove-replay"
    )
    replay = await food.remove_item(
        cart["id"], item_id, "usr_demo_001", "remove-replay"
    )

    assert replay == removed
    assert replay["items"] == []


@pytest.mark.asyncio
async def test_cart_write_key_is_actor_scoped() -> None:
    _, food = make_service()
    cart = await food.create_cart(
        "usr_demo_001", "res_pho_hanoi", "cart-actor-scope"
    )
    await food.add_item(
        cart["id"], item_payload(), "usr_demo_001", "shared-key"
    )

    with pytest.raises(DomainError) as error:
        await food.add_item(
            cart["id"], item_payload(), "usr_two", "shared-key"
        )

    assert error.value.code == "FORBIDDEN"


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("post", "/api/v1/carts", {"user_id": "usr_demo_001", "restaurant_id": "res_pho_hanoi"}),
        ("post", "/api/v1/carts/cart_test/items", {"menu_item_id": "item_pho_bo", "quantity": 1, "selected_options": []}),
        ("patch", "/api/v1/carts/cart_test/items/item_test", {"quantity": 1}),
        ("delete", "/api/v1/carts/cart_test/items/item_test", None),
        ("post", "/api/v1/carts/cart_test/voucher", {"code": "XONE50"}),
        ("delete", "/api/v1/carts/cart_test/voucher", None),
    ],
)
def test_cart_writes_require_idempotency_key(
    method: str,
    path: str,
    payload: dict | None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("SERVICE_PORT", "8104")
    monkeypatch.setenv("DATABASE_URL", "postgresql://test")
    monkeypatch.setenv("INTERNAL_SERVICE_TOKEN", "test-token")
    monkeypatch.setenv("PERSISTENCE", "memory")
    get_settings.cache_clear()
    headers = {
        "X-Internal-Service-Token": "test-token",
        "X-Actor-Id": "usr_demo_001",
    }
    try:
        with TestClient(app) as client:
            response = client.request(
                method, path, json=payload, headers=headers
            )
    finally:
        get_settings.cache_clear()

    assert response.status_code == 422
