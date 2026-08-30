from __future__ import annotations

import os
import subprocess
import time
from datetime import datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx
import pytest
from _helpers import REPO_ROOT, compose_args, get_cached_token

GATEWAY_URL = os.getenv("E2E_GATEWAY_URL")
DEMO_EMAIL = os.getenv("E2E_DEMO_EMAIL", "demo@example.invalid")
DEMO_PASSWORD = os.getenv("E2E_DEMO_PASSWORD", "replace-with-local-demo-password")
pytestmark = pytest.mark.skipif(not GATEWAY_URL, reason="E2E_GATEWAY_URL is not configured")


def unique_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12]}"


def restart_gateway() -> None:
    result = subprocess.run(
        compose_args("restart", "api-gateway"),
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr
    deadline = time.monotonic() + 45
    with httpx.Client(base_url=GATEWAY_URL, timeout=5) as client:
        while time.monotonic() < deadline:
            try:
                if client.get("/health/ready").status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            time.sleep(1)
    raise AssertionError("Gateway did not become ready after restart.")


def unique_restaurant_date() -> str:
    days = 30 + int(uuid4().hex[:4], 16) % 365
    booking_at = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")) + timedelta(days=days)
    return booking_at.strftime("%d/%m/%Y")


def login(client: httpx.Client, email: str = DEMO_EMAIL, password: str = DEMO_PASSWORD) -> str:
    return get_cached_token(client, email, password)


def assistant_chat(client: httpx.Client, token: str, message: str, conversation_id: str | None = None) -> dict:
    response = client.post(
        "/api/v1/assistant/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": message, **({"conversation_id": conversation_id} if conversation_id else {})},
    )
    response.raise_for_status()
    data = response.json()["data"]
    assert set(data) == {"conversation_id", "message", "items", "actions", "completed", "workflow_status"}

    assert "workflow_id" not in data
    assert "tool_request" not in data
    assert "state_patch" not in data
    return data


def assistant_action(client: httpx.Client, token: str, conversation_id: str, action: dict, key: str) -> dict:
    response = client.post(
        "/api/v1/assistant/actions",
        headers={"Authorization": f"Bearer {token}", "Idempotency-Key": key},
        json={"conversation_id": conversation_id, "action_id": action["id"]},
    )
    response.raise_for_status()
    data = response.json()["data"]
    assert set(data) == {"conversation_id", "message", "items", "actions", "completed", "workflow_status"}

    assert "workflow_id" not in data
    assert "tool_request" not in data
    return data


def find_action(data: dict, kind: str) -> dict:
    return next(action for action in data["actions"] if action["kind"] == kind)


def test_unified_assistant_routes_ride_food_healthcare_and_unsupported_requests() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=45) as client:
        token = login(client)

        ride = assistant_chat(client, token, "Dat xe tu Noi Bai den Hoan Kiem bang xe 4 cho")
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
                f"Dat ban cho 2 nguoi ngay {booking_date} luc 19h o Ha Noi roi goi xe may tu VinUni toi nha hang do",
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
        assert any(action["kind"] == "restaurant_confirm" for action in data["actions"])
        assert not any(action["kind"] == "ride_service" for action in data["actions"])
        confirmed = assistant_action(client, token, conversation_id, find_action(data, "restaurant_confirm"), unique_id("assistant-restaurant-confirm"))
        assert any(item.get("kind") == "reservation" for item in confirmed["completed"])
        assert any(item.get("kind") == "ride_quote" for item in confirmed["items"])
        assert any(action["kind"] == "ride_service" for action in confirmed["actions"])


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


def test_unified_a_action_replay_is_exact_and_a_new_key_cannot_resurrect() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=45) as client:
        token = login(client)
        conversation_id = unique_id("assistant-replay")
        first = assistant_chat(client, token, "Dat xe tu VinUni den Hoan Kiem bang xe 4 cho", conversation_id)
        action = find_action(first, "ride_service")
        key = unique_id("assistant-replay-key")
        executed = assistant_action(client, token, conversation_id, action, key)
        replay = assistant_action(client, token, conversation_id, action, key)
        assert replay == executed
        different_key = client.post(
            "/api/v1/assistant/actions",
            headers={"Authorization": f"Bearer {token}", "Idempotency-Key": unique_id("assistant-replay-other")},
            json={"conversation_id": conversation_id, "action_id": action["id"]},
        )
        assert different_key.status_code == 409
        assert different_key.json()["code"] == "ACTION_NOT_AVAILABLE"


