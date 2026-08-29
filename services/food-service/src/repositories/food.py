from __future__ import annotations

import asyncio
import hashlib
import json
import re
import unicodedata
from collections.abc import Callable
from copy import deepcopy
from datetime import UTC, datetime
from typing import Protocol
from uuid import uuid4

from src.domain.policies import DeliveryConfig, DomainError, FoodOrderStatus, calculate_discount, validate_transition
from src.domain.quotes import build_authoritative_quote


def ident(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _fold_text(value: object) -> str:
    if value is None:
        return ""
    normalized = unicodedata.normalize("NFD", str(value).lower())
    return "".join("d" if char == "đ" else char for char in normalized if unicodedata.category(char) != "Mn")


def _matches_keyword(text: str, keyword: str) -> bool:
    return all(re.search(rf"\b{re.escape(token)}\b", text) for token in keyword.split())


def _search_district(value: object, location_aliases: list[dict]) -> str:
    """Resolve a catalog-managed landmark alias to an administrative area.

    Place coverage is data-owned: operators add aliases to the Food catalog
    seed rather than modifying the search implementation.
    """
    location = _fold_text(value)
    for alias in location_aliases:
        aliases = alias.get("aliases", [])
        if not isinstance(aliases, list):
            continue
        if location in {_fold_text(candidate) for candidate in aliases}:
            return _fold_text(alias.get("district", "")) or location
    return location


AdvanceDecision = Callable[[dict], tuple[FoodOrderStatus, str | None, datetime | None]]


class FoodRepository(Protocol):
    async def search(self, **filters) -> list[dict]: ...
    async def list_menu_items(self, restaurant_id: str, limit: int = 20, offset: int = 0) -> tuple[list[dict], int]: ...
    async def list_restaurants(
        self,
        keyword: str = "",
        district: str | None = None,
        category: str | None = None,
        open_only: bool = True,
        limit: int = 12,
        offset: int = 0,
    ) -> tuple[list[dict], int]: ...
    async def get_restaurant(self, restaurant_id: str) -> dict | None: ...
    async def get_menu_item(self, item_id: str) -> dict | None: ...
    async def get_cart(self, cart_id: str) -> dict | None: ...
    async def save_cart(self, cart: dict, expected_version: int | None = None) -> dict: ...
    async def save_cart_idempotent(
        self,
        cart: dict,
        expected_version: int,
        actor_id: str,
        operation: str,
        idempotency_key: str,
        payload_hash: str,
    ) -> dict: ...
    async def get_cart_write_replay(
        self,
        actor_id: str,
        operation: str,
        idempotency_key: str,
        payload_hash: str,
    ) -> dict | None: ...
    async def create_cart_idempotent(self, cart: dict, idempotency_key: str) -> dict: ...
    async def get_voucher(self, code: str) -> dict | None: ...
    async def ensure_voucher_eligible(self, code: str, user_id: str) -> None: ...
    async def get_address(self, address_id: str) -> dict | None: ...
    async def list_addresses(self, user_id: str, label: str | None = None) -> list[dict]: ...
    async def create_order_with_optional_voucher(
        self,
        order: dict,
        voucher: dict | None,
        expected: dict | None = None,
        delivery_config: DeliveryConfig | None = None,
        address_id: str | None = None,
        address_snapshot: dict | None = None,
    ) -> dict: ...
    async def get_order(self, order_id: str) -> dict | None: ...
    async def get_order_by_idempotency(self, user_id: str, idempotency_key: str) -> dict | None: ...
    async def list_orders(self) -> list[dict]: ...
    async def dataset_status(self) -> dict: ...
    async def list_due_orders(self, now: datetime) -> list[dict]: ...
    async def claim_and_advance_due_orders(self, now: datetime, limit: int, advance: AdvanceDecision) -> list[dict]: ...
    async def transition_order_atomic(
        self,
        order_id: str,
        target: FoodOrderStatus,
        reason: str,
        actor_type: str = "system",
        next_transition_at: datetime | None = None,
        expected_version: int | None = None,
        operation_key: str | None = None,
    ) -> dict: ...
    async def get_order_events(self, order_id: str) -> list[dict]: ...


def _parse_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _json_object(value: object) -> dict:
    if isinstance(value, str):
        parsed = json.loads(value)
        if not isinstance(parsed, dict):
            raise TypeError("Expected a JSON object")
        return parsed
    if not isinstance(value, dict):
        raise TypeError("Expected a JSON object")
    return dict(value)


def _safe_catalog_record(record_type: str, value: dict) -> dict:
    """Return the explicit Food product DTO, excluding source provenance."""

    if record_type == "restaurant":
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
    else:
        fields = (
            "id",
            "restaurant_id",
            "name",
            "description",
            "price",
            "currency",
            "image_url",
            "category",
            "available",
            "option_groups",
        )
    return {field: value.get(field) for field in fields if field in value}


def _event(current: str | None, target: FoodOrderStatus, reason: str, actor_type: str) -> dict:
    return {
        "from_status": current,
        "to_status": target.value,
        "occurred_at": datetime.now(UTC).isoformat(),
        "reason": reason,
        "actor_type": actor_type,
    }


class InMemoryFoodRepository:
    """Deterministic test adapter with the same atomic operation semantics as PostgreSQL."""

    def __init__(self) -> None:
        self.restaurants = {
            "res_pho_hanoi": {
                "id": "res_pho_hanoi",
                "name": "Phở Gánh Phố Cổ",
                "category": "Phở",
                "district": "Hoàn Kiếm",
                "address": "12 Hàng Trống, Hoàn Kiếm, Hà Nội",
                "latitude": 21.0285,
                "longitude": 105.8520,
                "is_open": True,
            },
            "res_bun_cha": {
                "id": "res_bun_cha",
                "name": "Bún Chả Góc Phố",
                "category": "Bún chả",
                "district": "Ba Đình",
                "address": "34 Ngọc Hà, Ba Đình, Hà Nội",
                "latitude": 21.0375,
                "longitude": 105.8290,
                "is_open": True,
            },
            "res_com_viet": {
                "id": "res_com_viet",
                "name": "Cơm Nhà Hà Nội",
                "category": "Cơm",
                "district": "Đống Đa",
                "address": "88 Chùa Láng, Đống Đa, Hà Nội",
                "latitude": 21.0185,
                "longitude": 105.8070,
                "is_open": True,
            },
        }
        self.items = {
            "item_pho_bo": {
                "id": "item_pho_bo",
                "restaurant_id": "res_pho_hanoi",
                "name": "Phở bò tái",
                "description": "Phở bò nước dùng trong, thịt bò tái mềm.",
                "category": "Phở",
                "price": 65000,
                "currency": "VND",
                "available": True,
                "option_groups": [
                    {
                        "id": "opt_spice",
                        "name": "Mức cay",
                        "required": False,
                        "options": [
                            {"id": "mild", "name": "Không cay", "price": 0},
                            {"id": "hot", "name": "Cay vừa", "price": 0},
                        ],
                    },
                    {
                        "id": "opt_size",
                        "name": "Kích thước",
                        "required": True,
                        "options": [
                            {"id": "regular", "name": "Thường", "price": 0},
                            {"id": "large", "name": "Lớn", "price": 15000},
                        ],
                    },
                ],
            },
            "item_pho_ga": {
                "id": "item_pho_ga",
                "restaurant_id": "res_pho_hanoi",
                "name": "Phở gà",
                "description": "Phở gà ta thơm nhẹ.",
                "category": "Phở",
                "price": 60000,
                "currency": "VND",
                "available": True,
                "option_groups": [],
            },
            "item_bun_cha": {
                "id": "item_bun_cha",
                "restaurant_id": "res_bun_cha",
                "name": "Bún chả Hà Nội",
                "description": "Bún chả nướng than, nước chấm truyền thống.",
                "category": "Bún chả",
                "price": 70000,
                "currency": "VND",
                "available": True,
                "option_groups": [
                    {
                        "id": "opt_extra",
                        "name": "Thêm món",
                        "required": False,
                        "options": [{"id": "nem", "name": "Nem cua bể", "price": 20000}],
                    }
                ],
            },
            "item_com_ga": {
                "id": "item_com_ga",
                "restaurant_id": "res_com_viet",
                "name": "Cơm gà nướng",
                "description": "Cơm gạo dẻo với gà nướng mật ong.",
                "category": "Cơm",
                "price": 75000,
                "currency": "VND",
                "available": True,
                "option_groups": [],
            },
        }
        now = datetime.now(UTC)
        self.vouchers = {
            "XONE50": {
                "code": "XONE50",
                "discount_type": "percentage",
                "discount_value": 10,
                "maximum_discount": 50000,
                "minimum_order_amount": 100000,
                "expires_at": now.replace(year=now.year + 1),
                "usage_limit": 1000,
                "used_count": 0,
                "restaurant_id": None,
            },
            "PHO20K": {
                "code": "PHO20K",
                "discount_type": "fixed",
                "discount_value": 20000,
                "maximum_discount": None,
                "minimum_order_amount": 60000,
                "expires_at": now.replace(year=now.year + 1),
                "usage_limit": 1000,
                "used_count": 0,
                "restaurant_id": "res_pho_hanoi",
            },
        }
        self.addresses = {
            "addr_demo": {
                "id": "addr_demo",
                "user_id": "usr_demo_001",
                "label": "Nhà riêng",
                "address": "25 Lê Đại Hành, Hai Bà Trưng, Hà Nội",
                "district": "Hai Bà Trưng",
                "latitude": 21.0125,
                "longitude": 105.8480,
            }
        }
        self.drivers = {
            "drv_001": {
                "id": "drv_001",
                "name": "Nguyễn Văn Minh",
                "phone": "090***1234",
                "vehicle_type": "Xe máy",
                "license_plate": "29A-123.45",
                "available": True,
            }
        }
        self.location_aliases: list[dict] = []
        self.carts: dict[str, dict] = {}
        self.orders: dict[str, dict] = {}
        self.order_events: dict[str, list[dict]] = {}
        self.redeemed_vouchers: set[tuple[str, str]] = set()
        self.order_operations: dict[tuple[str, str], dict] = {}
        self.cart_operations: dict[tuple[str, str], tuple[str, dict]] = {}
        self.cart_write_operations: dict[
            tuple[str, str, str], tuple[str, dict]
        ] = {}
        self._lock = asyncio.Lock()

    async def search(self, **filters) -> list[dict]:
        raw_keyword = str(filters.get("keyword", "")).strip().casefold()
        keyword = _fold_text(raw_keyword)
        preserve_diacritics = any(ord(char) > 127 for char in raw_keyword)
        raw_district = filters.get("district", "")
        district = "" if str(raw_district).strip().casefold() in ("hà nội", "ha noi", "hồ chí minh", "ho chi minh", "tp hcm", "đà nẵng", "da nang") else _fold_text(raw_district)
        category = _fold_text(filters.get("category", ""))
        restaurant_id = str(filters.get("restaurant_id", ""))
        result = []
        item_keyword_match = False
        primary_item_keyword_match = False
        for item in self.items.values():
            if restaurant_id and item["restaurant_id"] != restaurant_id:
                continue
            restaurant = self.restaurants[item["restaurant_id"]]
            primary_item_text = _fold_text(f"{item['name']} {item['category']}")
            item_text = _fold_text(f"{primary_item_text} {item['description']}")
            restaurant_text = _fold_text(restaurant["name"])
            raw_primary_item_text = f"{item['name']} {item['category']}".casefold()
            raw_item_text = f"{raw_primary_item_text} {item['description']}".casefold()
            raw_restaurant_text = str(restaurant["name"]).casefold()
            matches_primary_item = not keyword or (
                _matches_keyword(raw_primary_item_text, raw_keyword)
                if preserve_diacritics
                else _matches_keyword(primary_item_text, keyword)
            )
            matches_item = matches_primary_item or (
                bool(keyword)
                and (
                    _matches_keyword(raw_item_text, raw_keyword)
                    if preserve_diacritics
                    else _matches_keyword(item_text, keyword)
                )
            )
            matches_restaurant = not keyword or (
                _matches_keyword(raw_restaurant_text, raw_keyword)
                if preserve_diacritics
                else _matches_keyword(restaurant_text, keyword)
            )
            if keyword and not matches_item and not matches_restaurant:
                continue
            if district and district not in _fold_text(f"{restaurant['district']} {restaurant.get('address', '')}"):
                continue
            if category and category != _fold_text(item["category"]):
                continue
            if filters.get("min_price") is not None and item["price"] < filters["min_price"]:
                continue
            if filters.get("max_price") is not None and item["price"] > filters["max_price"]:
                continue
            if filters.get("open_only", True) and not restaurant["is_open"]:
                continue
            item_keyword_match = item_keyword_match or matches_item
            primary_item_keyword_match = primary_item_keyword_match or matches_primary_item
            result.append(
                {
                    "item": deepcopy(item),
                    "restaurant": deepcopy(restaurant),
                    "_item_keyword_match": matches_item,
                    "_primary_item_keyword_match": matches_primary_item,
                }
            )
        if keyword and primary_item_keyword_match:
            result = [entry for entry in result if entry["_primary_item_keyword_match"]]
        elif keyword and item_keyword_match:
            result = [entry for entry in result if entry["_item_keyword_match"]]
        start = int(filters.get("offset", 0) or 0)
        limit = int(filters.get("limit", 12) or 12)
        return [{"item": entry["item"], "restaurant": entry["restaurant"]} for entry in result[start : start + limit]]

    async def list_menu_items(self, restaurant_id: str, limit: int = 20, offset: int = 0) -> tuple[list[dict], int]:
        items = sorted(
            (deepcopy(item) for item in self.items.values() if item.get("restaurant_id") == restaurant_id),
            key=lambda item: str(item.get("id", "")),
        )
        return items[offset : offset + limit], len(items)

    async def list_restaurants(
        self,
        keyword: str = "",
        district: str | None = None,
        category: str | None = None,
        open_only: bool = True,
        limit: int = 12,
        offset: int = 0,
    ) -> tuple[list[dict], int]:
        raw_keyword = str(keyword or "").strip().casefold()
        fold_keyword = _fold_text(raw_keyword)
        raw_district = district or ""
        district_folded = "" if str(raw_district).strip().casefold() in ("hà nội", "ha noi", "hồ chí minh", "ho chi minh", "tp hcm", "đà nẵng", "da nang") else _fold_text(raw_district)

        if fold_keyword:
            search_results = await self.search(keyword=keyword, district=district, category=category, open_only=open_only, limit=1000, offset=0)
            grouped: dict[str, dict] = {}
            for res in search_results:
                r = deepcopy(res["restaurant"])
                grouped.setdefault(r["id"], {**r, "matching_items": []})["matching_items"].append(res["item"])
            all_items = list(grouped.values())
            total = len(all_items)
            return all_items[offset : offset + limit], total

        matched = []
        for r in self.restaurants.values():
            if open_only and not r.get("is_open", True):
                continue
            if district_folded and district_folded not in _fold_text(f"{r.get('district', '')} {r.get('address', '')}"):
                continue
            matched.append(deepcopy(r))
        matched.sort(
            key=lambda r: (
                -(r.get("rating") or 0),
                -(r.get("review_count") or 0),
                str(r.get("name", "")).casefold(),
            )
        )
        total = len(matched)
        return matched[offset : offset + limit], total

    async def get_restaurant(self, restaurant_id: str) -> dict | None:
        return deepcopy(self.restaurants.get(restaurant_id))

    async def get_menu_item(self, item_id: str) -> dict | None:
        return deepcopy(self.items.get(item_id))

    async def get_cart(self, cart_id: str) -> dict | None:
        return deepcopy(self.carts.get(cart_id))

    async def save_cart(self, cart: dict, expected_version: int | None = None) -> dict:
        async with self._lock:
            current = self.carts.get(cart["id"])
            current_version = int(current.get("version", 0)) if current else 0
            if current and expected_version is not None and current_version != expected_version:
                raise DomainError("CART_CHANGED", "Giỏ hàng đã thay đổi, vui lòng tải lại.")
            saved = deepcopy(cart)
            saved["version"] = current_version + 1 if current else 0
            self.carts[saved["id"]] = saved
            return deepcopy(saved)

    async def save_cart_idempotent(
        self,
        cart: dict,
        expected_version: int,
        actor_id: str,
        operation: str,
        idempotency_key: str,
        payload_hash: str,
    ) -> dict:
        async with self._lock:
            operation_key = (actor_id, operation, idempotency_key)
            existing_operation = self.cart_write_operations.get(operation_key)
            if existing_operation is not None:
                if existing_operation[0] != payload_hash:
                    raise DomainError(
                        "IDEMPOTENCY_KEY_REUSED",
                        "Idempotency key đã được dùng cho payload khác.",
                    )
                return deepcopy(existing_operation[1])

            current = self.carts.get(cart["id"])
            if current is None or current.get("user_id") != actor_id:
                raise DomainError("FORBIDDEN", "Giỏ hàng không thuộc user hiện tại.")
            if int(current.get("version", 0)) != expected_version:
                raise DomainError("CART_CHANGED", "Giỏ hàng đã thay đổi, vui lòng tải lại.")

            saved = deepcopy(cart)
            saved["version"] = expected_version + 1
            self.carts[saved["id"]] = saved
            self.cart_write_operations[operation_key] = (payload_hash, saved)
            return deepcopy(saved)

    async def get_cart_write_replay(
        self,
        actor_id: str,
        operation: str,
        idempotency_key: str,
        payload_hash: str,
    ) -> dict | None:
        async with self._lock:
            existing = self.cart_write_operations.get(
                (actor_id, operation, idempotency_key)
            )
            if existing is None:
                return None
            if existing[0] != payload_hash:
                raise DomainError(
                    "IDEMPOTENCY_KEY_REUSED",
                    "Idempotency key đã được dùng cho payload khác.",
                )
            return deepcopy(existing[1])

    async def create_cart_idempotent(self, cart: dict, idempotency_key: str) -> dict:
        async with self._lock:
            payload_hash = hashlib.sha256(
                json.dumps({"restaurant_id": cart["restaurant_id"]}, sort_keys=True).encode()
            ).hexdigest()
            existing = self.cart_operations.get((cart["user_id"], idempotency_key))
            if existing:
                if existing[0] != payload_hash:
                    raise DomainError("IDEMPOTENCY_KEY_REUSED", "Idempotency key đã được dùng cho nhà hàng khác.")
                return deepcopy(existing[1])
            saved = deepcopy(cart)
            saved["idempotency_key"] = idempotency_key
            self.carts[saved["id"]] = saved
            self.cart_operations[(saved["user_id"], idempotency_key)] = (payload_hash, saved)
            return deepcopy(saved)

    async def get_voucher(self, code: str) -> dict | None:
        return deepcopy(self.vouchers.get(code.upper()))

    async def ensure_voucher_eligible(self, code: str, user_id: str) -> None:
        voucher = self.vouchers.get(code.upper())
        if voucher is None:
            raise DomainError("VOUCHER_INVALID", "Voucher không hợp lệ.")
        if (code.upper(), user_id) in self.redeemed_vouchers or int(voucher.get("used_count", 0)) >= int(
            voucher.get("usage_limit", 0)
        ):
            raise DomainError("VOUCHER_USAGE_LIMIT", "Voucher đã hết lượt sử dụng.")

    async def get_address(self, address_id: str) -> dict | None:
        return deepcopy(self.addresses.get(address_id))

    async def list_addresses(self, user_id: str, label: str | None = None) -> list[dict]:
        wanted = str(label or "").casefold()
        return [
            deepcopy(value)
            for value in self.addresses.values()
            if value.get("user_id") == user_id
            and (
                not wanted
                or wanted in str(value.get("label", "")).casefold()
                or wanted in str(value.get("address", "")).casefold()
            )
        ]

    async def create_order_with_optional_voucher(
        self,
        order: dict,
        voucher: dict | None,
        expected: dict | None = None,
        delivery_config: DeliveryConfig | None = None,
        address_id: str | None = None,
        address_snapshot: dict | None = None,
    ) -> dict:
        async with self._lock:
            existing = next(
                (
                    value
                    for value in self.orders.values()
                    if value["user_id"] == order["user_id"] and value["idempotency_key"] == order["idempotency_key"]
                ),
                None,
            )
            if existing:
                if expected is not None and existing["snapshot_hash"] != expected["snapshot_hash"]:
                    raise DomainError("IDEMPOTENCY_KEY_REUSED", "Idempotency key đã được dùng cho payload khác.")
                return deepcopy(existing)
            cart = self.carts.get(order["cart_id"])
            if cart is None or cart.get("user_id") != order["user_id"]:
                raise DomainError("CART_CHANGED", "Giỏ hàng đã thay đổi, vui lòng tạo lại xác nhận.")
            if expected is not None and delivery_config is not None and address_id is not None:
                address = deepcopy(address_snapshot) if address_snapshot is not None else self.addresses.get(address_id)
                voucher_code = str((cart.get("voucher") or {}).get("code", ""))
                current_voucher = self.vouchers.get(voucher_code.upper()) if voucher_code else None
                items = {
                    item["menu_item_id"]: self.items[item["menu_item_id"]]
                    for item in cart.get("items", [])
                    if item["menu_item_id"] in self.items
                }
                if address is None or address.get("user_id") != order["user_id"]:
                    raise DomainError("FORBIDDEN", "Địa chỉ giao hàng không thuộc user hiện tại.")
                restaurant_ids = {
                    str(item.get("restaurant_id", "")) for item in items.values() if str(item.get("restaurant_id", ""))
                }
                restaurants = {
                    restaurant_id: self.restaurants[restaurant_id]
                    for restaurant_id in restaurant_ids
                    if restaurant_id in self.restaurants
                }
                quote = build_authoritative_quote(cart, restaurants, items, current_voucher, address, delivery_config)
                if (
                    quote["snapshot_hash"] != expected["snapshot_hash"]
                    or int(quote["cart_version"]) != int(expected["cart_version"])
                    or int(quote["total"]["amount"]) != int(expected["amount"])
                    or quote["total"]["currency"] != expected["currency"]
                    or quote["quote_version"] != expected["quote_version"]
                ):
                    raise DomainError("CART_CHANGED", "Báo giá hoặc giỏ hàng đã thay đổi, vui lòng tạo lại xác nhận.")
                order.update(
                    {
                        "cart_version": quote["cart_version"],
                        "snapshot_hash": quote["snapshot_hash"],
                        "amount": quote["total"]["amount"],
                        "currency": quote["total"]["currency"],
                        "subtotal": quote["subtotal"],
                        "restaurant": quote["delivery"]["restaurant"],
                        "restaurants": quote.get("restaurants", []),
                        "items": quote["items"],
                        "address": quote["address"],
                        "delivery": quote["delivery"],
                        "voucher": quote.get("voucher"),
                        "voucher_code": quote.get("voucher_code"),
                        "discount": quote["discount"],
                    }
                )
                voucher = current_voucher
            elif int(cart.get("version", 0)) != int(order.get("cart_version", 0)):
                raise DomainError("CART_CHANGED", "Giỏ hàng đã thay đổi, vui lòng tạo lại xác nhận.")
            voucher_copy = deepcopy(voucher)
            if voucher_copy:
                code = str(voucher_copy["code"]).upper()
                current = self.vouchers.get(code)
                key = (code, order["user_id"])
                if (
                    current is None
                    or key in self.redeemed_vouchers
                    or int(current.get("used_count", 0)) >= int(current.get("usage_limit", 0))
                ):
                    raise DomainError("VOUCHER_USAGE_LIMIT", "Voucher đã hết lượt sử dụng.")
                calculate_discount(current, int(order["subtotal"]), datetime.now(UTC))
                if current.get("restaurant_id") and any(
                    current["restaurant_id"] != restaurant.get("id")
                    for restaurant in order.get("restaurants", [order["restaurant"]])
                ):
                    raise DomainError("VOUCHER_NOT_APPLICABLE", "Voucher không áp dụng cho nhà hàng này.")
                used = int(current.get("used_count", 0))
                limit = int(current.get("usage_limit", 0))
                if used >= limit or key in self.redeemed_vouchers:
                    raise DomainError("VOUCHER_USAGE_LIMIT", "Voucher đã hết lượt sử dụng.")
                current["used_count"] = used + 1
                self.vouchers[code] = deepcopy(current)
                self.redeemed_vouchers.add(key)
                voucher_copy = current
                order["voucher"] = deepcopy(current)
            created = deepcopy(order)
            self.orders[created["id"]] = created
            self.order_events[created["id"]] = deepcopy(created["timeline"])
            return deepcopy(created)

    async def get_order(self, order_id: str) -> dict | None:
        return deepcopy(self.orders.get(order_id))

    async def get_order_by_idempotency(self, user_id: str, idempotency_key: str) -> dict | None:
        value = next(
            (
                order
                for order in self.orders.values()
                if order["user_id"] == user_id and order["idempotency_key"] == idempotency_key
            ),
            None,
        )
        return deepcopy(value)

    async def list_orders(self) -> list[dict]:
        return [deepcopy(order) for order in self.orders.values()]

    async def list_due_orders(self, now: datetime) -> list[dict]:
        return [
            deepcopy(order)
            for order in self.orders.values()
            if order.get("next_transition_at") and _parse_datetime(order["next_transition_at"]) <= now
        ]

    def _advance_locked(self, order: dict, target: FoodOrderStatus, reason: str, actor_type: str) -> dict:
        current = FoodOrderStatus(order["status"])
        if current == target:
            return deepcopy(order)
        validate_transition(current, target)
        if target == FoodOrderStatus.DRIVER_ASSIGNED:
            driver = next((value for value in self.drivers.values() if value["available"]), None)
            if driver is None:
                raise DomainError("UPSTREAM_UNAVAILABLE", "Hiện chưa có tài xế khả dụng.")
            driver["available"] = False
            order["driver"] = {key: value for key, value in driver.items() if key != "available"}
        event = _event(current.value, target, reason, actor_type)
        order["status"] = target.value
        order.setdefault("timeline", []).append(event)
        self.order_events.setdefault(order["id"], []).append(deepcopy(event))
        order["version"] = int(order.get("version", 0)) + 1
        order["updated_at"] = event["occurred_at"]
        return deepcopy(order)

    async def transition_order_atomic(
        self,
        order_id: str,
        target: FoodOrderStatus,
        reason: str,
        actor_type: str = "system",
        next_transition_at: datetime | None = None,
        expected_version: int | None = None,
        operation_key: str | None = None,
    ) -> dict:
        async with self._lock:
            order = self.orders.get(order_id)
            if order is None:
                raise DomainError("NOT_FOUND", "Không tìm thấy đơn hàng.")
            if operation_key:
                existing_operation = self.order_operations.get((order_id, operation_key))
                if existing_operation:
                    if (
                        existing_operation["target_status"] != target.value
                        or existing_operation.get("payload_hash") != hashlib.sha256(reason.encode()).hexdigest()
                    ):
                        raise DomainError(
                            "IDEMPOTENCY_KEY_REUSED", "Transition operation key đã được dùng cho target khác."
                        )
                    return deepcopy(existing_operation["result"])
            if expected_version is not None and int(order.get("version", 0)) != expected_version:
                raise DomainError("WORKFLOW_CONFLICT", "Đơn hàng đã được cập nhật bởi worker khác.")
            updated = self._advance_locked(order, target, reason, actor_type)
            updated["next_transition_at"] = next_transition_at.isoformat() if next_transition_at else None
            if target == FoodOrderStatus.DELIVERED:
                updated["workflow_completed_at"] = datetime.now(UTC).isoformat()
                driver_id = (updated.get("driver") or {}).get("id")
                if driver_id in self.drivers:
                    self.drivers[driver_id]["available"] = True
            self.orders[order_id] = deepcopy(updated)
            if operation_key:
                self.order_operations[(order_id, operation_key)] = {
                    "target_status": target.value,
                    "payload_hash": hashlib.sha256(reason.encode()).hexdigest(),
                    "result": deepcopy(updated),
                }
            return deepcopy(updated)

    async def claim_and_advance_due_orders(self, now: datetime, limit: int, advance: AdvanceDecision) -> list[dict]:
        async with self._lock:
            due = sorted(
                (
                    order
                    for order in self.orders.values()
                    if order.get("next_transition_at") and _parse_datetime(order["next_transition_at"]) <= now
                ),
                key=lambda value: _parse_datetime(value["next_transition_at"]),
            )[:limit]
            result = []
            for order in due:
                target, decision, next_at = advance(deepcopy(order))
                if decision:
                    order["restaurant_decision"] = decision
                updated = self._advance_locked(order, target, "Timed Food workflow transition", "worker")
                updated["next_transition_at"] = next_at.isoformat() if next_at else None
                self.orders[order["id"]] = deepcopy(updated)
                result.append(deepcopy(updated))
            return result

    async def get_order_events(self, order_id: str) -> list[dict]:
        return deepcopy(self.order_events.get(order_id, []))

    async def dataset_status(self) -> dict:
        return {
            "dataset_version": "demo-hanoi",
            "source_name": "local-seed",
            "imported_at": None,
            "last_verified_at": None,
            "active": True,
            "row_count": len(self.restaurants) + len(self.items),
            "quality_warnings": [],
            "rejected_count": 0,
        }


class PostgresFoodRepository:
    """PostgreSQL adapter; every multi-step mutation owns one transaction."""

    def __init__(self, database_url: str) -> None:
        self.database_url = database_url
        self.pool = None

    async def connect(self) -> None:
        import asyncpg

        self.pool = await asyncpg.create_pool(self.database_url, min_size=1, max_size=5)

    async def close(self) -> None:
        if self.pool is not None:
            await self.pool.close()

    def _require_pool(self):
        if self.pool is None:
            raise RuntimeError("Food repository is not connected")
        return self.pool

    @staticmethod
    def _order_from_row(row: object) -> dict:
        record = dict(row)
        order = _json_object(record["data"])
        order.update(
            {
                "status": record["status"],
                "version": record["version"],
                "next_transition_at": record["next_transition_at"].isoformat()
                if record["next_transition_at"]
                else None,
                "restaurant_decision": record["restaurant_decision"],
                "driver_id": record["driver_id"],
                "created_at": record["created_at"].isoformat() if record["created_at"] else None,
                "updated_at": record["updated_at"].isoformat() if record["updated_at"] else None,
            }
        )
        return order

    async def _records(self, record_type: str) -> list[dict]:
        pool = self._require_pool()
        active_version = await pool.fetchval(
            "SELECT dataset_version FROM catalog_dataset_versions WHERE domain='food' AND is_active=TRUE ORDER BY imported_at DESC, dataset_version DESC LIMIT 1"
        )
        if active_version:
            rows = await pool.fetch(
                "SELECT data FROM food_catalog WHERE record_type = $1 AND is_active = TRUE AND dataset_version = $2 ORDER BY id",
                record_type,
                active_version,
            )
        else:
            rows = await pool.fetch(
                "SELECT data FROM food_catalog WHERE record_type = $1 AND is_active = TRUE ORDER BY id", record_type
            )
        return [_safe_catalog_record(record_type, _json_object(row["data"])) for row in rows]

    async def search(self, **filters) -> list[dict]:
        pool = self._require_pool()
        active_version = await pool.fetchval(
            "SELECT dataset_version FROM catalog_dataset_versions WHERE domain='food' AND is_active=TRUE ORDER BY imported_at DESC, dataset_version DESC LIMIT 1"
        )
        restaurants = {value["id"]: value for value in await self._records("restaurant")}
        result = []
        raw_keyword = str(filters.get("keyword", "")).strip().casefold()
        keyword = _fold_text(raw_keyword)
        preserve_diacritics = any(ord(char) > 127 for char in raw_keyword)
        district = _fold_text(filters.get("district", ""))
        category = _fold_text(filters.get("category", ""))
        restaurant_id = str(filters.get("restaurant_id", ""))
        item_keyword_match = False
        primary_item_keyword_match = False
        item_query = (
            "SELECT id, data->>'restaurant_id' AS restaurant_id, data->>'name' AS name, "
            "data->>'description' AS description, data->>'price' AS price, "
            "data->>'category' AS category FROM food_catalog "
            "WHERE record_type='menu_item' AND is_active=TRUE"
        )
        item_args: list[object] = []
        if active_version:
            item_query += " AND dataset_version=$1"
            item_args.append(active_version)
        item_query += " ORDER BY id"
        # Search only the scalar fields needed for matching. Full JSON payloads
        # (images, option groups, descriptions, etc.) are hydrated after the
        # result window is selected, avoiding a 17k-record JSON decode on every
        # assistant turn.
        item_rows = await pool.fetch(item_query, *item_args)
        for row in item_rows:
            item = {
                "id": str(row["id"]),
                "restaurant_id": str(row["restaurant_id"] or ""),
                "name": str(row["name"] or ""),
                "description": str(row["description"] or ""),
                "price": int(row["price"] or 0),
                "category": str(row["category"] or ""),
            }
            if restaurant_id and item["restaurant_id"] != restaurant_id:
                continue
            restaurant = restaurants.get(item["restaurant_id"])
            if restaurant is None:
                continue
            primary_item_haystack = _fold_text(f"{item['name']} {item.get('category', '')}")
            item_haystack = _fold_text(f"{primary_item_haystack} {item.get('description', '')}")
            restaurant_haystack = _fold_text(restaurant["name"])
            raw_primary_item_haystack = f"{item['name']} {item.get('category', '')}".casefold()
            raw_item_haystack = f"{raw_primary_item_haystack} {item.get('description', '')}".casefold()
            raw_restaurant_haystack = str(restaurant["name"]).casefold()
            matches_primary_item = not keyword or (
                _matches_keyword(raw_primary_item_haystack, raw_keyword)
                if preserve_diacritics
                else _matches_keyword(primary_item_haystack, keyword)
            )
            matches_item = matches_primary_item or (
                bool(keyword)
                and (
                    _matches_keyword(raw_item_haystack, raw_keyword)
                    if preserve_diacritics
                    else _matches_keyword(item_haystack, keyword)
                )
            )
            matches_restaurant = not keyword or (
                _matches_keyword(raw_restaurant_haystack, raw_keyword)
                if preserve_diacritics
                else _matches_keyword(restaurant_haystack, keyword)
            )
            if keyword and not matches_item and not matches_restaurant:
                continue
            if district and district not in _fold_text(f"{restaurant['district']} {restaurant.get('address', '')}"):
                continue
            if category and category != _fold_text(item["category"]):
                continue
            if filters.get("min_price") is not None and item["price"] < filters["min_price"]:
                continue
            if filters.get("max_price") is not None and item["price"] > filters["max_price"]:
                continue
            if filters.get("open_only", True) and not restaurant["is_open"]:
                continue
            item_keyword_match = item_keyword_match or matches_item
            primary_item_keyword_match = primary_item_keyword_match or matches_primary_item
            result.append(
                {
                    "item": item,
                    "restaurant": restaurant,
                    "_item_keyword_match": matches_item,
                    "_primary_item_keyword_match": matches_primary_item,
                }
            )
        if keyword and primary_item_keyword_match:
            result = [entry for entry in result if entry["_primary_item_keyword_match"]]
        elif keyword and item_keyword_match:
            result = [entry for entry in result if entry["_item_keyword_match"]]
        start = int(filters.get("offset", 0) or 0)
        limit = int(filters.get("limit", 12) or 12)
        result.sort(
            key=lambda value: (
                -(value["restaurant"].get("rating") or 0),
                -(value["restaurant"].get("review_count") or 0),
                str(value["item"].get("name", "")).casefold(),
                str(value["item"].get("id", "")),
            )
        )
        window = result[start : start + limit]
        item_ids = [str(entry["item"]["id"]) for entry in window]
        if not item_ids:
            return []
        full_query = (
            "SELECT id, data FROM food_catalog WHERE record_type='menu_item' AND is_active=TRUE AND id=ANY($1::text[])"
        )
        full_args: list[object] = [item_ids]
        if active_version:
            full_query += " AND dataset_version=$2"
            full_args.append(active_version)
        rows = await pool.fetch(full_query, *full_args)
        full_items = {str(row["id"]): _safe_catalog_record("menu_item", _json_object(row["data"])) for row in rows}
        return [
            {"item": full_items.get(str(entry["item"]["id"]), entry["item"]), "restaurant": entry["restaurant"]}
            for entry in window
        ]

    async def list_menu_items(self, restaurant_id: str, limit: int = 20, offset: int = 0) -> tuple[list[dict], int]:
        pool = self._require_pool()
        active_version = await pool.fetchval(
            "SELECT dataset_version FROM catalog_dataset_versions WHERE domain='food' AND is_active=TRUE ORDER BY imported_at DESC, dataset_version DESC LIMIT 1"
        )
        predicates = "record_type='menu_item' AND is_active=TRUE AND data->>'restaurant_id'=$1"
        args: list[object] = [restaurant_id]
        if active_version:
            predicates += " AND dataset_version=$2"
            args.append(active_version)
        total = int(await pool.fetchval(f"SELECT count(*)::int FROM food_catalog WHERE {predicates}", *args) or 0)
        rows = await pool.fetch(
            f"SELECT data FROM food_catalog WHERE {predicates} ORDER BY id LIMIT ${len(args) + 1} OFFSET ${len(args) + 2}",
            *args,
            limit,
            offset,
        )
        return [_safe_catalog_record("menu_item", _json_object(row["data"])) for row in rows], total

    async def list_restaurants(
        self,
        keyword: str = "",
        district: str | None = None,
        category: str | None = None,
        open_only: bool = True,
        limit: int = 12,
        offset: int = 0,
    ) -> tuple[list[dict], int]:
        raw_keyword = str(keyword or "").strip().casefold()
        fold_keyword = _fold_text(raw_keyword)
        if fold_keyword:
            search_results = await self.search(keyword=keyword, district=district, category=category, open_only=open_only, limit=1000, offset=0)
            grouped: dict[str, dict] = {}
            for res in search_results:
                r = res["restaurant"]
                grouped.setdefault(r["id"], {**r, "matching_items": []})["matching_items"].append(res["item"])
            all_items = list(grouped.values())
            total = len(all_items)
            return all_items[offset : offset + limit], total

        raw_district = district or ""
        district_folded = "" if str(raw_district).strip().casefold() in ("hà nội", "ha noi", "hồ chí minh", "ho chi minh", "tp hcm", "đà nẵng", "da nang") else _fold_text(raw_district)
        all_restaurants = [value for value in await self._records("restaurant")]
        matched = []
        for r in all_restaurants:
            if open_only and not r.get("is_open", True):
                continue
            if district_folded and district_folded not in _fold_text(f"{r.get('district', '')} {r.get('address', '')}"):
                continue
            matched.append(r)
        matched.sort(
            key=lambda r: (
                -(r.get("rating") or 0),
                -(r.get("review_count") or 0),
                str(r.get("name", "")).casefold(),
            )
        )
        total = len(matched)
        return matched[offset : offset + limit], total

    async def get_restaurant(self, restaurant_id: str) -> dict | None:
        pool = self._require_pool()
        active_version = await pool.fetchval(
            "SELECT dataset_version FROM catalog_dataset_versions WHERE domain='food' AND is_active=TRUE ORDER BY imported_at DESC, dataset_version DESC LIMIT 1"
        )
        query = "SELECT data FROM food_catalog WHERE record_type = 'restaurant' AND id = $1 AND is_active = TRUE"
        args: tuple[object, ...] = (restaurant_id,)
        if active_version:
            query += " AND dataset_version = $2"
            args += (active_version,)
        row = await pool.fetchrow(query, *args)
        return _safe_catalog_record("restaurant", _json_object(row["data"])) if row else None

    async def get_menu_item(self, item_id: str) -> dict | None:
        pool = self._require_pool()
        active_version = await pool.fetchval(
            "SELECT dataset_version FROM catalog_dataset_versions WHERE domain='food' AND is_active=TRUE ORDER BY imported_at DESC, dataset_version DESC LIMIT 1"
        )
        query = "SELECT data FROM food_catalog WHERE record_type = 'menu_item' AND id = $1 AND is_active = TRUE"
        args: tuple[object, ...] = (item_id,)
        if active_version:
            query += " AND dataset_version = $2"
            args += (active_version,)
        row = await pool.fetchrow(query, *args)
        return _safe_catalog_record("menu_item", _json_object(row["data"])) if row else None

    async def get_cart(self, cart_id: str) -> dict | None:
        row = await self._require_pool().fetchrow("SELECT data, version FROM food_carts WHERE id = $1", cart_id)
        if not row:
            return None
        cart = _json_object(row["data"])
        cart["version"] = row["version"]
        return cart

    async def save_cart(self, cart: dict, expected_version: int | None = None) -> dict:
        pool = self._require_pool()
        async with pool.acquire() as connection, connection.transaction():
            current = await connection.fetchrow("SELECT version FROM food_carts WHERE id=$1 FOR UPDATE", cart["id"])
            current_version = int(current["version"]) if current else None
            if current and expected_version is not None and current_version != expected_version:
                raise DomainError("CART_CHANGED", "Giỏ hàng đã thay đổi, vui lòng tải lại.")
            if current:
                row = await connection.fetchrow(
                    "UPDATE food_carts SET data=$1::jsonb, version=version+1, updated_at=now() WHERE id=$2 RETURNING version",
                    json.dumps(cart, ensure_ascii=False),
                    cart["id"],
                )
            else:
                row = await connection.fetchrow(
                    "INSERT INTO food_carts (id,user_id,restaurant_id,data,version) VALUES ($1,$2,$3,$4::jsonb,0) RETURNING version",
                    cart["id"],
                    cart["user_id"],
                    cart["restaurant_id"],
                    json.dumps(cart, ensure_ascii=False),
                )
            saved = deepcopy(cart)
            saved["version"] = int(row["version"])
            return saved

    async def save_cart_idempotent(
        self,
        cart: dict,
        expected_version: int,
        actor_id: str,
        operation: str,
        idempotency_key: str,
        payload_hash: str,
    ) -> dict:
        pool = self._require_pool()
        async with pool.acquire() as connection, connection.transaction():
            await connection.execute(
                """
                INSERT INTO food_cart_write_operations (
                    actor_id, operation, idempotency_key, payload_hash, cart_id
                )
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (actor_id, operation, idempotency_key) DO NOTHING
                """,
                actor_id,
                operation,
                idempotency_key,
                payload_hash,
                cart["id"],
            )
            operation_row = await connection.fetchrow(
                """
                SELECT payload_hash, result
                FROM food_cart_write_operations
                WHERE actor_id=$1 AND operation=$2 AND idempotency_key=$3
                FOR UPDATE
                """,
                actor_id,
                operation,
                idempotency_key,
            )
            if operation_row is None or str(operation_row["payload_hash"]) != payload_hash:
                raise DomainError(
                    "IDEMPOTENCY_KEY_REUSED",
                    "Idempotency key đã được dùng cho payload khác.",
                )
            if operation_row["result"] is not None:
                return _json_object(operation_row["result"])

            current = await connection.fetchrow(
                "SELECT user_id, version FROM food_carts WHERE id=$1 FOR UPDATE",
                cart["id"],
            )
            if current is None or str(current["user_id"]) != actor_id:
                raise DomainError("FORBIDDEN", "Giỏ hàng không thuộc user hiện tại.")
            if int(current["version"]) != expected_version:
                raise DomainError("CART_CHANGED", "Giỏ hàng đã thay đổi, vui lòng tải lại.")

            row = await connection.fetchrow(
                """
                UPDATE food_carts
                SET data=$1::jsonb, version=version+1, updated_at=now()
                WHERE id=$2
                RETURNING version
                """,
                json.dumps(cart, ensure_ascii=False),
                cart["id"],
            )
            saved = deepcopy(cart)
            saved["version"] = int(row["version"])
            await connection.execute(
                """
                UPDATE food_cart_write_operations
                SET result=$1::jsonb
                WHERE actor_id=$2 AND operation=$3 AND idempotency_key=$4
                """,
                json.dumps(saved, ensure_ascii=False),
                actor_id,
                operation,
                idempotency_key,
            )
            return saved

    async def get_cart_write_replay(
        self,
        actor_id: str,
        operation: str,
        idempotency_key: str,
        payload_hash: str,
    ) -> dict | None:
        row = await self._require_pool().fetchrow(
            """
            SELECT payload_hash, result
            FROM food_cart_write_operations
            WHERE actor_id=$1 AND operation=$2 AND idempotency_key=$3
            """,
            actor_id,
            operation,
            idempotency_key,
        )
        if row is None:
            return None
        if str(row["payload_hash"]) != payload_hash:
            raise DomainError(
                "IDEMPOTENCY_KEY_REUSED",
                "Idempotency key đã được dùng cho payload khác.",
            )
        return _json_object(row["result"]) if row["result"] is not None else None

    async def create_cart_idempotent(self, cart: dict, idempotency_key: str) -> dict:
        pool = self._require_pool()
        payload_hash = hashlib.sha256(
            json.dumps({"restaurant_id": cart["restaurant_id"]}, sort_keys=True).encode()
        ).hexdigest()
        async with pool.acquire() as connection, connection.transaction():
            await connection.execute(
                "INSERT INTO food_carts (id,user_id,restaurant_id,data,idempotency_key,payload_hash,version) VALUES ($1,$2,$3,$4::jsonb,$5,$6,0) ON CONFLICT (user_id,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING",
                cart["id"],
                cart["user_id"],
                cart["restaurant_id"],
                json.dumps(cart, ensure_ascii=False),
                idempotency_key,
                payload_hash,
            )
            row = await connection.fetchrow(
                "SELECT data,version,payload_hash FROM food_carts WHERE user_id=$1 AND idempotency_key=$2 FOR UPDATE",
                cart["user_id"],
                idempotency_key,
            )
            if not row:
                raise DomainError("IDEMPOTENCY_KEY_REUSED", "Không thể lưu giỏ hàng idempotent.")
            if row["payload_hash"] and str(row["payload_hash"]) != payload_hash:
                raise DomainError("IDEMPOTENCY_KEY_REUSED", "Idempotency key đã được dùng cho nhà hàng khác.")
            saved = _json_object(row["data"])
            saved["version"] = int(row["version"])
            return saved

    async def get_voucher(self, code: str) -> dict | None:
        row = await self._require_pool().fetchrow(
            "SELECT data FROM food_catalog WHERE record_type = 'voucher' AND id = $1 AND is_active = TRUE", code.upper()
        )
        return _json_object(row["data"]) if row else None

    async def ensure_voucher_eligible(self, code: str, user_id: str) -> None:
        row = await self._require_pool().fetchrow(
            "SELECT data FROM food_catalog WHERE record_type='voucher' AND id=$1 AND is_active = TRUE", code.upper()
        )
        if not row:
            raise DomainError("VOUCHER_INVALID", "Voucher không hợp lệ.")
        voucher = _json_object(row["data"])
        used = await self._require_pool().fetchval(
            "SELECT 1 FROM food_voucher_redemptions WHERE voucher_code=$1 AND user_id=$2", code.upper(), user_id
        )
        if used or int(voucher.get("used_count", 0)) >= int(voucher.get("usage_limit", 0)):
            raise DomainError("VOUCHER_USAGE_LIMIT", "Voucher đã hết lượt sử dụng.")

    async def get_address(self, address_id: str) -> dict | None:
        row = await self._require_pool().fetchrow(
            "SELECT data FROM food_catalog WHERE record_type = 'address' AND id = $1 AND is_active = TRUE", address_id
        )
        return _json_object(row["data"]) if row else None

    async def list_addresses(self, user_id: str, label: str | None = None) -> list[dict]:
        wanted = _fold_text(label)
        rows = await self._require_pool().fetch(
            "SELECT data FROM food_catalog WHERE record_type='address' AND is_active = TRUE AND data->>'user_id'=$1 ORDER BY id",
            user_id,
        )
        addresses = [_json_object(row["data"]) for row in rows]
        if not wanted:
            return addresses
        return [
            address
            for address in addresses
            if wanted in _fold_text(address.get("label", "")) or wanted in _fold_text(address.get("address", ""))
        ]

    async def create_order_with_optional_voucher(
        self,
        order: dict,
        voucher: dict | None,
        expected: dict | None = None,
        delivery_config: DeliveryConfig | None = None,
        address_id: str | None = None,
        address_snapshot: dict | None = None,
    ) -> dict:
        pool = self._require_pool()
        async with pool.acquire() as connection, connection.transaction():
            existing = await connection.fetchrow(
                "SELECT * FROM food_orders WHERE user_id=$1 AND idempotency_key=$2 FOR UPDATE",
                order["user_id"],
                order["idempotency_key"],
            )
            if existing:
                existing_order = self._order_from_row(existing)
                if expected is not None and existing_order["snapshot_hash"] != expected["snapshot_hash"]:
                    raise DomainError("IDEMPOTENCY_KEY_REUSED", "Idempotency key đã được dùng cho payload khác.")
                return existing_order
            cart_row = await connection.fetchrow(
                "SELECT user_id, restaurant_id, version, data FROM food_carts WHERE id=$1 FOR UPDATE", order["cart_id"]
            )
            if not cart_row or cart_row["user_id"] != order["user_id"]:
                raise DomainError("CART_CHANGED", "Giỏ hàng đã thay đổi, vui lòng tạo lại xác nhận.")
            cart = _json_object(cart_row["data"])
            cart["version"] = int(cart_row["version"])
            if expected is None:
                if int(cart_row["version"]) != int(order.get("cart_version", 0)):
                    raise DomainError("CART_CHANGED", "Giỏ hàng đã thay đổi, vui lòng tạo lại xác nhận.")
            else:
                if delivery_config is None or address_id is None:
                    raise DomainError("CART_CHANGED", "Authoritative quote configuration is missing.")
                address_row = (
                    None
                    if address_snapshot is not None
                    else await connection.fetchrow(
                        "SELECT data FROM food_catalog WHERE record_type='address' AND id=$1 AND is_active = TRUE FOR UPDATE",
                        address_id,
                    )
                )
                if address_snapshot is None and not address_row:
                    raise DomainError("NOT_FOUND", "Không tìm thấy địa chỉ giao hàng.")
                address = (
                    deepcopy(address_snapshot) if address_snapshot is not None else _json_object(address_row["data"])
                )
                if address.get("user_id") != order["user_id"]:
                    raise DomainError("FORBIDDEN", "Địa chỉ giao hàng không thuộc user hiện tại.")
                item_ids = [str(item["menu_item_id"]) for item in cart.get("items", [])]
                item_rows = await connection.fetch(
                    "SELECT id,data FROM food_catalog WHERE record_type='menu_item' AND is_active = TRUE AND id=ANY($1::text[]) FOR UPDATE",
                    item_ids,
                )
                items = {str(row["id"]): _json_object(row["data"]) for row in item_rows}
                restaurant_ids = list(
                    dict.fromkeys(
                        str(item.get("restaurant_id", ""))
                        for item in items.values()
                        if str(item.get("restaurant_id", ""))
                    )
                )
                restaurant_rows = await connection.fetch(
                    "SELECT id,data FROM food_catalog WHERE record_type='restaurant' AND is_active = TRUE AND id=ANY($1::text[]) FOR UPDATE",
                    restaurant_ids,
                )
                restaurants = {str(row["id"]): _json_object(row["data"]) for row in restaurant_rows}
                voucher_code = str((cart.get("voucher") or {}).get("code", "")) or None
                voucher_row = (
                    await connection.fetchrow(
                        "SELECT data FROM food_catalog WHERE record_type='voucher' AND id=$1 AND is_active = TRUE FOR UPDATE",
                        voucher_code.upper(),
                    )
                    if voucher_code
                    else None
                )
                current_voucher = _json_object(voucher_row["data"]) if voucher_row else None
                quote = build_authoritative_quote(cart, restaurants, items, current_voucher, address, delivery_config)
                if (
                    quote["snapshot_hash"] != expected["snapshot_hash"]
                    or int(quote["cart_version"]) != int(expected["cart_version"])
                    or int(quote["total"]["amount"]) != int(expected["amount"])
                    or quote["total"]["currency"] != expected["currency"]
                    or quote["quote_version"] != expected["quote_version"]
                ):
                    raise DomainError("CART_CHANGED", "Báo giá hoặc giỏ hàng đã thay đổi, vui lòng tạo lại xác nhận.")
                order.update(
                    {
                        "cart_version": quote["cart_version"],
                        "snapshot_hash": quote["snapshot_hash"],
                        "amount": quote["total"]["amount"],
                        "currency": quote["total"]["currency"],
                        "subtotal": quote["subtotal"],
                        "restaurant": quote["delivery"]["restaurant"],
                        "restaurants": quote.get("restaurants", []),
                        "items": quote["items"],
                        "address": quote["address"],
                        "delivery": quote["delivery"],
                        "voucher": quote.get("voucher"),
                        "voucher_code": quote.get("voucher_code"),
                        "discount": quote["discount"],
                    }
                )
                voucher = current_voucher
            if voucher:
                code = str(voucher["code"]).upper()
                voucher_row = await connection.fetchrow(
                    "SELECT data FROM food_catalog WHERE record_type='voucher' AND id=$1 AND is_active = TRUE FOR UPDATE",
                    code,
                )
                if not voucher_row:
                    raise DomainError("VOUCHER_INVALID", "Voucher không hợp lệ.")
                current = _json_object(voucher_row["data"])
                if await connection.fetchval(
                    "SELECT 1 FROM food_voucher_redemptions WHERE voucher_code=$1 AND user_id=$2",
                    code,
                    order["user_id"],
                ):
                    raise DomainError("VOUCHER_USAGE_LIMIT", "Voucher đã được user sử dụng.")
                calculate_discount(current, int(order["subtotal"]), datetime.now(UTC))
                if current.get("restaurant_id") and any(
                    current["restaurant_id"] != restaurant.get("id")
                    for restaurant in order.get("restaurants", [order["restaurant"]])
                ):
                    raise DomainError("VOUCHER_NOT_APPLICABLE", "Voucher không áp dụng cho nhà hàng này.")
                updated = await connection.fetchrow(
                    "UPDATE food_catalog SET data=jsonb_set(data,'{used_count}',to_jsonb(COALESCE((data->>'used_count')::int,0)+1)),updated_at=now() WHERE record_type='voucher' AND id=$1 AND is_active = TRUE AND COALESCE((data->>'used_count')::int,0) < COALESCE((data->>'usage_limit')::int,0) RETURNING data",
                    code,
                )
                if not updated:
                    raise DomainError("VOUCHER_USAGE_LIMIT", "Voucher đã hết lượt sử dụng.")
                order["voucher"] = _json_object(updated["data"])
            next_at = _parse_datetime(order["next_transition_at"]) if order.get("next_transition_at") else None
            await connection.execute(
                "INSERT INTO food_orders (id,user_id,status,idempotency_key,snapshot_hash,amount,currency,next_transition_at,workflow_scenario,restaurant_decision,driver_id,data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)",
                order["id"],
                order["user_id"],
                order["status"],
                order["idempotency_key"],
                order["snapshot_hash"],
                order["amount"],
                order["currency"],
                next_at,
                order.get("workflow_scenario", "standard"),
                order.get("restaurant_decision"),
                (order.get("driver") or {}).get("id"),
                json.dumps(order, ensure_ascii=False),
            )
            timeline = order.get("timeline", [])
            first = (
                timeline[0]
                if timeline
                else {
                    "from_status": None,
                    "to_status": order["status"],
                    "reason": "Order created",
                    "actor_type": "gateway",
                }
            )
            await connection.execute(
                "INSERT INTO food_order_status_events (order_id,from_status,to_status,occurred_at,reason,actor_type) VALUES ($1,$2,$3,$4,$5,$6)",
                order["id"],
                first.get("from_status"),
                first["to_status"],
                _parse_datetime(first.get("occurred_at", datetime.now(UTC).isoformat())),
                first.get("reason", "Order created"),
                first.get("actor_type", "gateway"),
            )
            if voucher:
                await connection.execute(
                    "INSERT INTO food_voucher_redemptions (voucher_code,order_id,user_id) VALUES ($1,$2,$3)",
                    str(voucher["code"]).upper(),
                    order["id"],
                    order["user_id"],
                )
            row = await connection.fetchrow("SELECT * FROM food_orders WHERE id=$1", order["id"])
            return self._order_from_row(row)

    async def get_order(self, order_id: str) -> dict | None:
        row = await self._require_pool().fetchrow("SELECT * FROM food_orders WHERE id = $1", order_id)
        return self._order_from_row(row) if row else None

    async def get_order_by_idempotency(self, user_id: str, idempotency_key: str) -> dict | None:
        row = await self._require_pool().fetchrow(
            "SELECT * FROM food_orders WHERE user_id=$1 AND idempotency_key=$2", user_id, idempotency_key
        )
        return self._order_from_row(row) if row else None

    async def list_orders(self) -> list[dict]:
        rows = await self._require_pool().fetch("SELECT * FROM food_orders ORDER BY created_at")
        return [self._order_from_row(row) for row in rows]

    async def dataset_status(self) -> dict:
        pool = self._require_pool()
        version = await pool.fetchrow(
            "SELECT dataset_version,source_manifest,imported_at,is_active,status FROM catalog_dataset_versions WHERE domain='food' AND is_active=TRUE ORDER BY imported_at DESC, dataset_version DESC LIMIT 1"
        )
        row_count = await pool.fetchval(
            "SELECT count(*)::int FROM food_catalog WHERE is_active = TRUE"
            if not version
            else "SELECT count(*)::int FROM food_catalog WHERE is_active = TRUE AND dataset_version = $1",
            *(() if not version else (version["dataset_version"],)),
        )
        if not version:
            return {
                "dataset_version": None,
                "source_name": None,
                "imported_at": None,
                "last_verified_at": None,
                "active": bool(row_count),
                "row_count": int(row_count or 0),
                "quality_warnings": [],
                "rejected_count": 0,
            }
        manifest = _json_object(version["source_manifest"]) if version["source_manifest"] else {}
        return {
            "dataset_version": version["dataset_version"],
            "source_name": manifest.get("source_name"),
            "imported_at": version["imported_at"].isoformat() if version["imported_at"] else None,
            "last_verified_at": manifest.get("last_verified_at"),
            "active": bool(version["is_active"]),
            "row_count": int(row_count or 0),
            "quality_warnings": manifest.get("quality_warnings", []),
            "rejected_count": manifest.get("rejected_count", 0),
        }

    async def list_due_orders(self, now: datetime) -> list[dict]:
        rows = await self._require_pool().fetch(
            "SELECT * FROM food_orders WHERE next_transition_at IS NOT NULL AND next_transition_at <= $1 ORDER BY next_transition_at",
            now,
        )
        return [self._order_from_row(row) for row in rows]

    async def _transition_connection(
        self,
        connection,
        row: object,
        target: FoodOrderStatus,
        reason: str,
        actor_type: str,
        next_transition_at: datetime | None,
        decision: str | None = None,
        operation_key: str | None = None,
    ) -> dict:
        order = self._order_from_row(row)
        current = FoodOrderStatus(order["status"])
        if current == target:
            return order
        validate_transition(current, target)
        if target == FoodOrderStatus.DRIVER_ASSIGNED:
            driver_row = await connection.fetchrow(
                "SELECT id,data FROM food_drivers WHERE available=true ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1"
            )
            if not driver_row:
                raise DomainError("UPSTREAM_UNAVAILABLE", "Hiện chưa có tài xế khả dụng.")
            driver = _json_object(driver_row["data"])
            await connection.execute(
                "UPDATE food_drivers SET available=false,assigned_order_id=$1,updated_at=now() WHERE id=$2",
                order["id"],
                driver_row["id"],
            )
            order["driver"] = driver
            order["driver_id"] = driver_row["id"]
        if decision:
            order["restaurant_decision"] = decision
        event = _event(current.value, target, reason, actor_type)
        order["status"] = target.value
        order.setdefault("timeline", []).append(event)
        order["next_transition_at"] = next_transition_at.isoformat() if next_transition_at else None
        if target == FoodOrderStatus.DELIVERED:
            order["workflow_completed_at"] = datetime.now(UTC).isoformat()
        updated = await connection.fetchrow(
            "UPDATE food_orders SET status=$1,next_transition_at=$2,restaurant_decision=$3,driver_id=$4,workflow_completed_at=$5,data=$6::jsonb,version=version+1,updated_at=now() WHERE id=$7 AND version=$8 RETURNING *",
            target.value,
            next_transition_at,
            order.get("restaurant_decision"),
            order.get("driver_id"),
            _parse_datetime(order["workflow_completed_at"]) if order.get("workflow_completed_at") else None,
            json.dumps(order, ensure_ascii=False),
            order["id"],
            int(row["version"]),
        )
        if not updated:
            raise DomainError("WORKFLOW_CONFLICT", "Đơn hàng đã được cập nhật bởi worker khác.")
        await connection.execute(
            "INSERT INTO food_order_status_events (order_id,from_status,to_status,reason,actor_type,metadata) VALUES ($1,$2,$3,$4,$5,$6::jsonb)",
            order["id"],
            current.value,
            target.value,
            reason,
            actor_type,
            json.dumps({"version": int(updated["version"])}, ensure_ascii=False),
        )
        if target == FoodOrderStatus.DELIVERED and order.get("driver_id"):
            await connection.execute(
                "UPDATE food_drivers SET available=true,assigned_order_id=NULL,updated_at=now() WHERE id=$1",
                order["driver_id"],
            )
        return self._order_from_row(updated)

    async def transition_order_atomic(
        self,
        order_id: str,
        target: FoodOrderStatus,
        reason: str,
        actor_type: str = "system",
        next_transition_at: datetime | None = None,
        expected_version: int | None = None,
        operation_key: str | None = None,
    ) -> dict:
        pool = self._require_pool()
        async with pool.acquire() as connection, connection.transaction():
            row = await connection.fetchrow("SELECT * FROM food_orders WHERE id=$1 FOR UPDATE", order_id)
            if not row:
                raise DomainError("NOT_FOUND", "Không tìm thấy đơn hàng.")
            if operation_key:
                operation = await connection.fetchrow(
                    "SELECT target_status,payload_hash,result FROM food_order_operations WHERE order_id=$1 AND operation_key=$2 FOR UPDATE",
                    order_id,
                    operation_key,
                )
                if operation:
                    if str(operation["target_status"]) != target.value or (
                        operation["payload_hash"]
                        and str(operation["payload_hash"]) != hashlib.sha256(reason.encode()).hexdigest()
                    ):
                        raise DomainError(
                            "IDEMPOTENCY_KEY_REUSED", "Transition operation key đã được dùng cho target khác."
                        )
                    return _json_object(operation["result"])
            if expected_version is not None and int(row["version"]) != expected_version:
                raise DomainError("WORKFLOW_CONFLICT", "Đơn hàng đã được cập nhật bởi worker khác.")
            updated = await self._transition_connection(connection, row, target, reason, actor_type, next_transition_at)
            if operation_key:
                await connection.execute(
                    "INSERT INTO food_order_operations (order_id,operation_key,operation_type,target_status,payload_hash,result) VALUES ($1,$2,$3,$4,$5,$6::jsonb)",
                    order_id,
                    operation_key,
                    "ORDER_TRANSITION",
                    target.value,
                    hashlib.sha256(reason.encode()).hexdigest(),
                    json.dumps(updated, ensure_ascii=False),
                )
            return updated

    async def claim_and_advance_due_orders(self, now: datetime, limit: int, advance: AdvanceDecision) -> list[dict]:
        pool = self._require_pool()
        result: list[dict] = []
        async with pool.acquire() as connection, connection.transaction():
            for _ in range(limit):
                # A ready order needs a free driver, but an already assigned
                # order may still need to advance and release that driver.
                # Skip only the blocked ready rows so one unavailable driver
                # cannot head-of-line block the whole workflow queue.
                row = await connection.fetchrow(
                    "SELECT * FROM food_orders "
                    "WHERE next_transition_at IS NOT NULL AND next_transition_at <= $1 "
                    "AND (status <> 'READY_FOR_PICKUP' OR EXISTS (SELECT 1 FROM food_drivers WHERE available = true)) "
                    "ORDER BY next_transition_at FOR UPDATE SKIP LOCKED LIMIT 1",
                    now,
                )
                if not row:
                    break
                order = self._order_from_row(row)
                target, decision, next_at = advance(deepcopy(order))
                result.append(
                    await self._transition_connection(
                        connection, row, target, "Timed Food workflow transition", "worker", next_at, decision
                    )
                )
        return result

    async def get_order_events(self, order_id: str) -> list[dict]:
        rows = await self._require_pool().fetch(
            "SELECT from_status,to_status,occurred_at,reason,actor_type,metadata FROM food_order_status_events WHERE order_id=$1 ORDER BY id",
            order_id,
        )
        return [
            {
                "from_status": row["from_status"],
                "to_status": row["to_status"],
                "occurred_at": row["occurred_at"].isoformat(),
                "reason": row["reason"],
                "actor_type": row["actor_type"],
                "metadata": _json_object(row["metadata"]) if row["metadata"] else {},
            }
            for row in rows
        ]
