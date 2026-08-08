from __future__ import annotations

import hashlib
import json
import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import httpx
import pytest

GATEWAY_URL = os.getenv("E2E_GATEWAY_URL")
E2E_COMPOSE_PROJECT_NAME = os.getenv("E2E_COMPOSE_PROJECT_NAME", "p-018")
DEMO_EMAIL = os.getenv("E2E_DEMO_EMAIL", "demo@example.invalid")
DEMO_PASSWORD = os.getenv("E2E_DEMO_PASSWORD", "replace-with-local-demo-password")
DEMO_USER_ID = os.getenv("E2E_DEMO_USER_ID", "usr_demo_001")
INTERNAL_SERVICE_TOKEN = os.getenv("E2E_INTERNAL_SERVICE_TOKEN", "replace-with-local-token")
REPO_ROOT = Path(__file__).resolve().parents[2]
pytestmark = pytest.mark.skipif(not GATEWAY_URL, reason="E2E_GATEWAY_URL is not configured")


def compose_args(*args: str) -> list[str]:
    return ["docker", "compose", "-p", E2E_COMPOSE_PROJECT_NAME, "--env-file", ".env.example", *args]


def login(client: httpx.Client) -> str:
    response = client.post("/api/v1/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    response.raise_for_status()
    return response.json()["data"]["access_token"]


def chat(client: httpx.Client, token: str, conversation_id: str, message: str) -> dict:
    response = client.post(f"/api/v1/conversations/{conversation_id}/messages", headers={"Authorization": f"Bearer {token}"}, json={"message": message})
    response.raise_for_status()
    return response.json()["data"]


def unique_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12]}"


