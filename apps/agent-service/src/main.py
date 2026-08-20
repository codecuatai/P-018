from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import router
from src.config import get_settings
from src.infrastructure.database import close_pool, persistence_ready


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    print(f"Starting {settings.app_name} in {settings.app_env} mode")
    yield
    print("Shutting down...")
    await close_pool()


app = FastAPI(
    title="X-One Agent Service",
    description="LangGraph intent and tool-request service. It does not execute bookings.",
    version="1.0.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")


@app.get("/health/live")
async def liveness() -> dict:
    return {"data": {"status": "live"}}


@app.get("/health/ready")
async def readiness() -> dict:
    if not await persistence_ready():
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AGENT_PERSISTENCE_UNAVAILABLE",
                "detail": "Required Agent persistence is unavailable.",
            },
        )
    return {
        "data": {
            "status": "ready",
            "service": "agent-service",
            "llm_configured": bool(settings.gemini_api_key),
            "persistence_mode": settings.agent_persistence_mode,
        }
    }


@app.get("/health", include_in_schema=False)
async def legacy_health() -> dict:
    """Compatibility endpoint retained for the former standalone agent."""
    return {"status": "ok", "env": settings.app_env}
