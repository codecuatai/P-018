from fastapi import APIRouter, Request, Response, status

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
def live() -> dict:
    """Liveness confirms only that the process is serving requests."""
    return {"data": {"status": "live"}}


@router.get("/ready")
async def ready(request: Request, response: Response) -> dict:
    """Readiness reports the connected database and workflow worker state."""
    worker_healthy = bool(getattr(request.app.state, "worker_healthy", True))
    repository = getattr(request.app.state, "food_service", None)
    persistence = getattr(getattr(repository, "repository", None), "pool", None)
    database_ready = repository is None or getattr(getattr(repository, "settings", None), "persistence", "memory") == "memory"
    if persistence is not None:
        try:
            await persistence.fetchval("SELECT 1")
            database_ready = True
        except Exception:
            database_ready = False
    ready_state = database_ready and worker_healthy
    if not ready_state:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"data": {"status": "ready" if ready_state else "not_ready", "service": "food-service", "database": "connected" if database_ready else "unavailable", "workflow_worker": "healthy" if worker_healthy else "unhealthy"}}
