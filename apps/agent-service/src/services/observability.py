from __future__ import annotations

from types import TracebackType
from typing import Any

from src.config import get_settings

try:
    from langfuse import get_client
except ImportError:  # pragma: no cover - production image installs the declared dependency.
    get_client = None  # type: ignore[assignment]


def langfuse_configured(settings: Any | None = None) -> bool:
    current = settings or get_settings()
    return bool(
        getattr(current, "langfuse_public_key", "")
        and getattr(current, "langfuse_secret_key", "")
    )


class SafeLangfuseGeneration:
    """Fail-open Langfuse generation metadata without prompt or output capture."""

    def __init__(
        self,
        *,
        name: str,
        model_name: str,
        invocation: str,
        schema_name: str | None = None,
        settings: Any | None = None,
    ) -> None:
        self.name = name
        self.model_name = model_name
        self.invocation = invocation
        self.schema_name = schema_name
        self.settings = settings or get_settings()
        self._context: Any | None = None
        self._observation: Any | None = None

    def __enter__(self) -> SafeLangfuseGeneration:
        if not langfuse_configured(self.settings) or get_client is None:
            return self
        try:
            client = get_client()
            self._context = client.start_as_current_observation(
                as_type="generation",
                name=self.name,
            )
            self._observation = self._context.__enter__()
            metadata = {"invocation": self.invocation, "status": "started"}
            if self.schema_name:
                metadata["schema"] = self.schema_name
            self._safe_update(model=self.model_name, metadata=metadata)
        except Exception:
            # Telemetry must never make the model path unavailable.
            self._context = None
            self._observation = None
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> bool:
        metadata = {"invocation": self.invocation, "status": "failed" if exc_type else "success"}
        if self.schema_name:
            metadata["schema"] = self.schema_name
        if exc_type:
            self._safe_update(
                level="ERROR",
                status_message=exc_type.__name__,
                metadata=metadata,
            )
        else:
            self._safe_update(metadata=metadata)
        if self._context is not None:
            try:
                # Do not pass the application exception to the SDK because its
                # message may contain provider payload or sensitive prompt data.
                self._context.__exit__(None, None, None)
            except Exception:
                pass
        return False

    def _safe_update(self, **values: Any) -> None:
        if self._observation is None:
            return
        try:
            self._observation.update(**values)
        except Exception:
            pass


def langfuse_generation(
    *,
    model_name: str,
    invocation: str,
    schema_name: str | None = None,
    settings: Any | None = None,
) -> SafeLangfuseGeneration:
    return SafeLangfuseGeneration(
        name=f"gemini.{invocation}",
        model_name=model_name,
        invocation=invocation,
        schema_name=schema_name,
        settings=settings,
    )


def flush_langfuse(settings: Any | None = None) -> None:
    current = settings or get_settings()
    if not langfuse_configured(current) or get_client is None:
        return
    try:
        get_client().flush()
    except Exception:
        # Shutdown and request handling must remain independent from telemetry.
        pass
