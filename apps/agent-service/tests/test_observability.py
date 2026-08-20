from __future__ import annotations

import json
import re
import subprocess
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from langfuse.types import (
    MaskOtelSpansParams,
    OtelSpanData,
    OtelSpanIdentifier,
)
from pydantic import ValidationError
from src.agents import assistant_graph
from src.observability.contracts import (
    GenerationUsage,
    SafeObservationMetadata,
    extract_generation_usage,
)
from src.observability.telemetry import (
    LangfuseTelemetry,
    ObservationHandle,
    SafeTelemetry,
    initialize_telemetry,
    mask_otel_spans,
)


class RecordingHandle(ObservationHandle):
    def __init__(self, events: list[dict[str, Any]], event: dict[str, Any]) -> None:
        self.events = events
        self.event = event

    def update(
        self,
        *,
        metadata: SafeObservationMetadata | None = None,
        usage: GenerationUsage | None = None,
        model: str | None = None,
    ) -> None:
        self.event.setdefault("updates", []).append(
            {
                "metadata": (
                    metadata.model_dump(mode="json", exclude_none=True)
                    if metadata is not None
                    else None
                ),
                "usage": usage.as_langfuse() if usage is not None else None,
                "model": model,
            }
        )


class RecordingTelemetry(SafeTelemetry):
    enabled = True

    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []

    @contextmanager
    def observation(
        self,
        name,
        as_type,
        metadata: SafeObservationMetadata,
        *,
        model: str | None = None,
        usage: GenerationUsage | None = None,
    ) -> Iterator[ObservationHandle]:
        event = {
            "name": name,
            "as_type": as_type,
            "metadata": metadata.model_dump(mode="json", exclude_none=True),
            "model": model,
            "usage": usage.as_langfuse() if usage is not None else None,
        }
        self.events.append(event)
        yield RecordingHandle(self.events, event)


def test_safe_metadata_rejects_arbitrary_payload_fields() -> None:
    with pytest.raises(ValidationError):
        SafeObservationMetadata.model_validate(
            {
                "status": "succeeded",
                "input": "must-not-leave-process",
            }
        )


def test_generation_usage_reads_only_known_numeric_counters() -> None:
    usage = extract_generation_usage(
        {
            "parsed": {"ignored": True},
            "raw": SimpleNamespace(
                usage_metadata={
                    "input_tokens": 12,
                    "output_tokens": 7,
                    "total_tokens": 19,
                    "content": "must-not-be-read",
                }
            ),
        }
    )

    assert usage == GenerationUsage(
        input_tokens=12,
        output_tokens=7,
        total_tokens=19,
    )


def test_export_mask_removes_forbidden_attributes() -> None:
    identifier = OtelSpanIdentifier(trace_id="0" * 32, span_id="1" * 16)
    result = mask_otel_spans(
        params=MaskOtelSpansParams(
            spans={
                identifier: OtelSpanData(
                    trace_id=identifier.trace_id,
                    span_id=identifier.span_id,
                    parent_span_id=None,
                    name="agent.core_a.run",
                    instrumentation_scope_name="langfuse-sdk",
                    instrumentation_scope_version="4.14.4",
                    attributes={
                        "langfuse.observation.input": "private",
                        "gen_ai.prompt.0.content": "private",
                        "langfuse.observation.metadata": "{}",
                    },
                    resource_attributes={},
                )
            }
        )
    )

    assert result is not None
    patch = result.span_patches[identifier]
    assert patch is not None
    assert set(patch.delete_attributes) == {
        "langfuse.observation.input",
        "gen_ai.prompt.0.content",
    }


def test_test_environment_never_initializes_a_network_client() -> None:
    telemetry = initialize_telemetry(
        SimpleNamespace(app_env="test", langfuse_configured=True)
    )

    assert telemetry.enabled is False


