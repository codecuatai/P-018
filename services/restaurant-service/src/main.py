from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.api.health import router as health_router
from src.api.v1.restaurants import router as restaurants_router
from src.api.v1.reservations import router as reservations_router
from src.config import get_settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_settings()
    yield


app = FastAPI(title="X-One Restaurant Service", version="0.1.0", lifespan=lifespan)
app.include_router(health_router)
app.include_router(restaurants_router, prefix="/v1")
app.include_router(reservations_router, prefix="/v1")

