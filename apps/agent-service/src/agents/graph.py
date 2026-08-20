from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Literal

from langgraph.graph import END, StateGraph
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from src.agents.intent import classify, extract_slots
from src.agents.reference_resolution import resolve_references
from src.agents.state import AgentState, FoodWorkflowContext
from src.agents.tool_selection import select_tools
from src.config import get_settings
from src.services.llm import GeminiAdapter, LLMAdapter

logger = logging.getLogger(__name__)


class OptionPreference(BaseModel):
    """A non-authoritative preference that can be resolved against a menu tool result."""

    model_config = ConfigDict(extra="forbid", strict=True)

    concept: str = Field(min_length=1)
    value: str = Field(min_length=1)


class SemanticSlots(BaseModel):
    """The complete non-authoritative semantic surface available to the model."""

    model_config = ConfigDict(extra="forbid", strict=True)

    quantity: int | None = Field(default=None, ge=1, strict=True)
    option_preferences: list[OptionPreference] | None = None
    address_query: str | None = None
    restaurant_alias: Literal["first", "second"] | None = None
    menu_item_alias: Literal["first", "second"] | None = None
    selection_index: int | None = Field(default=None, ge=0, strict=True)
    order_alias: Literal["last"] | None = None
    dish_query: str | None = None
    district: str | None = None
    max_price: int | None = Field(default=None, ge=0, strict=True)
    voucher_code: str | None = None


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
    extracted_slots: SemanticSlots = Field(default_factory=SemanticSlots)
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)


_CANDIDATE_SCALAR_FIELDS = {
    "id",
    "name",
    "title",
    "restaurant_id",
    "restaurant_name",
    "image_url",
    "price",
    "currency",
    "description",
    "category",
    "address",
    "city",
    "district",
    "rating",
    "review_count",
    "price_level",
}


def _candidate_snapshot(value: Any) -> dict[str, Any]:
    """Keep display data needed for follow-up selection without copying payloads wholesale."""
    if not isinstance(value, dict):
        return {}
    result = {
        key: value[key]
        for key in _CANDIDATE_SCALAR_FIELDS
        if key in value and isinstance(value[key], str | int | float | bool)
    }
    for key in ("option_groups", "options"):
        if isinstance(value.get(key), list):
            result[key] = value[key]
    if isinstance(value.get("restaurant"), dict):
        result["restaurant"] = _candidate_snapshot(value["restaurant"])
    return result


SEMANTIC_SLOTS = {
    "quantity",
    "option_preferences",
    "address_query",
    "restaurant_alias",
    "menu_item_alias",
    "selection_index",
    "order_alias",
    "dish_query",
    "district",
    "max_price",
    "voucher_code",
}

VALID_INTENTS = {
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
}

PROPOSAL_REGISTRY = [
    {"name": name}
    for name in (
        "search_food",
        "view_menu",
        "view_menu_item",
        "list_food_delivery_addresses",
        "get_food_cart",
        "create_cart",
        "add_to_cart",
        "update_food_cart_item",
        "remove_food_cart_item",
        "apply_voucher",
        "remove_food_voucher",
        "quote_delivery",
        "preview_order",
        "get_food_order",
        "track_food_order",
        "preview_food_order_cancellation",
        "prepare_food_order_confirmation",
        "prepare_food_order_cancellation_confirmation",
    )
]

_REVERSIBLE_WRITE_PROPOSALS = {
    "create_cart",
    "add_to_cart",
    "update_food_cart_item",
    "remove_food_cart_item",
    "apply_voucher",
    "remove_food_voucher",
}
_CONFIRMATION_PROPOSALS = {
    "prepare_food_order_confirmation",
    "prepare_food_order_cancellation_confirmation",
}


