from __future__ import annotations

import inspect
import json
import logging
import re
from typing import Any, Literal

from langgraph.graph import END, StateGraph
from pydantic import BaseModel, Field, ValidationError

from src.agents.intent import classify, extract_slots
from src.agents.option_resolution import resolve_options
from src.agents.reference_resolution import resolve_references
from src.agents.state import AgentState, FoodWorkflowContext
from src.agents.tool_selection import select_tools
from src.config import get_settings
from src.services.gateway import GatewayToolClient, GatewayToolError
from src.services.llm import GeminiAdapter, LLMAdapter

logger = logging.getLogger(__name__)


class StructuredDecision(BaseModel):
    intent: Literal[
        "search_food",
        "select_restaurant",
        "view_menu",
        "select_menu_item",
        "create_cart",
        "add_to_cart",
        "update_cart",
        "remove_cart_item",
        "apply_voucher",
        "remove_voucher",
        "quote_delivery",
        "preview_order",
        "place_order",
        "track_order",
        "cancel_order",
        "list_addresses",
        "general_food_support",
        "out_of_scope",
    ]
    confidence: float | None = Field(default=None, ge=0, le=1)
    extracted_slots: dict[str, Any] = Field(default_factory=dict)
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)


SEMANTIC_SLOTS = {
    "quantity",
    "option_preferences",
    "address_query",
    "restaurant_alias",
    "menu_item_alias",
    "order_alias",
    "dish_query",
    "district",
    "max_price",
    "voucher_code",
}


def _safe_model_slots(values: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in values.items() if key in SEMANTIC_SLOTS}


