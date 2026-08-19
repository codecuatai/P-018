"""Opt-in, real-runtime Langfuse evaluation for Agent tool proposals.

This is deliberately not part of the default unit-test suite. It calls a
running Agent service and may call Gemini/Gateway dependencies. Enable it with
``RUN_LANGFUSE_EVAL=1`` after seeding the dataset and configuring Langfuse:

    $env:RUN_LANGFUSE_EVAL = "1"
    pytest tests/test_langfuse_eval.py -v

The test records only a synthetic case id and safe score metadata in traces;
it does not put the user input, model output, provider payload, or PII into
Langfuse telemetry.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import httpx
import pytest

try:
    from langfuse import Langfuse
except ImportError as exc:  # pragma: no cover - dependency is declared by Agent.
    pytest.skip(f"Langfuse SDK is not installed: {type(exc).__name__}", allow_module_level=True)


DATASET_NAME = "agent_tool_eval_dataset"
RUN_NAME = os.getenv("LANGFUSE_EVAL_RUN_NAME", "agent-tool-accuracy")
BASE_URL = os.getenv("AGENT_EVAL_BASE_URL", "http://localhost:8001").rstrip("/")
TIMEOUT_SECONDS = float(os.getenv("AGENT_EVAL_TIMEOUT_SECONDS", "90"))


def _require_opt_in() -> None:
    if os.getenv("RUN_LANGFUSE_EVAL", "").lower() not in {"1", "true", "yes"}:
        pytest.skip(
            "Set RUN_LANGFUSE_EVAL=1 to run the real Agent/Langfuse evaluation.",
            allow_module_level=True,
        )
    if not os.getenv("LANGFUSE_PUBLIC_KEY") or not os.getenv("LANGFUSE_SECRET_KEY"):
        pytest.skip(
            "LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are required.",
            allow_module_level=True,
        )
    if not os.getenv("INTERNAL_SERVICE_TOKEN"):
        pytest.skip("INTERNAL_SERVICE_TOKEN is required for the Agent API.", allow_module_level=True)


def _load_items() -> list[Any]:
    _require_opt_in()
    client = Langfuse()
    dataset = client.get_dataset(DATASET_NAME)
    if not dataset.items:
        pytest.skip(
            f"Langfuse dataset {DATASET_NAME!r} has no items; run seed_eval_dataset.py first.",
            allow_module_level=True,
        )
    return dataset.items


# Pytest parameterization happens at collection time, so dataset loading is
# intentionally isolated here and is skipped unless the integration run is
# explicitly enabled.
DATASET_ITEMS = _load_items()


@pytest.fixture(scope="module")
def langfuse_client() -> Langfuse:
    """Create the client used for dataset-run linkage and scoring."""

    return Langfuse()


@pytest.fixture(scope="module")
def dataset(langfuse_client: Langfuse) -> Any:
    """Fetch the current dataset as a visible pytest fixture for diagnostics."""

    return langfuse_client.get_dataset(DATASET_NAME)


def _request_payload(item: Any) -> tuple[str, dict[str, Any], dict[str, str]]:
    metadata = item.metadata if isinstance(item.metadata, dict) else {}
    endpoint = str(metadata.get("endpoint", "/api/v1/healthcare-chat"))
    payload: dict[str, Any] = {"message": str(item.input)}

    if endpoint == "/api/v1/chat":
        payload.update(
            {
                "conversation_id": str(metadata.get("conversation_id", f"eval-{item.id}")),
                "user_id": str(metadata.get("user_id", "eval-actor")),
                "correlation_id": str(metadata.get("correlation_id", f"corr-{item.id}")),
                "workflow_context": metadata.get("workflow_context", {}),
            }
        )
    elif endpoint == "/api/v1/assistant-chat":
        payload.update(
            {
                "conversation_id": str(metadata.get("conversation_id", f"eval-{item.id}")),
                "user_id": str(metadata.get("user_id", "eval-actor")),
                "correlation_id": str(metadata.get("correlation_id", f"corr-{item.id}")),
                "mode": "plan",
            }
        )
    else:
        payload.update(
            {
                "workflow_id": str(metadata.get("workflow_id", f"eval-{item.id}")),
                "context": metadata.get("context", {}),
            }
        )

    headers = {
        "X-Internal-Service-Token": os.environ["INTERNAL_SERVICE_TOKEN"],
    }
    # /chat and /assistant-chat require X-Actor-Id to match user_id. Older
    # dataset items may only contain user_id, so derive the header safely from
    # that synthetic evaluation identity when actor_id is absent.
    actor_id = metadata.get("actor_id") or payload.get("user_id")
    if actor_id:
        headers["X-Actor-Id"] = str(actor_id)
    return endpoint, payload, headers


def _extract_tool_proposal(payload: Any) -> tuple[str | None, dict[str, Any]]:
    """Normalize the Agent's route-specific response into tool + arguments."""

    if not isinstance(payload, dict):
        return None, {}
    data = payload.get("data", payload)
    if not isinstance(data, dict):
        return None, {}

    request = data.get("tool_request")
    if isinstance(request, dict):
        return request.get("tool_name"), request.get("arguments", {}) if isinstance(request.get("arguments", {}), dict) else {}

    # Food intentionally returns only a sanitized call summary in meta.
    meta = data.get("meta")
    calls = meta.get("tool_calls") if isinstance(meta, dict) else None
    if isinstance(calls, list) and calls and isinstance(calls[0], dict):
        call = calls[0]
        return str(call.get("name")) if call.get("name") else None, {}
    return None, {}


