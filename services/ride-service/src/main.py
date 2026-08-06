from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.api.health import router as health_router
from src.config import get_settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_settings()
    yield


app = FastAPI(title="X-One Ride Service", version="0.1.0", lifespan=lifespan)
app.include_router(health_router)
