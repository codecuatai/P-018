from __future__ import annotations

from typing import Any

from .intent import plain


def resolve_options(
    option_groups: list[dict[str, Any]], preferences: list[dict[str, Any]]
) -> tuple[list[dict[str, str]], list[str]]:
    selected: list[dict[str, str]] = []
    unresolved = list(preferences)
    for group in option_groups:
        options = list(group.get("options", []))
        for preference in list(unresolved):
            concept = plain(str(preference.get("concept", "")))
            value = plain(str(preference.get("value", "")))
            group_text = plain(str(group.get("name", "")))
            option = next(
                (
                    item
                    for item in options
                    if value == plain(str(item.get("name", ""))).strip()
                    and (not concept or concept == group_text.strip())
                ),
                None,
            )
            if option:
                selected.append({"group_id": str(group["id"]), "option_id": str(option["id"])})
                unresolved.remove(preference)
                break
    missing_required = [
        str(group.get("name", "option"))
        for group in option_groups
        if group.get("required") and not any(item["group_id"] == str(group.get("id")) for item in selected)
    ]
    missing = [str(item.get("value", "option")) for item in unresolved] + missing_required
    return selected, missing
