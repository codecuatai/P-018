from __future__ import annotations

from hashlib import sha256


def make_tool_call_id(workflow_id: str, turn_id: str) -> str:
    """Build a deterministic tool-call id within the public contract limit."""
    raw = f"tc-{workflow_id}-{turn_id}"
    if len(raw) <= 100:
        return raw
    return f"tc-{sha256(raw.encode('utf-8')).hexdigest()}"
