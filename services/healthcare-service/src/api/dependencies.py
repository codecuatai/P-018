from __future__ import annotations

from fastapi import Header, HTTPException

from src.config import get_settings


def verify_internal_service_token(
    x_internal_service_token: str | None = Header(default=None, alias="X-Internal-Service-Token"),
) -> str:
    if not x_internal_service_token or x_internal_service_token != get_settings().internal_service_token:
        raise HTTPException(
            status_code=401,
            detail={"code": "UNAUTHORIZED", "detail": "Gateway authentication required."},
        )
    return x_internal_service_token
