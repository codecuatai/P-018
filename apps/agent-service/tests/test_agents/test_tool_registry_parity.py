from __future__ import annotations

import json
from pathlib import Path

from src.agents.policies.healthcare_policy import FINAL_TOOLS, READ_TOOLS, REVERSIBLE_TOOLS
from src.agents.policies.tool_policy import READ_TOOLS as RESTAURANT_READ_TOOLS
from src.agents.policies.tool_policy import WRITE_TOOLS as RESTAURANT_WRITE_TOOLS

CONTRACT_PATH = Path(__file__).resolve().parents[4] / "packages" / "contracts" / "tools" / "tool-registry-v2.json"


def _contract() -> list[dict[str, object]]:
    return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))["tools"]


def test_canonical_inventory_covers_all_four_domains_and_expected_surface() -> None:
    tools = _contract()
    names = {str(tool["name"]) for tool in tools}
    expected = {
        "food.search",
        "food.get_restaurant",
        "food.list_menu",
        "food.get_menu_item",
        "food.create_cart",
        "food.add_cart_item",
        "food.update_cart_item",
        "food.remove_cart_item",
        "food.quote_delivery",
        "food.apply_voucher",
        "food.remove_voucher",
        "food.preview_order",
        "food.prepare_order",
        "food.get_order",
        "food.list_orders",
        "food.track_order",
        "food.prepare_cancel_order",
        "food.cancel_order",
        "ride.quote.create",
        "ride.quote.get",
        "ride.booking.prepare",
        "ride.booking.confirm",
        "ride.booking.get",
        "ride.booking.list",
        "ride.booking.status.get",
        "ride.tracking.get",
        "ride.booking.cancel.prepare",
        "ride.booking.cancel",
        "restaurant.search",
        "restaurant.get",
        "restaurant.check_availability",
        "restaurant.create_hold",
        "restaurant.create_reservation",
        "restaurant.get_reservation",
        "restaurant.list_reservations",
        "restaurant.cancel_reservation",
        "healthcare.search_facilities",
        "healthcare.get_facility",
        "healthcare.list_departments",
        "healthcare.list_doctors",
        "healthcare.list_slots",
        "healthcare.hold_slot",
        "healthcare.get_appointment",
        "healthcare.list_appointments",
        "healthcare.confirm_appointment",
        "healthcare.cancel_appointment",
    }
    assert names == expected
    assert {str(tool["domain"]) for tool in tools} == {"food", "ride", "restaurant", "healthcare"}


def test_agent_policies_reference_only_registered_tools_and_final_tools_are_bound() -> None:
    by_name = {str(tool["name"]): tool for tool in _contract()}
    policy_names = RESTAURANT_READ_TOOLS | RESTAURANT_WRITE_TOOLS | READ_TOOLS | REVERSIBLE_TOOLS | FINAL_TOOLS
    assert policy_names <= by_name.keys()
    for name in FINAL_TOOLS | RESTAURANT_WRITE_TOOLS:
        tool = by_name[name]
        assert tool["idempotency_requirement"] == "required"
        if name in FINAL_TOOLS or name in {"restaurant.create_reservation", "restaurant.cancel_reservation"}:
            assert tool["confirmation_requirement"] == "explicit_gateway_confirmation"


def test_agent_tool_classification_has_a_legacy_adapter_or_policy_owner() -> None:
    policy_names = (
        RESTAURANT_READ_TOOLS
        | RESTAURANT_WRITE_TOOLS
        | READ_TOOLS
        | REVERSIBLE_TOOLS
        | FINAL_TOOLS
        | {"ride.quote.create"}
    )
    for tool in _contract():
        if tool["classification"] != "IMPLEMENTED_AGENT_TOOL":
            continue
        if tool["domain"] == "food":
            assert tool.get("aliases"), tool["name"]
        else:
            assert tool["name"] in policy_names, tool["name"]
