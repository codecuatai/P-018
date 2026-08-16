#!/usr/bin/env python3
"""Validate and import the curated Hanoi catalog sources.

The default command is read-only and writes a deterministic import plan under
``artifacts/dataops``. ``--apply`` is an explicit operator action that applies
only normalized records to the selected domain database after its owned
migration has been run. Raw CSV files are never rewritten.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import hashlib
import json
import math
import os
import re
import sys
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_VERSION = "2026-08-hanoi-v1"
DEFAULT_OUTPUT_ROOT = ROOT / "artifacts" / "dataops"
EXPECTED = {
    "food-restaurants": ["source_id", "name", "address", "ward", "district", "city", "category", "cuisine_tags", "phone", "opening_hours", "rating", "review_count", "price_level", "image_url", "source_name", "source_url", "fetched_at"],
    "food-menu-items": ["source_id", "restaurant_source_id", "name", "category", "description", "price", "currency", "image_url", "available", "options", "source_url", "fetched_at"],
    "restaurant": ["source_id", "name", "address", "ward", "district", "city", "latitude", "longitude", "cuisine_type", "cuisine_tags", "description", "phone", "website", "opening_hours", "rating", "review_count", "price_level", "image_url", "source_name", "source_url", "fetched_at"],
    "healthcare-facilities": ["source_id", "name", "facility_type", "address", "ward", "district", "city", "latitude", "longitude", "phone", "website", "description", "emergency_available", "opening_hours", "image_url", "source_name", "source_url", "fetched_at"],
    "healthcare-doctors": ["source_id", "facility_source_id", "department", "name", "title", "specialty", "description", "consultation_price", "image_url", "source_url", "fetched_at"],
    "healthcare-specialties": ["id", "facility_source_id", "name", "specialty", "specialty_tags", "description", "source_url"],
}


class NormalizedRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    domain: str
    dataset_version: str = Field(min_length=1, max_length=120)
    source_name: str | None = None
    source_record_id: str = Field(min_length=1, max_length=255)
    source_url: str | None = None
    fetched_at: str | None = None
    last_verified_at: str | None = None
    content_hash: str = Field(min_length=64, max_length=64)
    is_active: bool = True
    payload: dict[str, Any]


@dataclass
class RejectedRow:
    dataset: str
    line: int
    source_record_id: str | None
    errors: list[str]


@dataclass
class DatasetReport:
    dataset: str
    path: str
    content_hash: str
    encoding: str
    rows_total: int = 0
    rows_valid: int = 0
    rows_rejected: int = 0
    duplicates: int = 0
    missing_required: int = 0
    invalid_coordinates: int = 0
    invalid_prices: int = 0
    missing_prices: int = 0
    invalid_urls: int = 0
    unknown_categories: int = 0
    repaired_rows: int = 0
    missing_source_urls: int = 0
    suspicious_coordinates: int = 0
    suspicious_coordinate_distinct_addresses: int = 0
    rejected_rows: list[RejectedRow] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {"dataset": self.dataset, "path": self.path, "content_hash": self.content_hash, "encoding": self.encoding, "rows_total": self.rows_total, "rows_valid": self.rows_valid, "rows_rejected": self.rows_rejected, "duplicates": self.duplicates, "missing_required": self.missing_required, "invalid_coordinates": self.invalid_coordinates, "invalid_prices": self.invalid_prices, "missing_prices": self.missing_prices, "invalid_urls": self.invalid_urls, "unknown_categories": self.unknown_categories, "repaired_rows": self.repaired_rows, "missing_source_urls": self.missing_source_urls, "suspicious_coordinates": self.suspicious_coordinates, "suspicious_coordinate_distinct_addresses": self.suspicious_coordinate_distinct_addresses}


@dataclass
class ImportPlan:
    domain: str
    dataset_version: str
    generated_at: str
    records: list[NormalizedRecord]
    reports: list[DatasetReport]
    import_status: str

    def as_dict(self) -> dict[str, Any]:
        return {"domain": self.domain, "dataset_version": self.dataset_version, "generated_at": self.generated_at, "import_status": self.import_status, "rows_total": sum(report.rows_total for report in self.reports), "rows_valid": sum(report.rows_valid for report in self.reports), "rows_rejected": sum(report.rows_rejected for report in self.reports), "reports": [report.as_dict() for report in self.reports]}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate and import X-One Hanoi catalog sources.")
    parser.add_argument("domain", choices=["food", "restaurant", "healthcare"])
    parser.add_argument("--dataset-version", default=DEFAULT_VERSION)
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--source-root", type=Path, default=None, help="Repository root containing the ignored data/ CSV directory.")
    parser.add_argument("--apply", action="store_true", help="Apply the normalized plan to the selected domain database.")
    parser.add_argument("--allow-rejected", action="store_true", help="Apply valid records while keeping rejected rows out of the import.")
    parser.add_argument("--database-url", default=None, help="Database URL. If omitted, use the domain-specific process environment variable.")
    parser.add_argument("--deactivate-version", default=None, help="Deactivate a previous dataset version instead of importing.")
    args = parser.parse_args(argv)

    try:
        if args.deactivate_version:
            if not args.database_url:
                args.database_url = os.environ.get(database_env(args.domain))
            if not args.database_url:
                raise ValueError("A database URL is required for dataset deactivation.")
            asyncio.run(deactivate_version(args.domain, args.deactivate_version, args.database_url))
            print(json.dumps({"domain": args.domain, "deactivated_version": args.deactivate_version, "status": "DEACTIVATED"}, ensure_ascii=False))
            return 0

        plan = build_plan(args.domain, args.dataset_version, source_root=args.source_root)
        output_dir = args.output_dir or DEFAULT_OUTPUT_ROOT / args.dataset_version / args.domain
        write_plan(plan, output_dir)
        if args.apply:
            if plan.import_status == "REJECTED" and not args.allow_rejected:
                raise ValueError("Import contains rejected rows. Review the report or pass --allow-rejected explicitly.")
            database_url = args.database_url or os.environ.get(database_env(args.domain))
            if not database_url:
                raise ValueError(f"{database_env(args.domain)} is required for --apply; the read-only validation plan was still written.")
            asyncio.run(apply_plan(plan, database_url, allow_rejected=args.allow_rejected))
        print(json.dumps({"domain": plan.domain, "dataset_version": plan.dataset_version, "output_dir": str(output_dir), "status": "IMPORTED" if args.apply else "VALIDATED", "rows_valid": sum(report.rows_valid for report in plan.reports), "rows_rejected": sum(report.rows_rejected for report in plan.reports)}, ensure_ascii=False))
        return 0
    except (OSError, ValueError, csv.Error) as error:
        print(f"catalog import failed: {error}", file=sys.stderr)
        return 2


def build_plan(domain: str, dataset_version: str, source_root: Path | None = None) -> ImportPlan:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,119}", dataset_version):
        raise ValueError("dataset-version contains unsupported characters")
    resolved_source_root = resolve_source_root(source_root)
    if domain == "food":
        records, reports = build_food(dataset_version, resolved_source_root)
    elif domain == "restaurant":
        records, reports = build_restaurant(dataset_version, resolved_source_root)
    else:
        records, reports = build_healthcare(dataset_version, resolved_source_root)
    rejected = sum(report.rows_rejected for report in reports)
    return ImportPlan(domain=domain, dataset_version=dataset_version, generated_at=datetime.now(UTC).isoformat(), records=records, reports=reports, import_status="PARTIAL" if rejected and records else "REJECTED" if rejected else "READY")


def build_food(version: str, source_root: Path | None = None) -> tuple[list[NormalizedRecord], list[DatasetReport]]:
    source_root = resolve_source_root(source_root)
    restaurant_path = source_root / "data" / "food-service" / "restaurants.csv"
    menu_path = source_root / "data" / "food-service" / "menu_items.csv"
    restaurant_rows, restaurant_report = read_rows("food-restaurants", restaurant_path, EXPECTED["food-restaurants"], source_root)
    menu_rows, menu_report = read_rows("food-menu-items", menu_path, EXPECTED["food-menu-items"], source_root)
    records: list[NormalizedRecord] = []
    parent_ids: dict[str, str] = {}
    for line, row in restaurant_rows:
        errors = required_errors(row, ["source_id", "name", "address", "source_url", "fetched_at"])
        errors += url_errors(row, ["source_url", "image_url"])
        if errors:
            reject(restaurant_report, line, row, errors)
            continue
        source_id = row["source_id"].strip()
        record_id = f"food_restaurant_{source_id}"
        parent_ids[source_id] = record_id
        review_count = integer_or_none(row.get("review_count"))
        rating = meaningful_rating(row.get("rating"), review_count)
        payload = {"id": record_id, "name": row["name"].strip(), "address": row["address"].strip(), "ward": clean(row.get("ward")), "district": clean(row.get("district")), "city": normalize_city(row.get("city")), "category": clean(row.get("category")), "cuisine_tags": parse_json_array(row.get("cuisine_tags")), "phone": clean(row.get("phone")), "opening_hours": clean(row.get("opening_hours")), "rating": rating, "rating_source": "raw_source_scale" if rating is not None else None, "review_count": review_count, "price_level": normalize_price_level(row.get("price_level")), "image_url": clean(row.get("image_url")), "is_open": True, "latitude": None, "longitude": None, "source_metadata": source_metadata(row, version, source_id)}
        records.append(normalized("food", version, row, source_id, payload))
        restaurant_report.rows_valid += 1
    seen_items: set[str] = set()
    for line, row in menu_rows:
        source_id = clean(row.get("source_id"))
        errors = required_errors(row, ["source_id", "restaurant_source_id", "name", "price", "currency", "source_url", "fetched_at"])
        errors += url_errors(row, ["source_url", "image_url"])
        if source_id in seen_items: errors.append("DUPLICATE_SOURCE_ID")
        if parse_price(row.get("price")) is None: errors.append("INVALID_PRICE")
        if clean(row.get("restaurant_source_id")) not in parent_ids: errors.append("MISSING_PARENT_RESTAURANT")
        if errors:
            reject(menu_report, line, row, errors)
            continue
        seen_items.add(source_id or "")
        payload = {"id": f"food_menu_item_{source_id}", "restaurant_id": parent_ids[str(row["restaurant_source_id"]).strip()], "name": row["name"].strip(), "category": clean(row.get("category")), "description": clean(row.get("description")), "price": parse_price(row["price"]), "currency": clean(row.get("currency")) or "VND", "image_url": clean(row.get("image_url")), "available": parse_bool(row.get("available")), "option_groups": normalize_option_groups(row.get("options")), "source_metadata": source_metadata(row, version, str(source_id))}
        records.append(normalized("food", version, row, str(source_id), payload))
        menu_report.rows_valid += 1
    return records, [restaurant_report, menu_report]


def build_restaurant(version: str, source_root: Path | None = None) -> tuple[list[NormalizedRecord], list[DatasetReport]]:
    source_root = resolve_source_root(source_root)
    path = source_root / "data" / "restaurant-service" / "crawled_restaurants.csv"
    rows, report = read_rows("restaurant", path, EXPECTED["restaurant"], source_root)
    records: list[NormalizedRecord] = []
    seen: set[str] = set()
    suspicious_addresses: set[str] = set()
    for line, row in rows:
        source_id = clean(row.get("source_id"))
        errors = required_errors(row, ["source_id", "name", "address", "source_url", "fetched_at"])
        errors += url_errors(row, ["source_url", "image_url", "website"])
        latitude = parse_coordinate(row.get("latitude"), -90, 90)
        longitude = parse_coordinate(row.get("longitude"), -180, 180)
        if (clean(row.get("latitude")) or clean(row.get("longitude"))) and (latitude is None or longitude is None): errors.append("INVALID_COORDINATES")
        if source_id in seen: errors.append("DUPLICATE_SOURCE_ID")
        if errors:
            reject(report, line, row, errors)
            continue
        seen.add(str(source_id))
        suspicious = latitude is not None and longitude is not None and abs(latitude - 21.0285) < 1e-7 and abs(longitude - 105.8048) < 1e-7
        if suspicious:
            report.suspicious_coordinates += 1
            suspicious_addresses.add(clean(row.get("address")) or "")
        coordinate_status = "suspicious_default" if suspicious else "validated" if latitude is not None and longitude is not None else "missing"
        review_count = integer_or_none(row.get("review_count"))
        rating = meaningful_rating(row.get("rating"), review_count)
        payload = {"id": f"restaurant_{source_id}", "name": row["name"].strip(), "location": ", ".join(value for value in [clean(row.get("address")), clean(row.get("district")), normalize_city(row.get("city"))] if value), "address": clean(row.get("address")), "ward": clean(row.get("ward")), "district": clean(row.get("district")), "city": normalize_city(row.get("city")), "cuisine_type": clean(row.get("cuisine_type")) or "unknown", "cuisine_tags": parse_json_array(row.get("cuisine_tags")), "budget_range": normalize_price_level(row.get("price_level")) or "unknown", "price_level": clean(row.get("price_level")), "rating": rating, "rating_source": "raw_source_scale" if rating is not None else None, "review_count": review_count, "latitude": None if suspicious else latitude, "longitude": None if suspicious else longitude, "latitude_raw": latitude, "longitude_raw": longitude, "coordinate_status": coordinate_status, "phone": clean(row.get("phone")), "website": clean(row.get("website")), "opening_hours": clean(row.get("opening_hours")), "description": clean(row.get("description")), "image_url": clean(row.get("image_url")), "active": True, "source_metadata": source_metadata(row, version, str(source_id))}
        records.append(normalized("restaurant", version, row, str(source_id), payload))
        report.rows_valid += 1
    report.suspicious_coordinate_distinct_addresses = len(suspicious_addresses)
    return records, [report]


def build_healthcare(version: str, source_root: Path | None = None) -> tuple[list[NormalizedRecord], list[DatasetReport]]:
    source_root = resolve_source_root(source_root)
    facility_path = source_root / "data" / "healthcare-service" / "benhvien.csv"
    doctor_path = source_root / "data" / "healthcare-service" / "bacsi.csv"
    specialty_path = source_root / "data" / "healthcare-service" / "chuyenkhoa.csv"
    facility_rows, facility_report = read_rows("healthcare-facilities", facility_path, EXPECTED["healthcare-facilities"], source_root)
    doctor_rows, doctor_report = read_rows("healthcare-doctors", doctor_path, EXPECTED["healthcare-doctors"], source_root)
    specialty_rows, specialty_report = read_specialty_rows(specialty_path, source_root)
    records: list[NormalizedRecord] = []
    facility_ids: set[str] = set()
    facility_names: dict[str, str] = {}

    for line, row in facility_rows:
        source_id = clean(row.get("source_id"))
        errors = required_errors(row, ["source_id", "name", "address"])
        errors += url_errors(row, ["source_url", "image_url", "website"])
        latitude = parse_coordinate(row.get("latitude"), -90, 90)
        longitude = parse_coordinate(row.get("longitude"), -180, 180)
        if (clean(row.get("latitude")) or clean(row.get("longitude"))) and (latitude is None or longitude is None):
            errors.append("INVALID_COORDINATES")
        if errors:
            reject(facility_report, line, row, errors)
            continue
        facility_ids.add(str(source_id))
        facility_names[str(source_id)] = row["name"].strip()
        payload = {"source_id": str(source_id), "name": row["name"].strip(), "facility_type": clean(row.get("facility_type")), "address": row["address"].strip(), "ward": clean(row.get("ward")), "district": clean(row.get("district")), "city": normalize_city(row.get("city")), "latitude": latitude, "longitude": longitude, "phone": clean(row.get("phone")), "website": clean(row.get("website")), "description": clean(row.get("description")), "emergency_available": parse_bool(row.get("emergency_available")), "opening_hours": clean(row.get("opening_hours")), "image_url": clean(row.get("image_url")), "source_metadata": source_metadata(row, version, str(source_id))}
        records.append(normalized("healthcare", version, row, str(source_id), {"record_type": "facility", **payload}))
        facility_report.rows_valid += 1

    valid_specialties: list[tuple[int, dict[str, str]]] = []
    department_names: dict[tuple[str, str], str] = {}
    for line, row in specialty_rows:
        source_id = clean(row.get("id"))
        errors = required_errors(row, ["id", "facility_source_id", "name", "specialty"])
        errors += url_errors(row, ["source_url"])
        facility_source_id = clean(row.get("facility_source_id"))
        if facility_source_id not in facility_ids:
            errors.append("MISSING_PARENT_FACILITY")
        if errors:
            reject(specialty_report, line, row, errors)
            continue
        valid_specialties.append((line, row))
        department_names.setdefault((str(facility_source_id), fold_catalog_text(row["name"])), row["name"].strip())

    doctor_department_keys = {
        (str(row["facility_source_id"]).strip(), fold_catalog_text(row["department"]))
        for _, row in doctor_rows
        if clean(row.get("facility_source_id")) in facility_ids and clean(row.get("department"))
    }
    duplicate_department_names = Counter(key[1] for key in set(department_names) | doctor_department_keys)

    def department_display_name(key: tuple[str, str]) -> str:
        raw_name = department_names.get(key)
        if raw_name is None:
            raw_name = next((row["department"].strip() for _, row in doctor_rows if (str(row.get("facility_source_id") or "").strip(), fold_catalog_text(row.get("department") or "")) == key), "Department")
        if duplicate_department_names[key[1]] > 1:
            return f"{raw_name} ({facility_names.get(key[0], key[0])})"
        return raw_name

    department_by_key: dict[tuple[str, str], tuple[str, str]] = {}
    for _, row in valid_specialties:
        key = (str(row["facility_source_id"]).strip(), fold_catalog_text(row["name"]))
        department_by_key[key] = (str(row["id"]).strip(), department_display_name(key))

    for line, row in valid_specialties:
        staged = {**row, "source_name": "healthcare-specialties"}
        department_key = (str(row["facility_source_id"]).strip(), fold_catalog_text(row["name"]))
        payload = {"record_type": "department", "source_id": str(row["id"]).strip(), "facility_source_id": str(row["facility_source_id"]).strip(), "name": clean(row.get("name")), "catalog_name": department_by_key[department_key][1], "specialty": clean(row.get("specialty")), "specialty_tags": parse_tag_array(row.get("specialty_tags")), "description": clean(row.get("description")), "source_metadata": source_metadata(staged, version, str(row["id"]).strip())}
        records.append(normalized("healthcare", version, staged, str(row["id"]).strip(), payload))
        specialty_report.rows_valid += 1

    for line, row in doctor_rows:
        source_id = clean(row.get("source_id"))
        errors = required_errors(row, ["source_id", "facility_source_id", "department", "name"])
        errors += url_errors(row, ["source_url", "image_url"])
        facility_source_id = clean(row.get("facility_source_id"))
        if facility_source_id not in facility_ids:
            errors.append("MISSING_PARENT_FACILITY")
        if not clean(row.get("consultation_price")):
            doctor_report.missing_prices += 1
        if clean(row.get("consultation_price")) and parse_price(row.get("consultation_price")) is None:
            errors.append("INVALID_PRICE")
        if errors:
            reject(doctor_report, line, row, errors)
            continue
        department_key = (str(facility_source_id), fold_catalog_text(row["department"]))
        if department_key in department_by_key:
            department_source_id, catalog_name = department_by_key[department_key]
        else:
            department_source_id = f"derived_department_{hashlib.sha256(f'{facility_source_id}:{department_key[1]}'.encode('utf-8')).hexdigest()[:32]}"
            catalog_name = department_display_name(department_key)
            doctor_report.repaired_rows += 1
        payload = {"record_type": "doctor", "source_id": str(source_id), "facility_source_id": str(facility_source_id), "department": row["department"].strip(), "department_source_id": department_source_id, "department_name": catalog_name, "name": row["name"].strip(), "title": clean(row.get("title")), "specialty": clean(row.get("specialty")), "description": clean(row.get("description")), "consultation_price": parse_price(row.get("consultation_price")), "image_url": clean(row.get("image_url")), "source_metadata": source_metadata(row, version, str(source_id))}
        records.append(normalized("healthcare", version, row, str(source_id), payload))
        doctor_report.rows_valid += 1
    return records, [facility_report, doctor_report, specialty_report]


def read_specialty_rows(path: Path, report_root: Path | None = None) -> tuple[list[tuple[int, dict[str, str]]], DatasetReport]:
    raw = path.read_bytes()
    report = DatasetReport(dataset="healthcare-specialties", path=path_label(path, report_root), content_hash=hashlib.sha256(raw).hexdigest(), encoding="utf-8-sig")
    text = raw.decode("utf-8-sig")
    lines = text.splitlines()
    if not lines:
        raise ValueError("healthcare-specialties is empty")
    header = next(csv.reader([lines[0]], strict=True))
    if header != EXPECTED["healthcare-specialties"]:
        raise ValueError("healthcare-specialties schema does not match the declared columns")
    rows: list[tuple[int, dict[str, str]]] = []
    seen: set[str] = set()
    for line, raw_line in enumerate(lines[1:], start=2):
        report.rows_total += 1
        try:
            values = [value.strip() for value in next(csv.reader([raw_line], strict=False))]
        except csv.Error:
            report.rows_rejected += 1
            report.rejected_rows.append(RejectedRow("healthcare-specialties", line, None, ["MALFORMED_CSV_ROW"]))
            continue
        if len(values) < len(header):
            report.rows_rejected += 1
            report.rejected_rows.append(RejectedRow("healthcare-specialties", line, values[0] if values else None, ["MALFORMED_CSV_ROW_WIDTH"]))
            continue
        report.repaired_rows += 1
        repaired = repair_specialty_values(values)
        source_id = clean(repaired.get("id"))
        if source_id and source_id in seen:
            report.duplicates += 1
            reject(report, line, repaired, ["DUPLICATE_SOURCE_ID"])
            continue
        if source_id:
            seen.add(source_id)
        if not repaired.get("source_url"):
            report.missing_source_urls += 1
        rows.append((line, repaired))
    return rows, report


def repair_specialty_values(values: list[str]) -> dict[str, str]:
    url_index = next((index for index in range(len(values) - 1, 3, -1) if _valid_url(values[index])), len(values) - 1)
    source_url = values[url_index].strip() if url_index < len(values) else ""
    description = values[url_index - 1].strip().strip('"') if url_index > 4 else ""
    tags = ",".join(values[4:max(4, url_index - 1)])
    cleaned_tags = tags.replace('"', "").replace("'", "").strip("{}")
    return {
        "id": values[0] if values else "",
        "facility_source_id": values[1] if len(values) > 1 else "",
        "name": values[2] if len(values) > 2 else "",
        "specialty": values[3] if len(values) > 3 else "",
        "specialty_tags": cleaned_tags,
        "description": description,
        "source_url": source_url,
    }


def read_rows(dataset: str, path: Path, expected_columns: list[str], report_root: Path | None = None) -> tuple[list[tuple[int, dict[str, str]]], DatasetReport]:
    raw = path.read_bytes()
    report = DatasetReport(dataset=dataset, path=path_label(path, report_root), content_hash=hashlib.sha256(raw).hexdigest(), encoding="utf-8-sig")
    rows: list[tuple[int, dict[str, str]]] = []
    text = raw.decode("utf-8-sig")
    lines = text.splitlines()
    if not lines:
        raise ValueError(f"{dataset} is empty")
    header = next(csv.reader([lines[0]], strict=True))
    if header != expected_columns:
        raise ValueError(f"{dataset} schema does not match the declared columns")
    seen: set[str] = set()
    for line, raw_line in enumerate(lines[1:], start=2):
        report.rows_total += 1
        try:
            values = next(csv.reader([raw_line], strict=True))
        except csv.Error:
            report.rows_rejected += 1
            report.rejected_rows.append(RejectedRow(dataset, line, None, ["MALFORMED_CSV_ROW_WIDTH"]))
            continue
        if len(values) != len(header):
            report.rows_rejected += 1
            report.rejected_rows.append(RejectedRow(dataset, line, values[0].strip() if values else None, ["MALFORMED_CSV_ROW_WIDTH"]))
            continue
        row = dict(zip(header, values, strict=True))
        source_id = clean(row.get("source_id")) or clean(row.get("id"))
        if source_id and source_id in seen:
            report.duplicates += 1
            reject(report, line, row, ["DUPLICATE_SOURCE_ID"])
            continue
        if source_id: seen.add(source_id)
        rows.append((line, row))
    return rows, report


def normalized(domain: str, version: str, row: dict[str, str], source_id: str, payload: dict[str, Any]) -> NormalizedRecord:
    raw_hash = hashlib.sha256(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    return NormalizedRecord(domain=domain, dataset_version=version, source_name=clean(row.get("source_name")) or f"{domain}_catalog", source_record_id=source_id, source_url=clean(row.get("source_url")), fetched_at=clean(row.get("fetched_at")), last_verified_at=clean(row.get("fetched_at")), content_hash=raw_hash, payload=payload)


def source_metadata(row: dict[str, str], version: str, source_id: str) -> dict[str, Any]:
    return {"source_name": clean(row.get("source_name")) or "catalog_import", "source_record_id": source_id, "source_url": clean(row.get("source_url")), "fetched_at": clean(row.get("fetched_at")), "last_verified_at": clean(row.get("fetched_at")), "dataset_version": version, "content_hash": hashlib.sha256(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest(), "is_active": True}


def required_errors(row: dict[str, str], fields: Iterable[str]) -> list[str]:
    return [f"MISSING_{field.upper()}" for field in fields if not clean(row.get(field))]


def url_errors(row: dict[str, str], fields: Iterable[str]) -> list[str]:
    errors: list[str] = []
    for field in fields:
        value = clean(row.get(field))
        if value and urlparse(value).scheme not in {"http", "https"}:
            errors.append(f"INVALID_URL_{field.upper()}")
    return errors


def _valid_url(value: str) -> bool:
    parsed = urlparse(value.strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def reject(report: DatasetReport, line: int, row: dict[str, str], errors: list[str]) -> None:
    report.rows_rejected += 1
    report.missing_required += sum(error.startswith("MISSING_") for error in errors)
    report.invalid_coordinates += sum(error == "INVALID_COORDINATES" for error in errors)
    report.invalid_prices += sum(error == "INVALID_PRICE" for error in errors)
    report.invalid_urls += sum(error.startswith("INVALID_URL_") for error in errors)
    source_id = clean(row.get("source_id")) or clean(row.get("id"))
    report.rejected_rows.append(RejectedRow(report.dataset, line, source_id, sorted(set(errors))))


def clean(value: Any) -> str | None:
    if value is None: return None
    text = str(value).strip()
    return text or None


def parse_price(value: Any) -> int | None:
    text = clean(value)
    if not text: return None
    try:
        number = float(text.replace(",", ""))
    except ValueError:
        return None
    return int(number) if math.isfinite(number) and number >= 0 and number.is_integer() else None


def numeric(value: Any) -> float | None:
    text = clean(value)
    if not text: return None
    try:
        number = float(text)
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def integer_or_none(value: Any) -> int | None:
    number = numeric(value)
    return int(number) if number is not None and number.is_integer() and number >= 0 else None


def parse_coordinate(value: Any, minimum: float, maximum: float) -> float | None:
    number = numeric(value)
    return number if number is not None and minimum <= number <= maximum else None


def parse_bool(value: Any) -> bool | None:
    text = (clean(value) or "").casefold()
    if text in {"1", "true", "yes", "y"}: return True
    if text in {"0", "false", "no", "n"}: return False
    return None


def parse_json_array(value: Any) -> list[Any]:
    text = clean(value)
    if not text: return []
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


def normalize_option_groups(value: Any) -> list[dict[str, Any]]:
    """Project source option groups into the Food cart's explicit DTO shape."""

    groups: list[dict[str, Any]] = []
    for raw_group in parse_json_array(value):
        if not isinstance(raw_group, dict) or raw_group.get("id") is None:
            continue
        option_items = raw_group.get("option_items")
        if isinstance(option_items, dict):
            raw_options = option_items.get("items", [])
            min_select = int(option_items.get("min_select", 0) or 0)
            max_select = int(option_items.get("max_select", 0) or 0)
        elif isinstance(option_items, list):
            raw_options = option_items
            min_select = 0
            max_select = 0
        else:
            raw_options = raw_group.get("options", [])
            min_select = 0
            max_select = 0
        options: list[dict[str, Any]] = []
        for raw_option in raw_options if isinstance(raw_options, list) else []:
            if not isinstance(raw_option, dict) or raw_option.get("id") is None or not clean(raw_option.get("name")):
                continue
            raw_price = raw_option.get("price")
            if isinstance(raw_price, dict):
                raw_price = raw_price.get("value")
            options.append({"id": str(raw_option["id"]), "name": str(raw_option["name"]).strip(), "price": parse_price(raw_price) or 0})
        if not options:
            continue
        if min_select <= 0 and parse_bool(raw_group.get("mandatory")):
            min_select = 1
        if max_select <= 0:
            max_select = len(options)
        groups.append({"id": str(raw_group["id"]), "name": clean(raw_group.get("name")) or "Options", "required": min_select > 0, "min_select": min_select, "max_select": max_select, "options": options})
    return groups


