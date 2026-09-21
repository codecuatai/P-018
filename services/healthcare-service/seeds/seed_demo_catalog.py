"""Additive, deterministic local healthcare catalog seed.

The legacy ``seed_medical.py`` script is intentionally not used by the local
workflow because it deletes the healthcare catalog and appointment history.
This seed only adds missing demo rows and leaves imported rows untouched.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from src.database import SessionLocal
from src.models.medical import Department, Doctor, HealthcareFacility, SlotStatus, TimeSlot

FACILITY_SOURCE_ID = "demo-healthcare-facility-001"
DEPARTMENTS = (
    ("demo-healthcare-department-001", "Nội Tim mạch", "Tim mạch và huyết áp"),
    ("demo-healthcare-department-002", "Nội Thần kinh", "Não, tủy sống và dây thần kinh"),
    ("demo-healthcare-department-003", "Nội Cơ - Xương - Khớp", "Khớp, gân và thoái hóa"),
)
DOCTORS = (
    (
        "demo-healthcare-doctor-001",
        "demo-healthcare-department-001",
        "BS. Nguyễn Văn An",
        500000,
        "Chuyên gia tim mạch",
    ),
    (
        "demo-healthcare-doctor-002",
        "demo-healthcare-department-002",
        "BS. Trần Thị Bình",
        550000,
        "Kinh nghiệm thần kinh tổng quát",
    ),
    (
        "demo-healthcare-doctor-003",
        "demo-healthcare-department-003",
        "BS. Lê Hoàng Cường",
        450000,
        "Chuyên điều trị cơ xương khớp",
    ),
)


def _facility(db):
    facility = db.query(HealthcareFacility).filter(HealthcareFacility.source_id == FACILITY_SOURCE_ID).first()
    if facility:
        return facility
    facility = HealthcareFacility(
        source_id=FACILITY_SOURCE_ID,
        name="X-One Healthcare Demo",
        facility_type="clinic",
        address="Quận 1, Thành phố Hồ Chí Minh",
        district="Quận 1",
        city="Thành phố Hồ Chí Minh",
        latitude=10.7769,
        longitude=106.7009,
        phone="02800000000",
        source_name="xone_local_demo",
        dataset_version="local-demo-v1",
        is_active=True,
    )
    db.add(facility)
    db.flush()
    return facility


def _departments(db, facility: HealthcareFacility) -> dict[str, Department]:
    result: dict[str, Department] = {}
    for source_id, name, description in DEPARTMENTS:
        department = db.query(Department).filter(Department.source_id == source_id).first()
        if not department:
            department = db.query(Department).filter(Department.name == name).first()
        if not department:
            department = Department(
                source_id=source_id,
                name=name,
                description=description,
                facility_source_id=facility.source_id,
                source_name="xone_local_demo",
                dataset_version="local-demo-v1",
                is_active=True,
            )
            db.add(department)
            db.flush()
        result[source_id] = department
    return result


def _doctors(db, departments: dict[str, Department]) -> list[Doctor]:
    result: list[Doctor] = []
    for source_id, department_source_id, name, price, description in DOCTORS:
        doctor = db.query(Doctor).filter(Doctor.source_id == source_id).first()
        if not doctor:
            doctor = db.query(Doctor).filter(Doctor.name == name, Doctor.source_name == "xone_local_demo").first()
        if not doctor:
            department = departments[department_source_id]
            doctor = Doctor(
                source_id=source_id,
                department_id=department.id,
                facility_source_id=department.facility_source_id,
                name=name,
                title="Bác sĩ",
                specialty=department.name,
                price=price,
                description=description,
                source_name="xone_local_demo",
                dataset_version="local-demo-v1",
                is_active=True,
            )
            db.add(doctor)
            db.flush()
        result.append(doctor)
    return result


def _add_demo_slots(db, doctors: list[Doctor]) -> int:
    created = 0
    now = datetime.now()
    base = (now + timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0)
    for doctor in doctors:
        if not doctor.source_id or not doctor.source_id.startswith("demo-healthcare-"):
            continue
        has_future_available_slot = db.query(TimeSlot).filter(
            TimeSlot.doctor_id == doctor.id,
            TimeSlot.status == SlotStatus.AVAILABLE.value,
            TimeSlot.start_time > now,
        ).first()
        if has_future_available_slot:
            continue
        for index in range(4):
            start = base + timedelta(hours=index)
            db.add(
                TimeSlot(
                    doctor_id=doctor.id,
                    start_time=start,
                    end_time=start + timedelta(minutes=30),
                    status=SlotStatus.AVAILABLE.value,
                )
            )
            created += 1
    return created


def seed_data() -> None:
    with SessionLocal() as db:
        facility = _facility(db)
        departments = _departments(db, facility)
        doctors = _doctors(db, departments)
        slots_created = _add_demo_slots(db, doctors)
        db.commit()
        print(f"Healthcare additive seed complete: {len(departments)} departments, {len(doctors)} doctors, {slots_created} slots added.")


if __name__ == "__main__":
    seed_data()
