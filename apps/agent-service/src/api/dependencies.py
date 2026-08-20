import hmac

from fastapi import Depends, Header, HTTPException, status

from src.config import get_settings


def require_internal_auth(x_internal_service_token: str | None = Header(default=None)) -> None:
    expected = get_settings().internal_service_token
    if not x_internal_service_token or not hmac.compare_digest(x_internal_service_token, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")


def require_actor(
    x_actor_id: str | None = Header(default=None),
    _auth: None = Depends(require_internal_auth),
) -> str:
    if not x_actor_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "ACTOR_REQUIRED", "detail": "Actor assertion required."},
        )
    return x_actor_id