def _proposal(
    tool: dict[str, Any], *, workflow_id: str, correlation_id: str
) -> dict[str, Any]:
    """Project a selected tool to a non-executable, versioned Gateway proposal."""
    name = str(tool.get("name", ""))
    raw_arguments = tool.get("arguments", {})
    semantic_arguments = {
        key: value
        for key, value in (
            raw_arguments.items() if isinstance(raw_arguments, dict) else []
        )
        if not key.endswith("_id")
    }
    risk = (
        "FINANCIAL_OR_FINAL"
        if name in _CONFIRMATION_PROPOSALS
        else "REVERSIBLE_WRITE"
        if name in _REVERSIBLE_WRITE_PROPOSALS
        else "READ"
    )
    digest = hashlib.sha256(
        f"{workflow_id}:{correlation_id}:{name}".encode()
    ).hexdigest()[:20]
    return {
        "schema_version": "1",
        "capability_name": name,
        "semantic_arguments": semantic_arguments,
        "workflow_id": workflow_id,
        "tool_call_id": f"call_{digest}",
        "risk_ceiling": risk,
        "confirmation_gate": (
            "explicit_gateway_confirmation"
            if name in _CONFIRMATION_PROPOSALS
            else "none"
        ),
    }


def reconcile_intent(
    deterministic_intent: str,
    model_intent: str,
    workflow_context: dict[str, Any] | None = None,
) -> str:
    """Keep explicit user workflow actions authoritative over model routing."""
    del workflow_context
    if deterministic_intent == "out_of_scope":
        return "out_of_scope"
    if deterministic_intent != "general_food_support":
        return deterministic_intent
    return model_intent if model_intent in VALID_INTENTS else "general_food_support"


def _safe_model_slots(values: SemanticSlots | dict[str, Any]) -> dict[str, Any]:
    """Return only validated, non-authoritative model semantics.

    `StructuredDecision` validates this before normal graph use. The mapping branch
    keeps this boundary defensive for adapters/tests that supply an unparsed value:
    resource IDs are removed before validation and malformed values are discarded.
    """
    if isinstance(values, SemanticSlots):
        return values.model_dump(exclude_none=True)
    if not isinstance(values, dict):
        return {}
    try:
        permitted = {key: value for key, value in values.items() if key in SEMANTIC_SLOTS}
        return SemanticSlots.model_validate(permitted).model_dump(exclude_none=True)
    except ValidationError:
        return {}


def _parse_structured_decision(raw: Any) -> StructuredDecision:
    """Validate native output or recover one JSON object from model text safely."""
    if isinstance(raw, StructuredDecision):
        return raw
    if isinstance(raw, BaseModel):
        return StructuredDecision.model_validate(raw.model_dump())
    if isinstance(raw, dict):
        if raw.get("parsed") is not None:
            return _parse_structured_decision(raw["parsed"])
        if isinstance(raw.get("json"), dict):
            return StructuredDecision.model_validate(raw["json"])
        if raw.get("raw") is not None:
            return _parse_structured_decision(raw["raw"])
        return StructuredDecision.model_validate(raw)

    content = getattr(raw, "content", raw)
    if isinstance(content, dict):
        return StructuredDecision.model_validate(content)
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                if isinstance(block.get("json"), dict):
                    return StructuredDecision.model_validate(block["json"])
                if isinstance(block.get("text"), str):
                    parts.append(block["text"])
        content = "\n".join(parts)
    if not isinstance(content, str):
        raise TypeError("Unsupported structured model output")

    decoder = json.JSONDecoder()
    validation_error: ValidationError | None = None
    for index, character in enumerate(content):
        if character != "{":
            continue
        try:
            candidate, _ = decoder.raw_decode(content[index:])
        except json.JSONDecodeError:
            continue
        try:
            return StructuredDecision.model_validate(candidate)
        except ValidationError as exc:
            validation_error = exc
    if validation_error is not None:
        raise validation_error
    raise json.JSONDecodeError("No JSON object found in model output", content, 0)


def _missing_slots(intent: str, slots: dict[str, Any]) -> list[str]:
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
    return [slot for slot in required if not slots.get(slot)]


