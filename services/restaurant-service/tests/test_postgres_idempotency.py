from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import inspect
from src.infrastructure.database import build_engine
from src.repositories.restaurant_repository import RestaurantRepository

DATABASE_URL = os.environ.get("RESTAURANT_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not DATABASE_URL,
    reason="RESTAURANT_TEST_DATABASE_URL is not configured for PostgreSQL verification",
)


def test_postgres_idempotency_claim_is_atomic_and_lifecycle_records_survive() -> None:
    assert DATABASE_URL is not None
    engine = build_engine(DATABASE_URL)
    if not inspect(engine).has_table("restaurant_idempotency_records"):
        pytest.fail("Restaurant migration 0002 is required before the PostgreSQL idempotency test")

    repository = RestaurantRepository(DATABASE_URL)
    actor_id = f"pg-test-{uuid4().hex}"
    key = f"pg-create-{uuid4().hex}"
    start_at = datetime(2040, 1, 15, 18, tzinfo=UTC)
    end_at = start_at + timedelta(minutes=180)
    payload = {
        "restaurant_id": "rest-001",
        "party_size": 2,
        "start_at": start_at.isoformat(),
        "end_at": end_at.isoformat(),
        "special_requests": "postgres concurrency",
        "hold_id": None,
    }
    request_hash = repository.request_hash(payload)

    def create_once() -> dict:
        return repository.create_reservation(
            actor_id,
            "rest-001",
            2,
            start_at,
            end_at,
            "postgres concurrency",
            key,
            request_hash,
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _index: create_once(), range(2)))
    assert len({result["id"] for result in results}) == 1

    reservation_id = results[0]["id"]
    update_key = f"pg-update-{uuid4().hex}"
    update_payload = {"reservation_id": reservation_id, "fields": ["party_size"], "party_size": 3}
    updated = repository.update_reservation(
        actor_id,
        reservation_id,
        3,
        None,
        "postgres concurrency",
        {"party_size"},
        update_key,
        repository.request_hash(update_payload),
    )
    cancel_key = f"pg-cancel-{uuid4().hex}"
    cancelled = repository.cancel_reservation(
        actor_id,
        reservation_id,
        cancel_key,
        repository.request_hash({"reservation_id": reservation_id, "action": "cancel"}),
    )
    replayed_create = repository.create_reservation(
        actor_id,
        "rest-001",
        2,
        start_at,
        end_at,
        "postgres concurrency",
        key,
        request_hash,
    )
    assert updated["id"] == cancelled["id"] == replayed_create["id"] == reservation_id