def stable_hash(value: object) -> str:
    return hashlib.sha256(json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def run_sql(sql: str, database: str, user: str) -> str:
    result = subprocess.run(
        compose_args("exec", "-T", "postgres", "psql", "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1", "-qAt"),
        cwd=REPO_ROOT,
        input=sql,
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def db_scalar(sql: str, database: str, user: str) -> str:
    output = run_sql(sql, database, user)
    return output.splitlines()[-1].strip() if output else ""


def prepare_order(client: httpx.Client, token: str, with_voucher: bool = False) -> tuple[dict, str, str]:
    conversation_id = unique_id("e2e-conversation")
    search = chat(client, token, conversation_id, "Tìm phở bò dưới 100 nghìn ở Hà Nội.")
    assert search["state_updates"].get("restaurant_candidates")
    chat(client, token, conversation_id, "Chọn quán đầu tiên.")
    added = chat(client, token, conversation_id, "Cho tôi hai bát phở bò cỡ lớn, không cay.")
    cart_id = added["state_updates"]["cart_id"]
    if with_voucher:
        chat(client, token, conversation_id, "Áp mã XONE50.")
    chat(client, token, conversation_id, "Giao về nhà riêng.")
    preview = chat(client, token, conversation_id, "Xem tổng tiền.")
    assert preview["response_type"] in {"options", "order_preview"}
    confirmation = chat(client, token, conversation_id, "Đặt luôn.")
    form = confirmation["pending_confirmation"]
    assert form and form["action"] == "PLACE_FOOD_ORDER"
    return form, conversation_id, cart_id


def execute_order(client: httpx.Client, token: str, form: dict, conversation_id: str, key: str, **options: object) -> httpx.Response:
    return client.post(
        f"/api/v1/confirmations/{form['id']}/execute",
        headers={"Authorization": f"Bearer {token}", "Idempotency-Key": key},
        json={"payment_method": "card", "conversation_id": conversation_id, **options},
    )


def wait_for_order(client: httpx.Client, token: str, order_id: str, expected: set[str], timeout: float = 45) -> dict:
    deadline = time.monotonic() + timeout
    last: dict = {}
    while time.monotonic() < deadline:
        response = client.get(f"/api/v1/food/orders/{order_id}", headers={"Authorization": f"Bearer {token}"})
        response.raise_for_status()
        last = response.json()["data"]
        if last.get("status") in expected:
            return last
        time.sleep(1)
    raise AssertionError(f"Order did not reach {expected}: {last}")


def wait_for_payment(client: httpx.Client, token: str, payment_id: str, expected: str, timeout: float = 20) -> dict:
    deadline = time.monotonic() + timeout
    last: dict = {}
    while time.monotonic() < deadline:
        response = client.get(f"/api/v1/payments/{payment_id}", headers={"Authorization": f"Bearer {token}"})
        response.raise_for_status()
        last = response.json()["data"]
        if last.get("status") == expected:
            return last
        time.sleep(1)
    raise AssertionError(f"Payment did not reach {expected}: {last}")


def wait_for_confirmation(client: httpx.Client, token: str, confirmation_id: str, expected: str, timeout: float = 30) -> dict:
    deadline = time.monotonic() + timeout
    last: dict = {}
    while time.monotonic() < deadline:
        response = client.get(f"/api/v1/confirmations/{confirmation_id}", headers={"Authorization": f"Bearer {token}"})
        response.raise_for_status()
        last = response.json()["data"]
        if last.get("status") == expected:
            return last
        time.sleep(1)
    raise AssertionError(f"Confirmation did not reach {expected}: {last}")


def test_natural_language_food_happy_path() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        token = login(client)
        # Voucher redemption is covered by the dedicated exhaustion test below.
        # Keep the general happy path repeatable against a persistent local database,
        # where a prior run may have consumed the seeded voucher.
        form, conversation_id, _ = prepare_order(client, token)
        execute = execute_order(client, token, form, conversation_id, unique_id("e2e-place-order"))
        execute.raise_for_status()
        result = execute.json()["data"]
        assert result["order"]["status"] == "RESTAURANT_CONFIRMING"
        assert result["payment"]["status"] == "SUCCEEDED"
        order = wait_for_order(client, token, result["order"]["id"], {"DELIVERED"})
        assert order["status"] == "DELIVERED"
        receipt = client.get(f"/api/v1/payments/{result['payment']['id']}/receipt", headers={"Authorization": f"Bearer {token}"})
        receipt.raise_for_status()


def test_stale_quote_rejects_before_order_insert() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        token = login(client)
        form, conversation_id, cart_id = prepare_order(client, token)
        before_version = int(db_scalar(f"SELECT version FROM food_carts WHERE id={sql_literal(cart_id)}", "xone_food", "food_user"))
        chat(client, token, conversation_id, "Thêm một bát phở gà.")
        assert int(db_scalar(f"SELECT version FROM food_carts WHERE id={sql_literal(cart_id)}", "xone_food", "food_user")) > before_version
        response = execute_order(client, token, form, conversation_id, unique_id("e2e-stale-quote"))
        assert response.status_code == 409
        assert "CART_CHANGED" in response.text
        assert db_scalar(f"SELECT count(*) FROM food_orders WHERE data->>'cart_id'={sql_literal(cart_id)}", "xone_food", "food_user") == "0"


def test_concurrent_confirmation_creates_one_order_and_payment() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        token = login(client)
        form, conversation_id, cart_id = prepare_order(client, token)

    def submit() -> httpx.Response:
        with httpx.Client(base_url=GATEWAY_URL, timeout=30) as thread_client:
            return execute_order(thread_client, token, form, conversation_id, unique_id("e2e-concurrent"))

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _: submit(), range(2)))
    assert sum(response.status_code in {200, 201} for response in responses) == 1
    assert sum(response.status_code == 409 for response in responses) == 1
    assert db_scalar(f"SELECT count(*) FROM food_orders WHERE data->>'cart_id'={sql_literal(cart_id)}", "xone_food", "food_user") == "1"


def test_crash_recovery_after_stale_confirmation_claim() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        token = login(client)
        form, conversation_id, _ = prepare_order(client, token)
        confirmation_id = form["id"]
        execution_key = unique_id(f"confirmation-{confirmation_id}")
        order_key = unique_id("order-recovery")
        payment_key = unique_id("payment-recovery")
        execution_payload = {"payment_method": "card", "order_idempotency_key": order_key, "payment_idempotency_key": payment_key, "conversation_id": conversation_id, "simulate_timeout": True}
        execution_hash = stable_hash({"confirmation_id": confirmation_id, "payment_method": "card", "simulate_failure": False, "simulate_timeout": False})
        run_sql(
            f"""
            UPDATE confirmations SET status='PROCESSING', execution_key={sql_literal(execution_key)}, processing_started_at=now()-interval '60 seconds', recovery_claimed_at=NULL, next_recovery_at=NULL WHERE id={sql_literal(confirmation_id)};
            INSERT INTO confirmation_executions (execution_key, confirmation_id, actor_id, idempotency_key, payload_hash, status, execution_payload)
            VALUES ({sql_literal(execution_key)}, {sql_literal(confirmation_id)}, {sql_literal(DEMO_USER_ID)}, {sql_literal(execution_key)}, {sql_literal(execution_hash)}, 'PROCESSING', {sql_literal(json.dumps(execution_payload))}::jsonb);
            """,
            "xone_core",
            "core_user",
        )
        deadline = time.monotonic() + 30
        status = ""
        while time.monotonic() < deadline:
            status = client.get(f"/api/v1/confirmations/{confirmation_id}", headers={"Authorization": f"Bearer {token}"}).json()["data"]["status"]
            if status == "SUCCEEDED":
                break
            time.sleep(1)
        assert status == "SUCCEEDED"
        assert db_scalar(f"SELECT count(*) FROM confirmation_executions WHERE execution_key={sql_literal(execution_key)}", "xone_core", "core_user") == "1"
        result = client.get(f"/api/v1/confirmations/{confirmation_id}", headers={"Authorization": f"Bearer {token}"}).json()["data"]["result"]
        assert result["payment"]["status"] == "SUCCEEDED"
        assert db_scalar(f"SELECT count(*) FROM receipts WHERE payment_id={sql_literal(result['payment']['id'])}", "xone_core", "core_user") == "1"


