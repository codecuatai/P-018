import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import src.main as healthcare_main
from fastapi import FastAPI
from src.application.expired_hold_worker import run_expired_hold_cleanup_worker
from src.application.healthcare_service import cancel_appointment
from src.models.medical import AppointmentStatus, SlotStatus
from src.repositories.healthcare_repository import HealthcareRepository


def test_get_slot_with_lock_for_update_locks_before_reading() -> None:
    session = MagicMock()
    filtered_query = session.query.return_value.filter.return_value
    locked_query = filtered_query.with_for_update.return_value
    expected_slot = MagicMock()
    locked_query.first.return_value = expected_slot

    repository = HealthcareRepository(session)

    assert repository.get_slot_with_lock_for_update(42) is expected_slot
    filtered_query.with_for_update.assert_called_once_with()
    locked_query.first.assert_called_once_with()


def test_expired_slot_scan_uses_skip_locked() -> None:
    session = MagicMock()
    filtered_query = session.query.return_value.filter.return_value
    locked_query = filtered_query.with_for_update.return_value
    locked_query.all.return_value = []

    repository = HealthcareRepository(session)

    assert repository.get_expired_slots_with_lock_for_update(MagicMock()) == []
    filtered_query.with_for_update.assert_called_once_with(skip_locked=True)


def test_cancel_appointment_locks_slot_before_appointment() -> None:
    repository = MagicMock(spec=HealthcareRepository)
    appointment = MagicMock(
        id=9,
        slot_id=7,
        status=AppointmentStatus.DRAFT.value,
        is_paid=False,
    )
    slot = MagicMock(
        id=7,
        status=SlotStatus.HOLDING.value,
        hold_expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(minutes=5),
    )
    repository.get_actor_appointment_slot_id.return_value = slot.id
    repository.get_slot_with_lock_for_update.return_value = slot
    repository.get_actor_appointment_with_lock_for_update.return_value = appointment
    repository.release_slot.side_effect = lambda current: (
        setattr(current, "status", SlotStatus.AVAILABLE.value),
        setattr(current, "hold_expires_at", None),
    )
    repository.cancel_unpaid_appointment.side_effect = lambda current: setattr(
        current,
        "status",
        AppointmentStatus.CANCELLED.value,
    )

    result = cancel_appointment(
        repository,
        actor_id="actor-health-test",
        appointment_id=appointment.id,
    )

    method_names = [call[0] for call in repository.mock_calls]
    assert method_names.index("get_slot_with_lock_for_update") < method_names.index(
        "get_actor_appointment_with_lock_for_update"
    )
    assert result["appointment_status"] == AppointmentStatus.CANCELLED.value


def test_cleanup_worker_runs_immediately_and_stops_cleanly() -> None:
    cleanup_calls: list[int] = []

    def cleanup() -> int:
        cleanup_calls.append(1)
        return 0

    async def run_scenario() -> None:
        stop_event = asyncio.Event()
        worker_task = asyncio.create_task(
            run_expired_hold_cleanup_worker(
                stop_event,
                interval_seconds=3600,
                cleanup=cleanup,
            )
        )
        while not cleanup_calls:
            await asyncio.sleep(0)
        stop_event.set()
        await worker_task

    asyncio.run(run_scenario())


def test_lifespan_starts_and_stops_cleanup_worker(monkeypatch) -> None:
    lifecycle_events: list[str] = []

    async def fake_worker(stop_event: asyncio.Event) -> None:
        lifecycle_events.append("started")
        await stop_event.wait()

    async def fake_stop(stop_event: asyncio.Event, worker_task: asyncio.Task[None]) -> None:
        lifecycle_events.append("stopping")
        stop_event.set()
        await worker_task

    monkeypatch.setattr(healthcare_main, "run_expired_hold_cleanup_worker", fake_worker)
    monkeypatch.setattr(healthcare_main, "stop_expired_hold_cleanup_worker", fake_stop)

    async def run_scenario() -> None:
        test_app = FastAPI()
        async with healthcare_main.lifespan(test_app):
            await asyncio.sleep(0)
            worker_task = test_app.state.expired_hold_cleanup_task
            assert worker_task.get_name() == "healthcare-expired-hold-cleanup"
            assert lifecycle_events == ["started"]
        assert lifecycle_events == ["started", "stopping"]
        assert worker_task.done()

    asyncio.run(run_scenario())
