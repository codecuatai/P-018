import hmac

from fastapi import Header, HTTPException, Request, status

from src.config import get_settings


def require_internal_auth(
    request: Request,
    x_internal_service_token: str | None = Header(default=None),
    x_actor_id: str | None = Header(default=None),
) -> str:
    expected = get_settings().internal_service_token
    if not x_internal_service_token or not hmac.compare_digest(x_internal_service_token, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    if not x_actor_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Actor context required")
    request.state.actor_id = x_actor_id
    return x_actor_id
