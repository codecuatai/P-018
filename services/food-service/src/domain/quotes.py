from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any

from src.domain.policies import DeliveryConfig, DomainError, calculate_discount, quote_multi_pickup_delivery


def price_item(item: dict[str, Any], selected_options: list[dict[str, Any]]) -> tuple[int, list[dict[str, Any]]]:
    groups = {str(group["id"]): group for group in item.get("option_groups", [])}
    selected_by_group: dict[str, list[str]] = {}
    for option in selected_options:
        group_id = str(option["group_id"])
        option_id = str(option["option_id"])
        selected_by_group.setdefault(group_id, [])
        if option_id in selected_by_group[group_id]:
            raise DomainError("INVALID_OPTION", "Tùy chọn chỉ được chọn một lần trong cùng một nhóm.")
        selected_by_group[group_id].append(option_id)

    for group in groups.values():
        group_id = str(group["id"])
        min_select = int(group.get("min_select", 1 if group.get("required") else 0))
        max_select = int(group.get("max_select", 1))
        selected_count = len(selected_by_group.get(group_id, []))
        if selected_count < min_select:
            raise DomainError("INVALID_OPTION", f"Vui lòng chọn {group['name']}.")
        if selected_count > max_select:
            raise DomainError("INVALID_OPTION", f"Chỉ được chọn tối đa {max_select} tùy chọn trong {group['name']}.")

    normalized: list[dict[str, Any]] = []
    extra = 0
    for group_id, option_ids in selected_by_group.items():
        group = groups.get(group_id)
        if group is None:
            raise DomainError("INVALID_OPTION", "Nhóm tùy chọn không hợp lệ.")
        for option_id in option_ids:
            option = next((candidate for candidate in group["options"] if str(candidate["id"]) == option_id), None)
            if option is None:
                raise DomainError("INVALID_OPTION", "Tùy chọn không hợp lệ.")
            extra += int(option["price"])
            normalized.append(
                {
                    "group_id": group_id,
                    "group_name": group["name"],
                    "option_id": option_id,
                    "option_name": option["name"],
                    "price": int(option["price"]),
                }
            )
    return int(item["price"]) + extra, normalized


