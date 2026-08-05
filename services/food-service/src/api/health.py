from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
def live() -> dict:
    """Liveness confirms only that the process is serving requests."""
    return {"data": {"status": "live"}}


@router.get("/ready")
def ready() -> dict:
    """Skeleton readiness confirms parsed configuration, not a database probe."""
    return {"data": {"status": "ready", "service": "food-service", "dependency_checks": "not_configured"}}
