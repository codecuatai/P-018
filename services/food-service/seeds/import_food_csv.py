from __future__ import annotations

import argparse
import asyncio
import csv
import json
from datetime import datetime
from pathlib import Path
from typing import Any

import asyncpg
from src.config import get_settings

SERVICE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_DIR = SERVICE_ROOT / "import-data"
DEFAULT_LATITUDE = 21.0285
DEFAULT_LONGITUDE = 105.8520


def _read_csv(data_dir: Path, name: str) -> list[dict[str, str]]:
    path = data_dir / name
    if not path.is_file() and data_dir == DEFAULT_DATA_DIR:
        path = SERVICE_ROOT / name
    if not path.is_file():
        raise FileNotFoundError(f"Food import file was not found: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def _parse_json(value: str | None, default: Any) -> Any:
    normalized = (value or "").strip()
    if not normalized:
        return default
    return json.loads(normalized)


def _parse_int(value: object, *, default: int | None = None) -> int | None:
    normalized = str(value or "").strip().replace(",", "")
    if not normalized:
        return default
    return int(float(normalized))


def _parse_float(value: object, *, default: float | None = None) -> float | None:
    normalized = str(value or "").strip().replace(",", "")
    if not normalized:
        return default
    return float(normalized)


def _parse_bool(value: object, *, default: bool = False) -> bool:
    normalized = str(value or "").strip().casefold()
    if not normalized:
        return default
    return normalized in {"1", "true", "t", "yes", "y"}


def _parse_fetched_at(value: str | None) -> str | None:
    normalized = (value or "").strip()
    if not normalized:
        return None
    return datetime.fromisoformat(normalized).isoformat()


def _normalize_option_groups(value: str | None) -> list[dict[str, Any]]:
    raw_groups = _parse_json(value, [])
    if not isinstance(raw_groups, list):
        return []

    groups: list[dict[str, Any]] = []
    for group_index, raw_group in enumerate(raw_groups):
        if not isinstance(raw_group, dict):
            continue
        option_items = raw_group.get("option_items")
        raw_options = option_items.get("items", []) if isinstance(option_items, dict) else raw_group.get("items", [])
        if not isinstance(raw_options, list):
            continue
        group_id = str(raw_group.get("id") or f"source_group_{group_index}")
        group_name = str(raw_group.get("name") or raw_group.get("ntop") or f"Tùy chọn {group_index + 1}").strip()
        min_select = _parse_int(option_items.get("min_select") if isinstance(option_items, dict) else 0, default=0) or 0
        options: list[dict[str, Any]] = []
        for option_index, raw_option in enumerate(raw_options):
            if not isinstance(raw_option, dict):
                continue
            raw_price = raw_option.get("price")
            if isinstance(raw_price, dict):
                raw_price = raw_price.get("value")
            options.append(
                {
                    "id": str(raw_option.get("id") or f"{group_id}_{option_index}"),
                    "name": str(raw_option.get("name") or f"Lựa chọn {option_index + 1}").strip(),
                    "price": _parse_int(raw_price, default=0) or 0,
                }
            )
        if options:
            groups.append(
                {
                    "id": group_id,
                    "name": group_name,
                    "required": _parse_bool(raw_group.get("mandatory"), default=False) or min_select > 0,
                    "options": options,
                }
            )
    return groups


def _restaurant_record(row: dict[str, str]) -> dict[str, Any]:
    source_id = row["source_id"].strip()
    return {
        "id": f"res_{source_id}",
        "source_id": source_id,
        "name": row["name"].strip(),
        "address": row.get("address") or None,
        "ward": row.get("ward") or None,
        "district": row.get("district") or None,
        "city": row.get("city") or None,
        "category": row.get("category") or None,
        "cuisine_tags": _parse_json(row.get("cuisine_tags"), []),
        "phone": row.get("phone") or None,
        "opening_hours": row.get("opening_hours") or None,
        "rating": _parse_float(row.get("rating")),
        "review_count": max(_parse_int(row.get("review_count"), default=0) or 0, 0),
        "price_level": row.get("price_level") or None,
        "image_url": row.get("image_url") or None,
        "source_name": row.get("source_name") or None,
        "source_url": row.get("source_url") or None,
        "fetched_at": _parse_fetched_at(row.get("fetched_at")),
        "latitude": DEFAULT_LATITUDE,
        "longitude": DEFAULT_LONGITUDE,
        "location_approximate": True,
        "is_open": True,
    }


def _menu_item_record(row: dict[str, str], restaurant_ids: set[str]) -> dict[str, Any]:
    source_id = row["source_id"].strip()
    restaurant_source_id = row["restaurant_source_id"].strip()
    restaurant_id = f"res_{restaurant_source_id}"
    if restaurant_id not in restaurant_ids:
        raise ValueError(f"Menu item {source_id} references unknown restaurant {restaurant_source_id}")
    price = _parse_int(row.get("price"))
    if price is None or price < 0:
        raise ValueError(f"Menu item {source_id} has an invalid price")
    return {
        "id": f"item_{source_id}",
        "source_id": source_id,
        "restaurant_source_id": restaurant_source_id,
        "restaurant_id": restaurant_id,
        "name": row["name"].strip(),
        "category": row.get("category") or None,
        "description": row.get("description") or None,
        "price": price,
        "currency": row.get("currency") or "VND",
        "image_url": row.get("image_url") or None,
        "available": _parse_bool(row.get("available"), default=True),
        "option_groups": _normalize_option_groups(row.get("options")),
        "source_url": row.get("source_url") or None,
        "fetched_at": _parse_fetched_at(row.get("fetched_at")),
    }


async def _upsert_records(connection: asyncpg.Connection, records: list[tuple[str, str, str]]) -> None:
    await connection.executemany(
        """
        INSERT INTO food_catalog (id, record_type, data)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          record_type = EXCLUDED.record_type,
          data = EXCLUDED.data,
          updated_at = now()
        """,
        records,
    )


async def import_catalog(data_dir: Path) -> dict[str, int]:
    restaurant_rows = _read_csv(data_dir, "restaurants.csv")
    menu_rows = _read_csv(data_dir, "menu_items.csv")
    restaurants = [_restaurant_record(row) for row in restaurant_rows]
    restaurant_ids = {record["id"] for record in restaurants}
    menu_items = [_menu_item_record(row, restaurant_ids) for row in menu_rows]
    records = [
        (record["id"], "restaurant", json.dumps(record, ensure_ascii=False)) for record in restaurants
    ] + [(record["id"], "menu_item", json.dumps(record, ensure_ascii=False)) for record in menu_items]

    pool = await asyncpg.create_pool(get_settings().database_url, min_size=1, max_size=5)
    try:
        async with pool.acquire() as connection, connection.transaction():
            await _upsert_records(connection, records)
    finally:
        await pool.close()
    return {"restaurants": len(restaurants), "menu_items": len(menu_items)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Food restaurant and menu CSV data without deleting catalog records.")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    args = parser.parse_args()
    result = asyncio.run(import_catalog(args.data_dir))
    print("Food catalog import complete:")
    for key, value in result.items():
        print(f"  {key}={value}")


if __name__ == "__main__":
    main()
