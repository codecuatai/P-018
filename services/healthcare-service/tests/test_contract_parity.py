from __future__ import annotations

import re
from pathlib import Path

import pytest
from fastapi import HTTPException
from src.api.routes import _require_idempotency_key

ROOT = Path(__file__).resolve().parents[3]
CONTRACT_PATH = ROOT / "packages" / "contracts" / "openapi" / "healthcare-service-v1.yaml"
WRITE_PATHS = (
    "/api/v1/slots/hold",
    "/api/v1/payment/webhook",
    "/api/v1/appointments/{appointment_id}/confirm",
    "/api/v1/appointments/{appointment_id}/cancel",
)


def _path_block(contract: str, path: str) -> str:
    match = re.search(
        rf"(?ms)^  {re.escape(path)}:\n(?P<body>.*?)(?=^  /|^components:)",
        contract,
    )
    assert match is not None, f"OpenAPI path is missing: {path}"
    return match.group("body")


def test_healthcare_openapi_requires_bounded_idempotency_key() -> None:
    contract = CONTRACT_PATH.read_text(encoding="utf-8")
    parameter = re.search(
        r"(?ms)^    IdempotencyKey:\n(?P<body>.*?)(?=^    AppointmentId:)",
        contract,
    )
    assert parameter is not None
    body = parameter.group("body")
    assert re.search(r"^      required: true$", body, re.MULTILINE)
    assert re.search(r"schema: \{type: string, minLength: 1, maxLength: 255\}", body)

    for path in WRITE_PATHS:
        assert "#/components/parameters/IdempotencyKey" in _path_block(contract, path)


def test_healthcare_runtime_accepts_exact_contract_limit() -> None:
    key = "k" * 255
    assert _require_idempotency_key(key) == key

    with pytest.raises(HTTPException) as error:
        _require_idempotency_key("k" * 256)
    assert error.value.status_code == 422


def test_healthcare_runtime_rejects_missing_and_empty_key() -> None:
    with pytest.raises(HTTPException) as missing:
        _require_idempotency_key(None)
    assert missing.value.status_code == 400

    with pytest.raises(HTTPException) as empty:
        _require_idempotency_key("  ")
    assert empty.value.status_code == 400
