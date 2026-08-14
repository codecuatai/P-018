from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any

from src.domain.policies import DeliveryConfig, DomainError, calculate_discount, quote_delivery


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
            normalized.append({"group_id": group_id, "group_name": group["name"], "option_id": option_id, "option_name": option["name"], "price": int(option["price"])})
    return int(item["price"]) + extra, normalized


def build_authoritative_quote(
    cart: dict[str, Any],
    restaurant: dict[str, Any],
    menu_items: dict[str, dict[str, Any]],
    voucher: dict[str, Any] | None,
    address: dict[str, Any],
    delivery_config: DeliveryConfig,
    now: datetime | None = None,
) -> dict[str, Any]:
    if not restaurant.get("is_open", False):
        raise DomainError("RESTAURANT_CLOSED", "Nhà hàng hiện đã đóng cửa.")
    if not cart.get("items"):
        raise DomainError("CART_EMPTY", "Giỏ hàng đang trống.")

    current_items: list[dict[str, Any]] = []
    subtotal = 0
    for cart_item in cart["items"]:
        item_id = str(cart_item["menu_item_id"])
        item = menu_items.get(item_id)
        if item is None or item.get("restaurant_id") != cart["restaurant_id"]:
            raise DomainError("CROSS_RESTAURANT_CART", "Một giỏ hàng chỉ chứa món từ một nhà hàng.")
        if not item.get("available", False):
            raise DomainError("MENU_ITEM_UNAVAILABLE", "Món ăn hiện không phục vụ.")
        unit_price, options = price_item(item, [{"group_id": option["group_id"], "option_id": option["option_id"]} for option in cart_item.get("selected_options", [])])
        normalized_item = {"id": cart_item["id"], "menu_item_id": item["id"], "name": item["name"], "unit_price": unit_price, "base_price": int(item["price"]), "quantity": int(cart_item["quantity"]), "selected_options": options, "note": cart_item.get("note")}
        current_items.append(normalized_item)
        subtotal += unit_price * int(cart_item["quantity"])

    current_voucher = voucher
    voucher_display = {key: value for key, value in current_voucher.items() if key not in {"used_count", "usage_limit"}} if current_voucher else None
    discount = calculate_discount(current_voucher, subtotal, now or datetime.now(UTC)) if current_voucher else 0
    if current_voucher and current_voucher.get("restaurant_id") and current_voucher["restaurant_id"] != restaurant["id"]:
        raise DomainError("VOUCHER_NOT_APPLICABLE", "Voucher không áp dụng cho nhà hàng này.")
    delivery = {"restaurant": restaurant, "address": address, **quote_delivery(restaurant, address, delivery_config)}
    total = max(subtotal - discount, 0) + int(delivery["fee"]["amount"])
    payload: dict[str, Any] = {"cart_id": cart["id"], "cart_version": int(cart.get("version", 0)), "restaurant_id": cart["restaurant_id"], "items": current_items, "subtotal": subtotal, "voucher": voucher_display, "voucher_code": current_voucher.get("code") if current_voucher else None, "discount": discount, "delivery": delivery, "total": {"amount": total, "currency": "VND"}, "address": address, "cancellation_policy": {"allowed": True}, "payment_methods": ["bank_transfer", "card", "e_wallet"], "quote_version": "food-quote-v2"}
    payload["cancellation_policy"] = {"allowed": True, "refund_amount_percent": 100, "reason": "Trước khi món bắt đầu được chuẩn bị", "policy_version": "food-cancel-v1"}
    payload["snapshot_hash"] = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()
    return payload
