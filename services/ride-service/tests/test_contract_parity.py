from __future__ import annotations

from pathlib import Path

import yaml
from src.main import app

CONTRACT_PATH = Path(__file__).resolve().parents[3] / "packages/contracts/openapi/ride-service.v1.yaml"


def test_all_runtime_business_routes_are_described_in_openapi_contract() -> None:
    runtime = {
        (path, method.upper())
        for path, operations in app.openapi()["paths"].items()
        if not path.startswith("/health/")
        for method in operations
        if method != "parameters"
    }
    contract = yaml.safe_load(CONTRACT_PATH.read_text(encoding="utf-8"))
    documented = {
        (path, method.upper())
        for path, operations in contract["paths"].items()
        for method in operations
        if method != "parameters"
    }
    assert runtime == documented


def test_ride_contract_exposes_route_snapshot_and_tracking_shapes() -> None:
    contract = yaml.safe_load(CONTRACT_PATH.read_text(encoding="utf-8"))
    quote = contract["components"]["schemas"]["Quote"]["properties"]
    booking = contract["components"]["schemas"]["Booking"]["properties"]
    tracking = contract["components"]["schemas"]["Tracking"]["properties"]

    assert {"route_provider", "route_snapshot_hash", "tariff_snapshot"} <= quote.keys()
    assert {"driver_id", "tracking_started_at"} <= booking.keys()
    assert {"driver_location", "current_location", "route", "updated_at"} <= tracking.keys()
    assert "#/components/parameters/IdempotencyKey" in str(contract["paths"]["/v1/quotes"]["post"])
