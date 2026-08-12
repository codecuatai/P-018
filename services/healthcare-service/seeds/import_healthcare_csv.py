from __future__ import annotations

import argparse
import csv
import unicodedata
from datetime import datetime, timedelta
from pathlib import Path

from src.database import SessionLocal
from src.models.medical import Department, Doctor, HealthcareFacility, Patient, SlotStatus, TimeSlot

SERVICE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_DIR = SERVICE_ROOT / "import-data"
CSV_NAMES = ("benhvien.csv", "chuyenkhoa.csv", "bacsi.csv")


def _normalized_name(value: str) -> str:
    """Create a stable lookup key for CSV names with minor casing/diacritic differences."""
    decomposed = unicodedata.normalize("NFD", value.strip().casefold())
    without_marks = "".join(char for char in decomposed if unicodedata.category(char) != "Mn")
    return without_marks.replace("đ", "d")


def _parse_optional_int(value: str | None) -> int | None:
    normalized = (value or "").strip().replace(",", "")
    return int(normalized) if normalized else None


def _parse_optional_float(value: str | None) -> float | None:
    normalized = (value or "").strip()
    return float(normalized) if normalized else None


def _parse_optional_bool(value: str | None) -> bool | None:
    normalized = (value or "").strip().casefold()
    if not normalized:
        return None
    return normalized in {"1", "true", "t", "yes", "y"}


def _parse_optional_datetime(value: str | None) -> datetime | None:
    normalized = (value or "").strip()
    return datetime.fromisoformat(normalized) if normalized else None


def _read_csv(data_dir: Path, name: str) -> list[dict[str, str]]:
    path = data_dir / name
    if not path.is_file() and data_dir == DEFAULT_DATA_DIR:
        path = SERVICE_ROOT / name
    if not path.is_file():
        raise FileNotFoundError(f"Healthcare import file was not found: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def _upsert_facility(db, row: dict[str, str]) -> HealthcareFacility:
    source_id = row["source_id"].strip()
    facility = db.query(HealthcareFacility).filter(HealthcareFacility.source_id == source_id).one_or_none()
    values = {
        "name": row["name"].strip(),
        "facility_type": row.get("facility_type") or None,
        "address": row.get("address") or None,
        "ward": row.get("ward") or None,
        "district": row.get("district") or None,
        "city": row.get("city") or None,
        "latitude": _parse_optional_float(row.get("latitude")),
        "longitude": _parse_optional_float(row.get("longitude")),
        "phone": row.get("phone") or None,
        "website": row.get("website") or None,
        "description": row.get("description") or None,
        "emergency_available": _parse_optional_bool(row.get("emergency_available")),
        "opening_hours": row.get("opening_hours") or None,
        "image_url": row.get("image_url") or None,
        "source_name": row.get("source_name") or None,
        "source_url": row.get("source_url") or None,
        "fetched_at": _parse_optional_datetime(row.get("fetched_at")),
    }
    if facility is None:
        facility = HealthcareFacility(source_id=source_id, **values)
        db.add(facility)
        db.flush()
    else:
        for key, value in values.items():
            setattr(facility, key, value)
    return facility


def _upsert_department(db, row: dict[str, str], facility: HealthcareFacility) -> Department:
    source_id = row["id"].strip()
    name = row["name"].strip()
    department = (
        db.query(Department)
        .filter(Department.facility_id == facility.id, Department.source_id == source_id)
        .one_or_none()
    )
    if department is None:
        department = next(
            (
                candidate
                for candidate in db.query(Department).filter(Department.facility_id == facility.id).all()
                if _normalized_name(candidate.name) == _normalized_name(name)
            ),
            None,
        )
    if department is None:
        department = Department(facility_id=facility.id, source_id=source_id, name=name)
        db.add(department)
    department.source_id = source_id
    department.facility_id = facility.id
    department.name = name
    department.description = row.get("description") or None
    db.flush()
    return department


def _upsert_doctor(db, row: dict[str, str], facility: HealthcareFacility, departments: dict[tuple[int, str], Department]) -> Doctor:
    source_id = row["source_id"].strip()
    department_name = row["department"].strip()
    department_key = (facility.id, _normalized_name(department_name))
    department = departments.get(department_key)
    if department is None:
        department = next(
            (
                candidate
                for candidate in db.query(Department).filter(Department.facility_id == facility.id).all()
                if _normalized_name(candidate.name) == _normalized_name(department_name)
            ),
            None,
        )
        if department is None:
            department = Department(facility_id=facility.id, name=department_name, description=None)
            db.add(department)
            db.flush()
        departments[department_key] = department

    doctor = db.query(Doctor).filter(Doctor.source_id == source_id).one_or_none()
    values = {
        "facility_id": facility.id,
        "department_id": department.id,
        "name": row["name"].strip(),
        "title": row.get("title") or None,
        "specialty": row.get("specialty") or None,
        "price": _parse_optional_int(row.get("consultation_price")),
        "description": row.get("description") or None,
        "image_url": row.get("image_url") or None,
        "source_url": row.get("source_url") or None,
    }
    if doctor is None:
        doctor = Doctor(source_id=source_id, **values)
        db.add(doctor)
        db.flush()
    else:
        for key, value in values.items():
            setattr(doctor, key, value)
    return doctor


def _ensure_demo_patient(db) -> None:
    if db.get(Patient, 1) is None:
        db.add(Patient(id=1, name="Nguyễn Văn Bệnh Nhân", phone="0987654321", blood_type="O+", medical_history="Cao huyết áp"))
        db.flush()


def _ensure_slots(db, doctors: list[Doctor]) -> int:
    base_time = (datetime.now() + timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0)
    created = 0
    for doctor in doctors:
        for index in range(4):
            start = base_time + timedelta(hours=index)
            exists = db.query(TimeSlot).filter(TimeSlot.doctor_id == doctor.id, TimeSlot.start_time == start).one_or_none()
            if exists is None:
                db.add(TimeSlot(doctor_id=doctor.id, start_time=start, end_time=start + timedelta(minutes=30), status=SlotStatus.AVAILABLE.value))
                created += 1
    return created


def import_catalog(data_dir: Path) -> dict[str, int]:
    facilities_rows = _read_csv(data_dir, CSV_NAMES[0])
    departments_rows = _read_csv(data_dir, CSV_NAMES[1])
    doctors_rows = _read_csv(data_dir, CSV_NAMES[2])
    db = SessionLocal()
    try:
        facilities = {row["source_id"].strip(): _upsert_facility(db, row) for row in facilities_rows}
        departments: dict[tuple[int, str], Department] = {}
        department_count = 0
        for row in departments_rows:
            facility = facilities[row["facility_source_id"].strip()]
            department = _upsert_department(db, row, facility)
            departments[(facility.id, _normalized_name(department.name))] = department
            department_count += 1

        doctors = []
        for row in doctors_rows:
            facility = facilities[row["facility_source_id"].strip()]
            doctors.append(_upsert_doctor(db, row, facility, departments))
        _ensure_demo_patient(db)
        slot_count = _ensure_slots(db, doctors)
        db.commit()
        return {"facilities": len(facilities), "departments": department_count, "doctors": len(doctors), "slots_created": slot_count}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Healthcare facility, department, and doctor CSV data without deleting bookings.")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    args = parser.parse_args()
    result = import_catalog(args.data_dir)
    print("Healthcare catalog import complete:")
    for key, value in result.items():
        print(f"  {key}={value}")


if __name__ == "__main__":
    main()
