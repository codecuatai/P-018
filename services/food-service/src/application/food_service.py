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

    @staticmethod
    def _delivery_address(address_id: str, user_id: str, address_snapshot: dict | None = None) -> dict:
        if address_snapshot is not None:
            address_text = address_snapshot.get("address_text") or address_snapshot.get("address")
            if address_snapshot.get("user_id") != user_id or not str(address_text or "").strip():
                raise DomainError("FORBIDDEN", "Core address does not belong to the current actor.")
            return {
                "id": address_id,
                "user_id": user_id,
                "label": address_snapshot.get("label"),
                "address": str(address_text).strip(),
                "city": address_snapshot.get("city"),
                "district": address_snapshot.get("district"),
                "ward": address_snapshot.get("ward"),
                "latitude": address_snapshot.get("latitude"),
                "longitude": address_snapshot.get("longitude"),
                "provider": address_snapshot.get("provider"),
                "source": address_snapshot.get("source") or "core_saved_address",
            }
        return {}

    async def search(self, **filters: Any) -> list[dict]:
        return await self.repository.search(**filters)

    async def restaurant(self, restaurant_id: str) -> dict:
        restaurant = await self.repository.get_restaurant(restaurant_id)
        if restaurant is None:
            raise DomainError("NOT_FOUND", "Không tìm thấy nhà hàng.")
        return restaurant

    async def menu(self, restaurant_id: str) -> dict:
        restaurant = await self.restaurant(restaurant_id)
        items = [result["item"] for result in await self.repository.search(restaurant_id=restaurant_id, limit=100)]
        return {"restaurant": restaurant, "items": items}

    async def menu_item(self, item_id: str) -> dict:
        item = await self.repository.get_menu_item(item_id)
        if item is None:
            raise DomainError("NOT_FOUND", "Không tìm thấy món ăn.")
        return item

    async def list_addresses(self, user_id: str, label: str | None = None) -> list[dict]:
        return await self.repository.list_addresses(user_id, label)

    async def create_cart(self, user_id: str, restaurant_id: str, idempotency_key: str) -> dict:
        restaurant = await self.restaurant(restaurant_id)
        if not restaurant.get("is_open", False):
            raise DomainError("RESTAURANT_CLOSED", "Nhà hàng hiện đã đóng cửa.")
        cart = {
            "id": ident("cart"),
            "user_id": user_id,
            "restaurant_id": restaurant_id,
            "restaurant_ids": [restaurant_id],
            "items": [],
            "voucher": None,
            "subtotal": 0,
            "discount": 0,
            "total": 0,
            "currency": "VND",
            "version": 0,
        }
        return await self.repository.create_cart_idempotent(cart, idempotency_key)

    @classmethod
    def _normalized_write_value(cls, value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: cls._normalized_write_value(value[key])
                for key in sorted(value)
            }
        if isinstance(value, list):
            normalized = [cls._normalized_write_value(item) for item in value]
            return sorted(
                normalized,
                key=lambda item: json.dumps(
                    item, ensure_ascii=True, sort_keys=True, separators=(",", ":")
                ),
            )
        return value

    @classmethod
    def _cart_write_hash(
        cls, operation: str, cart_id: str, payload: dict[str, Any]
    ) -> str:
        normalized = cls._normalized_write_value(
            {"operation": operation, "cart_id": cart_id, "payload": payload}
        )
        encoded = json.dumps(
            normalized, ensure_ascii=True, sort_keys=True, separators=(",", ":")
        )
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    async def _save_cart_write(
        self,
        cart: dict,
        *,
        expected_version: int,
        actor_id: str,
        operation: str,
        idempotency_key: str,
        payload: dict[str, Any],
    ) -> dict:
        if not idempotency_key:
            raise DomainError(
                "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required."
            )
        return await self.repository.save_cart_idempotent(
            cart,
            expected_version,
            actor_id,
            operation,
            idempotency_key,
            self._cart_write_hash(operation, str(cart["id"]), payload),
        )

    async def _cart_write_replay(
        self,
        *,
        cart_id: str,
        actor_id: str,
        operation: str,
        idempotency_key: str,
        payload: dict[str, Any],
    ) -> dict | None:
        if not idempotency_key:
            raise DomainError(
                "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required."
            )
        return await self.repository.get_cart_write_replay(
            actor_id,
            operation,
            idempotency_key,
            self._cart_write_hash(operation, cart_id, payload),
        )

    async def _price_item(self, item: dict, selected_options: list[dict]) -> tuple[int, list[dict]]:
        return price_item(item, selected_options)

    @staticmethod
    def _restaurant_snapshot(restaurant: dict) -> dict:
        """Keep only the safe restaurant fields already exposed by the repository DTO."""

        fields = (
            "id",
            "name",
            "address",
            "ward",
            "district",
            "city",
            "category",
            "cuisine_tags",
            "phone",
            "opening_hours",
            "rating",
            "rating_source",
            "review_count",
            "price_level",
            "image_url",
            "is_open",
            "latitude",
            "longitude",
        )
        return {field: restaurant[field] for field in fields if field in restaurant and restaurant[field] is not None}

    @classmethod
    def _cart_item_snapshot(
        cls,
        item: dict,
        restaurant: dict,
        *,
        item_id: str,
        unit_price: int,
        normalized_options: list[dict],
        quantity: int,
        note: str | None,
    ) -> dict:
        fields = {
            "id": item_id,
            "menu_item_id": item["id"],
            "name": item["name"],
            "unit_price": unit_price,
            "base_price": item["price"],
            "quantity": quantity,
            "selected_options": normalized_options,
            "note": note,
            "restaurant": cls._restaurant_snapshot(restaurant),
        }
        for field in ("description", "image_url", "currency", "category"):
            if field in item and item[field] is not None:
                fields[field] = item[field]
        return fields

    async def _recalculate(self, cart: dict, expected_version: int | None = None, persist: bool = True) -> dict:
        subtotal = sum(item["unit_price"] * item["quantity"] for item in cart["items"])
        restaurant_ids = list(
            dict.fromkeys(
                str((item.get("restaurant") or {}).get("id", ""))
                for item in cart["items"]
                if str((item.get("restaurant") or {}).get("id", ""))
            )
        )
        cart["restaurant_ids"] = (
            restaurant_ids
            or list(dict.fromkeys(str(value) for value in cart.get("restaurant_ids", []) if str(value)))
            or [cart["restaurant_id"]]
        )
        discount = 0
        voucher_code = str((cart.get("voucher") or {}).get("code", "")) or None
        voucher = await self.repository.get_voucher(voucher_code) if voucher_code else None
        if voucher:
            if voucher.get("restaurant_id") and any(
                voucher["restaurant_id"] != restaurant_id for restaurant_id in cart["restaurant_ids"]
            ):
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

    async def add_item(
        self,
        cart_id: str,
        payload: dict,
        user_id: str,
        idempotency_key: str,
    ) -> dict:
        operation = "add_item"
        replay = await self._cart_write_replay(
            cart_id=cart_id,
            actor_id=user_id,
            operation=operation,
            idempotency_key=idempotency_key,
            payload=payload,
        )
        if replay is not None:
            return replay
        cart = await self._cart(cart_id)
        if cart["user_id"] != user_id:
            raise DomainError("FORBIDDEN", "Giỏ hàng không thuộc user hiện tại.")
        expected_version = int(cart.get("version", 0))
        item = await self.menu_item(payload["menu_item_id"])
        restaurant = await self.restaurant(item["restaurant_id"])
        if not restaurant.get("is_open", False):
            raise DomainError("RESTAURANT_CLOSED", "Nhà hàng hiện đã đóng cửa.")
        if not item["available"]:
            raise DomainError("MENU_ITEM_UNAVAILABLE", "Món ăn hiện không phục vụ.")
        unit_price, normalized_options = await self._price_item(item, payload.get("selected_options", []))
        cart["items"].append(
            self._cart_item_snapshot(
                item,
                restaurant,
                item_id=ident("ci"),
                unit_price=unit_price,
                normalized_options=normalized_options,
                quantity=payload["quantity"],
                note=payload.get("note"),
            )
        )
        await self._recalculate(cart, persist=False)
        return await self._save_cart_write(
            cart,
            expected_version=expected_version,
            actor_id=user_id,
            operation=operation,
            idempotency_key=idempotency_key,
            payload=payload,
        )

    async def update_item(
        self,
        cart_id: str,
        item_id: str,
        payload: dict,
        user_id: str,
        idempotency_key: str,
    ) -> dict:
        operation = "update_item"
        operation_payload = {"cart_item_id": item_id, **payload}
        replay = await self._cart_write_replay(
            cart_id=cart_id,
            actor_id=user_id,
            operation=operation,
            idempotency_key=idempotency_key,
            payload=operation_payload,
        )
        if replay is not None:
            return replay
        cart = await self._cart(cart_id)
        if cart["user_id"] != user_id:
            raise DomainError("FORBIDDEN", "Giỏ hàng không thuộc user hiện tại.")
        expected_version = int(cart.get("version", 0))
        cart_item = next((value for value in cart["items"] if value["id"] == item_id), None)
        if cart_item is None:
            raise DomainError("NOT_FOUND", "Không tìm thấy món trong giỏ hàng.")
        item = await self.menu_item(cart_item["menu_item_id"])
        restaurant = await self.restaurant(item["restaurant_id"])
        selected_options = payload.get("selected_options")
        if selected_options is None:
            selected_options = [
                {"group_id": option["group_id"], "option_id": option["option_id"]}
                for option in cart_item.get("selected_options", [])
            ]
        unit_price, normalized_options = await self._price_item(item, selected_options)
        note = payload["note"] if "note" in payload else cart_item.get("note")
        cart_item.clear()
        cart_item.update(
            self._cart_item_snapshot(
                item,
                restaurant,
                item_id=item_id,
                unit_price=unit_price,
                normalized_options=normalized_options,
                quantity=payload["quantity"],
                note=note,
            )
        )
        await self._recalculate(cart, persist=False)
        return await self._save_cart_write(
            cart,
            expected_version=expected_version,
            actor_id=user_id,
            operation=operation,
            idempotency_key=idempotency_key,
            payload=operation_payload,
        )

    async def remove_item(
        self,
        cart_id: str,
        item_id: str,
        user_id: str,
        idempotency_key: str,
    ) -> dict:
        operation = "remove_item"
        operation_payload = {"cart_item_id": item_id}
        replay = await self._cart_write_replay(
            cart_id=cart_id,
            actor_id=user_id,
            operation=operation,
            idempotency_key=idempotency_key,
            payload=operation_payload,
        )
        if replay is not None:
            return replay
        cart = await self._cart(cart_id)
        if cart["user_id"] != user_id:
            raise DomainError("FORBIDDEN", "Giỏ hàng không thuộc user hiện tại.")
        expected_version = int(cart.get("version", 0))
        before = len(cart["items"])
        cart["items"] = [item for item in cart["items"] if item["id"] != item_id]
        if len(cart["items"]) == before:
            raise DomainError("NOT_FOUND", "Không tìm thấy món trong giỏ hàng.")
        await self._recalculate(cart, persist=False)
        return await self._save_cart_write(
            cart,
            expected_version=expected_version,
            actor_id=user_id,
            operation=operation,
            idempotency_key=idempotency_key,
            payload=operation_payload,
        )

    async def apply_voucher(
        self, cart_id: str, code: str, user_id: str, idempotency_key: str
    ) -> dict:
        operation = "apply_voucher"
        operation_payload = {"code": code.upper()}
        replay = await self._cart_write_replay(
            cart_id=cart_id,
            actor_id=user_id,
            operation=operation,
            idempotency_key=idempotency_key,
            payload=operation_payload,
        )
        if replay is not None:
            return replay
        cart = await self._cart(cart_id)
        if cart["user_id"] != user_id:
            raise DomainError("FORBIDDEN", "Giỏ hàng không thuộc user hiện tại.")
        expected_version = int(cart.get("version", 0))
        voucher = await self.repository.get_voucher(code)
        if voucher is None:
            raise DomainError("VOUCHER_INVALID", "Voucher không hợp lệ.")
        restaurant_ids = {str((item.get("restaurant") or {}).get("id", "")) for item in cart.get("items", [])}
        if voucher.get("restaurant_id") and any(
            voucher["restaurant_id"] != restaurant_id for restaurant_id in restaurant_ids if restaurant_id
        ):
            raise DomainError("VOUCHER_NOT_APPLICABLE", "Voucher không áp dụng cho nhà hàng này.")
        cart["voucher"] = {"code": str(voucher["code"]).upper()}
        await self._recalculate(cart, persist=False)
        return await self._save_cart_write(
            cart,
            expected_version=expected_version,
            actor_id=user_id,
            operation=operation,
            idempotency_key=idempotency_key,
            payload=operation_payload,
        )

    async def remove_voucher(
        self, cart_id: str, user_id: str, idempotency_key: str
    ) -> dict:
        operation = "remove_voucher"
        operation_payload: dict[str, Any] = {}
        replay = await self._cart_write_replay(
            cart_id=cart_id,
            actor_id=user_id,
            operation=operation,
            idempotency_key=idempotency_key,
            payload=operation_payload,
        )
        if replay is not None:
            return replay
        cart = await self._cart(cart_id)
        if cart["user_id"] != user_id:
            raise DomainError("FORBIDDEN", "Giỏ hàng không thuộc user hiện tại.")
        expected_version = int(cart.get("version", 0))
        cart["voucher"] = None
        await self._recalculate(cart, persist=False)
        return await self._save_cart_write(
            cart,
            expected_version=expected_version,
            actor_id=user_id,
            operation=operation,
            idempotency_key=idempotency_key,
            payload=operation_payload,
        )

    async def delivery_quote(
        self, restaurant_id: str, address_id: str, user_id: str, address_snapshot: dict | None = None
    ) -> dict:
        restaurant = await self.restaurant(restaurant_id)
        address = (
            self._delivery_address(address_id, user_id, address_snapshot)
            if address_snapshot is not None
            else await self.repository.get_address(address_id)
        )
        if address is None:
            raise DomainError("NOT_FOUND", "Không tìm thấy địa chỉ giao hàng.")
        if address.get("user_id") != user_id:
            raise DomainError("FORBIDDEN", "Địa chỉ giao hàng không thuộc user hiện tại.")
        return {
            "restaurant": restaurant,
            "address": address,
            **quote_delivery(restaurant, address, self.delivery_config),
        }

    async def _reprice_cart(self, cart: dict, persist: bool = False) -> dict:
        for cart_item in cart["items"]:
            item = await self.menu_item(cart_item["menu_item_id"])
            restaurant = await self.restaurant(item["restaurant_id"])
            if not restaurant.get("is_open", False):
                raise DomainError("RESTAURANT_CLOSED", "Một nhà hàng trong đơn hiện đã đóng cửa.")
            if not item.get("available", False):
                raise DomainError("MENU_ITEM_UNAVAILABLE", "Món ăn hiện không phục vụ.")
            unit_price, options = await self._price_item(
                item,
                [
                    {"group_id": option["group_id"], "option_id": option["option_id"]}
                    for option in cart_item.get("selected_options", [])
                ],
            )
            item_id = str(cart_item["id"])
            quantity = int(cart_item["quantity"])
            note = cart_item.get("note")
            cart_item.clear()
            cart_item.update(
                self._cart_item_snapshot(
                    item,
                    restaurant,
                    item_id=item_id,
                    unit_price=unit_price,
                    normalized_options=options,
                    quantity=quantity,
                    note=note,
                )
            )
        return await self._recalculate(
            cart, persist=persist, expected_version=int(cart.get("version", 0)) if persist else None
        )

    async def preview_order(
        self, cart_id: str, address_id: str, user_id: str, address_snapshot: dict | None = None
    ) -> dict:
        cart = await self._cart(cart_id)
        if cart["user_id"] != user_id:
            raise DomainError("FORBIDDEN", "Giỏ hàng không thuộc user hiện tại.")
        if not cart["items"]:
            raise DomainError("CART_EMPTY", "Giỏ hàng đang trống.")
        address = (
            self._delivery_address(address_id, user_id, address_snapshot)
            if address_snapshot is not None
            else await self.repository.get_address(address_id)
        )
        if address is None or address.get("user_id") != user_id:
            raise DomainError("FORBIDDEN", "Địa chỉ giao hàng không thuộc user hiện tại.")
        items = {item["menu_item_id"]: await self.menu_item(item["menu_item_id"]) for item in cart["items"]}
        restaurant_ids = list(dict.fromkeys(str(item["restaurant_id"]) for item in items.values()))
        restaurants = {restaurant_id: await self.restaurant(restaurant_id) for restaurant_id in restaurant_ids}
        voucher_code = str((cart.get("voucher") or {}).get("code", "")) or None
        voucher = await self.repository.get_voucher(voucher_code) if voucher_code else None
        if voucher_code:
            await self.repository.ensure_voucher_eligible(voucher_code, user_id)
        return build_authoritative_quote(cart, restaurants, items, voucher, address, self.delivery_config)

    async def create_order(self, payload: dict) -> dict:
        existing = await self.repository.get_order_by_idempotency(payload["user_id"], payload["idempotency_key"])
        if existing:
            if (
                existing.get("cart_id") != payload.get("cart_id")
                or existing.get("address", {}).get("id") != payload.get("address_id")
                or existing.get("payment_method") != payload.get("payment_method")
            ):
                raise DomainError("IDEMPOTENCY_KEY_REUSED", "Idempotency key đã được dùng cho payload khác.")
            return existing
        if payload.get("address_snapshot") is not None:
            payload = {
                **payload,
                "address_snapshot": self._delivery_address(
                    str(payload["address_id"]),
                    str(payload["user_id"]),
                    payload["address_snapshot"],
                ),
            }
        if "expected_snapshot_hash" not in payload:
            preview = await self.preview_order(
                payload["cart_id"], payload["address_id"], payload["user_id"], payload.get("address_snapshot")
            )
            payload = {
                **payload,
                "expected_snapshot_hash": preview["snapshot_hash"],
                "expected_cart_version": preview["cart_version"],
                "expected_amount": preview["total"]["amount"],
                "expected_currency": preview["total"]["currency"],
                "expected_quote_version": preview["quote_version"],
            }
        expected = {
            "snapshot_hash": payload["expected_snapshot_hash"],
            "cart_version": payload["expected_cart_version"],
            "amount": payload["expected_amount"],
            "currency": payload["expected_currency"],
            "quote_version": payload["expected_quote_version"],
        }
        created_at = datetime.now(UTC).isoformat()
        cart = await self._cart(payload["cart_id"])
        multi_pickup = (
            len(
                {
                    str((item.get("restaurant") or {}).get("id", ""))
                    for item in cart.get("items", [])
                    if str((item.get("restaurant") or {}).get("id", ""))
                }
            )
            > 1
        )
        order = {
            "id": ident("ord"),
            "user_id": payload["user_id"],
            "cart_id": payload["cart_id"],
            "idempotency_key": payload["idempotency_key"],
            "payment_method": payload["payment_method"],
            "status": FoodOrderStatus.PAYMENT_PENDING.value,
            "workflow_scenario": "multi_pickup_demo" if multi_pickup else "standard",
            "next_transition_at": None,
            "restaurant_decision": None,
            "workflow_completed_at": None,
            "version": 0,
            "created_at": created_at,
            "updated_at": created_at,
            "timeline": [
                {
                    "from_status": None,
                    "to_status": FoodOrderStatus.PAYMENT_PENDING.value,
                    "occurred_at": created_at,
                    "reason": "Order created",
                    "actor_type": "gateway",
                }
            ],
        }
        return await self.repository.create_order_with_optional_voucher(
            order, None, expected, self.delivery_config, payload["address_id"], payload.get("address_snapshot")
        )

    async def get_order(self, order_id: str, user_id: str | None = None) -> dict:
        order = await self.repository.get_order(order_id)
        if order is None:
            raise DomainError("NOT_FOUND", "Không tìm thấy đơn hàng.")
        if user_id is not None and order["user_id"] != user_id:
            raise DomainError("FORBIDDEN", "Đơn hàng không thuộc user hiện tại.")
        return order

    async def list_orders(self, user_id: str) -> list[dict]:
        orders = await self.repository.list_orders()
        return sorted(
            (order for order in orders if order.get("user_id") == user_id),
            key=lambda order: str(order.get("created_at", "")),
            reverse=True,
        )

    async def ops_summary(self) -> dict:
        orders = await self.repository.list_orders()
        counts: dict[str, int] = {}
        for order in orders:
            status = str(order.get("status", "UNKNOWN"))
            counts[status] = counts.get(status, 0) + 1
        return {"domain": "food", "counts": {"orders": len(orders), "orders_by_status": counts}}

    async def ops_transactions(self, limit: int, offset: int) -> dict:
        orders = sorted(
            await self.repository.list_orders(), key=lambda value: str(value.get("created_at", "")), reverse=True
        )
        return {"items": orders[offset : offset + limit], "total": len(orders), "limit": limit, "offset": offset}

    async def ops_dataset_status(self) -> dict:
        return await self.repository.dataset_status()

    async def reconcile_due_orders(self) -> int:
        now = datetime.now(UTC)

        def decide(order: dict) -> tuple[FoodOrderStatus, str | None, datetime | None]:
            current = FoodOrderStatus(order["status"])
            if current == FoodOrderStatus.RESTAURANT_CONFIRMING:
                accepted = self._random_value() >= self.settings.restaurant_rejection_rate
                target = FoodOrderStatus.RESTAURANT_ACCEPTED if accepted else FoodOrderStatus.RESTAURANT_REJECTED
                decision = "accept" if accepted else "reject"
            else:
                target = {
                    FoodOrderStatus.RESTAURANT_ACCEPTED: FoodOrderStatus.PREPARING,
                    FoodOrderStatus.PREPARING: FoodOrderStatus.READY_FOR_PICKUP,
                    FoodOrderStatus.READY_FOR_PICKUP: FoodOrderStatus.DRIVER_ASSIGNED,
                    FoodOrderStatus.DRIVER_ASSIGNED: FoodOrderStatus.PICKED_UP,
                    FoodOrderStatus.PICKED_UP: FoodOrderStatus.DELIVERING,
                    FoodOrderStatus.DELIVERING: FoodOrderStatus.DELIVERED,
                }.get(current)
                if target is None:
                    raise DomainError("INVALID_ORDER_TRANSITION", "Đơn hàng không có transition timed hợp lệ.")
                decision = None
            hold_multi_pickup_demo = (
                order.get("workflow_scenario") == "multi_pickup_demo" and target == FoodOrderStatus.PICKED_UP
            )
            next_at = (
                None
                if hold_multi_pickup_demo
                else datetime.now(UTC) + timedelta(milliseconds=self._delay(target))
                if target
                in {
                    FoodOrderStatus.RESTAURANT_ACCEPTED,
                    FoodOrderStatus.PREPARING,
                    FoodOrderStatus.READY_FOR_PICKUP,
                    FoodOrderStatus.DRIVER_ASSIGNED,
                    FoodOrderStatus.PICKED_UP,
                    FoodOrderStatus.DELIVERING,
                }
                else None
            )
            return target, decision, next_at

        return len(await self.repository.claim_and_advance_due_orders(now, 1, decide))

    async def transition_order(self, order_id: str, target: str, reason: str, operation_key: str | None = None) -> dict:
        order = await self.get_order(order_id)
        try:
            target_status = FoodOrderStatus(target)
        except ValueError as exc:
            raise DomainError("INVALID_ORDER_TRANSITION", "Trạng thái đích không hợp lệ.") from exc
        next_at = (
            datetime.now(UTC) + timedelta(milliseconds=self._delay(target_status))
            if target_status
            in {
                FoodOrderStatus.RESTAURANT_CONFIRMING,
                FoodOrderStatus.RESTAURANT_ACCEPTED,
                FoodOrderStatus.PREPARING,
                FoodOrderStatus.READY_FOR_PICKUP,
                FoodOrderStatus.DRIVER_ASSIGNED,
                FoodOrderStatus.PICKED_UP,
                FoodOrderStatus.DELIVERING,
            }
            else None
        )
        return await self.repository.transition_order_atomic(
            order_id, target_status, reason, "gateway", next_at, int(order.get("version", 0)), operation_key
        )

    async def update_status(self, order_id: str, actor_id: str, target_status: str, idempotency_key: str) -> dict:
        return await self.transition_order(
            order_id=order_id,
            target=target_status,
            reason="Gateway status update",
            operation_key=idempotency_key,
        )

    async def tracking(self, order_id: str, user_id: str | None = None) -> dict:
        order = await self.get_order(order_id, user_id)
        events = await self.repository.get_order_events(order_id)
        delivery = order.get("delivery") or {}
        pickup_stops = (
            delivery.get("pickup_stops")
            if isinstance(delivery.get("pickup_stops"), list)
            else [order.get("restaurant")]
            if order.get("restaurant")
            else []
        )
        points = [
            {"latitude": stop["latitude"], "longitude": stop["longitude"]}
            for stop in pickup_stops
            if isinstance(stop, dict)
            and isinstance(stop.get("latitude"), int | float)
            and isinstance(stop.get("longitude"), int | float)
        ]
        address = order.get("address") if isinstance(order.get("address"), dict) else {}
        if isinstance(address.get("latitude"), int | float) and isinstance(address.get("longitude"), int | float):
            points.append({"latitude": address["latitude"], "longitude": address["longitude"]})
        delivery_route = {
            "provider": "food-service:planned-pickups",
            "origin": points[0] if points else None,
            "destination": points[-1] if points else None,
            "geometry": points,
            "distance_meters": int(float(delivery.get("distance_km") or 0) * 1000)
            if delivery.get("distance_km") is not None
            else None,
            "duration_seconds": int(float(delivery.get("eta_minutes") or 0) * 60)
            if delivery.get("eta_minutes") is not None
            else None,
        }
        return {
            "order_id": order["id"],
            "status": order["status"],
            "driver": order.get("driver"),
            "eta_minutes": order["delivery"].get("eta_minutes"),
            "restaurant": order.get("restaurant"),
            "address": order.get("address"),
            "delivery": delivery,
            "pickup_stops": pickup_stops,
            "delivery_route": delivery_route,
            "timeline": events or order.get("timeline", []),
        }

    async def cancel_preview(self, order_id: str, user_id: str | None = None) -> dict:
        order = await self.get_order(order_id, user_id)
        policy = cancellation_policy(FoodOrderStatus(order["status"]))
        result = {
            "order_id": order_id,
            "current_status": order["status"],
            **policy,
            "refund_amount": {
                "amount": order["amount"] if FoodOrderStatus(order["status"]) != FoodOrderStatus.PAYMENT_FAILED else 0,
                "currency": order["currency"],
            },
        }
        result["snapshot_hash"] = hashlib.sha256(json.dumps(result, sort_keys=True, default=str).encode()).hexdigest()
        return result

    async def cancel(self, order_id: str, user_id: str, idempotency_key: str) -> dict:
        order = await self.get_order(order_id, user_id)
        policy = cancellation_policy(FoodOrderStatus(order["status"]))
        if not policy["allowed"]:
            raise DomainError("ORDER_NOT_CANCELLABLE", policy["reason"])
        return await self.repository.transition_order_atomic(
            order_id,
            FoodOrderStatus.CANCELLED,
            "Customer cancellation",
            "gateway",
            None,
            int(order.get("version", 0)),
            idempotency_key,
        )
