from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from src.api.health import router as health_router
from src.api.v1.ops import router as ops_router
from src.api.v1.reservations import router as reservations_router
from src.api.v1.restaurants import router as restaurants_router
from src.application.restaurant_service import RestaurantApplicationService
from src.config import get_settings
from src.repositories.restaurant_repository import RestaurantRepository


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.restaurant_service = RestaurantApplicationService(RestaurantRepository(settings.database_url))
    yield


app = FastAPI(title="X-One Restaurant Service", version="0.1.0", lifespan=lifespan)


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict):
        code = str(exc.detail.get("code", "REQUEST_FAILED"))
        detail = str(exc.detail.get("detail", "Request failed"))
    else:
        detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
        code = detail.upper().replace(" ", "_")
    return JSONResponse(status_code=exc.status_code, content={"type": "about:blank", "title": detail, "status": exc.status_code, "code": code, "detail": detail, "retryable": exc.status_code in {409, 429}, "request_id": request.headers.get("X-Correlation-Id")})


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, _exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"type": "about:blank", "title": "Validation failed", "status": 422, "code": "VALIDATION_ERROR", "detail": "Request validation failed", "retryable": False, "request_id": request.headers.get("X-Correlation-Id")})

app.include_router(health_router)
app.include_router(restaurants_router, prefix="/v1")
app.include_router(reservations_router, prefix="/v1")
app.include_router(ops_router, prefix="/v1")

