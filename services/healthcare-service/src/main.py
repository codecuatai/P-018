from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.api.health import router as health_router
from src.config import get_settings


from src.api.routes import router as healthcare_router

@asynccontextmanager
async def lifespan(_: FastAPI):
    get_settings()
    yield


from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="X-One Healthcare Service", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(healthcare_router)
