from __future__ import annotations

from pathlib import Path

from catalog_import import ROOT, build_plan, database_timestamp, database_timestamp_without_timezone, resolve_source_root


def test_database_timestamp_converts_iso_offset_to_aware_datetime() -> None:
    value = database_timestamp("2026-08-11T01:42:47+07:00")
    assert value is not None
    assert value.isoformat() == "2026-08-11T01:42:47+07:00"
    assert database_timestamp(None) is None


def test_healthcare_timestamp_adapter_matches_timestamp_without_timezone() -> None:
    value = database_timestamp_without_timezone("2026-08-11T01:42:47+07:00")
    assert value is not None
    assert value.tzinfo is None


def test_food_plan_is_versioned_and_keeps_source_provenance() -> None:
    plan = build_plan("food", "test-food-v1")
    assert plan.import_status == "READY"
    assert len(plan.records) == 17_596
    assert all(record.dataset_version == "test-food-v1" for record in plan.records)
    assert all(record.content_hash and len(record.content_hash) == 64 for record in plan.records)
    assert all(record.payload.get("source_metadata", {}).get("source_record_id") == record.source_record_id for record in plan.records)


def test_restaurant_plan_excludes_suspicious_duplicate_coordinates_from_geo_fields() -> None:
    plan = build_plan("restaurant", "test-restaurant-v1")
    assert len(plan.records) == 1_307
    assert all(record.payload["coordinate_status"] == "suspicious_default" for record in plan.records)
    assert all(record.payload["latitude"] is None and record.payload["longitude"] is None for record in plan.records)
    assert all(record.payload["latitude_raw"] == 21.0285 and record.payload["longitude_raw"] == 105.8048 for record in plan.records)


def test_healthcare_plan_repairs_specialty_csv_and_keeps_quality_flags() -> None:
    plan = build_plan("healthcare", "test-healthcare-v1")
    assert plan.import_status == "READY"
    assert len(plan.records) == 281
    specialties = next(report for report in plan.reports if report.dataset == "healthcare-specialties")
    assert specialties.rows_total == 70
    assert specialties.rows_valid == 70
    assert specialties.rows_rejected == 0
    assert specialties.repaired_rows == 70
    assert specialties.missing_source_urls == 36
    doctors = next(report for report in plan.reports if report.dataset == "healthcare-doctors")
    assert doctors.missing_prices == 102
    assert all(record.payload.get("record_type") == "department" for record in plan.records if record.source_name == "healthcare-specialties")
    department_ids = {record.payload["source_id"] for record in plan.records if record.payload.get("record_type") == "department"}
    doctor_records = [record.payload for record in plan.records if record.payload.get("record_type") == "doctor"]
    assert len({record.payload["source_id"] for record in plan.records if record.payload.get("record_type") == "facility"}) == 3
    assert len(department_ids) == 70
    assert len(doctor_records) == 208
    assert all(doctor["department_source_id"] in department_ids or doctor["department_source_id"].startswith("derived_department_") for doctor in doctor_records)


def test_food_plan_preserves_product_fields_and_normalizes_nested_options() -> None:
    plan = build_plan("food", "test-food-fields-v1")
    item = next(record.payload for record in plan.records if record.payload.get("id", "").startswith("food_menu_item_") and record.payload.get("option_groups"))
    assert item["description"]
    assert item["image_url"].startswith("https://")
    assert item["available"] is True
    assert all({"id", "name", "required", "min_select", "max_select", "options"}.issubset(group) for group in item["option_groups"])
    assert all({"id", "name", "price"}.issubset(option) for group in item["option_groups"] for option in group["options"])


def test_restaurant_plan_reports_repeated_default_coordinates() -> None:
    plan = build_plan("restaurant", "test-restaurant-quality-v1")
    report = plan.reports[0]
    assert report.suspicious_coordinates == 1307
    assert report.suspicious_coordinate_distinct_addresses == 397
    assert plan.records[0].payload["latitude"] is None
    assert plan.records[0].payload["coordinate_status"] == "suspicious_default"


def test_source_files_are_not_rewritten_by_read_only_plan() -> None:
    assert (resolve_source_root() / "data" / "food-service" / "restaurants.csv").is_file()