def build_graph(tool_client: Any | None = None, llm: LLMAdapter | None = None):
    # Kept as a temporary call-site compatibility parameter. It is deliberately
    # never invoked: the Agent has no execution or domain client.
    del tool_client
    model = llm or GeminiAdapter()
    settings = get_settings()
    use_model = llm is not None or (
        getattr(settings, "agent_model_mode", "deterministic") == "gemini"
        and bool(settings.gemini_api_key)
    )

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
        deterministic_intent = classify(query)
        deterministic = extract_slots(query)
        # A bare location is a valid follow-up only when an existing food
        # search supplies the dish/category.  It must not start an unrelated
        # food flow by itself.
        if (
            deterministic_intent == "general_food_support"
            and deterministic.get("district")
            and state.get("extracted_slots", {}).get("dish_query")
        ):
            deterministic_intent = "search_food"
        registry = PROPOSAL_REGISTRY
        fallback = {
            "intent": deterministic_intent,
            "confidence": None,
            "decision_source": "deterministic",
            "extracted_slots": {**state.get("extracted_slots", {}), **deterministic},
        }
        # The production graph is constructed with the default Gemini adapter
        # even when the runtime is using the deterministic path.  Keep model
        # injection available for tests and explicit callers, but do not make
        # ordinary classified food requests wait for a remote model.
        if not use_model or (llm is None and deterministic_intent != "general_food_support"):
            return {
                **fallback,
                "tool_registry": registry,
                "step_count": state.get("step_count", 0) + 1,
            }
        try:
            prompt = json.dumps(
                {
                    "instruction": "Interpret the food-related part of this X-One conversation. Return semantic slots only; never return database IDs. Propose only registered non-transaction tools. The top-level assistant may be handling ride, restaurant, or healthcare tasks in the same turn, so do not claim that this subflow owns the whole conversation.",
                    "query": query,
                    "recent_messages": state.get("messages", [])[-20:],
                    "workflow_context": state.get("extracted_slots", {}),
                    "tool_registry": registry,
                    "allowed_output": "semantic proposals only",
                    "response_schema": StructuredDecision.model_json_schema(),
                },
                ensure_ascii=False,
            )
            structured_invoke = getattr(model, "ainvoke_structured", None)
            raw = (
                await structured_invoke(prompt, StructuredDecision)
                if callable(structured_invoke)
                else await model.ainvoke(prompt)
            )
            decision = _parse_structured_decision(raw)
            logger.info("Structured model decision accepted")
            model_slots = _safe_model_slots(decision.extracted_slots)
            # The structured model output is accepted only after schema and
            # semantic-slot validation; let those validated semantic values
            # refine deterministic extraction (while resource IDs remain
            # excluded by _safe_model_slots).
            slots = {**state.get("extracted_slots", {}), **deterministic, **model_slots}
            return {
                "intent": reconcile_intent(deterministic_intent, decision.intent, state.get("extracted_slots", {})),
                "confidence": decision.confidence,
                "decision_source": "model",
                "extracted_slots": slots,
                "tool_registry": registry,
                "step_count": state.get("step_count", 0) + 1,
            }
        except (json.JSONDecodeError, ValidationError) as exc:
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
        missing = _missing_slots(str(intent), slots)
        labels = {
            "address_id": "địa chỉ giao hàng",
            "cart_id": "giỏ hàng",
            "restaurant_id": "nhà hàng",
            "menu_item_id": "món ăn",
            "cart_item_id": "món trong giỏ",
        }
        return {
            "missing_slots": missing,
            **(
                {
                    "response_type": "options",
                    "response": "Mình cần bạn chọn rõ "
                    + ", ".join(labels.get(value, value) for value in missing)
                    + ".",
                    "data": {"missing_slots": missing},
                }
                if missing
                else {}
            ),
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
        workflow_id = state.get("conversation_id")
        correlation_id = state.get("correlation_id")
        if not actor or not workflow_id or not correlation_id:
            return {"error": "IDENTITY_REQUIRED", "tool_calls": []}
        selected = list(state.get("selected_tools", []))
        intent = str(state.get("intent", "general_food_support"))
        slots = dict(state.get("extracted_slots", {}))
        if (
            intent == "add_to_cart"
            and selected
            and selected[0].get("name") == "view_menu_item"
        ):
            if not slots.get("cart_id"):
                selected.append({"name": "create_cart", "arguments": {}})
            selected.append(
                {
                    "name": "add_to_cart",
                    "arguments": {
                        "quantity": slots.get("quantity", 1),
                        "option_preferences": slots.get(
                            "option_preferences", []
                        ),
                    },
                }
            )
        follow_up = {
            "quote_delivery": "quote_delivery",
            "preview_order": "preview_order",
            "place_order": "prepare_food_order_confirmation",
        }.get(intent)
        if (
            follow_up
            and selected
            and selected[0].get("name")
            == "list_food_delivery_addresses"
        ):
            selected.append({"name": follow_up, "arguments": {}})
        if len(selected) > get_settings().max_tool_calls:
            return {"error": "TOOL_CALL_LIMIT", "tool_calls": []}
        proposals = [
            _proposal(
                tool,
                workflow_id=str(workflow_id),
                correlation_id=str(correlation_id),
            )
            for tool in selected
        ]
        return {
            "tool_calls": proposals,
            "tool_results": [],
            "extracted_slots": dict(state.get("extracted_slots", {})),
        }

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
        proposals = state.get("tool_calls", [])
        if proposals:
            slots = state.get("extracted_slots", {})
            semantic_updates = {
                key: slots[key]
                for key in (
                    "dish_query",
                    "district",
                    "max_price",
                    "address_query",
                    "quantity",
                    "option_preferences",
                )
                if slots.get(key) is not None
            }
            return {
                "response_type": "text",
                "response": "Gateway will validate and execute the proposed next step.",
                "data": {"proposals": proposals},
                "state_updates": semantic_updates,
            }
        results = state.get("tool_results", [])
        intent = str(state.get("intent", "general_food_support"))
        slots = state.get("extracted_slots", {})
        updates: dict[str, Any] = {}
        for key in ("restaurant_id", "menu_item_id", "address_id", "address_query"):
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
                        restaurants.append(_candidate_snapshot(restaurant))
                    if item.get("id"):
                        snapshot = _candidate_snapshot(item)
                        snapshot.setdefault("restaurant_id", restaurant.get("id"))
                        if restaurant:
                            snapshot.setdefault("restaurant", _candidate_snapshot(restaurant))
                        items.append(snapshot)
                updates.update({"restaurant_candidates": restaurants, "menu_item_candidates": items})
            if name == "view_menu" and isinstance(data, dict) and isinstance(data.get("items"), list):
                updates["menu_item_candidates"] = [
                    _candidate_snapshot(item) for item in data["items"] if isinstance(item, dict) and item.get("id")
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
            confirmation = results[-1]["data"]
            updates["pending_confirmation_id"] = confirmation.get("id") if isinstance(confirmation, dict) else None
            return {
                "response_type": "confirmation_form",
                "response": "Bạn kiểm tra thông tin và xác nhận bước tiếp theo nhé.",
                "data": confirmation,
                "pending_confirmation": confirmation,
                "state_updates": updates,
            }
        if intent == "search_food" and results and not any(result.get("data", {}).get("items") for result in results):
            return {
                "response_type": "text",
                "response": "Mình chưa tìm thấy món phù hợp.",
                "data": {},
                "state_updates": updates,
            }
        if intent == "preview_order" and results:
            return {
                "response_type": "order_preview",
                "response": "Xem truoc don hang.",
                "data": {"preview": results[-1].get("data", {})},
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
            "select_menu_item": "Mình đã lấy món bạn chọn từ menu hiện tại.",
            "search_food": "Mình tìm được các món phù hợp.",
        }
        if intent == "search_food" and state.get("recommendation_fallback"):
            messages["search_food"] = (
                "Mình chưa thấy đúng món bạn yêu cầu ở khu vực này. Đây là các món và quán gần đó để bạn chọn thay thế."
            )
        return {
            "response_type": "options" if results else "text",
            "response": messages.get(intent, "Mình có thể giúp bạn tìm món, xem menu và tạo giỏ."),
            "data": results[-1].get("data", {}) if results else {},
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
