from pathlib import Path
from types import SimpleNamespace

import pytest
import src.agents.graph as graph_module
from src.agents.graph import build_graph
from src.agents.intent import classify, extract_slots
from src.agents.option_resolution import resolve_options
from src.agents.reference_resolution import resolve_references
from src.agents.tool_selection import select_tools


def test_fallback_extracts_semantics_without_seed_ids() -> None:
    slots = extract_slots("Tìm hamburger bò dưới 100 nghìn, áp mã SUMMER987")
    assert classify("Tìm hamburger bò") == "search_food"
    assert classify("Tìm phở giao về nhà") == "search_food"
    assert slots["dish_query"] == "hamburger bò"
    assert slots["voucher_code"] == "SUMMER987"
    assert "item_id" not in slots
    assert "restaurant_id" not in slots


def test_fallback_extracts_city_filter_without_leaking_it_into_dish_query() -> None:
    slots = extract_slots("Tìm phở bò dưới 100 nghìn ở Hà Nội.")
    assert slots["dish_query"] == "phở bò"
    assert slots["district"] == "ha noi"


def test_fallback_stops_food_query_before_delivery_and_another_domain() -> None:
    slots = extract_slots("Tìm phở giao về nhà và đặt lịch khám thần kinh sáng mai")
    assert slots["dish_query"] == "phở"


def test_explicit_delivery_address_declaration_extracts_only_the_address() -> None:
    slots = extract_slots("Địa chỉ nhà tôi là 181 Đường Nguyễn Trãi.")

    assert slots["address_query"] == "181 Đường Nguyễn Trãi"


def test_initial_food_delivery_request_searches_by_dish_not_the_full_sentence() -> None:
    query = "tôi muốn đặt phở bò giao về nhà"
    slots = extract_slots(query)
    assert classify(query) == "search_food"
    assert slots["dish_query"] == "phở bò"
    assert select_tools(classify(query), slots, []) == [{"name": "search_food", "arguments": {"keyword": "phở bò"}}]


def test_references_and_options_use_authoritative_opaque_values() -> None:
    slots = resolve_references(
        {"menu_item_alias": "second", "option_preferences": [{"concept": "size", "value": "lon"}]},
        {"menu_item_candidates": [{"id": "item_A", "name": "pizza"}, {"id": "item_Z_71b", "name": "burger bo", "restaurant_id": "restaurant_A_93f"}]},
    )
    assert slots["menu_item_id"] == "item_Z_71b"
    selected, missing = resolve_options(
        [{"id": "group_random", "name": "Kích thước", "required": True, "options": [{"id": "option_random", "name": "Cỡ lớn"}]}],
        slots["option_preferences"],
    )
    assert selected == [{"group_id": "group_random", "option_id": "option_random"}]
    assert missing == []


def test_runtime_graph_contains_no_seed_business_literals() -> None:
    graph = Path(__file__).parents[2] / "src" / "agents" / "graph.py"
    source = graph.read_text(encoding="utf-8")
    for literal in ("res_pho_hanoi", "item_pho_bo", "addr_demo", "XONE50", "PHO20K", "opt_size", "large", "usr_demo_001", "conv_demo"):
        assert literal not in source


def test_address_discovery_is_a_tool_request() -> None:
    assert select_tools("list_addresses", {"address_query": "nha rieng"}, []) == [{"name": "list_food_delivery_addresses", "arguments": {"label": "nha rieng"}}]


def test_new_dish_query_does_not_reuse_previous_menu_item() -> None:
    slots = resolve_references(
        {"menu_item_id": "item_old", "dish_query": "pho ga"},
        {"menu_item_candidates": [{"id": "item_old", "name": "pho bo tai"}]},
    )
    assert "menu_item_id" not in slots


class AddressDiscoveryGateway:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def registry(self, correlation_id: str) -> list[dict[str, str]]:
        return [
            {"name": "list_food_delivery_addresses", "permission": "read"},
            {"name": "quote_delivery", "permission": "read"},
            {"name": "prepare_food_order_confirmation", "permission": "confirmation_prepare"},
        ]

    async def execute(self, name: str, arguments: dict, user_id: str, correlation_id: str, conversation_id: str | None = None) -> dict:
        self.calls.append(name)
        if name == "list_food_delivery_addresses":
            return {"addresses": [{"id": "address_opaque_7", "label": "Nhà riêng", "user_id": user_id}]}
        if name == "quote_delivery":
            return {"restaurant": {"id": arguments["restaurant_id"]}, "address": {"id": arguments["address_id"]}, "delivery": {"fee": 15000}}
        return {"id": "confirmation_opaque_7", "action": "PLACE_FOOD_ORDER"}


