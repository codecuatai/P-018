from pathlib import Path

import yaml
from src.agents.assistant.contracts import (
    FoodSemanticSlots,
    HealthcareSemanticSlots,
    Operation,
    PlanningPhase,
    RestaurantSemanticSlots,
    RideSemanticSlots,
    SlotSource,
)

SPEC_PATH = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "contracts"
    / "openapi"
    / "agent-service.v1.yaml"
)


def _schemas() -> dict[str, dict[str, object]]:
    document = yaml.safe_load(SPEC_PATH.read_text(encoding="utf-8"))
    return document["components"]["schemas"]


def test_core_a_enums_and_slot_scalar_contract_match_pydantic() -> None:
    schemas = _schemas()
    task_properties = schemas["CoreAPlannedTask"]["properties"]
    slot_properties = schemas["CoreASemanticSlot"]["properties"]
    step_properties = schemas["CoreAPlannedStep"]["properties"]

    assert task_properties["operation"]["enum"] == [item.value for item in Operation]
    assert slot_properties["source"]["enum"] == [item.value for item in SlotSource]
    assert [item["type"] for item in slot_properties["value"]["oneOf"]] == [
        "string",
        "integer",
        "number",
        "boolean",
    ]
    assert step_properties["phase"]["enum"] == [item.value for item in PlanningPhase]
    assert slot_properties["confidence"] == {
        "type": ["number", "null"],
        "minimum": 0,
        "maximum": 1,
    }


def test_core_a_domain_slot_names_match_strict_pydantic_models() -> None:
    schemas = _schemas()
    expected = {
        "CoreARideSemanticSlots": RideSemanticSlots,
        "CoreARestaurantSemanticSlots": RestaurantSemanticSlots,
        "CoreAHealthcareSemanticSlots": HealthcareSemanticSlots,
        "CoreAFoodSemanticSlots": FoodSemanticSlots,
    }
    slot_union = schemas["CoreAPlannedTask"]["properties"]["semantic_slots"]["oneOf"]

    assert [item["$ref"].rsplit("/", 1)[-1] for item in slot_union] == list(expected)
    for schema_name, model in expected.items():
        schema = schemas[schema_name]
        assert schema["additionalProperties"] is False
        assert set(schema["properties"]) == set(model.model_fields)
