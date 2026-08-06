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
from src.domain.policies import FoodOrderStatus
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
    await pool.execute((root / "seeds" / "001_demo_hanoi.sql").read_text(encoding="utf-8"))
    settings = Settings(service_port=8104, database_url=DATABASE_URL, internal_service_token="test-token", workflow_step_delay_ms=0)
    service = FoodApplicationService(repository, settings, random_value=lambda: 1.0)
    try:
        yield repository, service
    finally:
        await repository.close()


async def _cart(service: FoodApplicationService, user_id: str, address_id: str = "addr_demo") -> dict:
    cart = await service.create_cart(user_id, "res_pho_hanoi")
    return await service.add_item(cart["id"], {"menu_item_id": "item_pho_bo", "quantity": 2, "selected_options": [{"group_id": "opt_size", "option_id": "large"}]})


@pytest.mark.asyncio
async def test_postgres_order_voucher_retry_and_rollback(postgres_food: tuple[PostgresFoodRepository, FoodApplicationService]) -> None:
    repository, service = postgres_food
    pool = repository._require_pool()
    run_id = uuid4().hex[:12]
    user_id = f"usr_pg_test_{run_id}"
    address_id = f"addr_pg_test_{run_id}"
    order_key = f"pg-order-key-{run_id}"
    await pool.execute("INSERT INTO food_catalog (id,record_type,data) VALUES ($1,'address',$2::jsonb) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data", address_id, json.dumps({"id": address_id, "user_id": user_id, "latitude": 21.0125, "longitude": 105.848}))
    cart = await _cart(service, user_id, address_id)
    order = await service.create_order({"cart_id": cart["id"], "address_id": address_id, "user_id": user_id, "idempotency_key": order_key, "payment_method": "card"})
    retry = await service.create_order({"cart_id": cart["id"], "address_id": address_id, "user_id": user_id, "idempotency_key": order_key, "payment_method": "card"})
    assert retry["id"] == order["id"]
    count = await pool.fetchval("SELECT count(*) FROM food_order_status_events WHERE order_id=$1", order["id"])
    assert count == 1

    await pool.execute("UPDATE food_catalog SET data=jsonb_set(data,'{used_count}','0'::jsonb) WHERE id='XONE50'")
    invalid = deepcopy(order)
    invalid["id"] = "ord_pg_rollback"
    invalid["idempotency_key"] = f"pg-rollback-key-{run_id}"
    invalid["voucher"] = {"code": "XONE50"}
    invalid["timeline"] = [{"from_status": None, "to_status": order["status"], "occurred_at": "not-a-date", "reason": "broken", "actor_type": "test"}]
    with pytest.raises(ValueError):
        await repository.create_order_with_optional_voucher(invalid, invalid["voucher"])
    assert await pool.fetchval("SELECT count(*) FROM food_orders WHERE id='ord_pg_rollback'") == 0
    assert await pool.fetchval("SELECT (data->>'used_count')::int FROM food_catalog WHERE id='XONE50'") == 0
    assert await pool.fetchval("SELECT count(*) FROM food_voucher_redemptions WHERE order_id='ord_pg_rollback'") == 0


@pytest.mark.asyncio
async def test_postgres_due_claim_is_single_winner(postgres_food: tuple[PostgresFoodRepository, FoodApplicationService]) -> None:
    repository, service = postgres_food
    pool = repository._require_pool()
    run_id = uuid4().hex[:12]
    user_id = f"usr_pg_worker_{run_id}"
    address_id = f"addr_pg_worker_{run_id}"
    await pool.execute("INSERT INTO food_catalog (id,record_type,data) VALUES ($1,'address',$2::jsonb) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data", address_id, json.dumps({"id": address_id, "user_id": user_id, "latitude": 21.0125, "longitude": 105.848}))
    cart = await _cart(service, user_id, address_id)
    order = await service.create_order({"cart_id": cart["id"], "address_id": address_id, "user_id": user_id, "idempotency_key": f"pg-worker-key-{run_id}", "payment_method": "card"})
    await service.transition_order(order["id"], FoodOrderStatus.PAID.value, "test")
    confirming = await service.transition_order(order["id"], FoodOrderStatus.RESTAURANT_CONFIRMING.value, "test")
    assert confirming["next_transition_at"]
    first, second = await asyncio.gather(service.reconcile_due_orders(), service.reconcile_due_orders())
    assert first + second == 1
    events = await repository.get_order_events(order["id"])
    assert len([event for event in events if event["to_status"] in {FoodOrderStatus.RESTAURANT_ACCEPTED.value, FoodOrderStatus.RESTAURANT_REJECTED.value}]) == 1
