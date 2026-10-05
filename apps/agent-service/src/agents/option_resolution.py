from __future__ import annotations

from typing import Any

from .intent import plain


def resolve_options(
    option_groups: list[dict[str, Any]], preferences: list[dict[str, Any]]
) -> tuple[list[dict[str, str]], list[str]]:
    selected: list[dict[str, str]] = []
    unresolved = list(preferences)
    concept_aliases = {
        "size": {"size", "kich thuoc", "co"},
        "spice": {"spice", "do cay", "vi cay"},
    }
    for group in option_groups:
        options = list(group.get("options", []))
        for preference in list(unresolved):
            concept = plain(str(preference.get("concept", "")))
            value = plain(str(preference.get("value", "")))
            group_text = plain(str(group.get("name", "")))
            concepts = concept_aliases.get(concept, {concept})
            option = next(
                (
                    item
                    for item in options
                    if (
                        value == plain(str(item.get("name", ""))).strip()
                        or plain(str(item.get("name", ""))).strip().endswith(f" {value}")
                    )
                    and (not concept or any(alias in group_text for alias in concepts))
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
