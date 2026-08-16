"""Idempotently seed a local-only synthetic Hanoi driver pool.

The seed is data, not runtime assignment logic. It never deletes catalog rows
or uses real personal data.
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from sqlalchemy.orm import Session  # noqa: E402
from src.infrastructure.database import get_engine  # noqa: E402
from src.infrastructure.models import RideDriverRow  # noqa: E402

NAMES = ["Nguyễn Minh Anh", "Trần Quang Huy", "Lê Đức Long", "Phạm Gia Bảo", "Vũ Hoàng Nam", "Đỗ Tuấn Kiệt", "Bùi Hải Đăng", "Hoàng Khánh Linh", "Đặng Việt Khoa", "Ngô Thành Công", "Dương Nhật Minh", "Phan Quốc Bảo", "Mai Thanh Tùng", "Cao Anh Tuấn", "Lý Minh Quân", "Trịnh Văn Phúc"]
BIKES = [("Honda", "Wave RSX"), ("Honda", "Vision"), ("Honda", "Air Blade"), ("Yamaha", "Janus"), ("Yamaha", "Grande")]
CAR4 = [("Toyota", "Vios"), ("Hyundai", "Accent"), ("Honda", "City"), ("VinFast", "VF 5"), ("Kia", "Soluto"), ("Mazda", "2")]
CAR7 = [("Mitsubishi", "Xpander"), ("Toyota", "Innova"), ("Toyota", "Veloz"), ("Hyundai", "Stargazer")]
COLORS = ["Đen", "Trắng", "Bạc", "Xanh navy", "Đỏ đô", "Xám"]


def records() -> list[dict]:
    result: list[dict] = []
    now = datetime.now(UTC)
    specs = [("BIKE", BIKES, 16, "29K1"), ("CAR_4", CAR4, 12, "30H"), ("CAR_7", CAR7, 8, "30G")]
    number = 0
    for vehicle_type, models, count, prefix in specs:
        for index in range(1, count + 1):
            number += 1
            make, model = models[(index - 1) % len(models)]
            name = NAMES[(number - 1) % len(NAMES)]
            plate = f"{prefix}-{390 + number:03d}.{(17 * number) % 100:02d}"
            color = COLORS[(number - 1) % len(COLORS)]
            latitude = 21.018 + ((number * 7) % 120) / 10_000
            longitude = 105.800 + ((number * 11) % 260) / 10_000
            result.append({
                "id": f"driver_demo_{vehicle_type.lower()}_{index:03d}",
                "display_name": name,
                "vehicle_type": vehicle_type,
                "vehicle_model": model,
                "vehicle_color": color,
                "license_plate": plate,
                "phone_masked": f"*** *** {number:04d}",
                "rating": round(4.72 + ((number * 3) % 25) / 100, 2),
                "latitude": latitude,
                "longitude": longitude,
                "vehicle": {"type": vehicle_type, "make": make, "model": model, "color": color, "license_plate": plate},
                "availability_status": "AVAILABLE",
                "created_at": now,
                "updated_at": now,
            })
    return result


def main() -> None:
    values = records()
    engine = get_engine()
    with Session(engine) as session:
        for value in values:
            row = session.get(RideDriverRow, value["id"])
            if row is None:
                session.add(RideDriverRow(**value))
                continue
            # Preserve an in-progress assignment; refresh catalog fields only.
            for key, item in value.items():
                if key not in {"created_at", "availability_status"}:
                    setattr(row, key, item)
                elif key == "availability_status" and row.availability_status == "AVAILABLE":
                    setattr(row, key, item)
        session.commit()
    engine.dispose()
    print(f"Seeded {len(values)} synthetic Ride drivers.")


if __name__ == "__main__":
    main()
