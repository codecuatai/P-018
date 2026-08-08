import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from src.database import sqlalchemy_database_url


def test_postgres_migration_allows_reuse_after_cancel() -> None:
    database_url = os.getenv("HEALTHCARE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("HEALTHCARE_TEST_DATABASE_URL is not configured")

    engine = create_engine(sqlalchemy_database_url(database_url))
    now = datetime.now(UTC).replace(tzinfo=None)
    suffix = uuid4().hex[:12]
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            index_definition = connection.execute(
                text("SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'uq_appointments_active_slot'")
            ).scalar_one_or_none()
            assert index_definition is not None
            assert "status IN ('DRAFT', 'CONFIRMED')" in str(index_definition)

            department_id = connection.execute(
                text("INSERT INTO departments (name, description) VALUES (:name, 'migration test') RETURNING id"),
                {"name": f"Migration test {suffix}"},
            ).scalar_one()
            doctor_id = connection.execute(
                text("INSERT INTO doctors (department_id, name, price, description) VALUES (:department_id, :name, 1, 'migration test') RETURNING id"),
                {"department_id": department_id, "name": f"Doctor {suffix}"},
            ).scalar_one()
            patient_id = connection.execute(
                text("INSERT INTO patients (name, phone) VALUES (:name, :phone) RETURNING id"),
                {"name": f"Patient {suffix}", "phone": f"09{suffix}"},
            ).scalar_one()
            slot_id = connection.execute(
                text("INSERT INTO time_slots (doctor_id, start_time, end_time, status) VALUES (:doctor_id, :start_time, :end_time, 'HOLDING') RETURNING id"),
                {"doctor_id": doctor_id, "start_time": now + timedelta(days=1), "end_time": now + timedelta(days=1, minutes=30)},
            ).scalar_one()

            first_id = connection.execute(
                text("INSERT INTO appointments (actor_id, patient_id, doctor_id, slot_id, status, is_paid) VALUES (:actor_id, :patient_id, :doctor_id, :slot_id, 'DRAFT', false) RETURNING id"),
                {"actor_id": f"actor-a-{suffix}", "patient_id": patient_id, "doctor_id": doctor_id, "slot_id": slot_id},
            ).scalar_one()
            connection.execute(text("UPDATE appointments SET status = 'CANCELLED' WHERE id = :id"), {"id": first_id})
            replacement_id = connection.execute(
                text("INSERT INTO appointments (actor_id, patient_id, doctor_id, slot_id, status, is_paid) VALUES (:actor_id, :patient_id, :doctor_id, :slot_id, 'DRAFT', false) RETURNING id"),
                {"actor_id": f"actor-b-{suffix}", "patient_id": patient_id, "doctor_id": doctor_id, "slot_id": slot_id},
            ).scalar_one()
            assert replacement_id != first_id
        finally:
            transaction.rollback()
    engine.dispose()
