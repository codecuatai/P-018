from __future__ import annotations

from typing import Any

from .intent import plain


def _exact_candidate(candidates: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
    wanted = plain(query).strip()
    if not wanted:
        return []
    return [
        candidate
        for candidate in candidates
        if any(
            plain(str(candidate.get(field, ""))).strip() == wanted
            for field in ("name", "label", "address")
        )
    ]


def resolve_references(slots: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    """Resolve typed model references to trusted candidates without phrase guessing."""
    resolved = dict(slots)
    restaurants = list(context.get("restaurant_candidates", []))
    items = list(context.get("menu_item_candidates", []))
    addresses = list(context.get("address_candidates", []))

    restaurant_aliases = {"first": 0, "second": 1}
    restaurant_alias = resolved.get("restaurant_alias")
    if restaurant_alias in restaurant_aliases:
        index = restaurant_aliases[restaurant_alias]
        if len(restaurants) > index:
            resolved["restaurant_id"] = restaurants[index].get("id")
            resolved["restaurant_name"] = restaurants[index].get("name")

    item_alias = resolved.get("menu_item_alias")
    if item_alias in restaurant_aliases:
        index = restaurant_aliases[item_alias]
        if len(items) > index:
            resolved["menu_item_id"] = items[index].get("id")
            resolved["menu_item_name"] = items[index].get("name")
            resolved["restaurant_id"] = resolved.get("restaurant_id") or items[index].get("restaurant_id")

    selection_index = resolved.get("selection_index")
    if isinstance(selection_index, int) and 0 <= selection_index < len(items):
        resolved["menu_item_id"] = items[selection_index].get("id")
        resolved["menu_item_name"] = items[selection_index].get("name")
        resolved["restaurant_id"] = resolved.get("restaurant_id") or items[selection_index].get("restaurant_id")

    # A typed dish name can select a candidate only when it exactly matches a
    # single item in the persisted menu snapshot. Never use fuzzy matching to
    # turn an order into a different item.
    dish_query = resolved.get("dish_query")
    if dish_query and not resolved.get("menu_item_id"):
        matches = _exact_candidate(items, str(dish_query))
        if len(matches) == 1:
            resolved["menu_item_id"] = matches[0].get("id")
            resolved["menu_item_name"] = matches[0].get("name")
            resolved["restaurant_id"] = resolved.get("restaurant_id") or matches[0].get("restaurant_id")

    # An address can be bound only after the LLM has interpreted the reference
    # and its normalized value exactly identifies one saved address.
    if resolved.get("address_query") and not resolved.get("address_id"):
        matches = _exact_candidate(addresses, str(resolved["address_query"]))
        if len(matches) == 1:
            resolved["address_id"] = matches[0].get("id")
            resolved["address_name"] = matches[0].get("label") or matches[0].get("name")
        elif len(matches) > 1:
            resolved["ambiguous_addresses"] = matches
    return resolved
