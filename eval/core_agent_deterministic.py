"""Aggregate-only deterministic Core Agent compatibility benchmark.

The runner reads the checked-in synthetic frozen cases and prints no prompts,
provider bodies, internal identifiers, or chain-of-thought. It is a fallback
compatibility baseline, not a substitute for the provider release set.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
AGENT_ROOT = ROOT / "apps" / "agent-service"
sys.path.insert(0, str(AGENT_ROOT))

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("SERVICE_PORT", "8100")
os.environ.setdefault(
    "DATABASE_URL", "postgresql://deterministic:deterministic@localhost/test"
)
os.environ.setdefault("INTERNAL_SERVICE_TOKEN", "deterministic-test-token")
os.environ.setdefault("AGENT_MODEL_MODE", "deterministic")
os.environ.setdefault("AGENT_PERSISTENCE_MODE", "memory")

from src.agents.assistant_graph import _typed_pipeline_result, deterministic_plan  # noqa: E402

EXPECTED_DOMAINS = {
    "search_food": "food",
    "restaurant.search": "restaurant",
    "healthcare.list_departments": "healthcare",
    "healthcare.list_slots": "healthcare",
    "ride.quote.create": "ride",
}


def _observed_tool(message: str) -> tuple[str, str | None, float]:
    started = time.perf_counter()
    decision = _typed_pipeline_result(
        deterministic_plan(message), {}, "deterministic"
    )["planning_decision"]
    latency_ms = (time.perf_counter() - started) * 1000
    steps = [
        step
        for task in decision["tasks"]
        for step in task["steps"]
        if step.get("capability")
    ]
    capability = steps[0]["capability"] if steps else "assistant.chat"
    domain = decision["tasks"][0]["domain"] if decision["tasks"] else None
    return capability, domain, latency_ms


def evaluate() -> dict[str, Any]:
    total = 0
    tool_exact = 0
    domain_total = 0
    domain_correct = 0
    latencies: list[float] = []
    by_file: dict[str, dict[str, int]] = {}

    for path in sorted((ROOT / "eval" / "eval_data").glob("*_cases.json")):
        cases = json.loads(path.read_text(encoding="utf-8"))
        correct = 0
        for case in cases:
            actual_tool, actual_domain, latency_ms = _observed_tool(case["input"])
            expected_tool = case["expected_output"]["expected_tool"]
            expected_domain = EXPECTED_DOMAINS.get(expected_tool)
            total += 1
            latencies.append(latency_ms)
            if actual_tool == expected_tool:
                tool_exact += 1
                correct += 1
            if expected_domain is not None:
                domain_total += 1
                if actual_domain == expected_domain:
                    domain_correct += 1
        by_file[path.stem] = {"correct": correct, "cases": len(cases)}

    if total == 0:
        raise RuntimeError("No frozen Core Agent evaluation cases were found.")
    latencies.sort()
    p95_index = max(0, int(len(latencies) * 0.95) - 1)
    return {
        "dataset": "eval/eval_data/*_cases.json",
        "dataset_cases": total,
        "mode": "deterministic",
        "tool_exact": tool_exact,
        "tool_exact_rate": round(tool_exact / total, 4),
        "domain_cases": domain_total,
        "domain_correct": domain_correct,
        "domain_rate": round(domain_correct / domain_total, 4),
        "planner_p95_ms": round(latencies[p95_index], 3),
        "by_file": by_file,
        "limitations": [
            "Legacy expected-tool labels are a compatibility inventory, not a provider semantic score.",
            "No provider call, live service dispatch, or slot-exactness score is included.",
        ],
    }


if __name__ == "__main__":
    print(json.dumps(evaluate(), ensure_ascii=True, sort_keys=True))