def test_unified_b_food_completion_exposes_only_authoritative_payment() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=45) as client:
        token = login(client)
        conversation_id = unique_id("assistant-food-payment")

        def food_chat(message: str) -> dict:
            return assistant_chat(client, token, message, conversation_id)

        turns = [
            food_chat("Tìm phở bò dưới 100 nghìn ở Hà Nội."),
            food_chat("Chọn quán đầu tiên."),
            food_chat("Cho tôi hai bát phở bò cỡ lớn, không cay."),
            food_chat("Giao về 181 Nguyễn Trãi, Thanh Xuân, Hà Nội."),
            food_chat("Xem tổng tiền."),
        ]
        assert all(turn["conversation_id"] == conversation_id for turn in turns)
        errors = [item.get("error_code") for turn in turns for item in turn["items"] if item.get("kind") == "task_error"]
        assert not errors, errors
        assert any(item.get("kind") == "food_options" for item in turns[0]["items"])
        assert any(item.get("preview") for item in turns[-1]["items"])

        confirmation = food_chat("Đặt luôn.")
        confirm_action = find_action(confirmation, "food_confirm")
        assert any(item.get("kind") == "food_confirmation" for item in confirmation["items"])
        result = assistant_action(client, token, conversation_id, confirm_action, unique_id("assistant-food-confirm"))
        order_item = next(item for item in result["completed"] if item.get("kind") == "food_order")
        assert order_item.get("order", {}).get("id")
        assert order_item.get("payment", {}).get("status") == "SUCCEEDED"
        assert "provider_reference" not in order_item.get("payment", {})
        assert "confirmation_id" not in order_item
        assert "workflow_id" not in order_item


def test_unified_c_healthcare_full_confirmation_flow() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=45) as client:
        token = login(client)
        conversation_id = unique_id("assistant-healthcare-full")
        first = assistant_chat(client, token, "Dat lich kham than kinh sang mai", conversation_id)
        selected = assistant_action(client, token, conversation_id, find_action(first, "select_healthcare_slot"), unique_id("assistant-health-select"))
        details_confirmed = assistant_action(client, token, conversation_id, find_action(selected, "healthcare_confirm"), unique_id("assistant-health-details"))
        confirmed = assistant_action(client, token, conversation_id, find_action(details_confirmed, "healthcare_payment"), unique_id("assistant-health-payment"))
        appointment = next(item for item in confirmed["completed"] if item.get("kind") == "appointment_confirmed")
        assert appointment.get("status") == "CONFIRMED"
        assert appointment.get("facility", {}).get("address")


def test_unified_d_healthcare_then_ride_uses_authoritative_facility_and_timing() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=45) as client:
        token = login(client)
        conversation_id = unique_id("assistant-healthcare-ride")
        first = assistant_chat(client, token, "Dat lich kham than kinh sang mai roi dat xe 4 cho tu VinUni dua toi toi do", conversation_id)
        selected = assistant_action(client, token, conversation_id, find_action(first, "select_healthcare_slot"), unique_id("assistant-healthcare-ride-select"))
        ride = next(item for item in selected["items"] if item.get("kind") == "ride_quote")
        assert ride["dropoff"]
        assert ride["recommended_departure"]
        assert ride["scheduled_pickup"] is False
        assert any(action["kind"] == "healthcare_confirm" for action in selected["actions"])
        assert not any(action["kind"] == "ride_service" for action in selected["actions"])
        details_confirmed = assistant_action(client, token, conversation_id, find_action(selected, "healthcare_confirm"), unique_id("assistant-healthcare-ride-details"))
        assert any(action["kind"] == "healthcare_payment" for action in details_confirmed["actions"])
        assert not any(action["kind"] == "ride_service" for action in details_confirmed["actions"])
        paid = assistant_action(client, token, conversation_id, find_action(details_confirmed, "healthcare_payment"), unique_id("assistant-healthcare-ride-payment"))
        assert any(action["kind"] == "ride_service" for action in paid["actions"])


