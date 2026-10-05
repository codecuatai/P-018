"""Audit only metadata shape for the synthetic question sweep traces."""

from __future__ import annotations

import base64
import json
import os
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SAFE_METADATA_KEYS = {
    "schema_version",
    "correlation_id",
    "route",
    "mode",
    "app_env",
    "tracing_enabled",
    "status",
    "degraded",
    "accepted",
    "actor_assertion_valid",
    "decision_source",
    "interaction_mode",
    "workflow_relation",
    "contract_version",
    "capability_catalog_version",
    "replan_directive",
    "task_count",
    "task_index",
    "domain",
    "disposition",
    "dependency_count",
    "step_kinds",
    "capability_names",
    "risk_ceilings",
    "confirmation_gates",
    "clarification_required",
    "blocked_count",
    "discarded_count",
    "invocation",
    "response_schema",
    "prompt_template_name",
    "prompt_template_version",
    "fallback_used",
    "structured_output_fallback_used",
    "retry_count",
    "error_code",
    "phase",
    "latency_ms",
    "result_count",
    "capability_count",
}


def main() -> int:
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY", "")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY", "")
    base_url = os.getenv("LANGFUSE_BASE_URL", "").strip().strip('"').rstrip("/")
    if not public_key or not secret_key or not base_url:
        print("trace_audit=unavailable reason=credentials_missing")
        return 2

    auth = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()
    now = datetime.now(UTC)
    params: dict[str, str] = {
        "fields": "core,basic,io,metadata,trace_context,usage",
        "fromStartTime": (now - timedelta(hours=2)).isoformat(),
        "toStartTime": (now + timedelta(minutes=1)).isoformat(),
        "limit": "1000",
    }
    observations: list[dict[str, object]] = []
    while True:
        query = urlencode(params)
        request = Request(
            f"{base_url}/api/public/v2/observations?{query}",
            headers={"Authorization": f"Basic {auth}"},
        )
        with urlopen(request, timeout=30) as response:
            page = json.loads(response.read().decode("utf-8"))
        observations.extend(item for item in page.get("data", []) if isinstance(item, dict))
        cursor = page.get("meta", {}).get("cursor") if isinstance(page.get("meta"), dict) else None
        if not cursor:
            break
        params["cursor"] = str(cursor)

    roots = [
        row
        for row in observations
        if isinstance(row.get("metadata"), dict)
        and str(row["metadata"].get("correlation_id", "")).startswith("qsw-20261004-")
    ]
    trace_ids = {row.get("traceId") for row in roots if row.get("traceId")}
    selected = [row for row in observations if row.get("traceId") in trace_ids]
    root_observations = [row for row in selected if row.get("isRootObservation") is True]
    generations = [row for row in selected if row.get("type") == "GENERATION"]
    usage_observations = [row for row in generations if row.get("usageDetails") not in (None, {})]
    io_count = sum(
        row.get("input") not in (None, "", {}) or row.get("output") not in (None, "", {})
        for row in selected
    )
    user_id_count = sum(row.get("userId") not in (None, "") for row in selected)
    session_id_count = sum(row.get("sessionId") not in (None, "") for row in selected)
    identity_count = user_id_count + session_id_count
    unexpected_metadata = sorted(
        {
            str(key)
            for row in selected
            for key in (row.get("metadata") or {})
            if key not in SAFE_METADATA_KEYS
        }
    )
    artifact = {
        "schema_version": "1",
        "audit": "Core Agent Langfuse trace privacy",
        "date_utc": now.date().isoformat(),
        "observations": len(selected),
        "traces": len(trace_ids),
        "root_observations": len(root_observations),
        "generation_observations": len(generations),
        "generation_usage_observations": len(usage_observations),
        "observation_io_count": io_count,
        "identity_field_count": identity_count,
        "user_id_field_count": user_id_count,
        "session_id_field_count": session_id_count,
        "unexpected_metadata_keys": unexpected_metadata,
        "sample_observation_names": sorted({str(row.get("name", "")) for row in selected})[:20],
    }
    output = os.getenv("TRACE_AUDIT_OUTPUT", "/tmp/core-agent-trace-audit.json")
    with open(output, "w", encoding="utf-8") as file:
        json.dump(artifact, file, ensure_ascii=True, indent=2)
    print("trace_audit=" + json.dumps(artifact, ensure_ascii=True, sort_keys=True))
    print(f"trace_audit_output={output}")
    return 0 if selected and io_count == 0 and identity_count == 0 and not unexpected_metadata else 1


if __name__ == "__main__":
    raise SystemExit(main())
