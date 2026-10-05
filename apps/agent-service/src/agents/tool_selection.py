from __future__ import annotations

from typing import Any


def select_tools(intent: str, slots: dict[str, Any], registry: list[dict[str, Any]]) -> list[dict[str, Any]]:
    available = {str(item.get("name")) for item in registry}

    def call(name: str, arguments: dict[str, Any]) -> list[dict[str, Any]]:
        return [{"name": name, "arguments": arguments}] if not available or name in available else []

    if intent == "search_food":
        return call(
            "search_food",
            {
                "keyword": slots.get("dish_query", ""),
                **({"district": slots["district"]} if slots.get("district") else {}),
                **({"max_price": slots["max_price"]} if slots.get("max_price") else {}),
            },
        )
    if intent == "select_restaurant":
        # Once reference resolution has selected a restaurant, the next safe
        # read is its authoritative menu. Returning no tool here leaves the
        # Gateway's planned search_food step without a proposal and turns a
        # valid multi-turn selection into CORE_A_PROPOSAL_MISSING.
        if slots.get("restaurant_id"):
            return call("view_menu", {"restaurant_id": slots["restaurant_id"]})
        return call("search_food", {"keyword": slots.get("dish_query", "")})
    if intent == "select_menu_item":
        if slots.get("menu_item_id"):
            return call("view_menu_item", {"menu_item_id": slots["menu_item_id"]})
        return call("search_food", {"keyword": slots.get("dish_query", "")})
    if intent == "view_menu" and slots.get("restaurant_id"):
        return call("view_menu", {"restaurant_id": slots["restaurant_id"]})
    if intent == "create_cart" and slots.get("restaurant_id"):
        return call("create_cart", {"restaurant_id": slots["restaurant_id"]})
    if intent == "add_to_cart":
        if slots.get("cart_id") and slots.get("menu_item_id"):
            # Always re-read the authoritative item before adding it. This
            # keeps required options and current pricing in the Food domain,
            # including when the user selected a rendered candidate.
            return call("view_menu_item", {"menu_item_id": slots["menu_item_id"]})
        if slots.get("restaurant_id") and slots.get("menu_item_id"):
            return call("view_menu_item", {"menu_item_id": slots["menu_item_id"]})
        return call("search_food", {"keyword": slots.get("dish_query", "")})
    if intent == "list_addresses":
        return call("list_food_delivery_addresses", {"label": slots.get("address_query", "")})
    if intent == "quote_delivery" and slots.get("restaurant_id") and slots.get("address_id"):
        return call("quote_delivery", {"restaurant_id": slots["restaurant_id"], "address_id": slots["address_id"]})
    if intent == "preview_order" and slots.get("cart_id") and slots.get("address_id"):
        return call("preview_order", {"cart_id": slots["cart_id"], "address_id": slots["address_id"]})
    if intent == "place_order" and slots.get("cart_id") and slots.get("address_id"):
        return call("prepare_food_order_confirmation", {"cart_id": slots["cart_id"], "address_id": slots["address_id"]})
    if intent == "apply_voucher" and slots.get("cart_id") and slots.get("voucher_code"):
        return call("apply_voucher", {"cart_id": slots["cart_id"], "code": slots["voucher_code"]})
    if intent == "remove_voucher" and slots.get("cart_id"):
        return call("remove_food_voucher", {"cart_id": slots["cart_id"]})
    if intent == "update_cart" and slots.get("cart_id") and slots.get("cart_item_id") and slots.get("quantity"):
        return call(
            "update_food_cart_item",
            {"cart_id": slots["cart_id"], "cart_item_id": slots["cart_item_id"], "quantity": slots["quantity"]},
        )
    if intent == "remove_cart_item" and slots.get("cart_id") and slots.get("cart_item_id"):
        return call("remove_food_cart_item", {"cart_id": slots["cart_id"], "cart_item_id": slots["cart_item_id"]})
    if intent == "track_order" and slots.get("order_id"):
        return call("track_food_order", {"order_id": slots["order_id"]})
    if intent == "cancel_order" and slots.get("order_id"):
        return call("prepare_food_order_cancellation_confirmation", {"order_id": slots["order_id"]})
    return []
