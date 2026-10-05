from __future__ import annotations

import asyncio
import logging
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any, Literal

from langfuse import Langfuse, propagate_attributes
from langfuse.types import (
    MaskOtelSpansParams,
    MaskOtelSpansResult,
    OtelSpanPatch,
)
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider

from src.observability.contracts import GenerationUsage, SafeObservationMetadata

logger = logging.getLogger(__name__)

ObservationName = str
ObservationType = Literal[
    "span",
    "agent",
    "chain",
    "generation",
    "guardrail",
]


_FORBIDDEN_ATTRIBUTE_MARKERS = (
    "authorization",
    "cookie",
    "secret",
    "api_key",
    "password",
    "bearer",
    "token",
    "credential",
    "cvv",
    "card_number",
)


def mask_otel_spans(
    *,
    params: MaskOtelSpansParams,
) -> MaskOtelSpansResult | None:
    """Delete any secret credentials before they leave the process."""

    patches = {}
    for identifier, span in params.spans.items():
        forbidden = tuple(
            key
            for key in span.attributes
            if any(marker in key.casefold() for marker in _FORBIDDEN_ATTRIBUTE_MARKERS)
        )
        if forbidden:
            patches[identifier] = OtelSpanPatch(delete_attributes=forbidden)
    return MaskOtelSpansResult(span_patches=patches) if patches else None


def _only_langfuse_sdk_spans(span: ReadableSpan) -> bool:
    scope = getattr(span, "instrumentation_scope", None)
    return getattr(scope, "name", None) == "langfuse-sdk"