def build_graph(tool_client: GatewayToolClient | None = None, llm: LLMAdapter | None = None):
    gateway = tool_client or GatewayToolClient()
    model = llm or GeminiAdapter()
    use_model = llm is not None or (tool_client is None and bool(get_settings().gemini_api_key))

    async def load_context(state: AgentState) -> AgentState:
        context = FoodWorkflowContext.model_validate(state.get("workflow_context", {}))
        return {
            "step_count": state.get("step_count", 0) + 1,
            "tool_calls": [],
            "tool_results": [],
            "data": {},
            "state_updates": {},
            "extracted_slots": context.model_dump(exclude_none=True),
        }

    async def classify_and_extract(state: AgentState) -> AgentState:
        query = str(state.get("query", ""))
        deterministic = extract_slots(query)
        registry: list[dict[str, Any]] = []
        fallback = {
            "intent": classify(query),
            "confidence": None,
            "decision_source": "deterministic",
            "extracted_slots": {**state.get("extracted_slots", {}), **deterministic},
        }
        if not use_model:
            return {**fallback, "step_count": state.get("step_count", 0) + 1}
        try:
            registry = await gateway.registry(str(state.get("correlation_id")))
            prompt = json.dumps(
                {
                    "instruction": "Classify this food request. Return semantic slots only; never return database IDs. Propose only registered non-transaction tools.",
                    "query": query,
                    "recent_messages": state.get("messages", [])[-20:],
                    "workflow_context": state.get("extracted_slots", {}),
                    "tool_registry": registry,
                    "allowed_permissions": ["read", "draft_write", "preview", "confirmation_prepare"],
                    "response_schema": StructuredDecision.model_json_schema(),
                },
                ensure_ascii=False,
            )
            raw = await model.ainvoke(prompt)
            fenced = re.search(r"```(?:json)?\s*(.*?)```", raw, re.DOTALL | re.IGNORECASE)
            decision = StructuredDecision.model_validate(json.loads(fenced.group(1) if fenced else raw))
            slots = {**state.get("extracted_slots", {}), **deterministic, **_safe_model_slots(decision.extracted_slots)}
            return {
                "intent": decision.intent,
                "confidence": decision.confidence,
                "decision_source": "model",
                "extracted_slots": slots,
                "tool_registry": registry,
                "step_count": state.get("step_count", 0) + 1,
            }
        except (json.JSONDecodeError, ValidationError, GatewayToolError) as exc:
            logger.warning("Structured model decision unavailable; deterministic fallback: %s", type(exc).__name__)
        except Exception as exc:
            logger.warning("LLM adapter failed; deterministic fallback: %s", type(exc).__name__)
        return {**fallback, "tool_registry": registry, "step_count": state.get("step_count", 0) + 1}

    async def resolve_node(state: AgentState) -> AgentState:
        context = FoodWorkflowContext.model_validate(state.get("workflow_context", {})).model_dump(exclude_none=True)
        slots = resolve_references(dict(state.get("extracted_slots", {})), context)
        return {"extracted_slots": slots, "step_count": state.get("step_count", 0) + 1}

    async def validate_slots(state: AgentState) -> AgentState:
        intent = state.get("intent", "general_food_support")
        slots = state.get("extracted_slots", {})
        required: list[str] = []
        if intent == "create_cart":
            required.append("restaurant_id")
        if (
            intent in {"quote_delivery", "preview_order", "place_order"}
            and not slots.get("address_id")
            and not slots.get("address_query")
        ):
            required.append("address_id")
        if intent in {"preview_order", "place_order"}:
            required.append("cart_id")
        if intent == "quote_delivery":
            required.append("restaurant_id")
        if intent in {"track_order", "cancel_order"}:
            required.append("order_id")
        if intent == "apply_voucher":
            required.extend(("cart_id", "voucher_code"))
        if intent == "remove_voucher":
            required.append("cart_id")
        if intent == "remove_cart_item":
            required.extend(("cart_id", "cart_item_id"))
        if intent == "update_cart":
            required.extend(("cart_id", "cart_item_id", "quantity"))
        if intent == "view_menu":
            required.append("restaurant_id")
        if intent == "add_to_cart":
            required.extend(slot for slot in ("quantity", "restaurant_id") if not slots.get(slot))
            if not slots.get("menu_item_id") and not slots.get("dish_query"):
                required.append("menu_item_id")
        if slots.get("ambiguous_menu_items"):
            return {
                "missing_slots": ["menu_item_id"],
                "ambiguity": "menu_item",
                "step_count": state.get("step_count", 0) + 1,
            }
        if slots.get("ambiguous_addresses"):
            return {
                "missing_slots": ["address_id"],
                "ambiguity": "address",
                "step_count": state.get("step_count", 0) + 1,
            }
        return {
            "missing_slots": [slot for slot in required if not slots.get(slot)],
            "step_count": state.get("step_count", 0) + 1,
        }

    async def select_node(state: AgentState) -> AgentState:
        slots = dict(state.get("extracted_slots", {}))
        intent = str(state.get("intent", "general_food_support"))
        if (
            slots.get("address_query")
            and not slots.get("address_id")
            and intent in {"quote_delivery", "preview_order", "place_order"}
        ):
            intent = "list_addresses"
        registry = state.get("tool_registry", [])
        selected = select_tools(intent, slots, registry)
        if not selected and intent == "add_to_cart" and slots.get("dish_query") and not slots.get("menu_item_id"):
            selected = select_tools("search_food", slots, registry)
        labels = {
            "address_id": "địa chỉ giao hàng",
            "cart_id": "giỏ hàng",
            "restaurant_id": "nhà hàng",
            "menu_item_id": "món ăn",
            "cart_item_id": "món trong giỏ",
        }
        if state.get("missing_slots"):
            missing = state["missing_slots"]
            return {
                "response_type": "options",
                "response": ("Mình cần bạn chọn rõ " + ", ".join(labels.get(value, value) for value in missing) + "."),
                "data": {"missing_slots": missing},
                "selected_tools": [],
            }
        return {"selected_tools": selected}

    async def execute_node(state: AgentState) -> AgentState:
        actor = state.get("user_id")
        conversation = state.get("conversation_id")
        if not actor or not conversation or not state.get("correlation_id"):
            return {"error": "IDENTITY_REQUIRED", "tool_calls": []}
        results: list[dict[str, Any]] = []
        calls: list[dict[str, Any]] = []

        async def invoke(name: str, args: dict[str, Any]) -> dict[str, Any]:
            signature = inspect.signature(gateway.execute)
            if len(signature.parameters) >= 5:
                return await gateway.execute(name, args, str(actor), str(state["correlation_id"]), str(conversation))
            return await gateway.execute(name, args, str(actor), str(state["correlation_id"]))

        try:
            for tool in list(state.get("selected_tools", []))[: get_settings().max_tool_calls]:
                name = str(tool["name"])
                result = await invoke(name, dict(tool.get("arguments", {})))
                calls.append({"name": name, "status": "succeeded"})
                results.append({"name": name, "data": result})
                if name == "view_menu_item" and state.get("intent") == "add_to_cart":
                    item = result if isinstance(result, dict) else {}
                    selected, missing = resolve_options(
                        list(item.get("option_groups", [])),
                        list(state.get("extracted_slots", {}).get("option_preferences", [])),
                    )
                    if missing:
                        return {"tool_calls": calls, "tool_results": results, "missing_options": missing}
                    slots = state.get("extracted_slots", {})
                    if not slots.get("cart_id"):
                        created = await invoke("create_cart", {"restaurant_id": slots.get("restaurant_id")})
                        calls.append({"name": "create_cart", "status": "succeeded"})
                        results.append({"name": "create_cart", "data": created})
                        cart_id = created.get("id") if isinstance(created, dict) else None
                    else:
                        cart_id = slots.get("cart_id")
                    if cart_id:
                        added = await invoke(
                            "add_to_cart",
                            {
                                "cart_id": cart_id,
                                "menu_item_id": slots.get("menu_item_id"),
                                "quantity": slots.get("quantity", 1),
                                "selected_options": selected,
                            },
                        )
                        calls.append({"name": "add_to_cart", "status": "succeeded"})
                        results.append({"name": "add_to_cart", "data": added})
                elif name == "search_food" and state.get("intent") == "add_to_cart":
                    items = result.get("items", []) if isinstance(result, dict) else []
                    if len(items) == 1 and isinstance(items[0], dict):
                        item = items[0].get("item", {})
                        item_id = item.get("id")
                        required_options = [group for group in item.get("option_groups", []) if group.get("required")]
                        if required_options:
                            return {"tool_calls": calls, "tool_results": results, "missing_options": [str(group.get("name", "option")) for group in required_options]}
                        slots = state.get("extracted_slots", {})
                        cart_id = slots.get("cart_id")
                        if cart_id and item_id:
                            added = await invoke("add_to_cart", {"cart_id": cart_id, "menu_item_id": item_id, "quantity": slots.get("quantity", 1), "selected_options": []})
                            calls.append({"name": "add_to_cart", "status": "succeeded"})
                            results.append({"name": "add_to_cart", "data": added})
                elif name == "create_cart" and state.get("intent") == "add_to_cart":
                    slots = state.get("extracted_slots", {})
                    created_id = result.get("id") if isinstance(result, dict) else None
                    if created_id and slots.get("menu_item_id"):
                        added = await invoke(
                            "add_to_cart",
                            {
                                "cart_id": created_id,
                                "menu_item_id": slots["menu_item_id"],
                                "quantity": slots.get("quantity", 1),
                                "selected_options": slots.get("selected_options", []),
                            },
                        )
                        calls.append({"name": "add_to_cart", "status": "succeeded"})
                        results.append({"name": "add_to_cart", "data": added})
        except GatewayToolError as exc:
            calls.append({"name": name, "status": "failed", "code": exc.code})
            return {"error": exc.code, "tool_calls": calls, "tool_results": results}
        return {"tool_calls": calls, "tool_results": results}

    async def evaluate_node(state: AgentState) -> AgentState:
        if state.get("error"):
            return {
                "response_type": "error",
                "response": "Mình chưa thể xử lý yêu cầu lúc này. Bạn thử lại sau nhé.",
                "data": {"code": state["error"]},
            }
        if state.get("missing_options"):
            return {
                "response_type": "options",
                "response": "Bạn chọn giúp mình: " + ", ".join(state["missing_options"]) + ".",
                "data": {"missing_options": state["missing_options"]},
            }
        if state.get("missing_slots"):
            return {
                "response_type": state.get("response_type", "options"),
                "response": state.get("response", "Bạn bổ sung giúp mình thông tin còn thiếu nhé."),
                "data": state.get("data", {}),
            }
        results = state.get("tool_results", [])
        intent = str(state.get("intent", "general_food_support"))
        slots = state.get("extracted_slots", {})
        updates: dict[str, Any] = {}
        for key in ("restaurant_id", "menu_item_id", "address_id"):
            if slots.get(key):
                updates[key] = slots[key]
        for result in results:
            name, data = result.get("name"), result.get("data", {})
            if name == "search_food" and isinstance(data, dict) and isinstance(data.get("items"), list):
                restaurants: list[dict[str, Any]] = []
                items: list[dict[str, Any]] = []
                for candidate in data["items"]:
                    restaurant = candidate.get("restaurant") or {} if isinstance(candidate, dict) else {}
                    item = candidate.get("item") or {} if isinstance(candidate, dict) else {}
                    if restaurant.get("id") and not any(value["id"] == restaurant["id"] for value in restaurants):
                        restaurants.append({"id": restaurant["id"], "name": restaurant.get("name", "")})
                    if item.get("id"):
                        items.append(
                            {"id": item["id"], "name": item.get("name", ""), "restaurant_id": item.get("restaurant_id")}
                        )
                updates.update({"restaurant_candidates": restaurants, "menu_item_candidates": items})
            if name == "view_menu" and isinstance(data, dict) and isinstance(data.get("items"), list):
                updates["menu_item_candidates"] = [
                    {"id": item.get("id"), "name": item.get("name", ""), "restaurant_id": item.get("restaurant_id")}
                    for item in data["items"]
                    if isinstance(item, dict) and item.get("id")
                ]
                if data.get("restaurant", {}).get("id"):
                    updates["restaurant_id"] = data["restaurant"]["id"]
            if name == "list_food_delivery_addresses" and isinstance(data, dict):
                addresses = data.get("addresses", data.get("items", []))
                updates["address_candidates"] = addresses if isinstance(addresses, list) else []
                if len(updates["address_candidates"]) == 1:
                    updates["address_id"] = updates["address_candidates"][0].get("id")
            if name in {
                "create_cart",
                "add_to_cart",
                "update_food_cart_item",
                "remove_food_cart_item",
                "apply_voucher",
                "remove_food_voucher",
            } and isinstance(data, dict):
                if data.get("id") and name == "create_cart":
                    updates["cart_id"] = data["id"]
                if isinstance(data.get("items"), list):
                    updates["cart_items"] = data["items"]
            if name in {"get_food_order", "track_food_order"} and isinstance(data, dict) and data.get("order_id"):
                updates["last_order_id"] = data["order_id"]
        if intent in {"place_order", "cancel_order"} and results:
            confirmation = results[0]["data"]
            updates["pending_confirmation_id"] = confirmation.get("id") if isinstance(confirmation, dict) else None
            return {
                "response_type": "confirmation_form",
                "response": "Bạn kiểm tra thông tin và xác nhận bước tiếp theo nhé.",
                "data": confirmation,
                "pending_confirmation": confirmation,
                "state_updates": updates,
            }
        if intent == "search_food" and results and not results[0].get("data", {}).get("items"):
            return {
                "response_type": "text",
                "response": "Mình chưa tìm thấy món phù hợp.",
                "data": {},
                "state_updates": updates,
            }
        if intent == "select_restaurant":
            name = slots.get("restaurant_name")
            return {
                "response_type": "options",
                "response": f"Mình đã chọn {name}." if name else "Mình đã lưu nhà hàng bạn chọn.",
                "data": {"restaurant_id": updates.get("restaurant_id"), "name": name},
                "state_updates": updates,
            }
        messages = {
            "quote_delivery": "Phí giao hàng đã được tính từ địa chỉ và nhà hàng.",
            "preview_order": "Đây là bản xem trước đơn hàng.",
            "view_menu": "Đây là menu hiện tại.",
            "select_menu_item": "Mình đã lấy món từ menu authoritative.",
            "search_food": "Mình tìm được các món phù hợp từ Food Service.",
        }
        return {
            "response_type": "options" if results else "text",
            "response": messages.get(intent, "Mình có thể giúp bạn tìm món, xem menu và tạo giỏ."),
            "data": results[0].get("data", {}) if results else {},
            "state_updates": updates,
        }

    def route_validation(state: AgentState) -> str:
        return "evaluate" if state.get("missing_slots") else "select"

    def route_selection(state: AgentState) -> str:
        return "evaluate" if not state.get("selected_tools") else "execute"

    graph = StateGraph(AgentState)
    for name, node in (
        ("load_context", load_context),
        ("classify", classify_and_extract),
        ("resolve", resolve_node),
        ("validate", validate_slots),
        ("select", select_node),
        ("execute", execute_node),
        ("evaluate", evaluate_node),
    ):
        graph.add_node(name, node)
    graph.set_entry_point("load_context")
    graph.add_edge("load_context", "classify")
    graph.add_edge("classify", "resolve")
    graph.add_edge("resolve", "validate")
    graph.add_conditional_edges("validate", route_validation, {"evaluate": "evaluate", "select": "select"})
    graph.add_conditional_edges("select", route_selection, {"evaluate": "evaluate", "execute": "execute"})
    graph.add_edge("execute", "evaluate")
    graph.add_edge("evaluate", END)
    return graph.compile()


agent = build_graph()
