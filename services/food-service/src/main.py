import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from src.api.food import router as food_router
from src.api.health import router as health_router
from src.application.food_service import FoodApplicationService
from src.config import get_settings
from src.domain.policies import DomainError
from src.repositories.food import InMemoryFoodRepository, PostgresFoodRepository

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.persistence == "postgres":
        repository = PostgresFoodRepository(settings.database_url)
    elif settings.persistence == "memory" and settings.app_env in {"development", "test"}:
        repository = InMemoryFoodRepository()
    else:
        raise RuntimeError("Invalid Food persistence mode for this runtime.")
    if isinstance(repository, PostgresFoodRepository):
        await repository.connect()
    app.state.food_service = FoodApplicationService(repository, settings)
    app.state.worker_healthy = True
    app.state.worker_error = None

    async def workflow_worker() -> None:
        while True:
            try:
                await app.state.food_service.reconcile_due_orders()
                app.state.worker_healthy = True
                app.state.worker_error = None
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                app.state.worker_healthy = False
                app.state.worker_error = type(exc).__name__
                logger.exception("Food workflow iteration failed")
            await asyncio.sleep(settings.workflow_poll_interval_ms / 1000)

    worker = (
        asyncio.create_task(workflow_worker())
        if settings.persistence == "postgres" and settings.workflow_worker_enabled
        else None
    )
    yield
    if worker is not None:
        worker.cancel()
        await asyncio.gather(worker, return_exceptions=True)
    if isinstance(repository, PostgresFoodRepository):
        await repository.close()


app = FastAPI(title="X-One Food Service", version="1.0.0", lifespan=lifespan)


def food_domain_error(request: Request, exc: DomainError) -> JSONResponse:
    status_by_code = {
        "NOT_FOUND": 404,
        "FORBIDDEN": 403,
        "UNAUTHORIZED": 401,
        "INVALID_OPTION": 422,
        "CROSS_RESTAURANT_CART": 409,
        "VOUCHER_INVALID": 422,
        "VOUCHER_EXPIRED": 422,
        "VOUCHER_NOT_APPLICABLE": 422,
        "VOUCHER_USAGE_LIMIT": 409,
        "DELIVERY_OUT_OF_RANGE": 422,
        "CART_EMPTY": 422,
        "CART_CHANGED": 409,
        "PAYLOAD_MISMATCH": 409,
        "IDEMPOTENCY_KEY_REUSED": 409,
        "INVALID_ORDER_TRANSITION": 409,
        "WORKFLOW_CONFLICT": 409,
        "ORDER_NOT_CANCELLABLE": 409,
        "MENU_ITEM_UNAVAILABLE": 422,
        "RESTAURANT_CLOSED": 422,
        "UPSTREAM_UNAVAILABLE": 503,
    }
    response_status = status_by_code.get(exc.code, 400)
    return JSONResponse(
        status_code=response_status,
        content={
            "type": f"https://x-one.local/problems/{exc.code.lower()}",
            "title": "Food domain error",
            "status": response_status,
            "code": exc.code,
            "detail": exc.detail,
            "retryable": response_status >= 500,
        },
    )


app.add_exception_handler(DomainError, food_domain_error)
app.include_router(health_router)
app.include_router(food_router)


@app.middleware("http")
async def correlation_id(request: Request, call_next):
    import uuid

    correlation_id = request.headers.get("x-correlation-id") or f"cor_{uuid.uuid4()}"
    response = await call_next(request)
    response.headers["x-correlation-id"] = correlation_id
    return response