def _assert_expected_tool(payload: Any, expected_output: dict[str, Any]) -> None:
    actual_tool, actual_parameters = _extract_tool_proposal(payload)
    expected_tool = expected_output.get("expected_tool")
    assert actual_tool == expected_tool, f"tool mismatch: expected={expected_tool!r} actual={actual_tool!r}"

    expected_parameters = expected_output.get("expected_parameters", {})
    assert isinstance(expected_parameters, dict)
    for key in expected_parameters:
        assert key in actual_parameters, f"missing parameter key: {key}"


def _send_score(client: Langfuse, *, trace_id: str | None, value: float, case_id: str, comment: str) -> None:
    """Send a score across Langfuse SDK generations and never log secrets."""

    kwargs = {
        "name": "tool_accuracy",
        "value": value,
        "trace_id": trace_id,
        "metadata": {"case_id": case_id},
        "comment": comment[:200],
    }
    score_method = getattr(client, "score", None)
    if callable(score_method):
        score_method(**kwargs)
    else:
        # Langfuse Python SDK v3 renamed the public method to create_score.
        client.create_score(**kwargs)


@contextmanager
def _item_trace(item: Any, client: Langfuse, case_id: str) -> Iterator[str | None]:
    """Link a request to its dataset item, with a safe trace fallback."""

    try:
        # Langfuse v3 exposes DatasetItemClient.run; older examples mention
        # get_langchain_handler, but this direct span works for any HTTP Agent.
        run_context = item.run(run_name=RUN_NAME, run_metadata={"case_id": case_id})
        span = run_context.__enter__()
    except Exception:
        # If dataset-run linking is unavailable, preserve evaluation telemetry
        # with an evaluator span rather than hiding the actual test result.
        with client.start_as_current_observation(
            as_type="evaluator",
            name="agent-tool-evaluation",
            metadata={"case_id": case_id, "dataset": DATASET_NAME},
        ) as observation:
            yield getattr(observation, "trace_id", None)
        return

    try:
        yield getattr(span, "trace_id", None)
    finally:
        # The request exception is scored explicitly by the test; do not pass
        # raw exception values into the telemetry SDK.
        run_context.__exit__(None, None, None)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "item",
    DATASET_ITEMS,
    ids=lambda item: str(
        item.metadata.get("case_id", item.id)
        if isinstance(item.metadata, dict)
        else getattr(item, "id", "dataset-item")
    ),
)
async def test_agent_tool_proposal_accuracy(item: Any, langfuse_client: Langfuse, dataset: Any) -> None:
    """Call the real Agent API and score tool name/parameter-key accuracy."""

    del dataset  # The fixture documents and verifies dataset availability.
    metadata = item.metadata if isinstance(item.metadata, dict) else {}
    case_id = str(metadata.get("case_id", item.id))
    expected_output = item.expected_output if isinstance(item.expected_output, dict) else {}
    endpoint, payload, headers = _request_payload(item)

    with _item_trace(item, langfuse_client, case_id) as trace_id:
        try:
            async with httpx.AsyncClient(base_url=BASE_URL, timeout=TIMEOUT_SECONDS) as http_client:
                response = await http_client.post(endpoint, json=payload, headers=headers)
            response.raise_for_status()
            _assert_expected_tool(response.json(), expected_output)
        except AssertionError as exc:
            _send_score(
                langfuse_client,
                trace_id=trace_id,
                value=0.0,
                case_id=case_id,
                comment=f"assertion_failed:{type(exc).__name__}",
            )
            langfuse_client.flush()
            raise
        except Exception as exc:
            _send_score(
                langfuse_client,
                trace_id=trace_id,
                value=0.0,
                case_id=case_id,
                comment=f"execution_failed:{type(exc).__name__}",
            )
            langfuse_client.flush()
            raise
        else:
            _send_score(
                langfuse_client,
                trace_id=trace_id,
                value=1.0,
                case_id=case_id,
                comment="tool_name_and_required_parameter_keys_match",
            )
            langfuse_client.flush()