def test_unified_e_food_and_healthcare_stay_in_one_conversation() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=45) as client:
        token = login(client)
        conversation_id = unique_id("assistant-food-healthcare")
        combined = assistant_chat(client, token, "Tìm phở giao về nhà và đặt lịch khám thần kinh sáng mai", conversation_id)
        healthcare_action = find_action(combined, "select_healthcare_slot")
        healthcare_actions = [action for action in combined["actions"] if action["kind"].startswith("healthcare_") or action["kind"] == "select_healthcare_slot"]
        follow_up = assistant_chat(client, token, "Chọn quán đầu tiên", conversation_id)
        assert follow_up["conversation_id"] == combined["conversation_id"] == conversation_id
        assert any(item.get("kind") in {"food_options", "food_confirmation", "food_empty"} for item in follow_up["items"])
        assert any(item.get("kind") in {"healthcare_options", "healthcare_no_availability"} for item in follow_up["items"])
        assert find_action(follow_up, "select_healthcare_slot") == healthcare_action
        assert [action for action in follow_up["actions"] if action["kind"].startswith("healthcare_") or action["kind"] == "select_healthcare_slot"] == healthcare_actions


def test_unified_g_generic_choice_clarifies_then_specific_food_choice_preserves_healthcare() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=45) as client:
        token = login(client)
        conversation_id = unique_id("assistant-food-healthcare-ambiguous")
        combined = assistant_chat(client, token, "Tìm phở giao về nhà và đặt lịch khám thần kinh sáng mai", conversation_id)
        healthcare_action = find_action(combined, "select_healthcare_slot")

        clarification = assistant_chat(client, token, "Chọn cái đầu tiên", conversation_id)
        assert "đồ ăn" in clarification["message"].casefold()
        assert "lịch khám" in clarification["message"].casefold()
        assert clarification["actions"] == combined["actions"]
        assert clarification["items"] == []

        food_follow_up = assistant_chat(client, token, "Chọn quán đầu tiên", conversation_id)
        assert any(item.get("kind") in {"food_options", "food_confirmation", "food_empty"} for item in food_follow_up["items"])
        assert find_action(food_follow_up, "select_healthcare_slot") == healthcare_action


def test_unified_f_restaurant_to_ride_completes_both_confirmed_actions() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=45) as client:
        token = login(client)
        conversation_id = unique_id("assistant-restaurant-ride-complete")
        booking_date = unique_restaurant_date()
        first = assistant_chat(client, token, f"Dat ban cho 2 nguoi ngay {booking_date} luc 19h o Ha Noi roi goi xe 4 cho tu VinUni toi nha hang do", conversation_id)
        selected = assistant_action(client, token, conversation_id, find_action(first, "select_restaurant"), unique_id("assistant-restaurant-select"))
        restaurant_confirmed = assistant_action(client, token, conversation_id, find_action(selected, "restaurant_confirm"), unique_id("assistant-restaurant-confirm"))
        ride_prepared = assistant_action(client, token, conversation_id, find_action(restaurant_confirmed, "ride_service"), unique_id("assistant-ride-service"))
        completed = assistant_action(client, token, conversation_id, find_action(ride_prepared, "ride_payment"), unique_id("assistant-ride-payment"))
        assert any(item.get("kind") == "reservation" for item in restaurant_confirmed["completed"])
        assert any(item.get("kind") == "ride_booking" for item in completed["completed"])


def test_unified_ride_actions_survive_gateway_restart_and_replay_once() -> None:
    assert GATEWAY_URL
    conversation_id = unique_id("assistant-ride-restart")
    with httpx.Client(base_url=GATEWAY_URL, timeout=45) as client:
        token = login(client)
        first = assistant_chat(client, token, "Dat xe 4 cho tu VinUni den Hoan Kiem", conversation_id)
        ride_service = find_action(first, "ride_service")

    restart_gateway()
    with httpx.Client(base_url=GATEWAY_URL, timeout=45) as client:
        service_confirmed = assistant_action(client, token, conversation_id, ride_service, unique_id("assistant-ride-service-restart"))
        ride_payment = find_action(service_confirmed, "ride_payment")

    restart_gateway()
    with httpx.Client(base_url=GATEWAY_URL, timeout=45) as client:
        payment_key = unique_id("assistant-ride-payment-restart")
        completed = assistant_action(client, token, conversation_id, ride_payment, payment_key)
        replay = assistant_action(client, token, conversation_id, ride_payment, payment_key)
        assert any(item.get("kind") == "ride_booking" for item in completed["completed"])
        assert replay == completed

        different_key = client.post(
            "/api/v1/assistant/actions",
            headers={"Authorization": f"Bearer {token}", "Idempotency-Key": unique_id("assistant-ride-payment-different")},
            json={"conversation_id": conversation_id, "action_id": ride_payment["id"]},
        )
        assert different_key.status_code == 409
        assert different_key.json()["code"] == "ACTION_NOT_AVAILABLE"