def build_authoritative_quote(
    cart: dict[str, Any],
    restaurants: dict[str, Any] | dict[str, dict[str, Any]],
    menu_items: dict[str, dict[str, Any]],
    voucher: dict[str, Any] | None,
    address: dict[str, Any],
    delivery_config: DeliveryConfig,
    now: datetime | None = None,
) -> dict[str, Any]:
    if not cart.get("items"):
        raise DomainError("CART_EMPTY", "Giỏ hàng đang trống.")

    restaurant_map = (
        {str(restaurants["id"]): restaurants}
        if "id" in restaurants
        else {str(key): value for key, value in restaurants.items() if isinstance(value, dict)}
    )

    current_items: list[dict[str, Any]] = []
    subtotal = 0
    pickup_stops: list[dict[str, Any]] = []
    pickup_ids: set[str] = set()
    for cart_item in cart["items"]:
        item_id = str(cart_item["menu_item_id"])
        item = menu_items.get(item_id)
        restaurant_id = str(item.get("restaurant_id", "")) if item else ""
        restaurant = restaurant_map.get(restaurant_id)
        if item is None or restaurant is None:
            raise DomainError("NOT_FOUND", "Không tìm thấy nhà hàng hoặc món ăn trong giỏ.")
        if not restaurant.get("is_open", False):
            raise DomainError("RESTAURANT_CLOSED", "Một nhà hàng trong đơn hiện đã đóng cửa.")
        if not item.get("available", False):
            raise DomainError("MENU_ITEM_UNAVAILABLE", "Món ăn hiện không phục vụ.")
        unit_price, options = price_item(
            item,
            [
                {"group_id": option["group_id"], "option_id": option["option_id"]}
                for option in cart_item.get("selected_options", [])
            ],
        )
        normalized_item = {
            "id": cart_item["id"],
            "menu_item_id": item["id"],
            "name": item["name"],
            "unit_price": unit_price,
            "base_price": int(item["price"]),
            "quantity": int(cart_item["quantity"]),
            "selected_options": options,
            "note": cart_item.get("note"),
            "restaurant": restaurant,
        }
        current_items.append(normalized_item)
        subtotal += unit_price * int(cart_item["quantity"])
        if restaurant_id not in pickup_ids:
            pickup_ids.add(restaurant_id)
            pickup_stops.append(restaurant)

    current_voucher = voucher
    voucher_display = (
        {key: value for key, value in current_voucher.items() if key not in {"used_count", "usage_limit"}}
        if current_voucher
        else None
    )
    discount = calculate_discount(current_voucher, subtotal, now or datetime.now(UTC)) if current_voucher else 0
    if (
        current_voucher
        and current_voucher.get("restaurant_id")
        and any(current_voucher["restaurant_id"] != restaurant["id"] for restaurant in pickup_stops)
    ):
        raise DomainError("VOUCHER_NOT_APPLICABLE", "Voucher không áp dụng cho nhà hàng này.")
    delivery = {
        "restaurant": pickup_stops[0],
        "address": address,
        **quote_multi_pickup_delivery(pickup_stops, address, delivery_config),
    }
    total = max(subtotal - discount, 0) + int(delivery["fee"]["amount"])
    payload: dict[str, Any] = {
        "cart_id": cart["id"],
        "cart_version": int(cart.get("version", 0)),
        "restaurant_id": cart["restaurant_id"],
        "restaurants": pickup_stops,
        "items": current_items,
        "subtotal": subtotal,
        "voucher": voucher_display,
        "voucher_code": current_voucher.get("code") if current_voucher else None,
        "discount": discount,
        "delivery": delivery,
        "total": {"amount": total, "currency": "VND"},
        "address": address,
        "cancellation_policy": {"allowed": True},
        "payment_methods": ["bank_transfer", "card", "e_wallet"],
        "quote_version": "food-quote-v3",
    }
    payload["cancellation_policy"] = {
        "allowed": True,
        "refund_amount_percent": 100,
        "reason": "Trước khi món bắt đầu được chuẩn bị",
        "policy_version": "food-cancel-v1",
    }
    # The order confirmation must bind the commercial terms, not import-only
    # catalog metadata.  The PostgreSQL write path re-reads the authoritative
    # catalog while the preview path returns its public DTO; hashing either
    # full record made an unchanged cart look stale when provenance differed.
    # Keep every material routing, address, item, price and discount term in
    # the fingerprint so a real change still invalidates confirmation.
    hash_payload = {
        "cart_id": payload["cart_id"],
        "cart_version": payload["cart_version"],
        "restaurant_id": payload["restaurant_id"],
        "pickup_stop_ids": [str(stop["id"]) for stop in pickup_stops],
        "items": [
            {
                "id": item["id"],
                "menu_item_id": item["menu_item_id"],
                "restaurant_id": item["restaurant"]["id"],
                "unit_price": item["unit_price"],
                "base_price": item["base_price"],
                "quantity": item["quantity"],
                "selected_options": item["selected_options"],
                "note": item["note"],
            }
            for item in current_items
        ],
        "subtotal": subtotal,
        "voucher_code": payload["voucher_code"],
        "discount": discount,
        "delivery": {
            "pickup_stop_ids": [str(stop["id"]) for stop in pickup_stops],
            "distance_km": delivery.get("distance_km"),
            "distance_source": delivery.get("distance_source"),
            "fee": delivery["fee"],
            "breakdown": delivery["breakdown"],
            "eta_minutes": delivery["eta_minutes"],
        },
        "address": {
            "id": address.get("id"),
            "address": address.get("address"),
            "city": address.get("city"),
            "district": address.get("district"),
            "ward": address.get("ward"),
            "latitude": address.get("latitude"),
            "longitude": address.get("longitude"),
        },
        "total": payload["total"],
        "quote_version": payload["quote_version"],
    }
    payload["snapshot_hash"] = hashlib.sha256(
        json.dumps(hash_payload, ensure_ascii=False, sort_keys=True, default=str).encode()
    ).hexdigest()
    return payload
