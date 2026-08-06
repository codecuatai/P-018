from __future__ import annotations

import hashlib
import json
import random
from datetime import UTC, datetime, timedelta
from typing import Any

from src.config import Settings
from src.domain.policies import (
    DeliveryConfig,
    DomainError,
    FoodOrderStatus,
    calculate_discount,
    cancellation_policy,
    quote_delivery,
)
from src.domain.quotes import build_authoritative_quote, price_item
from src.repositories.food import FoodRepository, ident


class FoodApplicationService:
    def __init__(self, repository: FoodRepository, settings: Settings, random_value: Any | None = None) -> None:
        self.repository = repository
        self.settings = settings
        self._random_value = random_value or random.random
        self.delivery_config = DeliveryConfig(
            base_fee=settings.delivery_base_fee,
            per_km_fee=settings.delivery_per_km_fee,
            minimum_fee=settings.delivery_minimum_fee,
            max_distance_km=settings.delivery_max_distance_km,
            long_distance_threshold_km=settings.delivery_long_distance_threshold_km,
            long_distance_surcharge=settings.delivery_long_distance_surcharge,
            eta_minutes=settings.delivery_eta_minutes,
        )

    def _delay(self, status: FoodOrderStatus) -> int:
        configured = self.settings.workflow_step_delay_ms
        if configured is not None:
            return configured
        return {
            FoodOrderStatus.RESTAURANT_CONFIRMING: self.settings.restaurant_confirm_delay_ms,
            FoodOrderStatus.RESTAURANT_ACCEPTED: self.settings.preparing_delay_ms,
            FoodOrderStatus.PREPARING: self.settings.ready_for_pickup_delay_ms,
            FoodOrderStatus.READY_FOR_PICKUP: self.settings.driver_assign_delay_ms,
            FoodOrderStatus.DRIVER_ASSIGNED: self.settings.pickup_delay_ms,
            FoodOrderStatus.PICKED_UP: self.settings.delivery_delay_ms,
            FoodOrderStatus.DELIVERING: self.settings.delivery_delay_ms,
        }.get(status, 0)

    async def search(self, **filters: Any) -> list[dict]:
        return await self.repository.search(**filters)

    async def restaurant(self, restaurant_id: str) -> dict:
        restaurant = await self.repository.get_restaurant(restaurant_id)
        if restaurant is None:
            raise DomainError("NOT_FOUND", "Không tìm thấy nhà hàng.")
        return restaurant

    async def menu(self, restaurant_id: str) -> dict:
        restaurant = await self.restaurant(restaurant_id)
        items = [result["item"] for result in await self.repository.search() if result["item"]["restaurant_id"] == restaurant_id]
        return {"restaurant": restaurant, "items": items}

    async def menu_item(self, item_id: str) -> dict:
        item = await self.repository.get_menu_item(item_id)
        if item is None:
            raise DomainError("NOT_FOUND", "Không tìm thấy món ăn.")
        return item

    async def create_cart(self, user_id: str, restaurant_id: str) -> dict:
        restaurant = await self.restaurant(restaurant_id)
        if not restaurant.get("is_open", False):
            raise DomainError("RESTAURANT_CLOSED", "Nhà hàng hiện đã đóng cửa.")
        cart = {"id": ident("cart"), "user_id": user_id, "restaurant_id": restaurant_id, "items": [], "voucher": None, "subtotal": 0, "discount": 0, "total": 0, "currency": "VND", "version": 0}
        return await self.repository.save_cart(cart)

    async def _price_item(self, item: dict, selected_options: list[dict]) -> tuple[int, list[dict]]:
        return price_item(item, selected_options)

    async def _recalculate(self, cart: dict, expected_version: int | None = None, persist: bool = True) -> dict:
        subtotal = sum(item["unit_price"] * item["quantity"] for item in cart["items"])
        discount = 0
        voucher_code = str((cart.get("voucher") or {}).get("code", "")) or None
        voucher = await self.repository.get_voucher(voucher_code) if voucher_code else None
        if voucher:
            if voucher.get("restaurant_id") and voucher["restaurant_id"] != cart["restaurant_id"]:
                raise DomainError("VOUCHER_NOT_APPLICABLE", "Voucher không áp dụng cho nhà hàng này.")
            discount = calculate_discount(voucher, subtotal, datetime.now(UTC))
        cart["subtotal"] = subtotal
        cart["discount"] = discount
        cart["total"] = max(subtotal - discount, 0)
        return await self.repository.save_cart(cart, expected_version) if persist else cart

    async def _cart(self, cart_id: str) -> dict:
        cart = await self.repository.get_cart(cart_id)
        if cart is None:
            raise DomainError("NOT_FOUND", "Không tìm thấy giỏ hàng.")
        return cart

    async def get_cart(self, cart_id: str, user_id: str | None = None) -> dict:
        cart = await self._cart(cart_id)
        if user_id is not None and cart["user_id"] != user_id:
            raise DomainError("FORBIDDEN", "Giỏ hàng không thuộc user hiện tại.")
        return await self._reprice_cart(cart, persist=False)

    async def add_item(self, cart_id: str, payload: dict, user_id: str | None = None) -> dict:
        cart = await self._cart(cart_id)
        if user_id is not None and cart["user_id"] != user_id:
            raise DomainError("FORBIDDEN", "Giỏ hàng không thuộc user hiện tại.")
        item = await self.menu_item(payload["menu_item_id"])
        if item["restaurant_id"] != cart["restaurant_id"]:
            raise DomainError("CROSS_RESTAURANT_CART", "Một giỏ hàng chỉ chứa món từ một nhà hàng.")
        if not item["available"]:
            raise DomainError("MENU_ITEM_UNAVAILABLE", "Món ăn hiện không phục vụ.")
        unit_price, normalized_options = await self._price_item(item, payload.get("selected_options", []))
        cart["items"].append({"id": ident("ci"), "menu_item_id": item["id"], "name": item["name"], "unit_price": unit_price, "base_price": item["price"], "quantity": payload["quantity"], "selected_options": normalized_options, "note": payload.get("note")})
        return await self._recalculate(cart, expected_version=int(cart.get("version", 0)))

    async def update_item(self, cart_id: str, item_id: str, payload: dict, user_id: str | None = None) -> dict:
        cart = await self._cart(cart_id)
        if user_id is not None and cart["user_id"] != user_id:
            raise DomainError("FORBIDDEN", "Giỏ hàng không thuộc user hiện tại.")
        cart_item = next((value for value in cart["items"] if value["id"] == item_id), None)
        if cart_item is None:
            raise DomainError("NOT_FOUND", "Không tìm thấy món trong giỏ hàng.")
        if payload.get("selected_options") is not None:
            item = await self.menu_item(cart_item["menu_item_id"])
            cart_item["unit_price"], cart_item["selected_options"] = await self._price_item(item, payload["selected_options"])
        cart_item["quantity"] = payload["quantity"]
        cart_item["note"] = payload.get("note")
        return await self._recalculate(cart, expected_version=int(cart.get("version", 0)))

    async def remove_item(self, cart_id: str, item_id: str, user_id: str | None = None) -> dict:
        cart = await self._cart(cart_id)
        if user_id is not None and cart["user_id"] != user_id:
            raise DomainError("FORBIDDEN", "Giỏ hàng không thuộc user hiện tại.")
        before = len(cart["items"])
        cart["items"] = [item for item in cart["items"] if item["id"] != item_id]
        if len(cart["items"]) == before:
            raise DomainError("NOT_FOUND", "Không tìm thấy món trong giỏ hàng.")
        return await self._recalculate(cart, expected_version=int(cart.get("version", 0)))

    async def apply_voucher(self, cart_id: str, code: str, user_id: str | None = None) -> dict:
        cart = await self._cart(cart_id)
        if user_id is not None and cart["user_id"] != user_id:
            raise DomainError("FORBIDDEN", "Giỏ hàng không thuộc user hiện tại.")
        voucher = await self.repository.get_voucher(code)
        if voucher is None:
            raise DomainError("VOUCHER_INVALID", "Voucher không hợp lệ.")
        if voucher.get("restaurant_id") and voucher["restaurant_id"] != cart["restaurant_id"]:
            raise DomainError("VOUCHER_NOT_APPLICABLE", "Voucher không áp dụng cho nhà hàng này.")
        cart["voucher"] = {"code": str(voucher["code"]).upper()}
        return await self._recalculate(cart, expected_version=int(cart.get("version", 0)))

    async def remove_voucher(self, cart_id: str, user_id: str | None = None) -> dict:
        cart = await self._cart(cart_id)
        if user_id is not None and cart["user_id"] != user_id:
            raise DomainError("FORBIDDEN", "Giỏ hàng không thuộc user hiện tại.")
        cart["voucher"] = None
        return await self._recalculate(cart, expected_version=int(cart.get("version", 0)))

    async def delivery_quote(self, restaurant_id: str, address_id: str) -> dict:
        restaurant = await self.restaurant(restaurant_id)
        address = await self.repository.get_address(address_id)
        if address is None:
            raise DomainError("NOT_FOUND", "Không tìm thấy địa chỉ giao hàng.")
        return {"restaurant": restaurant, "address": address, **quote_delivery(restaurant, address, self.delivery_config)}

    async def _reprice_cart(self, cart: dict, persist: bool = False) -> dict:
        restaurant = await self.restaurant(cart["restaurant_id"])
        if not restaurant.get("is_open", False):
            raise DomainError("RESTAURANT_CLOSED", "Nhà hàng hiện đã đóng cửa.")
        for cart_item in cart["items"]:
            item = await self.menu_item(cart_item["menu_item_id"])
            if item["restaurant_id"] != cart["restaurant_id"]:
                raise DomainError("CROSS_RESTAURANT_CART", "Một giỏ hàng chỉ chứa món từ một nhà hàng.")
            if not item.get("available", False):
                raise DomainError("MENU_ITEM_UNAVAILABLE", "Món ăn hiện không phục vụ.")
            unit_price, options = await self._price_item(item, [{"group_id": option["group_id"], "option_id": option["option_id"]} for option in cart_item.get("selected_options", [])])
            cart_item.update({"name": item["name"], "base_price": item["price"], "unit_price": unit_price, "selected_options": options})
        return await self._recalculate(cart, persist=persist, expected_version=int(cart.get("version", 0)) if persist else None)

    async def preview_order(self, cart_id: str, address_id: str, user_id: str) -> dict:
        cart = await self._cart(cart_id)
        if cart["user_id"] != user_id:
            raise DomainError("FORBIDDEN", "Giỏ hàng không thuộc user hiện tại.")
        if not cart["items"]:
            raise DomainError("CART_EMPTY", "Giỏ hàng đang trống.")
        address = await self.repository.get_address(address_id)
        if address is None or address.get("user_id") != user_id:
            raise DomainError("FORBIDDEN", "Địa chỉ giao hàng không thuộc user hiện tại.")
        restaurant = await self.restaurant(cart["restaurant_id"])
        items = {item["menu_item_id"]: await self.menu_item(item["menu_item_id"]) for item in cart["items"]}
        voucher_code = str((cart.get("voucher") or {}).get("code", "")) or None
        voucher = await self.repository.get_voucher(voucher_code) if voucher_code else None
        return build_authoritative_quote(cart, restaurant, items, voucher, address, self.delivery_config)

    async def create_order(self, payload: dict) -> dict:
        if "expected_snapshot_hash" not in payload:
            preview = await self.preview_order(payload["cart_id"], payload["address_id"], payload["user_id"])
            payload = {**payload, "expected_snapshot_hash": preview["snapshot_hash"], "expected_cart_version": preview["cart_version"], "expected_amount": preview["total"]["amount"], "expected_currency": preview["total"]["currency"], "expected_quote_version": preview["quote_version"]}
        expected = {"snapshot_hash": payload["expected_snapshot_hash"], "cart_version": payload["expected_cart_version"], "amount": payload["expected_amount"], "currency": payload["expected_currency"], "quote_version": payload["expected_quote_version"]}
        order = {"id": ident("ord"), "user_id": payload["user_id"], "cart_id": payload["cart_id"], "idempotency_key": payload["idempotency_key"], "payment_method": payload["payment_method"], "status": FoodOrderStatus.PAYMENT_PENDING.value, "workflow_scenario": "standard", "next_transition_at": None, "restaurant_decision": None, "workflow_completed_at": None, "version": 0, "timeline": [{"from_status": None, "to_status": FoodOrderStatus.PAYMENT_PENDING.value, "occurred_at": datetime.now(UTC).isoformat(), "reason": "Order created", "actor_type": "gateway"}]}
        return await self.repository.create_order_with_optional_voucher(order, None, expected, self.delivery_config, payload["address_id"])

    async def get_order(self, order_id: str, user_id: str | None = None) -> dict:
        order = await self.repository.get_order(order_id)
        if order is None:
            raise DomainError("NOT_FOUND", "Không tìm thấy đơn hàng.")
        if user_id is not None and order["user_id"] != user_id:
            raise DomainError("FORBIDDEN", "Đơn hàng không thuộc user hiện tại.")
        return order

    async def reconcile_due_orders(self) -> int:
        now = datetime.now(UTC)

        def decide(order: dict) -> tuple[FoodOrderStatus, str | None, datetime | None]:
            current = FoodOrderStatus(order["status"])
            if current == FoodOrderStatus.RESTAURANT_CONFIRMING:
                accepted = self._random_value() >= self.settings.restaurant_rejection_rate
                target = FoodOrderStatus.RESTAURANT_ACCEPTED if accepted else FoodOrderStatus.RESTAURANT_REJECTED
                decision = "accept" if accepted else "reject"
            else:
                target = {FoodOrderStatus.RESTAURANT_ACCEPTED: FoodOrderStatus.PREPARING, FoodOrderStatus.PREPARING: FoodOrderStatus.READY_FOR_PICKUP, FoodOrderStatus.READY_FOR_PICKUP: FoodOrderStatus.DRIVER_ASSIGNED, FoodOrderStatus.DRIVER_ASSIGNED: FoodOrderStatus.PICKED_UP, FoodOrderStatus.PICKED_UP: FoodOrderStatus.DELIVERING, FoodOrderStatus.DELIVERING: FoodOrderStatus.DELIVERED}.get(current)
                if target is None:
                    raise DomainError("INVALID_ORDER_TRANSITION", "Đơn hàng không có transition timed hợp lệ.")
                decision = None
            next_at = datetime.now(UTC) + timedelta(milliseconds=self._delay(target)) if target in {FoodOrderStatus.RESTAURANT_ACCEPTED, FoodOrderStatus.PREPARING, FoodOrderStatus.READY_FOR_PICKUP, FoodOrderStatus.DRIVER_ASSIGNED, FoodOrderStatus.PICKED_UP, FoodOrderStatus.DELIVERING} else None
            return target, decision, next_at

        return len(await self.repository.claim_and_advance_due_orders(now, 1, decide))

    async def transition_order(self, order_id: str, target: str, reason: str, operation_key: str | None = None) -> dict:
        order = await self.get_order(order_id)
        try:
            target_status = FoodOrderStatus(target)
        except ValueError as exc:
            raise DomainError("INVALID_ORDER_TRANSITION", "Trạng thái đích không hợp lệ.") from exc
        next_at = datetime.now(UTC) + timedelta(milliseconds=self._delay(target_status)) if target_status in {FoodOrderStatus.RESTAURANT_CONFIRMING, FoodOrderStatus.RESTAURANT_ACCEPTED, FoodOrderStatus.PREPARING, FoodOrderStatus.READY_FOR_PICKUP, FoodOrderStatus.DRIVER_ASSIGNED, FoodOrderStatus.PICKED_UP, FoodOrderStatus.DELIVERING} else None
        return await self.repository.transition_order_atomic(order_id, target_status, reason, "gateway", next_at, int(order.get("version", 0)), operation_key)

    async def tracking(self, order_id: str, user_id: str | None = None) -> dict:
        order = await self.get_order(order_id, user_id)
        events = await self.repository.get_order_events(order_id)
        return {"order_id": order["id"], "status": order["status"], "driver": order.get("driver"), "eta_minutes": order["delivery"].get("eta_minutes"), "timeline": events or order.get("timeline", [])}

    async def cancel_preview(self, order_id: str, user_id: str | None = None) -> dict:
        order = await self.get_order(order_id, user_id)
        policy = cancellation_policy(FoodOrderStatus(order["status"]))
        result = {"order_id": order_id, "current_status": order["status"], **policy, "refund_amount": {"amount": order["amount"] if FoodOrderStatus(order["status"]) != FoodOrderStatus.PAYMENT_FAILED else 0, "currency": order["currency"]}}
        result["snapshot_hash"] = hashlib.sha256(json.dumps(result, sort_keys=True, default=str).encode()).hexdigest()
        return result

    async def cancel(self, order_id: str, user_id: str, idempotency_key: str) -> dict:
        order = await self.get_order(order_id, user_id)
        policy = cancellation_policy(FoodOrderStatus(order["status"]))
        if not policy["allowed"]:
            raise DomainError("ORDER_NOT_CANCELLABLE", policy["reason"])
        return await self.repository.transition_order_atomic(order_id, FoodOrderStatus.CANCELLED, "Customer cancellation", "gateway", None, int(order.get("version", 0)), idempotency_key)
