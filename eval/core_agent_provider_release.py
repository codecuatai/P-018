#!/usr/bin/env python3
"""Run the 20-case Core Agent provider release set at the internal typed boundary.

Only aggregate metrics and synthetic case IDs are written. Tokens, prompts, raw
provider bodies, model responses, internal facts, and chain-of-thought are never
included in the artifact.
"""

from __future__ import annotations

import argparse
import json
import os
import time
import unicodedata
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "eval" / "results" / "core-agent-provider-release.json"
ACTOR_ID = "synthetic-core-agent-eval"
TOOL_DOMAINS = {
    "search_food": "food",
    "restaurant.search": "restaurant",
    "healthcare.list_departments": "healthcare",
    "healthcare.list_slots": "healthcare",
    "ride.quote.create": "ride",
}
SLOT_ALIASES = {
    "keyword": "query",
    "district": "location",
    "specialty": "department",
}


def _fold(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    normalized = unicodedata.normalize("NFD", value.strip().casefold())
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn")


def _request(
    agent_url: str, internal_token: str, payload: dict[str, Any]
) -> tuple[int, dict[str, Any]]:
    request = Request(
        f"{agent_url}/api/v1/assistant-chat",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Internal-Service-Token": internal_token,
            "X-Actor-Id": ACTOR_ID,
        },
    )
    try:
        with urlopen(request, timeout=45) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        try:
            return error.code, json.loads(error.read().decode("utf-8"))
        except json.JSONDecodeError:
            return error.code, {"detail": {"code": "NON_JSON_ERROR"}}
    except URLError as error:
        raise RuntimeError(f"Agent is unavailable: {type(error.reason).__name__}") from error


def _single_domain_cases() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    for path in sorted((ROOT / "eval" / "eval_data").glob("*_cases.json")):
        candidates = json.loads(path.read_text(encoding="utf-8"))
        accepted = [
            candidate
            for candidate in candidates
            if candidate["expected_output"]["expected_tool"] in TOOL_DOMAINS
        ][:4]
        for candidate in accepted:
            expected = candidate["expected_output"]
            tool = expected["expected_tool"]
            cases.append(
                {
                    "case_id": candidate["metadata"]["case_id"],
                    "message": candidate["input"],
                    "expected_domains": [TOOL_DOMAINS[tool]],
                    "expected_tools": [tool],
                    "expected_parameters": expected.get("expected_parameters", {}),
                }
            )
    return cases


def _release_cases() -> list[dict[str, Any]]:
    cases = _single_domain_cases()
    cases.extend(
        [
            {
                "case_id": "multi_restaurant_ride",
                "message": "TĂ¬m nhĂ  hĂ ng Viá»‡t á»Ÿ HoĂ n Kiáº¿m cho 2 ngÆ°á»i tá»‘i mai, rá»“i Ä‘i xe tá»« VinUni tá»›i Ä‘Ă³.",
                "expected_domains": ["restaurant", "ride"],
                "expected_dependency": [0, 1],
            },
            {
                "case_id": "multi_healthcare_ride",
                "message": "TĂ¬m lá»‹ch khĂ¡m tháº§n kinh sĂ¡ng mai, rá»“i Ä‘i xe tá»« VinUni tá»›i bá»‡nh viá»‡n Ä‘Ă³.",
                "expected_domains": ["healthcare", "ride"],
                "expected_dependency": [0, 1],
            },
            {
                "case_id": "multi_food_healthcare",
                "message": "TĂ¬m phá»Ÿ bĂ² á»Ÿ Cáº§u Giáº¥y vĂ  tĂ¬m khoa da liá»…u cho chiá»u mai.",
                "expected_domains": ["food", "healthcare"],
            },
            {
                "case_id": "multi_restaurant_food",
                "message": "TĂ¬m nhĂ  hĂ ng Nháº­t á»Ÿ Táº¢y Há»“ cho 4 ngÆ°á»i tá»‘i mai vĂ  tĂ¬m sushi giao Ä‘áº¿n Cáº§u Giáº¥y.",
                "expected_domains": ["restaurant", "food"],
            },
        ]
    )
    if len(cases) != 20:
        raise RuntimeError(f"Provider release inventory must contain 20 cases, got {len(cases)}.")
    return cases


def _safe_error_code(body: dict[str, Any]) -> str | None:
    detail = body.get("detail")
    return str(detail.get("code")) if isinstance(detail, dict) and detail.get("code") else None


def _semantic_slots(data: dict[str, Any]) -> dict[str, Any]:
    turn = data.get("semantic_turn")
    intents = turn.get("intents", []) if isinstance(turn, dict) else []
    values: dict[str, Any] = {}
    for intent in intents:
        slots = intent.get("slots", {}) if isinstance(intent, dict) else {}
        if not isinstance(slots, dict):
            continue
        for field, raw in slots.items():
            if isinstance(raw, dict) and raw.get("value") is not None:
                values.setdefault(field, raw["value"])
    return values


