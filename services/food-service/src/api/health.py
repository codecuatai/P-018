from fastapi import APIRouter, Request

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
def live() -> dict:
    """Liveness confirms only that the process is serving requests."""
    return {"data": {"status": "live"}}


@router.get("/ready")
def ready(request: Request) -> dict:
    """Readiness reports the connected database and workflow worker state."""
    worker_healthy = bool(getattr(request.app.state, "worker_healthy", True))
    repository = getattr(request.app.state, "food_service", None)
    persistence = getattr(getattr(repository, "repository", None), "pool", None)
    database_ready = repository is None or persistence is not None or getattr(getattr(repository, "settings", None), "persistence", "memory") == "memory"
    ready_state = database_ready and worker_healthy
    return {"data": {"status": "ready" if ready_state else "not_ready", "service": "food-service", "database": "connected" if database_ready else "unavailable", "workflow_worker": "healthy" if worker_healthy else "unhealthy"}}