def test_pending_payment_recovery_reuses_provider_reference() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        token = login(client)
        form, conversation_id, _ = prepare_order(client, token)
        response = execute_order(client, token, form, conversation_id, unique_id("e2e-payment-recovery"))
        response.raise_for_status()
        payment = response.json()["data"]["payment"]
        payment_id = payment["id"]
        run_sql(f"UPDATE payments SET status='PENDING', provider_status='PENDING', last_checked_at=now()-interval '60 seconds', receipt_id=NULL, completed_at=NULL WHERE id={sql_literal(payment_id)}", "xone_core", "core_user")
        recovered = wait_for_payment(client, token, payment_id, "SUCCEEDED")
        assert recovered["providerReference"] == payment["providerReference"]
        assert db_scalar(f"SELECT count(*) FROM receipts WHERE payment_id={sql_literal(payment_id)}", "xone_core", "core_user") == "1"


def test_payment_failure_converges_without_receipt() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        token = login(client)
        form, conversation_id, _ = prepare_order(client, token)
        key = unique_id("e2e-payment-failure")
        response = execute_order(client, token, form, conversation_id, key, simulate_failure=True)
        assert response.status_code == 409
        assert "PAYMENT_FAILED" in response.text
        order_key = f"order:{form['id']}:{key}"
        order_id = db_scalar(f"SELECT id FROM food_orders WHERE idempotency_key={sql_literal(order_key)}", "xone_food", "food_user")
        payment_id = db_scalar(f"SELECT id FROM payments WHERE order_id={sql_literal(order_id)}", "xone_core", "core_user")
        assert db_scalar(f"SELECT status FROM food_orders WHERE id={sql_literal(order_id)}", "xone_food", "food_user") == "PAYMENT_FAILED"
        assert db_scalar(f"SELECT count(*) FROM receipts WHERE payment_id={sql_literal(payment_id)}", "xone_core", "core_user") == "0"


def test_real_payment_timeout_recovers_through_public_flow() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        token = login(client)
        form, conversation_id, _ = prepare_order(client, token)
        response = execute_order(client, token, form, conversation_id, unique_id("e2e-real-timeout"), simulate_timeout=True)
        assert response.status_code == 409
        assert "PAYMENT_TIMEOUT" in response.text
        processing = client.get(f"/api/v1/confirmations/{form['id']}", headers={"Authorization": f"Bearer {token}"})
        processing.raise_for_status()
        confirmation = processing.json()["data"]
        payment = confirmation["result"]["payment"]
        assert confirmation["status"] == "FAILED_RETRYABLE"
        assert payment["status"] in {"TIMED_OUT", "PENDING", "UNKNOWN"}
        pending_order = client.get(f"/api/v1/food/orders/{payment['orderId']}", headers={"Authorization": f"Bearer {token}"})
        pending_order.raise_for_status()
        assert pending_order.json()["data"]["status"] == "PAYMENT_PENDING"
        recovered_payment = wait_for_payment(client, token, payment["id"], "SUCCEEDED", timeout=30)
        assert recovered_payment["providerReference"] == payment["providerReference"]
        order = wait_for_order(client, token, payment["orderId"], {"DELIVERED"}, timeout=60)
        assert order["status"] == "DELIVERED"
        recovered_confirmation = wait_for_confirmation(client, token, form["id"], "SUCCEEDED")
        assert recovered_confirmation["result"]["payment"]["id"] == payment["id"]
        assert db_scalar(f"SELECT count(*) FROM receipts WHERE payment_id={sql_literal(payment['id'])}", "xone_core", "core_user") == "1"


