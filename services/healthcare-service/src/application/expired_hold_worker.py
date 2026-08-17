from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from contextlib import suppress
from datetime import datetime

from sqlalchemy.orm import Session

from src.application.healthcare_service import _utc_now, reconcile_expired_holds
from src.database import SessionLocal
from src.repositories.healthcare_repository import HealthcareRepository

EXPIRED_HOLD_CLEANUP_INTERVAL_SECONDS = 15 * 60
WORKER_SHUTDOWN_TIMEOUT_SECONDS = 10

logger = logging.getLogger(__name__)

SessionFactory = Callable[[], Session]
CleanupFunction = Callable[[], int]


def cleanup_expired_holds_once(
    session_factory: SessionFactory = SessionLocal,
    now: datetime | None = None,
) -> int:
    session = session_factory()
    repository = HealthcareRepository(session)
    try:
        expired_appointment_ids = reconcile_expired_holds(repository, now or _utc_now())
        repository.commit()
        return len(expired_appointment_ids)
    except Exception:
        repository.rollback()
        raise
    finally:
        session.close()


async def run_expired_hold_cleanup_worker(
    stop_event: asyncio.Event,
    *,
    interval_seconds: float = EXPIRED_HOLD_CLEANUP_INTERVAL_SECONDS,
    cleanup: CleanupFunction = cleanup_expired_holds_once,
) -> None:
    while not stop_event.is_set():
        try:
            cleaned_count = await asyncio.to_thread(cleanup)
            if cleaned_count:
                logger.info("Expired Healthcare holds reconciled: count=%s", cleaned_count)
        except Exception:
            logger.exception("Expired Healthcare hold cleanup failed; the worker will retry.")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except TimeoutError:
            continue


async def stop_expired_hold_cleanup_worker(
    stop_event: asyncio.Event,
    worker_task: asyncio.Task[None],
) -> None:
    stop_event.set()
    try:
        await asyncio.wait_for(worker_task, timeout=WORKER_SHUTDOWN_TIMEOUT_SECONDS)
    except TimeoutError:
        worker_task.cancel()
        with suppress(asyncio.CancelledError):
            await worker_task

