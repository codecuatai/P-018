import hmac

from fastapi import Header, HTTPException, status

from src.config import get_settings


def require_internal_auth(x_internal_service_token: str | None = Header(default=None)) -> None:
    expected = get_settings().internal_service_token
    if not x_internal_service_token or not hmac.compare_digest(x_internal_service_token, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