def _evaluate_execution(
    case: dict[str, Any], status: int, body: dict[str, Any], latency_ms: int
) -> tuple[dict[str, Any], int, int]:
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    decision = data.get("planning_decision") if isinstance(data, dict) else {}
    tasks = decision.get("tasks", []) if isinstance(decision, dict) else []
    tasks = [task for task in tasks if isinstance(task, dict)]
    domains = [str(task.get("domain")) for task in tasks]
    steps = [
        step
        for task in tasks
        for step in task.get("steps", [])
        if isinstance(step, dict)
    ]
    capabilities = {str(step["capability"]) for step in steps if step.get("capability")}
    expected_domains = case["expected_domains"]
    expected_tools = set(case.get("expected_tools", []))
    classification_ok = set(domains) == set(expected_domains) and expected_tools.issubset(capabilities)
    dependency_ok = True
    if case.get("expected_dependency"):
        dependency_ok = len(tasks) >= 2 and 0 in tasks[1].get("depends_on", [])
    risk_gate_ok = all(
        step.get("risk_ceiling") == "READ" and step.get("confirmation_gate") == "NONE"
        for step in steps
        if step.get("step_kind") == "CAPABILITY"
    )
    provider_ok = data.get("decision_source") == "model"

    actual_slots = _semantic_slots(data)
    slot_correct = 0
    expected_parameters = case.get("expected_parameters", {})
    for expected_field, expected_value in expected_parameters.items():
        actual_field = SLOT_ALIASES.get(expected_field, expected_field)
        if _fold(actual_slots.get(actual_field)) == _fold(expected_value):
            slot_correct += 1

    passed = (
        status == 200
        and provider_ok
        and classification_ok
        and dependency_ok
        and risk_gate_ok
    )
    return (
        {
            "case_id": case["case_id"],
            "status": "PASS" if passed else "FAIL",
            "http_status": status,
            "provider_model_used": provider_ok,
            "classification_and_dag_ok": classification_ok and dependency_ok,
            "risk_and_gate_ok": risk_gate_ok,
            "slot_fields_correct": slot_correct,
            "slot_fields_total": len(expected_parameters),
            "latency_ms": latency_ms,
            **(_safe_error_code(body) and {"safe_error_code": _safe_error_code(body)}),
        },
        slot_correct,
        len(expected_parameters),
    )


def run(agent_url: str, internal_token: str, repetitions: int) -> dict[str, Any]:
    if repetitions < 2:
        raise ValueError("Provider release cases must be repeated at least twice.")
    cases = _release_cases()
    results: list[dict[str, Any]] = []
    slot_correct = 0
    slot_total = 0
    for repetition in range(repetitions):
        for index, case in enumerate(cases):
            correlation_id = f"provider-eval-{repetition + 1}-{index + 1}"
            started = time.monotonic()
            status, body = _request(
                agent_url,
                internal_token,
                {
                    "message": case["message"],
                    "conversation_id": correlation_id,
                    "user_id": ACTOR_ID,
                    "correlation_id": correlation_id,
                    "mode": "plan",
                },
            )
            latency_ms = round((time.monotonic() - started) * 1000)
            result, correct, total = _evaluate_execution(case, status, body, latency_ms)
            results.append({"repetition": repetition + 1, **result})
            slot_correct += correct
            slot_total += total

    executions = len(results)
    classification_passed = sum(item["classification_and_dag_ok"] for item in results)
    risk_passed = sum(item["risk_and_gate_ok"] for item in results)
    provider_calls = sum(item["provider_model_used"] for item in results)
    latencies = sorted(item["latency_ms"] for item in results)
    p95 = latencies[max(0, int(executions * 0.95) - 1)]
    classification_rate = classification_passed / executions
    slot_rate = slot_correct / slot_total if slot_total else 1.0
    passed = (
        provider_calls == executions
        and classification_rate >= 0.98
        and slot_rate >= 0.95
        and risk_passed == executions
        and p95 < 8000
    )
    return {
        "schema_version": "1",
        "evaluation": "Core Agent provider release set",
        "dataset_version": "provider-release.v1",
        "base_cases": len(cases),
        "repetitions": repetitions,
        "executions": executions,
        "results": results,
        "summary": {
            "status": "PASS" if passed else "FAIL",
            "provider_calls": provider_calls,
            "classification_and_dag_rate": round(classification_rate, 4),
            "slot_exactness_rate": round(slot_rate, 4),
            "risk_and_gate_rate": round(risk_passed / executions, 4),
            "p95_ms": p95,
            "fallback_rate": round((executions - provider_calls) / executions, 4),
        },
        "privacy": "Aggregate metrics and synthetic case IDs only; no prompts, provider bodies, responses, tokens, internal facts, or reasoning.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent-url", default=os.getenv("E2E_AGENT_URL", "http://localhost:8100"))
    parser.add_argument("--repetitions", type=int, default=2)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    token = os.getenv("E2E_INTERNAL_SERVICE_TOKEN")
    if not token:
        print("Set E2E_INTERNAL_SERVICE_TOKEN in the private process environment.")
        return 2
    try:
        artifact = run(args.agent_url.rstrip("/"), token, args.repetitions)
    except (RuntimeError, ValueError) as error:
        print(str(error))
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Sanitized provider release artifact written to {args.output}")
    return 0 if artifact["summary"]["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