def test_real_payment_timeout_restart_preserves_provider_attempt_and_converges() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        token = login(client)
        form, conversation_id, _ = prepare_order(client, token)
        response = execute_order(client, token, form, conversation_id, unique_id("e2e-timeout-restart"), simulate_timeout=True)
        assert response.status_code == 409
        processing = client.get(f"/api/v1/confirmations/{form['id']}", headers={"Authorization": f"Bearer {token}"})
        processing.raise_for_status()
        payment = processing.json()["data"]["result"]["payment"]
        provider_reference = payment["providerReference"]
        pending_order = client.get(f"/api/v1/food/orders/{payment['orderId']}", headers={"Authorization": f"Bearer {token}"})
        pending_order.raise_for_status()
        assert pending_order.json()["data"]["status"] == "PAYMENT_PENDING"
    restart = subprocess.run(compose_args("restart", "api-gateway"), cwd=REPO_ROOT, text=True, capture_output=True, check=False)
    assert restart.returncode == 0, restart.stderr
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        deadline = time.monotonic() + 45
        ready = False
        while time.monotonic() < deadline:
            try:
                ready = client.get("/health/ready").status_code == 200
            except httpx.HTTPError:
                ready = False
            if ready:
                break
            time.sleep(1)
        assert ready
        recovered = wait_for_payment(client, token, payment["id"], "SUCCEEDED", timeout=45)
        assert recovered["providerReference"] == provider_reference
        order = wait_for_order(client, token, payment["orderId"], {"DELIVERED"}, timeout=60)
        confirmation = wait_for_confirmation(client, token, form["id"], "SUCCEEDED", timeout=45)
        assert order["status"] == "DELIVERED"
        assert confirmation["result"]["payment"]["id"] == payment["id"]
        assert db_scalar(f"SELECT attempt_count FROM sandbox_payment_provider_transactions WHERE provider_reference={sql_literal(provider_reference)}", "xone_core", "core_user") == "1"
        assert db_scalar(f"SELECT count(*) FROM receipts WHERE payment_id={sql_literal(payment['id'])}", "xone_core", "core_user") == "1"


def test_voucher_exhaustion_between_prepare_and_execute_is_cart_changed() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        token = login(client)
        run_sql("UPDATE food_catalog SET data=jsonb_set(data,'{used_count}','0'::jsonb) WHERE record_type='voucher' AND id='XONE50'; DELETE FROM food_voucher_redemptions WHERE voucher_code='XONE50'", "xone_food", "food_user")
        form, conversation_id, _ = prepare_order(client, token, with_voucher=True)
        run_sql("UPDATE food_catalog SET data=jsonb_set(data,'{used_count}',data->'usage_limit') WHERE record_type='voucher' AND id='XONE50'", "xone_food", "food_user")
        response = execute_order(client, token, form, conversation_id, unique_id("e2e-voucher-race"))
        assert response.status_code == 409
        assert "CART_CHANGED" in response.text
        stored = client.get(f"/api/v1/confirmations/{form['id']}", headers={"Authorization": f"Bearer {token}"})
        stored.raise_for_status()
        assert stored.json()["data"]["status"] == "FAILED_FINAL"


def test_restaurant_reject_saga_refunds_once() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        token = login(client)
        form, conversation_id, _ = prepare_order(client, token)
        response = execute_order(client, token, form, conversation_id, unique_id("e2e-reject-saga"))
        response.raise_for_status()
        result = response.json()["data"]
        order_id = result["order"]["id"]
        payment_id = result["payment"]["id"]
        run_sql(f"UPDATE food_orders SET status='RESTAURANT_REJECTED', restaurant_decision='reject', next_transition_at=NULL, version=version+1 WHERE id={sql_literal(order_id)}", "xone_food", "food_user")
        order = wait_for_order(client, token, order_id, {"REFUNDED"})
        assert order["status"] == "REFUNDED"
        refunds = client.get(f"/api/v1/payments/{payment_id}/refunds", headers={"Authorization": f"Bearer {token}"})
        refunds.raise_for_status()
        assert len(refunds.json()["data"]) == 1


def test_cancellation_confirmation_refunds_before_preparing() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        token = login(client)
        form, conversation_id, _ = prepare_order(client, token)
        response = execute_order(client, token, form, conversation_id, unique_id("e2e-cancel-source"))
        response.raise_for_status()
        order_id = response.json()["data"]["order"]["id"]
        run_sql(f"UPDATE food_orders SET status='RESTAURANT_CONFIRMING', next_transition_at=now()+interval '10 minutes', version=version+1 WHERE id={sql_literal(order_id)}", "xone_food", "food_user")
        prepared = client.post("/api/v1/confirmations/food-order-cancellation", headers={"Authorization": f"Bearer {token}"}, json={"order_id": order_id})
        prepared.raise_for_status()
        cancellation = prepared.json()["data"]
        executed = client.post(f"/api/v1/confirmations/{cancellation['id']}/execute-cancellation", headers={"Authorization": f"Bearer {token}", "Idempotency-Key": unique_id("e2e-cancel")}, json={"conversation_id": conversation_id})
        executed.raise_for_status()
        assert executed.json()["data"]["order"]["status"] == "REFUNDED"


