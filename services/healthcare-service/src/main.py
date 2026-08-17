import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.health import router as health_router
from src.api.routes import router as healthcare_router
from src.application.expired_hold_worker import (
    run_expired_hold_cleanup_worker,
    stop_expired_hold_cleanup_worker,
)
from src.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_settings()
    stop_event = asyncio.Event()
    worker_task = asyncio.create_task(
        run_expired_hold_cleanup_worker(stop_event),
        name="healthcare-expired-hold-cleanup",
    )
    app.state.expired_hold_cleanup_task = worker_task
    try:
        yield
    finally:
        await stop_expired_hold_cleanup_worker(stop_event, worker_task)


app = FastAPI(title="X-One Healthcare Service", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(healthcare_router)