def test_langfuse_initialization_failure_degrades_to_noop(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    class FailingLangfuseTelemetry:
        def __init__(self, **_kwargs: Any) -> None:
            raise RuntimeError("sensitive-sdk-message-must-not-propagate")

    monkeypatch.setattr(
        "src.observability.telemetry.LangfuseTelemetry",
        FailingLangfuseTelemetry,
    )

    telemetry = initialize_telemetry(
        SimpleNamespace(
            app_env="development",
            langfuse_configured=True,
            langfuse_public_key="test-public",
            langfuse_secret_key="test-secret",
            langfuse_base_url="https://us.cloud.langfuse.com",
        )
    )

    assert telemetry.enabled is False
    assert "RuntimeError" in caplog.text
    assert "sensitive-sdk-message-must-not-propagate" not in caplog.text


def test_langfuse_adapter_never_sets_observation_input_or_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, Any]] = []
    updates: list[dict[str, Any]] = []

    class FakeObservation:
        def update(self, **kwargs: Any) -> None:
            updates.append(kwargs)

    class FakeContext:
        def __enter__(self) -> FakeObservation:
            return FakeObservation()

        def __exit__(self, *_args: Any) -> None:
            return None

    class FakeLangfuse:
        def __init__(self, **kwargs: Any) -> None:
            calls.append({"constructor": kwargs})

        def start_as_current_observation(self, **kwargs: Any) -> FakeContext:
            calls.append({"observation": kwargs})
            return FakeContext()

        def flush(self) -> None:
            return None

        def shutdown(self) -> None:
            return None

    monkeypatch.setattr(
        "src.observability.telemetry.Langfuse",
        FakeLangfuse,
    )
    telemetry = LangfuseTelemetry(
        public_key="test-public",
        secret_key="test-secret",
        base_url="https://us.cloud.langfuse.com",
        app_env="development",
    )

    with telemetry.observation(
        "model.generate.plan",
        "generation",
        SafeObservationMetadata(
            response_schema="AssistantPlan",
            status="started",
        ),
        model="test-model",
    ) as observation:
        observation.update(
            metadata=SafeObservationMetadata(
                response_schema="AssistantPlan",
                status="succeeded",
            ),
            usage=GenerationUsage(
                input_tokens=10,
                output_tokens=5,
                total_tokens=15,
            ),
        )

    observation_call = next(item["observation"] for item in calls if "observation" in item)
    assert {"input", "output", "prompt"}.isdisjoint(observation_call)
    assert {"input", "output", "prompt"}.isdisjoint(updates[0])
    serialized = json.dumps(
        {"calls": calls, "updates": updates},
        ensure_ascii=True,
        default=str,
    ).casefold()
    for forbidden in (
        "conversation_state",
        "authoritative_results",
        "semantic_arguments",
        "user_profile",
    ):
        assert forbidden not in serialized


def test_core_a_emits_only_bounded_decision_flow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    telemetry = RecordingTelemetry()
    monkeypatch.setattr(assistant_graph, "get_telemetry", lambda: telemetry)
    plan = assistant_graph.deterministic_plan(
        "đặt xe máy từ Hồ Gươm đến Văn Miếu",
        {},
    )

    result = assistant_graph._typed_pipeline_result(
        plan,
        {"conversation_state": {}},
        "deterministic",
    )

    names = [event["name"] for event in telemetry.events]
    assert names[:2] == ["planner.route", "core_a.validate"]
    assert "core_a.task" in names
    assert result["planning_decision"]["contract_version"] == "core-a.v1"
    serialized = json.dumps(telemetry.events, ensure_ascii=True).casefold()
    for forbidden in (
        "prompt",
        "message",
        "query",
        "normalized_request",
        "semantic_slots",
        "authoritative_results",
    ):
        assert forbidden not in serialized


@pytest.mark.asyncio
async def test_model_generation_records_usage_without_content(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    telemetry = RecordingTelemetry()
    monkeypatch.setattr(assistant_graph, "get_telemetry", lambda: telemetry)

    class FakeModel:
        async def ainvoke_structured(self, _prompt: str, _schema):
            return {
                "parsed": assistant_graph.AssistantPlan(
                    assistant_message="ok",
                    tasks=[],
                    interaction_mode="chitchat",
                ),
                "raw": SimpleNamespace(
                    usage_metadata={
                        "input_tokens": 20,
                        "output_tokens": 4,
                        "total_tokens": 24,
                    }
                ),
            }

    parsed = await assistant_graph._invoke_structured(
        FakeModel(),
        "not-exported",
        assistant_graph.AssistantPlan,
        purpose="plan",
    )

    assert isinstance(parsed, assistant_graph.AssistantPlan)
    generation = next(
        event for event in telemetry.events if event["name"] == "model.generate.plan"
    )
    assert generation["updates"][0]["usage"] == {
        "input": 20,
        "output": 4,
        "total": 24,
    }
    assert "not-exported" not in json.dumps(telemetry.events, ensure_ascii=True)


def test_repository_has_no_tracked_langfuse_secret_or_trace_export() -> None:
    root = Path(__file__).resolve().parents[3]
    tracked = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=root,
        check=True,
        capture_output=True,
    ).stdout.decode("utf-8").split("\\0")
    secret_pattern = re.compile(b"sk" + b"-lf-" + b"[A-Za-z0-9_-]{16,}")
    findings: list[str] = []
    for relative in tracked:
        path = root / relative
        if not relative or not path.is_file():
            continue
        if secret_pattern.search(path.read_bytes()):
            findings.append(relative)

    assert findings == []
    assert not (root / "h.json").exists()
