from __future__ import annotations

import argparse
import csv
import json
import os
from pathlib import Path

from sqlalchemy import select
from src.infrastructure.database import OpeningHourRow, RestaurantRow, TableRow, make_session_factory

SERVICE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_FILE = SERVICE_ROOT / "import-data" / "restaurants.csv"
WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


def _text(value: object, default: str = "") -> str:
    normalized = str(value or "").strip()
    return normalized or default


def _rating(value: object) -> float:
    try:
        return max(0.0, min(float(_text(value, "0")), 5.0))
    except ValueError:
        return 0.0


def _opening_hours(value: object) -> dict[str, dict[str, str]]:
    try:
        parsed = json.loads(_text(value, "{}"))
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _upsert_hours(db, restaurant_id: str, raw_hours: object) -> None:
    configured = _opening_hours(raw_hours)
    existing = {
        row.weekday: row
        for row in db.scalars(
            select(OpeningHourRow).where(OpeningHourRow.restaurant_id == restaurant_id)
        ).all()
    }
    for weekday, name in enumerate(WEEKDAYS):
        hours = configured.get(name)
        if not isinstance(hours, dict):
            continue
        opens_at = _text(hours.get("opens_at"), "08:00")
        closes_at = _text(hours.get("closes_at"), "22:00")
        row = existing.get(weekday)
        if row is None:
            db.add(
                OpeningHourRow(
                    restaurant_id=restaurant_id,
                    weekday=weekday,
                    opens_at=opens_at,
                    closes_at=closes_at,
                )
            )
        else:
            row.opens_at = opens_at
            row.closes_at = closes_at


def _ensure_tables(db, restaurant_id: str) -> None:
    if db.scalar(select(TableRow.id).where(TableRow.restaurant_id == restaurant_id).limit(1)):
        return
    for index, capacity in enumerate((2, 4, 4, 6, 8), 1):
        db.add(
            TableRow(
                restaurant_id=restaurant_id,
                table_code=f"T{index:02d}",
                capacity=capacity,
                seating_type="standard",
                active=True,
            )
        )


def import_catalog(data_file: Path) -> dict[str, int]:
    if not data_file.is_file():
        raise FileNotFoundError(f"Restaurant import file was not found: {data_file}")
    with data_file.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    factory = make_session_factory(os.environ["DATABASE_URL"])
    inserted = 0
    updated = 0
    with factory() as db:
        for source in rows:
            source_id = _text(source.get("source_id"))
            if not source_id:
                continue
            restaurant_id = f"rest-{source_id}"[:64]
            row = db.get(RestaurantRow, restaurant_id)
            values = {
                "name": _text(source.get("name"), "Nhà hàng"),
                "location": _text(source.get("address"), _text(source.get("city"), "Hà Nội")),
                "cuisine_type": _text(source.get("cuisine_type"), "vietnamese").casefold(),
                "budget_range": _text(source.get("price_level"), "$$")[:8],
                "rating": _rating(source.get("rating")),
                "timezone": "Asia/Ho_Chi_Minh",
                "active": True,
                "description": _text(source.get("description")) or None,
                "image_url": _text(source.get("image_url")) or None,
            }
            if row is None:
                row = RestaurantRow(id=restaurant_id, **values)
                db.add(row)
                db.flush()
                inserted += 1
            else:
                for key, value in values.items():
                    setattr(row, key, value)
                updated += 1
            _ensure_tables(db, restaurant_id)
            _upsert_hours(db, restaurant_id, source.get("opening_hours"))
        db.commit()
    return {"inserted": inserted, "updated": updated, "source_rows": len(rows)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Import the checked-in Restaurant catalog without deleting bookings.")
    parser.add_argument("--data-file", type=Path, default=DEFAULT_DATA_FILE)
    result = import_catalog(parser.parse_args().data_file)
    print("Restaurant catalog import complete:")
    for key, value in result.items():
        print(f"  {key}={value}")


if __name__ == "__main__":
    main()
