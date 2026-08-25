"""Real PostgreSQL checks for the Food transaction boundary.

Run explicitly with FOOD_TEST_DATABASE_URL pointing at an empty disposable test
database. The suite is intentionally not silently redirected to the developer
database or the in-memory adapter.
"""

from __future__ import annotations

import asyncio
import json
import os
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

import pytest
import pytest_asyncio
from src.application.food_service import FoodApplicationService
from src.config import Settings
from src.domain.policies import DomainError, FoodOrderStatus
from src.repositories.food import PostgresFoodRepository

DATABASE_URL = os.environ.get("FOOD_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="FOOD_TEST_DATABASE_URL is not configured")


@pytest_asyncio.fixture
async def postgres_food() -> tuple[PostgresFoodRepository, FoodApplicationService]:
    assert DATABASE_URL
    repository = PostgresFoodRepository(DATABASE_URL)
    await repository.connect()
    root = Path(__file__).resolve().parents[1]
    pool = repository._require_pool()
    for migration in sorted((root / "migrations").glob("*.sql")):
        await pool.execute(migration.read_text(encoding="utf-8"))
    settings = Settings(
        app_env="test",
        persistence="postgres",
        service_port=8104,
        database_url=DATABASE_URL,
        internal_service_token="test-token",
        workflow_step_delay_ms=0,
    )
    service = FoodApplicationService(repository, settings, random_value=lambda: 1.0)
    try:
        yield repository, service
    finally:
        await repository.close()


async def _catalog_ids(repository: PostgresFoodRepository) -> tuple[str, str, str, str]:
    pool = repository._require_pool()
    item = await pool.fetchrow(
        "SELECT id, data->>'restaurant_id' AS restaurant_id FROM food_catalog "
        "WHERE record_type='menu_item' AND is_active=TRUE ORDER BY id LIMIT 1"
    )
    alternative = await pool.fetchval(
        "SELECT id FROM food_catalog WHERE record_type='restaurant' AND is_active=TRUE AND id <> $1 ORDER BY id LIMIT 1",
        item["restaurant_id"] if item else "",
    )
    voucher = await pool.fetchval(
        "SELECT data->>'code' FROM food_catalog WHERE record_type='voucher' AND is_active=TRUE ORDER BY id LIMIT 1"
    )
    if not item or not alternative or not voucher:
        pytest.skip("PostgreSQL Food catalog must contain menu, restaurant, and voucher records")
    return str(item["restaurant_id"]), str(item["id"]), str(alternative), str(voucher)


async def _cart(
    repository: PostgresFoodRepository,
    service: FoodApplicationService,
    user_id: str,
    address_id: str | None = None,
) -> dict:
    restaurant_id, menu_item_id, _, _ = await _catalog_ids(repository)
    item_data = await repository._require_pool().fetchval(
        "SELECT data FROM food_catalog WHERE id=$1 AND record_type='menu_item'",
        menu_item_id,
    )
    selected_options = []
    for group in (item_data or {}).get("option_groups", []):
        options = group.get("options", []) if isinstance(group, dict) else []
        if group.get("required") and options:
            selected_options.append({"group_id": group["id"], "option_id": options[0]["id"]})
    cart = await service.create_cart(user_id, restaurant_id, f"cart-{user_id}-{uuid4().hex}")
    return await service.add_item(
        cart["id"],
        {
            "menu_item_id": menu_item_id,
            "quantity": 2,
            "selected_options": selected_options,
        },
        user_id,
        f"add-{user_id}-{uuid4().hex}",
    )


@pytest.mark.asyncio
async def test_postgres_order_voucher_retry_and_rollback(
    postgres_food: tuple[PostgresFoodRepository, FoodApplicationService],
) -> None:
    repository, service = postgres_food
    pool = repository._require_pool()
    run_id = uuid4().hex[:12]
    user_id = f"usr_pg_test_{run_id}"
    address_id = f"addr_pg_test_{run_id}"
    order_key = f"pg-order-key-{run_id}"
    await pool.execute(
        "INSERT INTO food_catalog (id,record_type,data) VALUES ($1,'address',$2::jsonb) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data",
        address_id,
        json.dumps({"id": address_id, "user_id": user_id, "latitude": 21.0125, "longitude": 105.848}),
    )
    cart = await _cart(repository, service, user_id, address_id)
    order = await service.create_order(
        {
            "cart_id": cart["id"],
            "address_id": address_id,
            "user_id": user_id,
            "idempotency_key": order_key,
            "payment_method": "card",
        }
    )
    retry = await service.create_order(
        {
            "cart_id": cart["id"],
            "address_id": address_id,
            "user_id": user_id,
            "idempotency_key": order_key,
            "payment_method": "card",
        }
    )
    assert retry["id"] == order["id"]
    count = await pool.fetchval("SELECT count(*) FROM food_order_status_events WHERE order_id=$1", order["id"])
    assert count == 1

    voucher = (await _catalog_ids(repository))[3]
    await pool.execute("UPDATE food_catalog SET data=jsonb_set(data,'{used_count}','0'::jsonb) WHERE data->>'code'=$1", voucher)
    invalid = deepcopy(order)
    invalid["id"] = "ord_pg_rollback"
    invalid["idempotency_key"] = f"pg-rollback-key-{run_id}"
    invalid["voucher"] = {"code": voucher}
    invalid["timeline"] = [
        {
            "from_status": None,
            "to_status": order["status"],
            "occurred_at": "not-a-date",
            "reason": "broken",
            "actor_type": "test",
        }
    ]
    with pytest.raises(ValueError):
        await repository.create_order_with_optional_voucher(invalid, invalid["voucher"])
    assert await pool.fetchval("SELECT count(*) FROM food_orders WHERE id='ord_pg_rollback'") == 0
    assert await pool.fetchval("SELECT (data->>'used_count')::int FROM food_catalog WHERE data->>'code'=$1", voucher) == 0
    assert await pool.fetchval("SELECT count(*) FROM food_voucher_redemptions WHERE order_id='ord_pg_rollback'") == 0


@pytest.mark.asyncio
async def test_postgres_due_claim_is_single_winner(
    postgres_food: tuple[PostgresFoodRepository, FoodApplicationService],
) -> None:
    repository, service = postgres_food
    pool = repository._require_pool()
    run_id = uuid4().hex[:12]
    user_id = f"usr_pg_worker_{run_id}"
    address_id = f"addr_pg_worker_{run_id}"
    await pool.execute(
        "INSERT INTO food_catalog (id,record_type,data) VALUES ($1,'address',$2::jsonb) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data",
        address_id,
        json.dumps({"id": address_id, "user_id": user_id, "latitude": 21.0125, "longitude": 105.848}),
    )
    cart = await _cart(repository, service, user_id, address_id)
    order = await service.create_order(
        {
            "cart_id": cart["id"],
            "address_id": address_id,
            "user_id": user_id,
            "idempotency_key": f"pg-worker-key-{run_id}",
            "payment_method": "card",
        }
    )
    await service.transition_order(order["id"], FoodOrderStatus.PAID.value, "test")
    confirming = await service.transition_order(order["id"], FoodOrderStatus.RESTAURANT_CONFIRMING.value, "test")
    assert confirming["next_transition_at"]
    service.settings.workflow_step_delay_ms = 1000
    first, second = await asyncio.gather(service.reconcile_due_orders(), service.reconcile_due_orders())
    assert first + second == 1
    events = await repository.get_order_events(order["id"])
    assert (
        len(
            [
                event
                for event in events
                if event["to_status"]
                in {FoodOrderStatus.RESTAURANT_ACCEPTED.value, FoodOrderStatus.RESTAURANT_REJECTED.value}
            ]
        )
        == 1
    )


@pytest.mark.asyncio
async def test_postgres_create_cart_concurrent_idempotency(
    postgres_food: tuple[PostgresFoodRepository, FoodApplicationService],
) -> None:
    repository, service = postgres_food
    pool = repository._require_pool()
    user_id = f"usr_pg_cart_{uuid4().hex[:12]}"
    key = f"pg-cart-concurrent-{uuid4().hex[:12]}"
    restaurant_id, _, alternative_restaurant_id, _ = await _catalog_ids(repository)
    results = await asyncio.gather(*[service.create_cart(user_id, restaurant_id, key) for _ in range(20)])
    assert len({cart["id"] for cart in results}) == 1
    assert (
        await pool.fetchval("SELECT count(*) FROM food_carts WHERE user_id=$1 AND idempotency_key=$2", user_id, key)
        == 1
    )
    with pytest.raises(DomainError) as error:
        await service.create_cart(user_id, alternative_restaurant_id, key)
    assert error.value.code == "IDEMPOTENCY_KEY_REUSED"
