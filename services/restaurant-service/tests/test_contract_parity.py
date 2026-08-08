import re
from pathlib import Path

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


def test_all_runtime_business_routes_are_described_in_openapi_contract() -> None:
    assert runtime_business_operations() == contract_operations()