def test_cancellation_is_rejected_after_preparing() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        token = login(client)
        form, conversation_id, _ = prepare_order(client, token)
        response = execute_order(client, token, form, conversation_id, unique_id("e2e-cannot-cancel-source"))
        response.raise_for_status()
        order_id = response.json()["data"]["order"]["id"]
        run_sql(f"UPDATE food_orders SET status='PREPARING', next_transition_at=now()+interval '10 minutes', version=version+1 WHERE id={sql_literal(order_id)}", "xone_food", "food_user")
        rejected = client.post("/api/v1/confirmations/food-order-cancellation", headers={"Authorization": f"Bearer {token}"}, json={"order_id": order_id})
        assert rejected.status_code == 409
        assert "ORDER_NOT_CANCELLABLE" in rejected.text


def internal_status(service: str, url: str, headers: dict[str, str] | None = None) -> int:
    header_lines = "".join(f"req.add_header({key!r}, {value!r});" for key, value in (headers or {}).items())
    script = f"import urllib.request,urllib.error;req=urllib.request.Request({url!r});{header_lines}\ntry: urllib.request.urlopen(req); print(200)\nexcept urllib.error.HTTPError as e: print(e.code)"
    result = subprocess.run(compose_args("exec", "-T", service, "python", "-c", script), cwd=REPO_ROOT, text=True, capture_output=True, check=False)
    assert result.returncode == 0, result.stderr
    return int(result.stdout.strip().splitlines()[-1])


def test_security_internal_auth_and_actor_ownership() -> None:
    assert GATEWAY_URL
    assert internal_status("agent-service", "http://agent-service:8001/api/v1/status") == 401
    assert internal_status("food-service", "http://food-service:8104/api/v1/restaurants") == 401
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        token = login(client)
        form, conversation_id, _ = prepare_order(client, token)
        response = execute_order(client, token, form, conversation_id, unique_id("e2e-security-order"))
        response.raise_for_status()
        order_id = response.json()["data"]["order"]["id"]
    assert internal_status("food-service", f"http://food-service:8104/api/v1/orders/{order_id}", {"X-Internal-Service-Token": INTERNAL_SERVICE_TOKEN, "X-Actor-Id": "usr_other"}) == 403


def test_restart_preserves_order_payment_and_conversation() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        token = login(client)
        form, conversation_id, _ = prepare_order(client, token)
        response = execute_order(client, token, form, conversation_id, unique_id("e2e-restart"))
        response.raise_for_status()
        result = response.json()["data"]
        order_id = result["order"]["id"]
        payment_id = result["payment"]["id"]
    restart = subprocess.run(compose_args("restart", "api-gateway"), cwd=REPO_ROOT, text=True, capture_output=True, check=False)
    assert restart.returncode == 0, restart.stderr
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        deadline = time.monotonic() + 45
        ready = False
        while time.monotonic() < deadline:
            try:
                ready = client.get("/health/ready").status_code == 200
            except httpx.HTTPError:
                ready = False
            if ready:
                break
            time.sleep(1)
        assert ready
        assert client.get(f"/api/v1/food/orders/{order_id}", headers={"Authorization": f"Bearer {token}"}).status_code == 200
        assert client.get(f"/api/v1/payments/{payment_id}", headers={"Authorization": f"Bearer {token}"}).status_code == 200
        assert client.get(f"/api/v1/conversations/{conversation_id}", headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_concurrent_conversation_turns_append_without_loss() -> None:
    assert GATEWAY_URL
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        token = login(client)
        conversation_id = unique_id("e2e-concurrency")
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(chat, client, token, conversation_id, message) for message in ("Tìm phở bò", "Tìm bún chả")]
            [future.result() for future in futures]
        conversation = client.get(f"/api/v1/conversations/{conversation_id}", headers={"Authorization": f"Bearer {token}"})
        conversation.raise_for_status()
        messages = conversation.json()["data"]["messages"]
        assert len(messages) == 4
        assert {message["content"] for message in messages if message["role"] == "user"} == {"Tìm phở bò", "Tìm bún chả"}
