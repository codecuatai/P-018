import re
from pathlib import Path

import yaml
from src.main import app

CONTRACT_PATH_PATTERN = re.compile(r"^  (?P<path>/[^:]+):$")
CONTRACT_METHOD_PATTERN = re.compile(r"^    (?P<method>get|post|patch|put|delete|options|head):$")


def runtime_business_operations() -> set[tuple[str, str]]:
    return {
        (path, method.upper())
        for path, operations in app.openapi()["paths"].items()
        if not path.startswith("/health/")
        for method in operations
        if method != "parameters"
    }


def contract_operations() -> set[tuple[str, str]]:
    contract = (Path(__file__).resolve().parents[3] / "packages/contracts/openapi/restaurant-service-v1.yaml").read_text(encoding="utf-8")
    operations: set[tuple[str, str]] = set()
    current_path: str | None = None
    for line in contract.splitlines():
        path_match = CONTRACT_PATH_PATTERN.match(line)
        if path_match:
            current_path = path_match.group("path")
            continue
        method_match = CONTRACT_METHOD_PATTERN.match(line)
        if method_match and current_path:
            operations.add((current_path, method_match.group("method").upper()))
    return operations


def contract_document() -> dict:
    contract_path = Path(__file__).resolve().parents[3] / "packages/contracts/openapi/restaurant-service-v1.yaml"
    return yaml.safe_load(contract_path.read_text(encoding="utf-8"))


def test_all_runtime_business_routes_are_described_in_openapi_contract() -> None:
    assert runtime_business_operations() == contract_operations()


def test_contract_carries_semantic_parameters_and_write_safety_constraints() -> None:
    runtime = app.openapi()["paths"]
    contract = contract_document()["paths"]
    availability = contract["/v1/restaurants/{restaurant_id}/availability"]["post"]
    path_parameter = next(item for item in availability["parameters"] if item.get("name") == "restaurant_id")
    assert path_parameter["in"] == "path"
    assert path_parameter["required"] is True
    response_schema = availability["responses"]["200"]["content"]["application/json"]["schema"]
    assert response_schema == {"$ref": "#/components/schemas/AvailabilityEnvelope"}
    snapshot = contract_document()["components"]["schemas"]["AvailabilitySnapshot"]
    assert {"snapshot_id", "resource_version", "observed_at", "expires_at"} <= set(snapshot["required"])

    side_effects = (
        ("/v1/reservation-holds", "post"),
        ("/v1/reservations", "post"),
        ("/v1/reservations/{reservation_id}", "patch"),
        ("/v1/reservations/{reservation_id}/cancel", "post"),
    )
    for path, method in side_effects:
        operation = contract[path][method]
        if "requestBody" in operation:
            assert operation["requestBody"]["required"] is True
        references = [item.get("$ref") for item in operation.get("parameters", [])]
        assert "#/components/parameters/IdempotencyKey" in references

    assert contract_document()["components"]["parameters"]["IdempotencyKey"]["schema"] == {
        "type": "string",
        "minLength": 1,
        "maxLength": 255,
    }
    assert "parameters" in runtime["/v1/restaurants/{restaurant_id}/availability"]["post"]

    runtime_search_parameters = {
        item["name"] for item in runtime["/v1/restaurants"]["get"]["parameters"]
    }
    contract_search_parameters = {
        item.get("name")
        for item in contract["/v1/restaurants"]["get"]["parameters"]
        if "name" in item
    }
    assert "q" in runtime_search_parameters
    assert "q" in contract_search_parameters