def parse_tag_array(value: Any) -> list[str]:
    text = clean(value)
    if not text:
        return []
    return [part.strip().strip("{}[]\"'") for part in text.split(",") if part.strip().strip("{}[]\"'")]


def normalize_city(value: Any) -> str | None:
    text = clean(value)
    if not text: return None
    folded = re.sub(r"[^a-z0-9]+", " ", text.casefold()).strip()
    if folded in {"ha noi", "hanoi", "hn"}: return "Hà Nội"
    return text


def fold_catalog_text(value: Any) -> str:
    text = clean(value) or ""
    normalized_text = unicodedata.normalize("NFD", text.casefold())
    return "".join(char for char in normalized_text if unicodedata.category(char) != "Mn").replace("đ", "d")


def meaningful_rating(value: Any, review_count: int | None) -> float | None:
    rating = numeric(value)
    if rating is None or review_count is None or review_count <= 0 or not 0 <= rating <= 5:
        return None
    return rating


def path_label(path: Path, report_root: Path | None = None) -> str:
    base = report_root or ROOT
    try:
        return path.relative_to(base).as_posix()
    except ValueError:
        return path.as_posix()


def resolve_source_root(source_root: Path | None = None) -> Path:
    configured = source_root or (Path(os.environ["XONE_CATALOG_SOURCE_ROOT"]) if os.environ.get("XONE_CATALOG_SOURCE_ROOT") else ROOT)
    resolved = configured.expanduser().resolve()
    if not (resolved / "data").is_dir():
        raise ValueError(f"Catalog source root does not contain a data directory: {resolved}")
    return resolved


