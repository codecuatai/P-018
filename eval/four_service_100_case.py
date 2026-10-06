#!/usr/bin/env python3
"""Run 100 safe, four-domain discovery turns through the local public Gateway.

Only case IDs, service/card kinds, HTTP status, safe error codes, and timings
are written to the report. Prompts, tokens, raw provider responses, and user
identifiers are never persisted.
"""

from __future__ import annotations

import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "eval" / "results" / "four-service-100-case.json"
EXPECTED = {"food", "ride", "restaurant", "healthcare"}
ACTOR = "synthetic-four-service-eval"

FOOD = ["phở bò", "bún chả", "cơm gà", "bún đậu", "bánh mì", "mì Ý", "sushi", "cháo sườn", "bún bò Huế", "salad gà"]
CUISINES = ["món Việt", "món Nhật", "món Hàn", "món Thái", "món Ý", "đồ nướng", "lẩu", "món chay", "hải sản", "món Hoa"]
DISTRICTS = ["Cầu Giấy", "Ba Đình", "Tây Hồ", "Hoàn Kiếm", "Đống Đa", "Hai Bà Trưng"]
DEPARTMENTS = ["da liễu", "tim mạch", "nhi khoa", "tai mũi họng", "thần kinh", "mắt", "tiêu hóa", "cơ xương khớp", "răng hàm mặt", "nội tổng quát"]
PICKUPS = ["Hồ Gươm", "VinUni", "Times City", "Bạch Mai", "Cầu Giấy", "Ga Hà Nội", "Royal City", "Mỹ Đình", "Hồ Tây", "Kim Mã"]
DROPOFFS = ["Cầu Giấy", "Hoàn Kiếm", "Tây Hồ", "Ba Đình", "Vincom Bà Triệu", "Đống Đa", "Bạch Mai", "Times City", "Mỹ Đình", "Hồ Gươm"]
VEHICLES = ["xe máy", "xe 4 chỗ", "xe 7 chỗ", "ô tô", "xe máy", "xe 4 chỗ", "xe 7 chỗ", "ô tô", "xe máy", "xe 4 chỗ"]


