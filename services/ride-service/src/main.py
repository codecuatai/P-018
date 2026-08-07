from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response

from src.api.health import router as health_router
from src.api.rides import router as rides_router
from src.config import get_settings
from src.domain.ride import RideError


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    get_settings()
    yield


app = FastAPI(
    title="X-One Ride Service",
    description="Ride-owned deterministic simulation for quotes and booking lifecycle.",
    version="1.0.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def correlation_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    incoming = request.headers.get("X-Correlation-Id")
    request.state.correlation_id = incoming if incoming and len(incoming) <= 128 else f"cor_{uuid4()}"
    response = await call_next(request)
    response.headers["X-Correlation-Id"] = request.state.correlation_id
    return response


@app.exception_handler(RideError)
async def ride_error_handler(request: Request, exc: RideError) -> JSONResponse:
    return _problem(request, exc.status, exc.code, exc.detail, exc.retryable)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, _: RequestValidationError) -> JSONResponse:
    return _problem(request, 422, "VALIDATION_ERROR", "Request validation failed.", False)


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    detail = "Resource not found." if exc.status_code == 404 else "Request failed."
    return _problem(request, exc.status_code, "HTTP_ERROR", detail, False)


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, _: Exception) -> JSONResponse:
    return _problem(request, 500, "INTERNAL_ERROR", "An unexpected error occurred.", True)


def _problem(
    request: Request,
    status: int,
    code: str,
    detail: str,
    retryable: bool,
) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={
            "type": f"https://x-one.local/problems/{code.lower()}",
            "title": code.replace("_", " ").title(),
            "status": status,
            "code": code,
            "detail": detail,
            "retryable": retryable,
            "request_id": getattr(request.state, "correlation_id", f"cor_{uuid4()}"),
        },
    )


app.include_router(health_router)
app.include_router(rides_router)