def normalize_price_level(value: Any) -> str | None:
    text = (clean(value) or "").casefold()
    return {"low": "low", "mid": "mid", "medium": "mid", "high": "high", "premium": "premium"}.get(text, text or None)


def write_plan(plan: ImportPlan, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "manifest.json").write_text(json.dumps(plan.as_dict(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with (output_dir / "normalized.jsonl").open("w", encoding="utf-8", newline="\n") as stream:
        for record in plan.records: stream.write(record.model_dump_json(exclude_none=True) + "\n")
    with (output_dir / "rejected.jsonl").open("w", encoding="utf-8", newline="\n") as stream:
        for report in plan.reports:
            for row in report.rejected_rows: stream.write(json.dumps(row.__dict__, ensure_ascii=False, sort_keys=True) + "\n")


def database_env(domain: str) -> str:
    return {"food": "FOOD_DATABASE_URL", "restaurant": "RESTAURANT_DATABASE_URL", "healthcare": "HEALTHCARE_DATABASE_URL"}[domain]


def database_timestamp(value: str | None) -> datetime | None:
    """Convert normalized ISO-8601 text to the datetime type asyncpg expects."""
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)


def database_timestamp_without_timezone(value: str | None) -> datetime | None:
    parsed = database_timestamp(value)
    return parsed.replace(tzinfo=None) if parsed is not None else None


async def apply_plan(plan: ImportPlan, database_url: str, allow_rejected: bool) -> None:
    import asyncpg

    connection = await asyncpg.connect(database_url)
    try:
        async with connection.transaction():
            await register_dataset(connection, plan, allow_rejected)
            if plan.domain == "food": await apply_food(connection, plan.records)
            elif plan.domain == "restaurant": await apply_restaurant(connection, plan.records)
            else: await apply_healthcare(connection, plan.records)
    finally:
        await connection.close()


async def register_dataset(connection: Any, plan: ImportPlan, allow_rejected: bool) -> None:
    content_hash = hashlib.sha256(json.dumps([report.as_dict() for report in plan.reports], sort_keys=True).encode("utf-8")).hexdigest()
    status = "PARTIAL" if allow_rejected and plan.import_status == "PARTIAL" else "IMPORTED"
    await connection.execute("INSERT INTO catalog_dataset_versions (dataset_version, domain, content_hash, source_manifest, is_active, status) VALUES ($1,$2,$3,$4::jsonb,TRUE,$5) ON CONFLICT (dataset_version) DO UPDATE SET content_hash=EXCLUDED.content_hash, source_manifest=EXCLUDED.source_manifest, is_active=TRUE, status=EXCLUDED.status, imported_at=now()", plan.dataset_version, plan.domain, content_hash, json.dumps(plan.as_dict(), ensure_ascii=False), status)
    await connection.execute("UPDATE catalog_dataset_versions SET is_active=FALSE WHERE domain=$1 AND dataset_version<>$2", plan.domain, plan.dataset_version)
    if plan.domain == "food":
        await connection.execute("UPDATE food_catalog SET is_active=FALSE WHERE record_type IN ('restaurant', 'menu_item') AND dataset_version IS DISTINCT FROM $1", plan.dataset_version)
    elif plan.domain == "restaurant":
        await connection.execute("UPDATE restaurants SET active=FALSE WHERE dataset_version IS DISTINCT FROM $1", plan.dataset_version)
    else:
        await connection.execute("UPDATE healthcare_facilities SET is_active=FALSE WHERE dataset_version IS DISTINCT FROM $1", plan.dataset_version)
        await connection.execute("UPDATE departments SET is_active=FALSE WHERE dataset_version IS DISTINCT FROM $1", plan.dataset_version)
        await connection.execute("UPDATE doctors SET is_active=FALSE WHERE dataset_version IS DISTINCT FROM $1", plan.dataset_version)


async def apply_food(connection: Any, records: list[NormalizedRecord]) -> None:
    for record in records:
        payload = json.dumps(record.payload, ensure_ascii=False)
        await connection.execute("INSERT INTO food_catalog (id,record_type,data,dataset_version,source_record_id,source_name,source_url,fetched_at,last_verified_at,content_hash,is_active,updated_at) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,TRUE,now()) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data,dataset_version=EXCLUDED.dataset_version,source_record_id=EXCLUDED.source_record_id,source_name=EXCLUDED.source_name,source_url=EXCLUDED.source_url,fetched_at=EXCLUDED.fetched_at,last_verified_at=EXCLUDED.last_verified_at,content_hash=EXCLUDED.content_hash,is_active=TRUE,updated_at=now()", str(record.payload["id"]), "restaurant" if record.payload.get("id", "").startswith("food_restaurant_") else "menu_item", payload, record.dataset_version, record.source_record_id, record.source_name, record.source_url, database_timestamp(record.fetched_at), database_timestamp(record.last_verified_at), record.content_hash)


async def apply_restaurant(connection: Any, records: list[NormalizedRecord]) -> None:
    for record in records:
        payload = record.payload
        catalog_fields = {field: payload.get(field) for field in ("cuisine_tags", "price_level", "phone", "website", "opening_hours", "review_count", "latitude_raw", "longitude_raw")}
        provenance = {"source_metadata": payload.get("source_metadata", {}), "catalog": catalog_fields}
        await connection.execute("INSERT INTO restaurants (id,name,location,cuisine_type,budget_range,rating,timezone,active,description,image_url,address,ward,district,city,latitude,longitude,source_name,source_record_id,source_url,fetched_at,last_verified_at,dataset_version,content_hash,coordinate_status,provenance_json) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,location=EXCLUDED.location,cuisine_type=EXCLUDED.cuisine_type,budget_range=EXCLUDED.budget_range,rating=EXCLUDED.rating,active=TRUE,description=EXCLUDED.description,image_url=EXCLUDED.image_url,address=EXCLUDED.address,ward=EXCLUDED.ward,district=EXCLUDED.district,city=EXCLUDED.city,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,source_name=EXCLUDED.source_name,source_record_id=EXCLUDED.source_record_id,source_url=EXCLUDED.source_url,fetched_at=EXCLUDED.fetched_at,last_verified_at=EXCLUDED.last_verified_at,dataset_version=EXCLUDED.dataset_version,content_hash=EXCLUDED.content_hash,coordinate_status=EXCLUDED.coordinate_status,provenance_json=EXCLUDED.provenance_json", payload.get("id"), payload.get("name"), payload.get("location") or "", payload.get("cuisine_type") or "unknown", payload.get("budget_range") or "unknown", payload.get("rating") or 0, "Asia/Ho_Chi_Minh", payload.get("description"), payload.get("image_url"), payload.get("address"), payload.get("ward"), payload.get("district"), payload.get("city"), payload.get("latitude"), payload.get("longitude"), record.source_name, record.source_record_id, record.source_url, database_timestamp(record.fetched_at), database_timestamp(record.last_verified_at), record.dataset_version, record.content_hash, payload.get("coordinate_status"), json.dumps(provenance, ensure_ascii=False))


async def apply_healthcare(connection: Any, records: list[NormalizedRecord]) -> None:
    ordered_records = [record for record in records if record.payload.get("record_type") == "facility"] + [record for record in records if record.payload.get("record_type") == "department"] + [record for record in records if record.payload.get("record_type") == "doctor"]
    for record in ordered_records:
        payload = record.payload
        if payload.get("record_type") == "facility":
            await connection.execute("INSERT INTO healthcare_facilities (source_id,name,facility_type,address,ward,district,city,latitude,longitude,phone,website,description,emergency_available,opening_hours,image_url,source_name,source_url,fetched_at,last_verified_at,dataset_version,content_hash,is_active,provenance_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,TRUE,$22::jsonb) ON CONFLICT (source_id) DO UPDATE SET name=EXCLUDED.name,address=EXCLUDED.address,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,dataset_version=EXCLUDED.dataset_version,content_hash=EXCLUDED.content_hash,is_active=TRUE,provenance_json=EXCLUDED.provenance_json", payload.get("source_id"), payload.get("name"), payload.get("facility_type"), payload.get("address"), payload.get("ward"), payload.get("district"), payload.get("city"), payload.get("latitude"), payload.get("longitude"), payload.get("phone"), payload.get("website"), payload.get("description"), payload.get("emergency_available"), payload.get("opening_hours"), payload.get("image_url"), record.source_name, record.source_url, database_timestamp_without_timezone(record.fetched_at), database_timestamp_without_timezone(record.last_verified_at), record.dataset_version, record.content_hash, json.dumps(payload.get("source_metadata", {}), ensure_ascii=False))
        elif payload.get("record_type") == "department":
            await connection.execute("INSERT INTO departments (name,description,source_id,facility_source_id,source_name,source_url,dataset_version,content_hash,is_active,provenance_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9::jsonb) ON CONFLICT (source_id) WHERE source_id IS NOT NULL DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,source_id=EXCLUDED.source_id,facility_source_id=EXCLUDED.facility_source_id,source_name=EXCLUDED.source_name,source_url=EXCLUDED.source_url,dataset_version=EXCLUDED.dataset_version,content_hash=EXCLUDED.content_hash,is_active=TRUE,provenance_json=EXCLUDED.provenance_json", payload.get("catalog_name") or payload.get("name"), payload.get("description") or payload.get("specialty"), payload.get("source_id"), payload.get("facility_source_id"), record.source_name, record.source_url, record.dataset_version, record.content_hash, json.dumps(payload.get("source_metadata", {}), ensure_ascii=False))
        elif payload.get("record_type") == "doctor":
            department_source_id = str(payload.get("department_source_id") or hashlib.sha256(f"{payload.get('facility_source_id')}:{payload.get('department')}".encode("utf-8")).hexdigest()[:32])
            department_id = await connection.fetchval("INSERT INTO departments (name,description,source_id,facility_source_id,source_name,dataset_version,content_hash,is_active,provenance_json) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8::jsonb) ON CONFLICT (source_id) WHERE source_id IS NOT NULL DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,source_id=EXCLUDED.source_id,facility_source_id=EXCLUDED.facility_source_id,source_name=EXCLUDED.source_name,dataset_version=EXCLUDED.dataset_version,content_hash=EXCLUDED.content_hash,is_active=TRUE,provenance_json=EXCLUDED.provenance_json RETURNING id", payload.get("department_name") or payload.get("department"), payload.get("specialty"), department_source_id, payload.get("facility_source_id"), record.source_name, record.dataset_version, record.content_hash, json.dumps(payload.get("source_metadata", {}), ensure_ascii=False))
            await connection.execute("INSERT INTO doctors (department_id,name,price,description,source_id,facility_source_id,title,specialty,source_name,source_url,dataset_version,content_hash,is_active,provenance_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,$13::jsonb) ON CONFLICT (source_id) WHERE source_id IS NOT NULL DO UPDATE SET department_id=EXCLUDED.department_id,name=EXCLUDED.name,price=EXCLUDED.price,description=EXCLUDED.description,facility_source_id=EXCLUDED.facility_source_id,title=EXCLUDED.title,specialty=EXCLUDED.specialty,source_name=EXCLUDED.source_name,source_url=EXCLUDED.source_url,dataset_version=EXCLUDED.dataset_version,content_hash=EXCLUDED.content_hash,is_active=TRUE,provenance_json=EXCLUDED.provenance_json", department_id, payload.get("name"), payload.get("consultation_price"), payload.get("description"), payload.get("source_id"), payload.get("facility_source_id"), payload.get("title"), payload.get("specialty"), record.source_name, record.source_url, record.dataset_version, record.content_hash, json.dumps(payload.get("source_metadata", {}), ensure_ascii=False))


    await ensure_healthcare_runtime_slots(connection, records[0].dataset_version if records else None)


async def ensure_healthcare_runtime_slots(connection: Any, dataset_version: str | None) -> None:
    """Create repeatable local slots for imported doctors with known prices.

    The source catalog contains doctors and consultation prices, but no live
    scheduling feed. These slots keep the local booking flow testable while
    remaining attached to the imported Hanoi facilities and doctors. They are
    deliberately not the separate HCM demo catalog and are only created when a
    doctor has no slot on the next local calendar day.
    """
    if not dataset_version:
        return

    doctor_rows = await connection.fetch(
        "SELECT id FROM doctors WHERE dataset_version=$1 AND is_active=TRUE AND price IS NOT NULL ORDER BY id",
        dataset_version,
    )
    if not doctor_rows:
        return

    local_tomorrow = (datetime.now(timezone(timedelta(hours=7))) + timedelta(days=1)).replace(
        hour=8,
        minute=0,
        second=0,
        microsecond=0,
    )
    base_start = local_tomorrow.astimezone(UTC).replace(tzinfo=None)
    next_day_start = base_start + timedelta(days=1)
    for doctor_row in doctor_rows:
        doctor_id = doctor_row["id"]
        has_tomorrow_slot = await connection.fetchval(
            "SELECT EXISTS(SELECT 1 FROM time_slots WHERE doctor_id=$1 AND start_time>=$2 AND start_time<$3)",
            doctor_id,
            base_start,
            next_day_start,
        )
        if has_tomorrow_slot:
            continue
        for offset in range(4):
            start_time = base_start + timedelta(hours=offset)
            await connection.execute(
                "INSERT INTO time_slots (doctor_id,start_time,end_time,status) "
                "SELECT $1,$2,$3,'AVAILABLE' "
                "WHERE NOT EXISTS (SELECT 1 FROM time_slots WHERE doctor_id=$1 AND start_time=$2)",
                doctor_id,
                start_time,
                start_time + timedelta(minutes=30),
            )


async def deactivate_version(domain: str, version: str, database_url: str) -> None:
    import asyncpg

    connection = await asyncpg.connect(database_url)
    try:
        async with connection.transaction():
            await connection.execute("UPDATE catalog_dataset_versions SET is_active=FALSE,status='DEACTIVATED' WHERE domain=$1 AND dataset_version=$2", domain, version)
            if domain == "food": await connection.execute("UPDATE food_catalog SET is_active=FALSE WHERE dataset_version=$1", version)
            elif domain == "restaurant": await connection.execute("UPDATE restaurants SET active=FALSE WHERE dataset_version=$1", version)
            else:
                await connection.execute("UPDATE healthcare_facilities SET is_active=FALSE WHERE dataset_version=$1", version)
                await connection.execute("UPDATE departments SET is_active=FALSE WHERE dataset_version=$1", version)
                await connection.execute("UPDATE doctors SET is_active=FALSE WHERE dataset_version=$1", version)
    finally:
        await connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
