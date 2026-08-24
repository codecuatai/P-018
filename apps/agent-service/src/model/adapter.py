from typing import Any, Protocol


class ModelAdapter(Protocol):
    async def extract(self, message: str, workflow: dict[str, Any]) -> dict[str, Any]:
        """Return validated intent and slot patch data."""

    async def compose(
        self, message: str, tasks: list[dict[str, Any]], authoritative_results: list[dict[str, Any]]
    ) -> str:
        """Return a composed safe message based on the authoritative context."""
