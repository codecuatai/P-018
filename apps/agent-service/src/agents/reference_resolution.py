from __future__ import annotations

from typing import Any

from .intent import plain


def _match(candidates: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
    wanted = plain(query)
    return [
        candidate
        for candidate in candidates
        if wanted
        and (
            wanted in plain(str(candidate.get("name", candidate.get("label", ""))))
            or plain(str(candidate.get("name", candidate.get("label", "")))) in wanted
        )
    ]


def _is_generic_delivery_address(query: str) -> bool:
    """Keep a generic home preference from becoming an address selection."""
    return plain(query).strip() in {
        "home",
        "nha",
        "nha toi",
        "giao ve nha",
        "giao toi nha",
    }


def resolve_references(slots: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    resolved = dict(slots)
    restaurants = list(context.get("restaurant_candidates", []))
    items = list(context.get("menu_item_candidates", []))
    addresses = list(context.get("address_candidates", []))
    if resolved.get("menu_item_id") and resolved.get("dish_query"):
        current = next((item for item in items if item.get("id") == resolved["menu_item_id"]), None)
        if current and plain(str(resolved["dish_query"])) not in plain(str(current.get("name", ""))):
            resolved.pop("menu_item_id", None)
    if resolved.get("restaurant_alias") in {"first", "second"}:
        index = 0 if resolved["restaurant_alias"] == "first" else 1
        if len(restaurants) > index:
            resolved["restaurant_id"] = restaurants[index].get("id")
            resolved["restaurant_name"] = restaurants[index].get("name")
    if resolved.get("menu_item_alias") in {"first", "second"}:
        index = 0 if resolved["menu_item_alias"] == "first" else 1
        if len(items) > index:
            resolved["menu_item_id"] = items[index].get("id")
            resolved["menu_item_name"] = items[index].get("name")
            resolved["restaurant_id"] = resolved.get("restaurant_id") or items[index].get("restaurant_id")
    selection_index = resolved.get("selection_index")
    if isinstance(selection_index, int) and 0 <= selection_index < len(items):
        resolved["menu_item_id"] = items[selection_index].get("id")
        resolved["menu_item_name"] = items[selection_index].get("name")
        resolved["restaurant_id"] = resolved.get("restaurant_id") or items[selection_index].get("restaurant_id")
    if resolved.get("dish_query") and not resolved.get("menu_item_id"):
        matches = _match(items, str(resolved["dish_query"]))
        if len(matches) == 1:
            resolved["menu_item_id"] = matches[0].get("id")
            resolved["menu_item_name"] = matches[0].get("name")
            resolved["restaurant_id"] = resolved.get("restaurant_id") or matches[0].get("restaurant_id")
        elif len(matches) > 1:
            resolved["ambiguous_menu_items"] = matches
    if (
        resolved.get("address_query")
        and not resolved.get("address_id")
        and not _is_generic_delivery_address(str(resolved["address_query"]))
    ):
        matches = _match(addresses, str(resolved["address_query"]))
        if len(matches) == 1:
            resolved["address_id"] = matches[0].get("id")
            resolved["address_name"] = matches[0].get("label") or matches[0].get("name")
        elif len(matches) > 1:
            resolved["ambiguous_addresses"] = matches
    if resolved.get("order_alias") == "last":
        resolved["order_id"] = context.get("last_order_id")
    if resolved.get("cart_item_alias") == "second" and len(context.get("cart_items", [])) > 1:
        resolved["cart_item_id"] = context["cart_items"][1].get("id")
    return resolved