class NestedCallLimitGateway:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def registry(self, correlation_id: str) -> list[dict[str, str]]:
        return [
            {"name": "view_menu_item", "permission": "read"},
            {"name": "create_cart", "permission": "write"},
            {"name": "add_to_cart", "permission": "write"},
        ]

    async def execute(self, name: str, arguments: dict, user_id: str, correlation_id: str, conversation_id: str | None = None) -> dict:
        self.calls.append(name)
        if name == "view_menu_item":
            return {
                "id": arguments["menu_item_id"],
                "option_groups": [{"id": "group_opaque_9", "name": "Kích thước", "options": [{"id": "option_opaque_9", "name": "Cỡ lớn"}]}],
            }
        if name == "create_cart":
            return {"id": "cart_from_tool"}
        return {"id": "cart_item_from_tool"}


@pytest.mark.asyncio
async def test_address_discovery_reselects_original_quote_tool() -> None:
    gateway = AddressDiscoveryGateway()
    graph = build_graph(tool_client=gateway)
    result = await graph.ainvoke(
        {
            "query": "Giao về nhà riêng",
            "user_id": "user_opaque_7",
            "conversation_id": "conversation_opaque_7",
            "correlation_id": "correlation_opaque_7",
            "workflow_context": {"restaurant_id": "restaurant_opaque_7"},
        }
    )
    assert gateway.calls == ["list_food_delivery_addresses", "quote_delivery"]
    assert result["response_type"] == "options"
    assert result["data"]["address"]["id"] == "address_opaque_7"


@pytest.mark.asyncio
async def test_address_discovery_reselects_original_prepare_tool() -> None:
    gateway = AddressDiscoveryGateway()
    graph = build_graph(tool_client=gateway)
    result = await graph.ainvoke(
        {
            "query": "Đặt luôn giao về nhà riêng",
            "user_id": "user_opaque_8",
            "conversation_id": "conversation_opaque_8",
            "correlation_id": "correlation_opaque_8",
            "workflow_context": {"restaurant_id": "restaurant_opaque_8", "cart_id": "cart_opaque_8"},
        }
    )
    assert gateway.calls == ["list_food_delivery_addresses", "prepare_food_order_confirmation"]
    assert result["response_type"] == "confirmation_form"
    assert result["data"]["id"] == "confirmation_opaque_7"


@pytest.mark.asyncio
async def test_place_order_asks_for_address_before_reading_profile_addresses() -> None:
    gateway = AddressDiscoveryGateway()
    graph = build_graph(tool_client=gateway)

    result = await graph.ainvoke(
        {
            "query": "Đặt luôn",
            "user_id": "user_opaque_9",
            "conversation_id": "conversation_opaque_9",
            "correlation_id": "correlation_opaque_9",
            "workflow_context": {"restaurant_id": "restaurant_opaque_9", "cart_id": "cart_opaque_9"},
        }
    )

    assert gateway.calls == []
    assert result["missing_slots"] == ["address_id"]
    assert "địa chỉ giao hàng" in result["response"]


@pytest.mark.asyncio
async def test_nested_tool_calls_enforce_the_hard_maximum(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(graph_module, "get_settings", lambda: SimpleNamespace(max_tool_calls=2, max_graph_steps=12, gemini_api_key=""))
    gateway = NestedCallLimitGateway()
    graph = build_graph(tool_client=gateway)

    result = await graph.ainvoke(
        {
            "query": "Thêm 1 món item_opaque_9 cỡ lớn vào giỏ",
            "user_id": "user_opaque_9",
            "conversation_id": "conversation_opaque_9",
            "correlation_id": "correlation_opaque_9",
            "workflow_context": {"restaurant_id": "restaurant_opaque_9", "menu_item_id": "item_opaque_9"},
        }
    )

    assert gateway.calls == ["view_menu_item", "create_cart"]
    assert result["data"]["code"] == "TOOL_CALL_LIMIT"
