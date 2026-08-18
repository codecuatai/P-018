from fastapi import HTTPException


def require_idempotency_key(value: str | None) -> str:
    """Validate a Restaurant side-effect key before it reaches persistence."""
    if value is None:
        raise HTTPException(status_code=400, detail={"code": "IDEMPOTENCY_KEY_REQUIRED", "detail": "Idempotency-Key is required."})
    key = value.strip()
    if not key:
        raise HTTPException(status_code=400, detail={"code": "IDEMPOTENCY_KEY_INVALID", "detail": "Idempotency-Key must not be blank."})
    if len(key) > 255:
        raise HTTPException(status_code=422, detail={"code": "IDEMPOTENCY_KEY_INVALID", "detail": "Idempotency-Key must be at most 255 characters."})
    return key
