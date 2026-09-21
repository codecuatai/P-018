from types import SimpleNamespace

import pytest
import src.services.observability as observability


def configured_settings() -> SimpleNamespace:
    return SimpleNamespace(
        langfuse_public_key="pk-test",
        langfuse_secret_key="sk-test",
        langfuse_base_url="https://cloud.langfuse.com",
    )


def test_langfuse_generation_is_noop_without_configuration() -> None:
    settings = SimpleNamespace()
    with observability.langfuse_generation(
        model_name="test-model",
        invocation="raw",
        settings=settings,
    ):
        pass


def test_langfuse_generation_records_safe_metadata_only(monkeypatch: pytest.MonkeyPatch) -> None:
    updates: list[dict[str, object]] = []

    class FakeObservation:
        def __enter__(self) -> "FakeObservation":
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def update(self, **values: object) -> None:
            updates.append(values)

    class FakeClient:
        def start_as_current_observation(self, **values: object) -> FakeObservation:
            updates.append({"start": values})
            return FakeObservation()

    monkeypatch.setattr(observability, "get_client", lambda: FakeClient())

    with observability.langfuse_generation(
        model_name="gemini-test",
        invocation="structured",
        schema_name="Decision",
        settings=configured_settings(),
    ):
        pass

    flattened = repr(updates)
    assert "secret prompt" not in flattened
    assert "secret result" not in flattened
    assert "gemini-test" in flattened
    assert "structured" in flattened
    assert "Decision" in flattened


def test_langfuse_generation_does_not_swallow_model_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeObservation:
        def __enter__(self) -> "FakeObservation":
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def update(self, **_values: object) -> None:
            return None

    class FakeClient:
        def start_as_current_observation(self, **_values: object) -> FakeObservation:
            return FakeObservation()

    monkeypatch.setattr(observability, "get_client", lambda: FakeClient())

    with pytest.raises(RuntimeError, match="provider failed"):
        with observability.langfuse_generation(
            model_name="gemini-test",
            invocation="raw",
            settings=configured_settings(),
        ):
            raise RuntimeError("provider failed")
