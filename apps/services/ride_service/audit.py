from time import perf_counter
from uuid import uuid4

from starlette.requests import Request
from starlette.types import ASGIApp, Receive, Scope, Send

from .models import ApiAuditLog


async def write_audit_log(database, request: Request, status_code: int, started_at: float) -> None:
    async with database.sessions() as session:
        session.add(
            ApiAuditLog(
                request_id=request.headers.get("X-Request-ID") or f"req_{uuid4().hex[:20]}",
                method=request.method,
                path=request.url.path,
                status_code=status_code,
                duration_ms=round((perf_counter() - started_at) * 1000),
                idempotency_key=request.headers.get("Idempotency-Key"),
                # Deliberately do not persist request bodies; they may contain payment or PII data.
                request_body=None,
            )
        )
        await session.commit()


class AuditMiddleware:
    """Records request metadata without consuming or buffering the ASGI body stream."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive=receive)
        started_at = perf_counter()
        status_code = 500

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            database = getattr(scope["app"].state, "database", None)
            if database:
                try:
                    await write_audit_log(database, request, status_code, started_at)
                except Exception:
                    pass
