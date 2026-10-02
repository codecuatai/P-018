from __future__ import annotations

from collections.abc import Mapping
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

BoundedCode = Annotated[
    str,
    Field(min_length=1, max_length=160, pattern=r"^[A-Za-z0-9_.:-]+$"),
]


def safe_code(value: Any, *, max_length: int = 160) -> str | None:
    """Project an external identifier to the bounded telemetry code alphabet."""

    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized or len(normalized) > max_length:
        return None
    if not all(character.isalnum() or character in "._:-" for character in normalized):
        return None
    return normalized


class SafeObservationMetadata(BaseModel):
    """The complete metadata surface allowed to leave Agent Service."""

    model_config = ConfigDict(extra="forbid", strict=True)

    schema_version: Literal["1"] = "1"
    correlation_id: BoundedCode | None = None
    route: Literal["assistant-chat"] | None = None
    mode: Literal["plan", "compose"] | None = None
    app_env: Literal["development", "production", "test"] | None = None
    tracing_enabled: bool | None = None
    status: Literal["started", "succeeded", "degraded", "failed"] | None = None
    degraded: bool | None = None
    accepted: bool | None = None
    actor_assertion_valid: bool | None = None
    decision_source: Literal["model", "deterministic"] | None = None
    interaction_mode: Literal["service", "chitchat", "advisory", "unsupported"] | None = None
    workflow_relation: Literal[
        "SINGLE_TASK",
        "INDEPENDENT_TASKS",
        "DEPENDENT_TASKS",
        "MIXED",
    ] | None = None
    contract_version: BoundedCode | None = None
    capability_catalog_version: BoundedCode | None = None
    replan_directive: BoundedCode | None = None
    task_count: int | None = Field(default=None, ge=0, le=4)
    task_index: int | None = Field(default=None, ge=0, le=3)
    domain: Literal["ride", "food", "restaurant", "healthcare"] | None = None
    disposition: Literal[
        "READY",
        "NEEDS_INFO",
        "WAITING",
        "BLOCKED",
        "FAILED",
        "COMPLETED",
    ] | None = None
    dependency_count: int | None = Field(default=None, ge=0, le=4)
    step_kinds: list[Literal["CAPABILITY", "WAIT_FOR_CONFIRMATION"]] = Field(
        default_factory=list,
        max_length=16,
    )
    capability_names: list[BoundedCode] = Field(default_factory=list, max_length=16)
    risk_ceilings: list[BoundedCode] = Field(default_factory=list, max_length=16)
    confirmation_gates: list[BoundedCode] = Field(default_factory=list, max_length=16)
    clarification_required: bool | None = None
    blocked_count: int | None = Field(default=None, ge=0, le=4)
    discarded_count: int | None = Field(default=None, ge=0, le=8)
    invocation: Literal["raw", "structured"] | None = None
    response_schema: BoundedCode | None = None
    prompt_template_name: BoundedCode | None = None
    prompt_template_version: BoundedCode | None = None
    fallback_used: bool | None = None
    structured_output_fallback_used: bool | None = None
    retry_count: int | None = Field(default=None, ge=0, le=10)
    error_code: BoundedCode | None = None
    phase: BoundedCode | None = None
    latency_ms: int | None = Field(default=None, ge=0)
    result_count: int | None = Field(default=None, ge=0, le=32)
    capability_count: int | None = Field(default=None, ge=0, le=16)


class GenerationUsage(BaseModel):
    """Numeric-only provider usage metadata."""

    model_config = ConfigDict(extra="forbid", strict=True)

    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    total_tokens: int | None = Field(default=None, ge=0)

    def as_langfuse(self) -> dict[str, int]:
        values = {
            "input": self.input_tokens,
            "output": self.output_tokens,
            "total": self.total_tokens,
        }
        return {key: value for key, value in values.items() if value is not None}


def _mapping(value: Any) -> Mapping[str, Any] | None:
    if isinstance(value, Mapping):
        return value
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        dumped = model_dump()
        return dumped if isinstance(dumped, Mapping) else None
    return None


def _non_negative_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value >= 0:
        return value
    return None


def _usage_candidates(value: Any) -> list[Mapping[str, Any]]:
    candidates: list[Mapping[str, Any]] = []
    root = _mapping(value)
    raw = root.get("raw") if root is not None else getattr(value, "raw", None)
    for item in (value, raw):
        mapped = _mapping(item)
        if mapped is not None:
            candidates.append(mapped)
        for attribute in ("usage_metadata", "response_metadata"):
            nested = _mapping(
                mapped.get(attribute) if mapped is not None else getattr(item, attribute, None)
            )
            if nested is not None:
                candidates.append(nested)
                usage = _mapping(nested.get("usage_metadata"))
                if usage is not None:
                    candidates.append(usage)
    return candidates


def extract_generation_usage(value: Any) -> GenerationUsage | None:
    """Read only known numeric counters; never serialize provider content."""

    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    for candidate in _usage_candidates(value):
        if input_tokens is None:
            for key in ("input_tokens", "prompt_tokens", "prompt_token_count"):
                input_tokens = _non_negative_int(candidate.get(key))
                if input_tokens is not None:
                    break
        if output_tokens is None:
            for key in ("output_tokens", "completion_tokens", "candidates_token_count"):
                output_tokens = _non_negative_int(candidate.get(key))
                if output_tokens is not None:
                    break
        if total_tokens is None:
            for key in ("total_tokens", "total_token_count"):
                total_tokens = _non_negative_int(candidate.get(key))
                if total_tokens is not None:
                    break
    if input_tokens is None and output_tokens is None and total_tokens is None:
        return None
    if total_tokens is None and input_tokens is not None and output_tokens is not None:
        total_tokens = input_tokens + output_tokens
    return GenerationUsage(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
    )


def format_human_plan_output(
    decision: Any,
    assistant_message: str | None = None,
) -> dict[str, Any]:
    """Project an agent plan to non-content metadata for Langfuse."""
    decision_dict: Mapping[str, Any] = {}
    if isinstance(decision, Mapping):
        decision_dict = decision
    elif hasattr(decision, "model_dump") and callable(getattr(decision, "model_dump")):
        dumped = decision.model_dump()
        if isinstance(dumped, Mapping):
            decision_dict = dumped

    raw_tasks = decision_dict.get("tasks", [])
    tasks = raw_tasks if isinstance(raw_tasks, list) else []
    allowed_domains = {"ride", "food", "restaurant", "healthcare"}
    domains: set[str] = set()
    dependency_counts: list[int] = []
    for task in tasks[:4]:
        t_dict = _mapping(task) or {}
        domain = t_dict.get("domain")
        if domain in allowed_domains:
            domains.add(domain)
        depends_on = t_dict.get("depends_on", [])
        dependency_counts.append(min(len(depends_on), 4) if isinstance(depends_on, list) else 0)

    return {
        "interaction_mode": decision_dict.get("interaction_mode", "service"),
        "workflow_relation": decision_dict.get("workflow_relation", "SINGLE_TASK"),
        "tasks_count": min(len(tasks), 4),
        "domains": sorted(domains),
        "dependency_counts": dependency_counts,
    }

