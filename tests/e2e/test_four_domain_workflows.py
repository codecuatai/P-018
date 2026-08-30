from __future__ import annotations

import os
import subprocess
from datetime import datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx
import pytest
from _helpers import REPO_ROOT, compose_args, get_cached_token

GATEWAY_URL = os.getenv("E2E_GATEWAY_URL")
DEMO_EMAIL = os.getenv("E2E_DEMO_EMAIL", "demo@example.invalid")
DEMO_PASSWORD = os.getenv("E2E_DEMO_PASSWORD", "replace-with-local-demo-password")
HEALTHCARE_DB_NAME = os.getenv("E2E_HEALTHCARE_DB_NAME", "xone_healthcare")
HEALTHCARE_DB_USER = os.getenv("E2E_HEALTHCARE_DB_USER", "healthcare_user")
pytestmark = pytest.mark.skipif(not GATEWAY_URL, reason="E2E_GATEWAY_URL is not configured")


def unique_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12]}"


def unique_restaurant_request() -> str:
    # Persistent E2E runs must not collide with a reservation left by an earlier run.
    days = 30 + int(uuid4().hex[:4], 16) % 365
    booking_at = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")) + timedelta(days=days)
    return f"dat ban cho 2 nguoi ngay {booking_at:%d/%m/%Y} luc 19h o Ha Noi"


def login(client: httpx.Client, email: str = DEMO_EMAIL, password: str = DEMO_PASSWORD) -> str:
    return get_cached_token(client, email, password)


def auth_headers(token: str, idempotency_key: str | None = None) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {token}"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    return headers


def workflow_chat(
    client: httpx.Client,
    token: str,
    workflow_id: str,
    message: str,
    context: dict[str, object] | None = None,
) -> dict:
    response = client.post(
        "/api/v1/restaurant-workflows/chat" if workflow_id.startswith("restaurant-") else "/api/v1/healthcare-workflows/chat",
        headers=auth_headers(token),
        json={
            "message": message,
            "workflow_id": workflow_id,
            "client_turn_id": unique_id("turn"),
            **({"context": context} if context is not None else {}),
        },
    )
    response.raise_for_status()
    return response.json()["data"]


