from __future__ import annotations


def is_explicit_confirmation(resolved_confirmation: object) -> bool:
    """Accept only a typed confirmation decision from the planner or UI.

    Natural-language confirmation must be interpreted with conversation context by
    the LLM before reaching this policy boundary.
    """

    return resolved_confirmation is True
