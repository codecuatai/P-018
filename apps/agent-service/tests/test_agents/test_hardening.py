from pathlib import Path

from src.agents.intent import classify, extract_slots
from src.agents.option_resolution import resolve_options
from src.agents.reference_resolution import resolve_references
from src.agents.tool_selection import select_tools


def test_fallback_extracts_semantics_without_seed_ids() -> None:
    slots = extract_slots("Tìm hamburger bò dưới 100 nghìn, áp mã SUMMER987")
    assert classify("Tìm hamburger bò") == "search_food"
    assert slots["dish_query"] == "hamburger bo"
    assert slots["voucher_code"] == "SUMMER987"
    assert "item_id" not in slots
    assert "restaurant_id" not in slots


def test_fallback_extracts_city_filter_without_leaking_it_into_dish_query() -> None:
    slots = extract_slots("Tìm phở bò dưới 100 nghìn ở Hà Nội.")
    assert slots["dish_query"] == "pho bo"
    assert slots["district"] == "ha noi"


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