def _safe_model(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized or len(normalized) > 160:
        return None
    if not all(character.isalnum() or character in "._:/-" for character in normalized):
        return None
    return normalized


class ObservationHandle:
    def update(
        self,
        *,
        metadata: SafeObservationMetadata | dict[str, Any] | None = None,
        usage: GenerationUsage | None = None,
        model: str | None = None,
        input: Any = None,
        output: Any = None,
        level: str | None = None,
        status_message: str | None = None,
    ) -> None:
        return None


class _LangfuseObservationHandle(ObservationHandle):
    def __init__(self, observation: Any) -> None:
        self._observation = observation

    def update(
        self,
        *,
        metadata: SafeObservationMetadata | dict[str, Any] | None = None,
        usage: GenerationUsage | None = None,
        model: str | None = None,
        input: Any = None,
        output: Any = None,
        level: str | None = None,
        status_message: str | None = None,
    ) -> None:
        update: dict[str, Any] = {}
        if metadata is not None:
            if hasattr(metadata, "model_dump") and callable(getattr(metadata, "model_dump")):
                update["metadata"] = metadata.model_dump(mode="json", exclude_none=True)
            elif isinstance(metadata, dict):
                update["metadata"] = metadata
        if usage is not None and usage.as_langfuse():
            update["usage_details"] = usage.as_langfuse()
        safe_model = _safe_model(model)
        if safe_model is not None:
            update["model"] = safe_model
        # Observation payloads may contain prompts, user messages, model
        # output, tool results, or PII. Langfuse is metadata-only by contract.
        if level is not None:
            update["level"] = level
        if status_message is not None:
            update["status_message"] = status_message
        if not update:
            return
        try:
            self._observation.update(**update)
        except Exception:
            return


class SafeTelemetry:
    enabled = False

    @contextmanager
    def observation(
        self,
        name: ObservationName,
        as_type: ObservationType,
        metadata: SafeObservationMetadata | dict[str, Any] | None = None,
        *,
        input: Any = None,
        output: Any = None,
        session_id: str | None = None,
        user_id: str | None = None,
        tags: list[str] | None = None,
        model: str | None = None,
        usage: GenerationUsage | None = None,
    ) -> Iterator[ObservationHandle]:
        yield ObservationHandle()

    def flush(self) -> None:
        return None

    def shutdown(self) -> None:
        return None


class LangfuseTelemetry(SafeTelemetry):
    enabled = True

    def __init__(self, *, public_key: str, secret_key: str, base_url: str, app_env: str) -> None:
        self._client = Langfuse(
            public_key=public_key,
            secret_key=secret_key,
            base_url=base_url,
            environment=app_env,
            tracing_enabled=True,
            tracer_provider=TracerProvider(),
            blocked_instrumentation_scopes=[
                "langchain",
                "langgraph",
                "opentelemetry.instrumentation.fastapi",
            ],
            should_export_span=_only_langfuse_sdk_spans,
            mask_otel_spans=mask_otel_spans,
        )

    @contextmanager
    def observation(
        self,
        name: ObservationName,
        as_type: ObservationType,
        metadata: SafeObservationMetadata | dict[str, Any] | None = None,
        *,
        input: Any = None,
        output: Any = None,
        session_id: str | None = None,
        user_id: str | None = None,
        tags: list[str] | None = None,
        model: str | None = None,
        usage: GenerationUsage | None = None,
    ) -> Iterator[ObservationHandle]:
        meta_dict: dict[str, Any] = {}
        version = "1"
        if metadata is not None:
            if hasattr(metadata, "model_dump") and callable(getattr(metadata, "model_dump")):
                meta_dict = metadata.model_dump(mode="json", exclude_none=True)
                version = str(getattr(metadata, "schema_version", "1"))
            elif isinstance(metadata, dict):
                meta_dict = metadata

        kwargs: dict[str, Any] = {
            "name": name,
            "as_type": as_type,
            "metadata": meta_dict,
            "version": version,
        }
        # Never export observation input/output, even if a caller accidentally
        # supplies them. The telemetry adapter is the final privacy boundary.

        safe_model = _safe_model(model)
        if safe_model is not None:
            kwargs["model"] = safe_model
        if usage is not None and usage.as_langfuse():
            kwargs["usage_details"] = usage.as_langfuse()

        prop_kwargs: dict[str, Any] = {}
        # Actor and workflow identifiers must not become Langfuse identities.
        if tags is not None:
            prop_kwargs["tags"] = tags

        prop_cm = propagate_attributes(**prop_kwargs) if prop_kwargs else None
        if prop_cm is not None:
            try:
                prop_cm.__enter__()
            except Exception:
                prop_cm = None

        try:
            context = self._client.start_as_current_observation(**kwargs)
            observation = context.__enter__()
        except Exception:
            if prop_cm is not None:
                try:
                    prop_cm.__exit__(None, None, None)
                except Exception:
                    pass
            yield ObservationHandle()
            return

        try:
            yield _LangfuseObservationHandle(observation)
        finally:
            try:
                context.__exit__(None, None, None)
            except Exception:
                pass
            if prop_cm is not None:
                try:
                    prop_cm.__exit__(None, None, None)
                except Exception:
                    pass
            if as_type == "agent":
                self.flush()




    def flush(self) -> None:
        try:
            self._client.flush()
        except Exception:
            return

    def shutdown(self) -> None:
        try:
            self._client.shutdown()
        except Exception:
            return


_TELEMETRY: SafeTelemetry = SafeTelemetry()


def initialize_telemetry(settings: Any) -> SafeTelemetry:
    """Initialize once from typed process settings; tests stay network-free."""

    global _TELEMETRY
    if settings.app_env == "test" or not settings.langfuse_configured:
        _TELEMETRY = SafeTelemetry()
        return _TELEMETRY
    try:
        _TELEMETRY = LangfuseTelemetry(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            base_url=settings.langfuse_base_url,
            app_env=settings.app_env,
        )
    except Exception as error:
        # Telemetry is non-authoritative. Log only the exception class because
        # SDK error messages may include endpoint or credential material.
        logger.warning(
            "Langfuse telemetry initialization unavailable error_type=%s",
            type(error).__name__,
        )
        _TELEMETRY = SafeTelemetry()
    return _TELEMETRY


def get_telemetry() -> SafeTelemetry:
    return _TELEMETRY


async def shutdown_telemetry(timeout_seconds: float = 2.0) -> None:
    global _TELEMETRY
    telemetry = _TELEMETRY
    _TELEMETRY = SafeTelemetry()
    try:
        await asyncio.wait_for(asyncio.to_thread(telemetry.shutdown), timeout_seconds)
    except TimeoutError:
        return