def make_cases() -> list[dict[str, str]]:
    cases: list[dict[str, str]] = []
    today = date.today()
    layouts = [
        "Tìm {food} để giao tới {address}; báo giá {vehicle} từ {pickup} đến {dropoff}; tìm nhà hàng {cuisine} ở {district} cho {party} người ngày {d1} lúc 19h; tìm lịch khám khoa {department} ngày {d2}.",
        "Nhờ bạn hỗ trợ bốn việc: giao món {food} tới {address}; tính báo giá {vehicle} từ {pickup} tới {dropoff}; tìm chỗ ăn {cuisine} tại {district} cho {party} người vào {d1} lúc 19h; tra lịch khám {department} vào {d2}.",
        "Cho mình tìm món {food} giao về {address}. Đồng thời báo giá chuyến {vehicle} từ {pickup} đến {dropoff}, tìm nhà hàng {cuisine} khu {district} cho nhóm {party} người lúc 19h ngày {d1}, và xem lịch khám {department} ngày {d2}.",
        "Tìm quán bán {food} giao đến {address}, xem giá xe {vehicle} từ {pickup} qua {dropoff}, gợi ý nhà hàng {cuisine} ở {district} cho {party} khách tối {d1} lúc 19h, và tìm lịch khám chuyên khoa {department} ngày {d2}.",
    ]
    for index in range(100):
        offset = index % 10
        first_day = today + timedelta(days=40 + (index % 40))
        second_day = first_day + timedelta(days=1)
        values = {
            "food": FOOD[offset],
            "address": f"{DISTRICTS[(offset + 2) % len(DISTRICTS)]}, Hà Nội",
            "vehicle": VEHICLES[offset],
            "pickup": PICKUPS[offset],
            "dropoff": DROPOFFS[(offset + 3) % len(DROPOFFS)],
            "cuisine": CUISINES[(offset + index // 10) % len(CUISINES)],
            "district": DISTRICTS[(offset + index // 10) % len(DISTRICTS)],
            "party": str(2 + (index % 7)),
            "d1": first_day.strftime("%d/%m/%Y"),
            "department": DEPARTMENTS[(offset + index // 10) % len(DEPARTMENTS)],
            "d2": second_day.strftime("%d/%m/%Y"),
        }
        cases.append({"case_id": f"four-service-{index + 1:03d}", "message": layouts[index % len(layouts)].format(**values)})
    return cases


def read_json(opener: Any, url: str, payload: dict[str, Any], headers: dict[str, str] | None = None) -> tuple[int, dict[str, Any]]:
    request = Request(url, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), method="POST", headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with opener.open(request, timeout=75) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        try:
            body = json.loads(error.read().decode("utf-8", errors="replace"))
        except json.JSONDecodeError:
            body = {}
        return error.code, body if isinstance(body, dict) else {}
    except URLError as error:
        raise RuntimeError(type(error.reason).__name__) from error


def kinds(payload: dict[str, Any], field: str) -> list[str]:
    values = payload.get(field)
    if not isinstance(values, list):
        return []
    return sorted({str(item["kind"]) for item in values if isinstance(item, dict) and item.get("kind")})


def observed_domains(item_kinds: list[str], action_kinds: list[str], completed_kinds: list[str]) -> set[str]:
    domains: set[str] = set()
    all_kinds = item_kinds + action_kinds + completed_kinds
    for kind in all_kinds:
        if kind.startswith("food_") or kind == "select_food_item":
            domains.add("food")
        elif kind.startswith("ride_"):
            domains.add("ride")
        elif kind.startswith("restaurant_") or kind == "reservation" or kind == "select_restaurant":
            domains.add("restaurant")
        elif kind.startswith("healthcare_") or kind.startswith("appointment") or kind == "select_healthcare_slot":
            domains.add("healthcare")
    return domains


def run_case(base_url: str, token: str, case: dict[str, str], index: int) -> dict[str, Any]:
    correlation_id = f"xone-4svc-20261006-{index + 1:03d}"
    started = time.monotonic()
    try:
        status, envelope = 0, {}
        for attempt in range(4):
            status, envelope = read_json(
                build_opener(),
                f"{base_url}/api/v1/assistant/chat",
                {"message": case["message"]},
                {"Authorization": f"Bearer {token}", "X-Correlation-Id": correlation_id},
            )
            if status not in {429, 502, 503, 504} or attempt == 3:
                break
            time.sleep(3 * (attempt + 1))
        payload = envelope.get("data") if isinstance(envelope.get("data"), dict) else {}
        item_kinds = kinds(payload, "items")
        action_kinds = kinds(payload, "actions")
        completed_kinds = kinds(payload, "completed")
        actual = observed_domains(item_kinds, action_kinds, completed_kinds)
        final_kinds = {"reservation", "appointment_confirmed", "food_order", "ride_booking"}
        no_final_action = not (set(completed_kinds) & final_kinds)
        success = status == 200 and actual == EXPECTED and no_final_action
        return {
            "case_id": case["case_id"],
            "correlation_id": correlation_id,
            "http_status": status,
            "status": "PASS" if success else "FAIL",
            "covered_domains": sorted(actual),
            "item_kinds": item_kinds,
            "action_kinds": action_kinds,
            "completed_kinds": completed_kinds,
            "safe_error_code": _error_code(envelope),
            "final_action_absent": no_final_action,
            "latency_ms": round((time.monotonic() - started) * 1000),
        }
    except (RuntimeError, TimeoutError) as error:
        return {"case_id": case["case_id"], "correlation_id": correlation_id, "http_status": 0, "status": "ERROR", "covered_domains": [], "item_kinds": [], "action_kinds": [], "completed_kinds": [], "safe_error_code": str(error), "final_action_absent": None, "latency_ms": round((time.monotonic() - started) * 1000)}


def _error_code(envelope: dict[str, Any]) -> str | None:
    error = envelope.get("error") or envelope.get("detail")
    if isinstance(error, dict) and isinstance(error.get("code"), str):
        return error["code"][:100]
    return None


def run_restaurant_selection_regression(base_url: str, token: str) -> dict[str, Any]:
    opener = build_opener()
    correlation_id = "xone-4svc-selection-20261006"
    search_status, search_envelope = read_json(
        opener,
        f"{base_url}/api/v1/assistant/chat",
        {"message": "Tìm nhà hàng món Nhật ở Cầu Giấy."},
        {"Authorization": f"Bearer {token}", "X-Correlation-Id": f"{correlation_id}-search"},
    )
    search = search_envelope.get("data") if isinstance(search_envelope.get("data"), dict) else {}
    conversation_id = search.get("conversation_id")
    actions = search.get("actions") if isinstance(search.get("actions"), list) else []
    action = next((item for item in actions if isinstance(item, dict) and item.get("kind") == "select_restaurant"), None)
    if search_status != 200 or not isinstance(conversation_id, str) or not action:
        return {"status": "FAIL", "search_http_status": search_status, "action_http_status": 0, "selected_card_visible": False, "selection_persisted": False, "safe_error_code": _error_code(search_envelope)}

    action_status, action_envelope = read_json(
        opener,
        f"{base_url}/api/v1/assistant/actions",
        {"conversation_id": conversation_id, "action_id": action.get("id")},
        {
            "Authorization": f"Bearer {token}",
            "X-Correlation-Id": f"{correlation_id}-action",
            "Idempotency-Key": "xone-4svc-selected-restaurant-key",
        },
    )
    action_response = action_envelope.get("data") if isinstance(action_envelope.get("data"), dict) else {}
    items = action_response.get("items") if isinstance(action_response.get("items"), list) else []
    visible = any(
        isinstance(item, dict)
        and item.get("kind") == "restaurant_options"
        and item.get("selected") is True
        and isinstance(item.get("options"), list)
        and any(isinstance(option, dict) and isinstance(option.get("name"), str) and option.get("name") for option in item["options"])
        for item in items
    )

    request = Request(
        f"{base_url}/api/v1/conversations/{conversation_id}",
        headers={"Authorization": f"Bearer {token}", "X-Correlation-Id": f"{correlation_id}-reload"},
    )
    try:
        with opener.open(request, timeout=30) as response:
            stored_envelope = json.loads(response.read().decode("utf-8"))
            stored_conversation = stored_envelope.get("data") if isinstance(stored_envelope, dict) else {}
    except (HTTPError, URLError, json.JSONDecodeError):
        stored_conversation = {}
    state = stored_conversation.get("state") if isinstance(stored_conversation, dict) and isinstance(stored_conversation.get("state"), dict) else {}
    tasks = state.get("tasks") if isinstance(state, dict) and isinstance(state.get("tasks"), list) else []
    persisted = any(
        isinstance(task, dict)
        and isinstance(task.get("authoritative"), dict)
        and isinstance(task["authoritative"].get("selected"), dict)
        and bool(task["authoritative"]["selected"].get("id"))
        for task in tasks
    )
    passed = action_status == 200 and visible and persisted
    return {
        "status": "PASS" if passed else "FAIL",
        "search_http_status": search_status,
        "action_http_status": action_status,
        "selected_card_visible": visible,
        "selection_persisted": persisted,
        "safe_error_code": _error_code(action_envelope),
    }


def run(base_url: str, email: str, password: str, workers: int) -> dict[str, Any]:
    cases = make_cases()
    results: list[dict[str, Any]] = []
    actual_workers = max(1, min(workers, 4))
    for start in range(0, len(cases), 15):
        opener = build_opener()
        login_status, login_response = read_json(opener, f"{base_url}/api/v1/auth/login", {"email": email, "password": password})
        data = login_response.get("data") if isinstance(login_response.get("data"), dict) else {}
        token = data.get("access_token")
        if login_status not in {200, 201} or not isinstance(token, str) or not token:
            raise RuntimeError(f"Local demo login failed (HTTP {login_status}).")
        batch = list(enumerate(cases[start : start + 15], start=start))
        with ThreadPoolExecutor(max_workers=actual_workers) as pool:
            futures = [pool.submit(run_case, base_url, token, case, index) for index, case in batch]
            for future in as_completed(futures):
                results.append(future.result())
    results.sort(key=lambda result: result["case_id"])
    opener = build_opener()
    login_status, login_response = read_json(opener, f"{base_url}/api/v1/auth/login", {"email": email, "password": password})
    data = login_response.get("data") if isinstance(login_response.get("data"), dict) else {}
    token = data.get("access_token")
    if login_status not in {200, 201} or not isinstance(token, str) or not token:
        raise RuntimeError(f"Local demo login failed (HTTP {login_status}).")
    selection_regression = run_restaurant_selection_regression(base_url, token)
    passed = sum(result["status"] == "PASS" for result in results)
    by_domain = {domain: sum(domain in result["covered_domains"] for result in results) for domain in sorted(EXPECTED)}
    latencies = sorted(result["latency_ms"] for result in results)
    return {
        "schema_version": "1",
        "evaluation": "100 four-service public Gateway discovery scenarios",
        "base_case_count": len(cases),
        "executed_case_count": len(results),
        "concurrency": actual_workers,
        "final_actions_allowed": False,
        "restaurant_selection_regression": selection_regression,
        "summary": {
            "status": "PASS" if passed == len(cases) and selection_regression["status"] == "PASS" else "FAIL",
            "cases_passed": passed,
            "cases_failed": len(results) - passed,
            "coverage_by_domain": by_domain,
            "all_four_domains_per_case": sum(set(result["covered_domains"]) == EXPECTED for result in results),
            "final_actions_completed": sum(result["final_action_absent"] is False for result in results),
            "median_latency_ms": latencies[len(latencies) // 2] if latencies else 0,
            "p95_latency_ms": latencies[max(0, int(len(latencies) * 0.95) - 1)] if latencies else 0,
        },
        "results": results,
        "privacy": "Synthetic service-discovery prompts only. No prompts, auth tokens, raw responses, or user identifiers are persisted.",
    }


def main() -> int:
    base_url = os.getenv("E2E_GATEWAY_URL", "http://localhost:3000").rstrip("/")
    email = os.getenv("E2E_DEMO_EMAIL")
    password = os.getenv("E2E_DEMO_PASSWORD")
    workers = int(os.getenv("FOUR_SERVICE_EVAL_WORKERS", "1"))
    output = Path(os.getenv("FOUR_SERVICE_EVAL_OUTPUT", str(DEFAULT_OUTPUT)))
    if not email or not password:
        print("Set E2E_DEMO_EMAIL and E2E_DEMO_PASSWORD in the private process environment.", file=sys.stderr)
        return 2
    try:
        artifact = run(base_url, email, password, workers)
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(output), "summary": artifact["summary"]}, ensure_ascii=False, sort_keys=True))
    return 0 if artifact["summary"]["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
