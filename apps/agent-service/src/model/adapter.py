from typing import Any, Protocol


class ModelAdapter(Protocol):
    async def extract(self, message: str, workflow: dict[str, Any]) -> dict[str, Any]:
        """Return validated intent and slot patch data."""
