from __future__ import annotations

import os
from datetime import datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx
import pytest

GATEWAY_URL = os.getenv("E2E_GATEWAY_URL")
DEMO_EMAIL = os.getenv("E2E_DEMO_EMAIL", "demo@example.invalid")
DEMO_PASSWORD = os.getenv("E2E_DEMO_PASSWORD", "replace-with-local-demo-password")
pytestmark = pytest.mark.skipif(not GATEWAY_URL, reason="E2E_GATEWAY_URL is not configured")


def unique_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12]}"


def unique_restaurant_date() -> str:
    days = 30 + int(uuid4().hex[:4], 16) % 365
    booking_at = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")) + timedelta(days=days)
    return booking_at.strftime("%d/%m/%Y")


def login(client: httpx.Client) -> str:
    response = client.post("/api/v1/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    response.raise_for_status()
    return str(response.json()["data"]["access_token"])


def assistant_chat(client: httpx.Client, token: str, message: str, conversation_id: str | None = None) -> dict:
    response = client.post(
        "/api/v1/assistant/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": message, **({"conversation_id": conversation_id} if conversation_id else {})},
    )
    response.raise_for_status()
    data = response.json()["data"]
    assert set(data) == {"conversation_id", "message", "items", "actions", "completed"}
    assert "workflow_id" not in data
    assert "tool_request" not in data
    assert "state_patch" not in data
    return data


def test_unified_assistant_routes_ride_food_healthcare_and_unsupported_requests() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=45) as client:
        token = login(client)

        ride = assistant_chat(client, token, "Dat xe tu Noi Bai den Hoan Kiem")
        assert ride["items"]
        assert any(item.get("kind") == "ride_quote" for item in ride["items"])
        assert any(action["kind"] == "ride_service" for action in ride["actions"])

        food = assistant_chat(client, token, "Tim pho giao ve nha")
        assert food["items"]
        assert any(item.get("kind") in {"food_options", "food_confirmation", "food_empty"} for item in food["items"])

        healthcare = assistant_chat(client, token, "Dat lich kham than kinh")
        assert healthcare["items"]
        assert any(item.get("kind") == "healthcare_options" for item in healthcare["items"])

        unsupported = assistant_chat(client, token, "Dat ve may bay di Da Nang")
        assert not unsupported["items"]
        assert not unsupported["actions"]
        assert "hỗ trợ" in unsupported["message"].casefold()


def test_unified_assistant_keeps_restaurant_and_ride_in_one_conversation() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=45) as client:
        token = login(client)
        conversation_id = unique_id("assistant-restaurant-ride")
        booking_date = unique_restaurant_date()
        first = assistant_chat(
            client,
            token,
            f"Dat ban cho 2 nguoi ngay {booking_date} luc 19h o Ha Noi roi goi xe tu VinUni toi nha hang do",
            conversation_id,
        )
        assert any(item.get("kind") == "restaurant_options" for item in first["items"])
        assert not any(item.get("kind") == "ride_quote" for item in first["items"])
        selection = next(action for action in first["actions"] if action["kind"] == "select_restaurant")

        selected = client.post(
            "/api/v1/assistant/actions",
            headers={"Authorization": f"Bearer {token}", "Idempotency-Key": unique_id("assistant-select")},
            json={"conversation_id": conversation_id, "action_id": selection["id"]},
        )
        selected.raise_for_status()
        data = selected.json()["data"]
        assert any(item.get("kind") == "restaurant_confirmation" for item in data["items"])
        assert any(item.get("kind") == "ride_quote" for item in data["items"])
        assert any(action["kind"] == "restaurant_confirm" for action in data["actions"])
        assert any(action["kind"] == "ride_service" for action in data["actions"])


def test_unified_assistant_preserves_restaurant_confirmation_when_food_is_added() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=45) as client:
        token = login(client)
        conversation_id = unique_id("assistant-preserve-confirmation")
        booking_date = unique_restaurant_date()
        first = assistant_chat(client, token, f"Dat ban cho 2 nguoi ngay {booking_date} luc 19h o Ha Noi", conversation_id)
        selection = next(action for action in first["actions"] if action["kind"] == "select_restaurant")

        selected = client.post(
            "/api/v1/assistant/actions",
            headers={"Authorization": f"Bearer {token}", "Idempotency-Key": unique_id("assistant-select")},
            json={"conversation_id": conversation_id, "action_id": selection["id"]},
        )
        selected.raise_for_status()
        selected_data = selected.json()["data"]
        confirm = next(action for action in selected_data["actions"] if action["kind"] == "restaurant_confirm")

        follow_up = assistant_chat(client, token, "Tim pho giao ve nha", conversation_id)
        assert any(item.get("kind") == "restaurant_confirmation" for item in follow_up["items"])
        assert any(action["id"] == confirm["id"] and action["kind"] == "restaurant_confirm" for action in follow_up["actions"])
        assert any(item.get("kind") in {"food_options", "food_confirmation", "food_empty"} for item in follow_up["items"])


def test_unified_assistant_rejects_stale_restaurant_action_after_details_change() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=45) as client:
        token = login(client)
        conversation_id = unique_id("assistant-stale-action")
        booking_date = unique_restaurant_date()
        first = assistant_chat(client, token, f"Dat ban cho 2 nguoi ngay {booking_date} luc 19h o Ha Noi", conversation_id)
        stale_action = next(action for action in first["actions"] if action["kind"] == "select_restaurant")

        updated = assistant_chat(client, token, "3 nguoi", conversation_id)
        assert any(action["kind"] == "select_restaurant" for action in updated["actions"])

        replay = client.post(
            "/api/v1/assistant/actions",
            headers={"Authorization": f"Bearer {token}", "Idempotency-Key": unique_id("assistant-stale")},
            json={"conversation_id": conversation_id, "action_id": stale_action["id"]},
        )
        assert replay.status_code == 409
        assert replay.json()["code"] == "ACTION_NOT_AVAILABLE"


def test_unified_assistant_preserves_bike_vehicle_type() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=45) as client:
        token = login(client)
        data = assistant_chat(client, token, "Dat xe may tu VinUni den Hoan Kiem")
        ride = next(item for item in data["items"] if item.get("kind") == "ride_quote")
        assert ride["vehicle"] == "Xe máy"
