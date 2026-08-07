from __future__ import annotations

import inspect
import json
import logging
import re
from typing import Any, Literal

from langgraph.graph import END, StateGraph
from pydantic import BaseModel, Field, ValidationError

from src.agents.state import AgentState, FoodWorkflowContext
from src.config import get_settings
from src.services.gateway import GatewayToolClient, GatewayToolError
from src.services.llm import GeminiAdapter, LLMAdapter

logger = logging.getLogger(__name__)


class StructuredDecision(BaseModel):
    intent: Literal["search_food", "select_restaurant", "view_menu", "select_menu_item", "create_cart", "add_to_cart", "update_cart", "remove_cart_item", "apply_voucher", "remove_voucher", "quote_delivery", "preview_order", "place_order", "track_order", "cancel_order", "general_food_support", "out_of_scope"]
    confidence: float = Field(ge=0, le=1)
    extracted_slots: dict[str, Any] = Field(default_factory=dict)
    missing_slots: list[str] = Field(default_factory=list)
    response_message: str | None = None
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    references: dict[str, Any] = Field(default_factory=dict)


def _legacy_classify(query: str) -> str:
    text = query.lower()
    if any(word in text for word in ("khiếu nại", "chuyến bay", "đặt bàn")):
        return "out_of_scope"
    if any(word in text for word in ("theo dõi", "tracking", "đơn hàng đang")):
        return "track_order"
    if any(word in text for word in ("hủy", "huỷ")):
        return "cancel_order"
    if any(word in text for word in ("đặt luôn", "thanh toán đi", "tôi đồng ý", "đặt món")):
        return "place_order"
    if "voucher" in text or "mã giảm" in text:
        return "apply_voucher"
    if any(word in text for word in ("phí giao", "ship bao nhiêu", "giao đến")):
        return "quote_delivery"
    if any(word in text for word in ("xem menu", "thực đơn", "menu")):
        return "view_menu"
    if any(word in text for word in ("tạo giỏ", "mở giỏ")):
        return "create_cart"
    if any(word in text for word in ("thêm", "cho vào giỏ", "mua")):
        return "add_to_cart"
    if any(word in text for word in ("xem tổng", "preview", "xem đơn")):
        return "preview_order"
    if any(word in text for word in ("tìm", "ăn gì", "món", "nhà hàng", "phở", "bún", "cơm")):
        return "search_food"
    return "general_food_support"


def extract_slots(query: str) -> dict[str, Any]:
    slots: dict[str, Any] = {}
    for key in ("cart_id", "item_id", "restaurant_id", "address_id", "order_id"):
        match = re.search(rf"{key}\s*[:=]?\s*([A-Za-z0-9_\-]+)", query, re.IGNORECASE)
        if match:
            slots[key] = match.group(1)
    if "addr_demo" in query or any(word in query.lower() for word in ("nhà riêng", "địa chỉ demo", "lê đại hành")):
        slots["address_id"] = "addr_demo"
    if "item_pho_bo" in query:
        slots["item_id"] = "item_pho_bo"
    if "res_pho_hanoi" in query:
        slots["restaurant_id"] = "res_pho_hanoi"
    return slots


_legacy_extract_slots = extract_slots


def _plain(text: str) -> str:
    import unicodedata
    normalized = unicodedata.normalize("NFD", text.lower())
    return "".join("d" if char == "đ" else char for char in normalized if unicodedata.category(char) != "Mn")


