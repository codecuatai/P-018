from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from .audit import AuditMiddleware
from .config import Settings
from .database import RideDatabase
from .geoapify import GeoapifyRouteProvider
from .models import ApiAuditLog
from .payment_gateway import PaymentGateway
from .repository import RideRepository
from .schemas import (
    AuditLogOut,
    BookingCreate,
    BookingOut,
    FinalizeFareInput,
    LiveQuoteCreate,
    LiveQuoteOut,
    QuoteCreate,
    QuoteOut,
)
from .service import RideService


def create_app(database_url: str | None = None, payment_gateway=None) -> FastAPI:
    settings = Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        database = RideDatabase(database_url or settings.database_url)
        await database.create_tables()
        app.state.database = database
        app.state.payment_gateway = payment_gateway or PaymentGateway(settings.payment_service_url)
        app.state.location_provider = (
            GeoapifyRouteProvider(settings.geoapify_api_key) if settings.geoapify_api_key else None
        )
        yield
        await database.dispose()

    app = FastAPI(title="Ride Service MVP", version="0.1.0", lifespan=lifespan)
    origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(AuditMiddleware)

    async def service(request: Request):
        async with request.app.state.database.sessions() as session:
            yield RideService(
                RideRepository(session), request.app.state.payment_gateway, request.app.state.location_provider
            )

    @app.post("/v1/rides/quotes", response_model=QuoteOut, status_code=201)
    async def create_quote(data: QuoteCreate, svc: RideService = Depends(service)):
        return await svc.create_quote(data)

    @app.post("/v1/rides/quotes/live", response_model=LiveQuoteOut, status_code=201)
    async def create_live_quote(data: LiveQuoteCreate, svc: RideService = Depends(service)):
        quote, route = await svc.create_live_quote(data)
        return {"quote": quote, **route}

    @app.post("/v1/rides/bookings", response_model=BookingOut, status_code=201)
    async def create_booking(
        data: BookingCreate,
        idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
        svc: RideService = Depends(service),
    ):
        return await svc.create_booking(data, idempotency_key)

    @app.get("/v1/rides/bookings/{booking_id}", response_model=BookingOut)
    async def get_booking(booking_id: str, svc: RideService = Depends(service)):
        return await svc.get_booking(booking_id)

    @app.get("/v1/rides/quotes/{quote_id}", response_model=QuoteOut)
    async def get_quote(quote_id: str, svc: RideService = Depends(service)):
        quote = await svc.repository.get_quote(quote_id)
        from fastapi import HTTPException

        if not quote:
            raise HTTPException(404, "Quote not found")
        return quote

    @app.post("/v1/rides/bookings/{booking_id}/cancel", response_model=BookingOut)
    async def cancel_booking(
        booking_id: str,
        idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
        svc: RideService = Depends(service),
    ):
        return await svc.cancel(booking_id, idempotency_key)

    @app.post("/v1/rides/bookings/{booking_id}/finalize-fare", response_model=BookingOut)
    async def finalize_fare(
        booking_id: str,
        data: FinalizeFareInput,
        idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
        svc: RideService = Depends(service),
    ):
        return await svc.finalize_fare(booking_id, data, idempotency_key)

    @app.post("/v1/rides/bookings/{booking_id}/complete", response_model=BookingOut)
    async def complete_booking(
        booking_id: str,
        idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
        svc: RideService = Depends(service),
    ):
        return await svc.complete(booking_id, idempotency_key)

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