def run_healthcare_sql(sql: str) -> str:
    result = subprocess.run(
        [
            *compose_args(
                "exec",
                "-T",
                "postgres",
                "psql",
                "-U",
                HEALTHCARE_DB_USER,
                "-d",
                HEALTHCARE_DB_NAME,
                "-v",
                "ON_ERROR_STOP=1",
                "-qAt",
            ),
        ],
        cwd=REPO_ROOT,
        input=sql,
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def expire_healthcare_slot(slot_id: int) -> None:
    run_healthcare_sql(
        f"UPDATE time_slots SET hold_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' "
        f"WHERE id = {slot_id} AND status = 'HOLDING';"
    )


def healthcare_state(appointment_id: int) -> tuple[str, str, str]:
    row = run_healthcare_sql(
        "SELECT a.status, a.is_paid::text, s.status "
        "FROM appointments a JOIN time_slots s ON s.id = a.slot_id "
        f"WHERE a.id = {appointment_id};"
    )
    status, is_paid, slot_status = row.split("|")
    return status, is_paid, slot_status


def restaurant_context(data: dict, tool_name: str, tool_result: object) -> dict[str, object]:
    return {
        "slots": dict(data.get("slots") or {}),
        "tool_name": tool_name,
        "tool_result": tool_result,
    }


def healthcare_context(
    *,
    department: str,
    slot_id: int | None = None,
    patient_id: int = 1,
    appointment_id: int | None = None,
) -> dict[str, object]:
    slots: dict[str, object] = {"department": department, "patient_id": patient_id}
    if slot_id is not None:
        slots["slot_id"] = slot_id
    if appointment_id is not None:
        slots["appointment_id"] = appointment_id
    return {
        "slots": slots,
        "patient_id": patient_id,
        "appointment_id": appointment_id,
        "tool_name": None,
        "tool_result": None,
        "symptoms": "dau bung",
    }


def hold_healthcare_slot(client: httpx.Client, token: str, department: str, slot_id: int, workflow_id: str) -> dict:
    data = workflow_chat(
        client,
        token,
        workflow_id,
        f"toi muon dat lich kham, xac nhan giu slot id {slot_id}",
        healthcare_context(department=department, slot_id=slot_id),
    )
    assert data.get("tool_result"), data
    assert data["tool_result"]["slot_id"] == slot_id
    return data


def propose_healthcare_confirmation(
    client: httpx.Client,
    token: str,
    workflow_id: str,
    department: str,
    appointment_id: int,
) -> dict:
    return workflow_chat(
        client,
        token,
        workflow_id,
        f"xac nhan lich kham appointment id {appointment_id}",
        healthcare_context(department=department, appointment_id=appointment_id),
    )


def test_ride_public_two_step_confirmation() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        token = login(client)
        quote_response = client.post(
            "/api/v1/services/ride/quote",
            headers=auth_headers(token, unique_id("ride-quote")),
            json={
                "pickup_address": "VinUni, Gia Lam",
                "dropoff_address": "Hoan Kiem",
                "vehicle_type": "CAR_4",
                "pickup_latitude": 21.0285,
                "pickup_longitude": 105.8048,
                "dropoff_latitude": 21.0301,
                "dropoff_longitude": 105.8122,
            },
        )
        quote_response.raise_for_status()
        quote = quote_response.json()["data"]

        prepared = client.post(
            "/api/v1/service-actions/ride/prepare",
            headers=auth_headers(token, unique_id("ride-prepare")),
            json={"quote_id": quote["id"]},
        )
        prepared.raise_for_status()
        booking = prepared.json()["data"]
        assert booking["status"] == "AWAITING_CONFIRMATION"

        payment = client.post(
            f"/api/v1/service-actions/ride/{booking['id']}/confirm",
            headers=auth_headers(token, unique_id("ride-confirm")),
        )
        payment.raise_for_status()
        completed = payment.json()["data"]
        assert completed["status"] == "DRIVER_ASSIGNED"


def test_restaurant_public_flow_requires_explicit_final_confirmation() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        token = login(client)
        workflow_id = unique_id("restaurant-workflow")
        first = workflow_chat(client, token, workflow_id, unique_restaurant_request())
        assert first["tool_result"]["items"]
        assert first["tool_request"]["tool_name"] == "restaurant.search"

        second = workflow_chat(
            client,
            token,
            workflow_id,
            "chon nha hang dau tien",
            restaurant_context(first, "restaurant.search", first["tool_result"]),
        )
        assert second["tool_request"]["tool_name"] == "restaurant.check_availability"
        assert second["tool_result"]["available"] is True

        third = workflow_chat(
            client,
            token,
            workflow_id,
            "co, giu ban",
            restaurant_context(second, "restaurant.check_availability", second["tool_result"]),
        )
        assert third["tool_result"]["status"] == "ACTIVE"

        proposal = workflow_chat(
            client,
            token,
            workflow_id,
            "xac nhan dat ban",
            restaurant_context(third, "restaurant.create_hold", third["tool_result"]),
        )
        assert proposal["status"] == "CONFIRMATION_REQUIRED"
        pending = proposal["pending_confirmation"]
        assert pending["action"] == "CREATE_RESTAURANT_RESERVATION"

        final = client.post(
            "/api/v1/restaurant-workflows/confirm",
            headers=auth_headers(token, unique_id("restaurant-confirm")),
            json={"confirmation_id": pending["id"], "workflow_id": workflow_id},
        )
        final.raise_for_status()
        reservation = final.json()["data"]["tool_result"]
        assert reservation["status"] == "CONFIRMED"


def test_healthcare_public_flow_reconciles_expiry_and_reuses_slots() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        token = login(client)
        workflow_id = unique_id("healthcare-discovery")
        departments = workflow_chat(client, token, workflow_id, "toi bi met va muon dat lich kham")
        assert departments["tool_request"]["tool_name"] == "healthcare.list_departments"
        assert departments["tool_result"]

        doctors = workflow_chat(
            client,
            token,
            workflow_id,
            "chon khoa tieu hoa",
            {
                "slots": departments.get("slots", {}),
                "tool_name": "healthcare.list_departments",
                "tool_result": departments["tool_result"],
                "patient_id": 1,
            },
        )
        assert doctors["tool_request"]["tool_name"] == "healthcare.list_slots"
        candidates = [
            slot
            for doctor in doctors["tool_result"]
            for slot in doctor.get("available_slots", [])
        ]
        assert len(candidates) >= 2
        department = str(doctors["slots"]["department"])
        first_slot = int(candidates[0]["id"])
        expired_payment_slot = int(candidates[1]["id"])
        # Reuse the payment-expiry slot after reconciliation for the final-expiry path.
        expired_confirmation_slot = expired_payment_slot

        held = hold_healthcare_slot(client, token, department, first_slot, unique_id("healthcare-hold"))
        appointment_id = int(held["tool_result"]["appointment_id"])
        payment = client.post(
            "/api/v1/healthcare-workflows/payment",
            headers=auth_headers(token, unique_id("healthcare-payment")),
            json={"appointment_id": appointment_id, "workflow_id": workflow_id},
        )
        payment.raise_for_status()
        assert payment.json()["data"]["status"] == "PAYMENT_SUCCEEDED"

        proposal = propose_healthcare_confirmation(client, token, workflow_id, department, appointment_id)
        assert proposal["status"] == "CONFIRMATION_REQUIRED"
        pending = proposal["pending_confirmation"]

        final = client.post(
            "/api/v1/healthcare-workflows/confirm",
            headers=auth_headers(token, unique_id("healthcare-confirm")),
            json={"confirmation_id": pending["id"], "workflow_id": workflow_id},
        )
        final.raise_for_status()
        assert final.json()["data"]["tool_result"]["appointment"]["status"] == "CONFIRMED"

        cancelled = workflow_chat(
            client,
            token,
            workflow_id,
            f"huy lich hen id {appointment_id}",
            healthcare_context(department=department, appointment_id=appointment_id),
        )
        assert cancelled["tool_result"]["status"] == "success"

        reused = hold_healthcare_slot(client, token, department, first_slot, unique_id("healthcare-reuse"))
        assert int(reused["tool_result"]["appointment_id"]) != appointment_id

        expired_payment = hold_healthcare_slot(client, token, department, expired_payment_slot, unique_id("healthcare-expired-payment"))
        expired_payment_id = int(expired_payment["tool_result"]["appointment_id"])
        expire_healthcare_slot(expired_payment_slot)
        rejected_payment = client.post(
            "/api/v1/healthcare-workflows/payment",
            headers=auth_headers(token, unique_id("healthcare-expired-payment-ack")),
            json={"appointment_id": expired_payment_id, "workflow_id": workflow_id},
        )
        assert rejected_payment.status_code == 409
        assert "APPOINTMENT_EXPIRED" in rejected_payment.text
        assert healthcare_state(expired_payment_id) == ("EXPIRED", "false", "AVAILABLE")

        expired_confirmation = hold_healthcare_slot(
            client,
            token,
            department,
            expired_confirmation_slot,
            unique_id("healthcare-expired-confirmation"),
        )
        expired_confirmation_id = int(expired_confirmation["tool_result"]["appointment_id"])
        payment_two = client.post(
            "/api/v1/healthcare-workflows/payment",
            headers=auth_headers(token, unique_id("healthcare-payment-two")),
            json={"appointment_id": expired_confirmation_id, "workflow_id": workflow_id},
        )
        payment_two.raise_for_status()
        proposal_two = propose_healthcare_confirmation(
            client,
            token,
            workflow_id,
            department,
            expired_confirmation_id,
        )
        pending_two = proposal_two["pending_confirmation"]
        expire_healthcare_slot(expired_confirmation_slot)
        rejected_final = client.post(
            "/api/v1/healthcare-workflows/confirm",
            headers=auth_headers(token, unique_id("healthcare-expired-confirm")),
            json={"confirmation_id": pending_two["id"], "workflow_id": workflow_id},
        )
        assert rejected_final.status_code == 409
        assert "APPOINTMENT_EXPIRED" in rejected_final.text
        assert healthcare_state(expired_confirmation_id) == ("EXPIRED", "false", "AVAILABLE")

        reusable_after_expiry = hold_healthcare_slot(
            client,
            token,
            department,
            expired_confirmation_slot,
            unique_id("healthcare-reuse-expired"),
        )
        assert int(reusable_after_expiry["tool_result"]["appointment_id"]) != expired_confirmation_id