def _classify_vietnamese(query: str) -> str:
    text = _plain(query)
    if any(word in text for word in ("khieu nai", "chuyen bay", "dat ban")):
        return "out_of_scope"
    if any(word in text for word in ("theo doi", "tracking", "don hang dang")):
        return "track_order"
    if any(word in text for word in ("huy", "huỷ")):
        return "cancel_order"
    if any(word in text for word in ("dat luon", "thanh toan di", "toi dong y", "dat mon")):
        return "place_order"
    if any(word in text for word in ("bo ma", "xoa ma", "go ma", "bo voucher")):
        return "remove_voucher"
    if any(word in text for word in ("voucher", "ma giam", "ap ma")):
        return "apply_voucher"
    if any(word in text for word in ("phi giao", "ship bao nhieu", "giao den")):
        return "quote_delivery"
    if "menu" in text or "thuc don" in text:
        return "view_menu"
    if "tao gio" in text or "mo gio" in text:
        return "create_cart"
    if any(word in text for word in ("bo mon", "xoa mon")):
        return "remove_cart_item"
    if any(word in text for word in ("doi mon", "sua gio", "cap nhat gio")):
        return "update_cart"
    if any(word in text for word in ("them", "cho vao gio", "mua")):
        return "add_to_cart"
    if (re.search(r"\b[1-9][0-9]?\b", text) or any(word in text for word in ("mot ", "hai ", "ba ", "bon "))) and any(word in text for word in ("pho", "bun", "com", "mon")):
        return "add_to_cart"
    if any(word in text for word in ("xem tong", "preview", "xem don")):
        return "preview_order"
    if any(word in text for word in ("chon quan", "chon nha hang")):
        return "select_restaurant"
    if "quan dau tien" in text or "nha hang dau tien" in text:
        return "select_restaurant"
    if any(word in text for word in ("tim", "an gi", "mon", "nha hang", "pho", "bun", "com")):
        return "search_food"
    return "general_food_support"


def _extract_vietnamese(query: str) -> dict[str, Any]:
    slots = _legacy_extract_slots(query)
    text = _plain(query)
    quantity = re.search(r"\b([1-9][0-9]?)\b", text)
    if quantity:
        slots["quantity"] = int(quantity.group(1))
    else:
        for word, value in (("mot", 1), ("hai", 2), ("ba", 3), ("bon", 4)):
            if re.search(rf"\b{word}\b", text):
                slots["quantity"] = value
                break
    if "pho bo" in text:
        slots["item_id"] = "item_pho_bo"
    if "pho ga" in text:
        slots["item_id"] = "item_pho_ga"
    if "bun cha" in text:
        slots["item_id"] = "item_bun_cha"
    if "pho" in text:
        slots.setdefault("restaurant_id", "res_pho_hanoi")
    if "large" in text or "co lon" in text or "lon" in text:
        slots["selected_options"] = [{"group_id": "opt_size", "option_id": "large"}]
    if "khong cay" in text:
        slots.setdefault("selected_options", []).append({"group_id": "opt_spice", "option_id": "mild"})
    if "nha rieng" in text or "addr_demo" in text:
        slots["address_id"] = "addr_demo"
    if "don vua dat" in text or "don vua tao" in text or "don gan nhat" in text:
        slots["order_alias"] = "last_order_id"
    if "quan dau tien" in text or "nha hang dau tien" in text:
        slots["restaurant_alias"] = "first"
    if "quan thu hai" in text or "nha hang thu hai" in text:
        slots["restaurant_alias"] = "second"
    if "mon dau tien" in text or "mon vua xem" in text:
        slots["menu_item_alias"] = "first"
    if "mon thu hai" in text:
        slots["menu_item_alias"] = "second"
        slots["cart_item_alias"] = "second"
    district = re.search(r"(?:o|tai|khu vuc)\s+([A-Za-zÀ-ỹĐđ\s]+?)(?:\s+(?:duoi|tren|gia|$))", query, re.IGNORECASE)
    if district:
        slots["district"] = district.group(1).strip()
    max_price = re.search(r"(?:duoi|khong qua|toi da)\s*(\d+)\s*(?:nghin|k|000)?", text)
    if max_price:
        value = int(max_price.group(1))
        slots["max_price"] = value * 1000 if value < 1000 else value
    voucher = re.search(r"\b[A-Z][A-Z0-9]{3,}\b", query)
    if voucher and voucher.group(0) in {"XONE50", "PHO20K"}:
        slots["voucher_code"] = voucher.group(0)
    return slots


