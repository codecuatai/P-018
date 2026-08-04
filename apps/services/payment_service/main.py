from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, Request
from sqlalchemy import select

from .audit import AuditMiddleware
from .config import Settings
from .database import PaymentDatabase
from .models import ApiAuditLog
from .repository import PaymentRepository
from .schemas import AuditLogOut, CaptureRequest, PaymentIntentCreate, PaymentIntentOut
from .service import PaymentService, ProviderTimeout


def create_app(database_url: str | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        database = PaymentDatabase(database_url or Settings().database_url)
        await database.create_tables()
        app.state.database = database
        yield
        await database.dispose()

    app = FastAPI(title="Payment Service MVP", version="0.1.0", lifespan=lifespan)

    app.add_middleware(AuditMiddleware)

    async def service(request: Request):
        async with request.app.state.database.sessions() as session:
            yield PaymentService(PaymentRepository(session))

    @app.post("/v1/payment-intents", response_model=PaymentIntentOut, status_code=201)
    async def create_payment_intent(
        data: PaymentIntentCreate,
        idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
        svc: PaymentService = Depends(service),
    ):
        return await svc.create(data, idempotency_key)

    @app.get("/v1/payment-intents/{intent_id}", response_model=PaymentIntentOut)
    async def get_payment_intent(intent_id: str, svc: PaymentService = Depends(service)):
        return await svc.get(intent_id)

    @app.post("/v1/payment-intents/{intent_id}/authorize", response_model=PaymentIntentOut)
    async def authorize(
        intent_id: str,
        idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
        svc: PaymentService = Depends(service),
    ):
        return await svc.authorize(intent_id, idempotency_key)

    @app.post("/v1/payment-intents/{intent_id}/capture", response_model=PaymentIntentOut)
    async def capture(
        intent_id: str,
        data: CaptureRequest | None = None,
        idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
        svc: PaymentService = Depends(service),
    ):
        try:
            return await svc.capture(intent_id, idempotency_key, data.amount if data else None)
        except ProviderTimeout:
            from fastapi import HTTPException

            raise HTTPException(504, "Provider timed out after accepting capture; reconcile payment intent")

    @app.post("/v1/payment-intents/{intent_id}/cancel", response_model=PaymentIntentOut)
    async def cancel(
        intent_id: str,
        idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
        svc: PaymentService = Depends(service),
    ):
        return await svc.cancel(intent_id, idempotency_key)

    @app.post("/v1/payment-intents/{intent_id}/refund", response_model=PaymentIntentOut)
    async def refund(
        intent_id: str,
        idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
        svc: PaymentService = Depends(service),
    ):
        return await svc.refund(intent_id, idempotency_key)

    @app.get("/v1/audit-logs", response_model=list[AuditLogOut])
    async def list_audit_logs(request: Request, limit: int = 100):
        async with request.app.state.database.sessions() as session:
            logs = await session.scalars(
                select(ApiAuditLog).order_by(ApiAuditLog.id.desc()).limit(min(max(limit, 1), 500))
            )
            return list(logs)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