def _semantic_search_keyword(query: str, slots: dict[str, Any]) -> str:
    text = _plain(query)
    if "pho bo" in text:
        return "phở bò"
    if "bun cha" in text:
        return "bún chả"
    if "pho ga" in text:
        return "phở gà"
    if "com ga" in text:
        return "cơm gà"
    return str(slots.get("dish_name") or "món ăn")


classify = _classify_vietnamese
extract_slots = _extract_vietnamese


def build_graph(tool_client: GatewayToolClient | None = None, llm: LLMAdapter | None = None):
    gateway = tool_client or GatewayToolClient()
    model = llm or GeminiAdapter()
    use_model = llm is not None or (tool_client is None and bool(get_settings().gemini_api_key))

    async def load_context(state: AgentState) -> AgentState:
        context = FoodWorkflowContext.model_validate(state.get("workflow_context", {}))
        return {"step_count": state.get("step_count", 0) + 1, "tool_calls": [], "tool_results": [], "data": {}, "state_updates": {}, "extracted_slots": context.model_dump(exclude_none=True)}

    async def classify_and_extract(state: AgentState) -> AgentState:
        query = state.get("query", "")
        fallback = {"intent": classify(query), "confidence": 0.92, "extracted_slots": {**state.get("extracted_slots", {}), **extract_slots(query)}}
        try:
            if not use_model:
                return {**fallback, "step_count": state.get("step_count", 0) + 1}
            registry = await gateway.registry(state.get("correlation_id", "cor_unknown"))
            prompt = json.dumps({"instruction": "Classify the Vietnamese food request into a safe intent and propose only registered non-transaction tools.", "query": query, "recent_messages": state.get("messages", [])[-20:], "workflow_context": state.get("extracted_slots", {}), "tool_registry": registry, "allowed_permissions": ["read", "draft_write", "preview", "confirmation_prepare"], "system_constraints": ["never execute transaction tools", "never invent prices or IDs"], "response_schema": StructuredDecision.model_json_schema()}, ensure_ascii=False)
            raw = await model.ainvoke(prompt)
            if raw:
                fenced = re.search(r"```(?:json)?\s*(.*?)```", raw, re.DOTALL | re.IGNORECASE)
                parsed = json.loads(fenced.group(1) if fenced else raw)
                decision = StructuredDecision.model_validate(parsed)
                return {"intent": decision.intent, "confidence": decision.confidence, "extracted_slots": {**state.get("extracted_slots", {}), **decision.extracted_slots, **decision.references, **extract_slots(query)}, "model_tool_calls": decision.tool_calls, "tool_registry": registry, "step_count": state.get("step_count", 0) + 1}
        except (json.JSONDecodeError, ValidationError, GatewayToolError) as exc:
            logger.warning("Structured model decision unavailable; using deterministic fallback: %s", type(exc).__name__)
        except Exception as exc:
            logger.warning("LLM adapter failed; using deterministic fallback: %s", type(exc).__name__)
        return {**fallback, "step_count": state.get("step_count", 0) + 1}

    async def resolve_references(state: AgentState) -> AgentState:
        slots = dict(state.get("extracted_slots", {}))
        context = FoodWorkflowContext.model_validate(state.get("workflow_context", {})).model_dump(exclude_none=True)
        if slots.get("order_alias") == "last_order_id":
            slots["order_id"] = context.get("last_order_id")
        if slots.get("restaurant_alias") == "first" and context.get("restaurant_candidates"):
            slots["restaurant_id"] = context["restaurant_candidates"][0]["id"]
        if slots.get("restaurant_alias") == "second" and len(context.get("restaurant_candidates", [])) > 1:
            slots["restaurant_id"] = context["restaurant_candidates"][1]["id"]
        if slots.get("menu_item_alias") == "first" and context.get("menu_item_candidates"):
            slots["item_id"] = context["menu_item_candidates"][0]["id"]
        if slots.get("menu_item_alias") == "second" and len(context.get("menu_item_candidates", [])) > 1:
            slots["item_id"] = context["menu_item_candidates"][1]["id"]
        if slots.get("cart_item_alias") == "second" and len(context.get("cart_items", [])) > 1:
            slots["cart_item_id"] = context["cart_items"][1].get("id")
        if slots.get("address_alias") == "home":
            slots["address_id"] = context.get("address_id") or "addr_demo"
        return {"extracted_slots": slots, "step_count": state.get("step_count", 0) + 1}

    async def validate_slots(state: AgentState) -> AgentState:
        intent = state.get("intent", "general_food_support")
        slots = state.get("extracted_slots", {})
        required: list[str] = []
        if intent == "select_restaurant" and not slots.get("restaurant_id") and not slots.get("restaurant_alias"):
            required.append("restaurant_id")
        if intent in {"quote_delivery", "preview_order", "place_order"}:
            required.append("address_id")
        if intent in {"preview_order", "place_order"}:
            required.append("cart_id")
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
            required.extend(slot for slot in ("restaurant_id", "item_id", "quantity") if not slots.get(slot))
        return {"missing_slots": [slot for slot in required if not slots.get(slot)], "step_count": state.get("step_count", 0) + 1}

    async def select_tools(state: AgentState) -> AgentState:
        if state.get("missing_slots"):
            labels = {"address_id": "địa chỉ giao hàng", "cart_id": "giỏ hàng", "restaurant_id": "nhà hàng"}
            question = "Bạn cho mình biết thêm " + ", ".join(labels.get(slot, slot) for slot in state["missing_slots"]) + " nhé."
            return {"response_type": "options", "response": question, "data": {"missing_slots": state["missing_slots"]}}
        intent = state.get("intent")
        slots = state.get("extracted_slots", {})
        query = state.get("query", "")
        registry = {str(tool.get("name")): tool for tool in state.get("tool_registry", []) if isinstance(tool, dict)}
        allowed_permissions = {"read", "draft_write", "preview", "confirmation_prepare"}
        selected: list[dict[str, Any]] = [call for call in state.get("model_tool_calls", []) if isinstance(call, dict) and call.get("name") in registry and registry[str(call.get("name"))].get("permission") in allowed_permissions]
        if selected:
            return {"selected_tools": selected}
        if intent == "search_food":
            selected = [{"name": "search_food", "arguments": {"keyword": _semantic_search_keyword(query, slots), **({"district": slots["district"]} if slots.get("district") else {}), **({"max_price": slots["max_price"]} if slots.get("max_price") else {})}}]
        elif intent == "view_menu":
            selected = [{"name": "view_menu", "arguments": {"restaurant_id": slots["restaurant_id"]}}]
        elif intent == "create_cart":
            selected = [{"name": "create_cart", "arguments": {"restaurant_id": slots.get("restaurant_id", "res_pho_hanoi")}}]
        elif intent == "add_to_cart":
            if not slots.get("cart_id"):
                selected = [{"name": "create_cart", "arguments": {"restaurant_id": slots.get("restaurant_id", "res_pho_hanoi")}}]
            else:
                selected = [{"name": "add_to_cart", "arguments": {"cart_id": slots.get("cart_id"), "menu_item_id": slots.get("item_id"), "quantity": slots.get("quantity", 1), "selected_options": slots.get("selected_options", [])}}]
        elif intent == "apply_voucher":
            selected = [{"name": "apply_voucher", "arguments": {"cart_id": slots["cart_id"], "code": slots["voucher_code"]}}]
        elif intent == "remove_voucher":
            selected = [{"name": "remove_food_voucher", "arguments": {"cart_id": slots["cart_id"]}}]
        elif intent == "update_cart":
            selected = [{"name": "update_food_cart_item", "arguments": {"cart_id": slots["cart_id"], "cart_item_id": slots["cart_item_id"], "quantity": slots["quantity"], **({"selected_options": slots["selected_options"]} if slots.get("selected_options") else {})}}]
        elif intent == "remove_cart_item":
            selected = [{"name": "remove_food_cart_item", "arguments": {"cart_id": slots["cart_id"], "cart_item_id": slots["cart_item_id"]}}]
        elif intent == "quote_delivery":
            selected = [{"name": "quote_delivery", "arguments": {"restaurant_id": slots.get("restaurant_id", "res_pho_hanoi"), "address_id": slots["address_id"]}}]
        elif intent == "preview_order":
            selected = [{"name": "preview_order", "arguments": {"cart_id": slots["cart_id"], "address_id": slots["address_id"]}}]
        elif intent == "place_order":
            selected = [{"name": "prepare_food_order_confirmation", "arguments": {"cart_id": slots["cart_id"], "address_id": slots["address_id"]}}]
        elif intent == "cancel_order":
            if slots.get("order_alias") == "last_order_id":
                slots["order_id"] = state.get("workflow_context", {}).get("last_order_id")
            if slots.get("order_id"):
                selected = [{"name": "prepare_food_order_cancellation_confirmation", "arguments": {"order_id": slots["order_id"]}}]
        elif intent == "track_order":
            if slots.get("order_alias") == "last_order_id":
                slots["order_id"] = state.get("workflow_context", {}).get("last_order_id")
            if slots.get("order_id"):
                selected = [{"name": "track_food_order", "arguments": {"order_id": slots["order_id"]}}]
        return {"selected_tools": selected}

    async def execute_tools(state: AgentState) -> AgentState:
        results: list[dict[str, Any]] = []
        calls: list[dict[str, Any]] = []
        async def invoke_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
            common = (name, arguments, state.get("user_id", "usr_demo_001"), state.get("correlation_id") or "cor_unknown")
            if len(inspect.signature(gateway.execute).parameters) >= 5:
                return await gateway.execute(*common, state.get("conversation_id"))
            return await gateway.execute(*common)
        try:
            selected = list(state.get("selected_tools", []))[: get_settings().max_tool_calls]
            for tool in selected:
                name = str(tool["name"])
                arguments = dict(tool.get("arguments", {}))
                result = await invoke_tool(name, arguments)
                calls.append({"name": name, "status": "succeeded"})
                results.append({"name": name, "data": result})
                if name == "create_cart" and state.get("intent") == "add_to_cart" and isinstance(result, dict) and result.get("id"):
                    add_arguments = {"cart_id": result["id"], "menu_item_id": state.get("extracted_slots", {}).get("item_id"), "quantity": state.get("extracted_slots", {}).get("quantity", 1), "selected_options": state.get("extracted_slots", {}).get("selected_options", [])}
                    add_result = await invoke_tool("add_to_cart", add_arguments)
                    calls.append({"name": "add_to_cart", "status": "succeeded"})
                    results.append({"name": "add_to_cart", "data": add_result})
        except GatewayToolError as exc:
            calls.append({"name": name, "status": "failed", "code": exc.code})
            return {"error": exc.code, "tool_calls": calls}
        return {"tool_calls": calls, "tool_results": results}

    async def evaluate_result(state: AgentState) -> AgentState:
        if state.get("error"):
            return {"response_type": "error", "response": "Mình chưa thể kết nối dịch vụ đặt món lúc này. Bạn thử lại sau nhé.", "data": {"code": state["error"]}}
        results = state.get("tool_results", [])
        intent = state.get("intent")
        if state.get("missing_slots"):
            return {"response_type": state.get("response_type", "options"), "response": state.get("response", "Bạn bổ sung giúp mình thông tin còn thiếu nhé."), "data": state.get("data", {})}
        updates: dict[str, Any] = {}
        slots = state.get("extracted_slots", {})
        if slots.get("address_id"):
            updates["address_id"] = slots["address_id"]
        if slots.get("restaurant_id"):
            updates["restaurant_id"] = slots["restaurant_id"]
        if slots.get("item_id"):
            updates["menu_item_id"] = slots["item_id"]
        if intent == "select_restaurant":
            selected_restaurant = slots.get("restaurant_id")
            if selected_restaurant:
                updates["restaurant_id"] = selected_restaurant
        for result in results:
            data = result.get("data", {})
            name = result.get("name")
            if name == "create_cart" and isinstance(data, dict) and data.get("id"):
                updates["cart_id"] = data["id"]
            if name in {"create_cart", "add_to_cart", "update_food_cart_item", "remove_food_cart_item", "apply_voucher", "remove_food_voucher"} and isinstance(data, dict) and isinstance(data.get("items"), list):
                updates["cart_items"] = data["items"]
            if name in {"get_food_order", "track_food_order"} and isinstance(data, dict) and data.get("order_id"):
                updates["last_order_id"] = data["order_id"]
            if name == "search_food" and isinstance(data, dict) and isinstance(data.get("items"), list):
                restaurants: list[dict[str, Any]] = []
                items: list[dict[str, Any]] = []
                for candidate in data["items"]:
                    if isinstance(candidate, dict):
                        restaurant = candidate.get("restaurant") or {}
                        item = candidate.get("item") or {}
                        if isinstance(restaurant, dict) and restaurant.get("id") and not any(value["id"] == restaurant["id"] for value in restaurants):
                            restaurants.append({"id": restaurant["id"], "name": restaurant.get("name", "")})
                        if isinstance(item, dict) and item.get("id"):
                            items.append({"id": item["id"], "name": item.get("name", ""), "restaurant_id": item.get("restaurant_id")})
                updates["restaurant_candidates"] = restaurants
                updates["menu_item_candidates"] = items
                if restaurants and len(restaurants) == 1 and not updates.get("restaurant_id"):
                    updates["restaurant_id"] = restaurants[0]["id"]
        if intent in {"place_order", "cancel_order"} and results:
            confirmation = results[0]["data"]
            if intent == "cancel_order":
                updates["pending_confirmation_id"] = confirmation.get("id")
            else:
                updates["pending_confirmation_id"] = confirmation.get("id")
            return {"response_type": "confirmation_form", "response": "Bạn kiểm tra thông tin đơn và xác nhận thanh toán nhé.", "data": confirmation, "pending_confirmation": confirmation, "state_updates": updates}
        messages = {"quote_delivery": "Phí giao hàng đã được tính từ địa chỉ và nhà hàng.", "preview_order": "Đây là bản xem trước đơn hàng.", "view_menu": "Đây là menu hiện tại của nhà hàng.", "search_food": "Mình tìm được các món phù hợp từ Food Service."}
        if intent == "select_restaurant":
            return {"response_type": "options", "response": "Mình đã chọn nhà hàng đầu tiên trong danh sách cho bạn.", "data": {"restaurant_id": updates.get("restaurant_id")}, "state_updates": updates}
        return {"response_type": "options" if results else "text", "response": messages.get(intent, "Mình có thể giúp bạn tìm món, xem menu, tạo giỏ và xem trước đơn giao tại Hà Nội."), "data": results[0]["data"] if results else {}, "state_updates": updates}

    def route_validation(state: AgentState) -> str:
        return "evaluate_result" if state.get("missing_slots") else "select_tools"

    def route_selection(state: AgentState) -> str:
        return "evaluate_result" if not state.get("selected_tools") else "execute_tools"

    graph = StateGraph(AgentState)
    graph.add_node("load_context", load_context)
    graph.add_node("classify_and_extract", classify_and_extract)
    graph.add_node("resolve_references", resolve_references)
    graph.add_node("validate_slots", validate_slots)
    graph.add_node("select_tools", select_tools)
    graph.add_node("execute_tools", execute_tools)
    graph.add_node("evaluate_result", evaluate_result)
    graph.set_entry_point("load_context")
    graph.add_edge("load_context", "classify_and_extract")
    graph.add_edge("classify_and_extract", "resolve_references")
    graph.add_edge("resolve_references", "validate_slots")
    graph.add_conditional_edges("validate_slots", route_validation, {"evaluate_result": "evaluate_result", "select_tools": "select_tools"})
    graph.add_conditional_edges("select_tools", route_selection, {"evaluate_result": "evaluate_result", "execute_tools": "execute_tools"})
    graph.add_edge("execute_tools", "evaluate_result")
    graph.add_edge("evaluate_result", END)
    return graph.compile()


agent = build_graph()
