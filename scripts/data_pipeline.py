"""Audit, normalize, and version the local Hanoi datasets without editing raw CSVs.

The importer intentionally stops at a domain-neutral manifest. Domain services
own the final insert/upsert adapters and can consume this manifest through an
explicit release step; the script never opens another service's database.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse


MOJIBAKE_MARKERS = ("Ã", "Â", "Ä", "áº", "ï¿½")
URL_FIELDS = ("source_url", "sourceUrl", "website", "image_url", "imageUrl")
CITY_ALIASES = {"ha noi": "Hà Nội", "hanoi": "Hà Nội", "hn": "Hà Nội", "hà nội": "Hà Nội"}
DATASET_REQUIRED: dict[str, tuple[str, ...]] = {
    "food_menu_items": ("source_id", "restaurant_source_id", "name", "price", "source_url"),
    "food_restaurants": ("source_id", "name", "source_url"),
    "restaurant_restaurants": ("source_id", "name", "address", "city", "latitude", "longitude", "source_url", "source_name", "fetched_at"),
    "healthcare_doctors": ("source_id", "facility_source_id", "department", "name", "source_url", "fetched_at"),
    "healthcare_facilities": ("source_id", "name", "address", "city", "latitude", "longitude", "source_url", "source_name", "fetched_at"),
    "healthcare_departments": ("id", "facility_source_id", "name", "specialty"),
}


@dataclass
class DatasetQualityReport:
    path: str
    dataset: str
    rows_total: int = 0
    rows_valid: int = 0
    rows_rejected: int = 0
    columns: int = 0
    headers: list[str] = field(default_factory=list)
    encoding: str = ""
    line_ending: str = ""
    delimiter: str = ","
    duplicates: int = 0
    missing_required: int = 0
    invalid_coordinates: int = 0
    missing_coordinates: int = 0
    invalid_prices: int = 0
    invalid_urls: int = 0
    missing_source_urls: int = 0
    invalid_json: int = 0
    unknown_categories: int = 0
    malformed_rows: int = 0
    repaired_rows: int = 0
    mojibake_rows: int = 0
    source_ids_missing: int = 0
    content_hash: str = ""
    quality_flags: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class CsvRead:
    headers: tuple[str, ...]
    rows: tuple[tuple[str, ...], ...]
    text: str
    encoding: str
    line_ending: str
    delimiter: str
    content_hash: str


def dataset_name(path: Path) -> str:
    normalized = path.as_posix().lower()
    if normalized.endswith("food-service/menu_items.csv"):
        return "food_menu_items"
    if normalized.endswith("food-service/restaurants.csv"):
        return "food_restaurants"
    if normalized.endswith("restaurant-service/crawled_restaurants.csv"):
        return "restaurant_restaurants"
    if normalized.endswith("healthcare-service/bacsi.csv"):
        return "healthcare_doctors"
    if normalized.endswith("healthcare-service/benhvien.csv"):
        return "healthcare_facilities"
    if normalized.endswith("healthcare-service/chuyenkhoa.csv"):
        return "healthcare_departments"
    return path.stem


def read_csv(path: Path) -> CsvRead:
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
        encoding = "UTF-8 BOM" if raw.startswith(b"\xef\xbb\xbf") else "UTF-8"
    except UnicodeDecodeError as exc:
        raise ValueError(f"{path}: input is not valid UTF-8 ({exc})") from exc
    line_ending = "CRLF" if "\r\n" in text else "LF" if "\n" in text else "NONE"
    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ","
    reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter)
    try:
        rows = tuple(tuple(cell.strip() for cell in row) for row in reader)
    except csv.Error as exc:
        raise ValueError(f"{path}: malformed CSV ({exc})") from exc
    if not rows:
        raise ValueError(f"{path}: CSV has no header")
    return CsvRead(rows[0], rows[1:], text, encoding, line_ending, delimiter, hashlib.sha256(raw).hexdigest())


def repair_specialty_row(row: Iterable[str]) -> dict[str, str]:
    """Repair the known unquoted-comma shape in chuyenkhoa.csv.

    The raw row is retained by the caller; this function only creates the
    normalized staging projection and never guesses a doctor or appointment.
    """

    values = list(row)
    if len(values) < 7:
        values += [""] * (7 - len(values))
    url_index = next((index for index in range(len(values) - 1, 3, -1) if _valid_url(values[index])), len(values) - 1)
    source_url = values[url_index]
    description = values[url_index - 1] if url_index > 4 else ""
    tags = ",".join(values[4 : max(4, url_index - 1)])
    return {
        "id": values[0],
        "facility_source_id": values[1],
        "name": values[2],
        "specialty": values[3],
        "specialty_tags": _clean_tag_blob(tags),
        "description": description.strip().strip('"'),
        "source_url": source_url.strip(),
    }


def audit_csv(path: str | Path, *, dataset: str | None = None) -> DatasetQualityReport:
    csv_path = Path(path)
    name = dataset or dataset_name(csv_path)
    report = DatasetQualityReport(path=csv_path.as_posix(), dataset=name)
    read = read_csv(csv_path)
    report.headers = list(read.headers)
    report.columns = len(read.headers)
    report.encoding = read.encoding
    report.line_ending = read.line_ending
    report.delimiter = read.delimiter
    report.content_hash = read.content_hash
    if name == "healthcare_departments":
        report.rows_total = len(read.rows)
        report.malformed_rows = sum(1 for row in read.rows if len(row) != len(read.headers))
        report.repaired_rows = report.rows_total
        records = [repair_specialty_row(row) for row in read.rows]
    else:
        report.rows_total = len(read.rows)
        report.malformed_rows = sum(1 for row in read.rows if len(row) != len(read.headers))
        records = [dict(zip(read.headers, row, strict=False)) for row in read.rows]

    required = DATASET_REQUIRED.get(name, tuple(read.headers[:1]))
    id_field = "id" if name == "healthcare_departments" else "source_id"
    seen: set[str] = set()
    rejected: set[int] = set()
    for index, record in enumerate(records):
        if any(not str(record.get(field, "")).strip() for field in required):
            report.missing_required += 1
            rejected.add(index)
        if name == "healthcare_departments" and not str(record.get("source_url", "")).strip():
            report.missing_source_urls += 1
        identifier = str(record.get(id_field, "")).strip()
        if not identifier:
            report.source_ids_missing += 1
            rejected.add(index)
        elif identifier in seen:
            report.duplicates += 1
            rejected.add(index)
        seen.add(identifier)
        if any(_has_mojibake(str(value)) for value in record.values()):
            report.mojibake_rows += 1
        _audit_urls(record, report, rejected, index)
        _audit_price(record, report, rejected, index)
        _audit_coordinates(record, report, rejected, index)
        _audit_json(record, report)
        if _has_unknown_category(record):
            report.unknown_categories += 1
    report.rows_rejected = len(rejected)
    report.rows_valid = max(0, report.rows_total - report.rows_rejected)
    if report.mojibake_rows:
        report.quality_flags.append("MOJIBAKE_MARKERS_PRESENT_REVIEW_BEFORE_IMPORT")
    if report.malformed_rows:
        report.quality_flags.append("MALFORMED_ROWS_REPAIRED_IN_STAGING")
    if report.missing_source_urls:
        report.quality_flags.append("SOURCE_URL_MISSING_RETAINED_FOR_REVIEW")
    if report.missing_coordinates:
        report.quality_flags.append("MISSING_COORDINATES_RETAINED_WITHOUT_FABRICATION")
    if report.invalid_coordinates:
        report.quality_flags.append("INVALID_COORDINATES_REJECTED")
    if report.invalid_prices:
        report.quality_flags.append("INVALID_PRICES_REJECTED")
    if report.invalid_urls:
        report.quality_flags.append("INVALID_URLS_REJECTED")
    if report.invalid_json:
        report.quality_flags.append("INVALID_JSON_RETAINED_RAW_FOR_REVIEW")
    return report


def normalize_city(value: str | None) -> str | None:
    if value is None:
        return None
    raw = " ".join(value.strip().split())
    if not raw:
        return None
    return CITY_ALIASES.get(raw.casefold(), raw)


def normalize_record(record: dict[str, str], *, dataset: str, dataset_version: str, source_name: str | None = None, imported_at: str | None = None) -> dict[str, Any]:
    result: dict[str, Any] = dict(record)
    if dataset == "healthcare_departments":
        result = repair_specialty_row(record.values()) if len(record) != 7 else result
    city = normalize_city(result.get("city"))
    if city:
        result["city_normalized"] = city
    source_id = result.get("source_id") or result.get("id") or ""
    fetched_at = result.get("fetched_at") or imported_at or datetime.now(UTC).isoformat()
    source = source_name or result.get("source_name") or dataset
    result.update({
        "source_name": source,
        "source_record_id": source_id,
        "dataset_version": dataset_version,
        "content_hash": hashlib.sha256(json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest(),
        "fetched_at": fetched_at,
        "last_verified_at": fetched_at,
        "is_active": True,
        "imported_at": imported_at or datetime.now(UTC).isoformat(),
    })
    return result


class DatasetRegistry:
    """Small version registry used by local release scripts, not a domain DB."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.state: dict[str, Any] = {"versions": {}, "active": {}}
        if self.path.exists():
            try:
                loaded = json.loads(self.path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                raise ValueError(f"Cannot read dataset registry {self.path}: {exc}") from exc
            if isinstance(loaded, dict):
                self.state = loaded

    def record(self, dataset: str, version: str, report: DatasetQualityReport, *, activate: bool = False) -> None:
        key = f"{dataset}:{version}"
        self.state.setdefault("versions", {})[key] = {"dataset": dataset, "version": version, "content_hash": report.content_hash, "rows_total": report.rows_total, "rows_valid": report.rows_valid, "rows_rejected": report.rows_rejected, "is_active": False}
        if activate:
            self.activate(dataset, version)

    def activate(self, dataset: str, version: str) -> None:
        key = f"{dataset}:{version}"
        if key not in self.state.setdefault("versions", {}):
            raise ValueError(f"Dataset version is not registered: {key}")
        for value in self.state["versions"].values():
            if value.get("dataset") == dataset:
                value["is_active"] = False
        self.state["versions"][key]["is_active"] = True
        self.state.setdefault("active", {})[dataset] = version

    def deactivate(self, dataset: str, version: str) -> None:
        key = f"{dataset}:{version}"
        value = self.state.setdefault("versions", {}).get(key)
        if value is None:
            raise ValueError(f"Dataset version is not registered: {key}")
        value["is_active"] = False
        if self.state.setdefault("active", {}).get(dataset) == version:
            self.state["active"].pop(dataset, None)

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def import_dataset(path: str | Path, dataset_version: str, registry: DatasetRegistry, *, activate: bool = False) -> dict[str, Any]:
    report = audit_csv(path)
    registry.record(report.dataset, dataset_version, report, activate=activate)
    return {"dataset": report.dataset, "dataset_version": dataset_version, "content_hash": report.content_hash, "quality": report.as_dict(), "mode": "manifest-only"}


def audit_tree(root: str | Path) -> list[DatasetQualityReport]:
    return [audit_csv(path) for path in sorted(Path(root).rglob("*.csv"))]


def _audit_urls(record: dict[str, str], report: DatasetQualityReport, rejected: set[int], index: int) -> None:
    for field in URL_FIELDS:
        value = record.get(field, "").strip()
        if value and not _valid_url(value):
            report.invalid_urls += 1
            rejected.add(index)


def _audit_price(record: dict[str, str], report: DatasetQualityReport, rejected: set[int], index: int) -> None:
    for field, value in record.items():
        if field not in {"price", "consultation_price", "base_fee", "per_km", "per_minute"} or not value.strip():
            continue
        try:
            if int(float(value)) < 0:
                raise ValueError
        except ValueError:
            report.invalid_prices += 1
            rejected.add(index)


def _audit_coordinates(record: dict[str, str], report: DatasetQualityReport, rejected: set[int], index: int) -> None:
    latitude = record.get("latitude", "").strip()
    longitude = record.get("longitude", "").strip()
    if not latitude and not longitude:
        if "latitude" in record or "longitude" in record:
            report.missing_coordinates += 1
        return
    try:
        lat = float(latitude)
        lon = float(longitude)
        if not -90 <= lat <= 90 or not -180 <= lon <= 180 or (lat == 0 and lon == 0):
            raise ValueError
    except ValueError:
        report.invalid_coordinates += 1
        rejected.add(index)


def _audit_json(record: dict[str, str], report: DatasetQualityReport) -> None:
    for field in ("options", "cuisine_tags"):
        value = record.get(field, "").strip()
        if not value:
            continue
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            report.invalid_json += 1
            continue
        if not isinstance(parsed, list):
            report.invalid_json += 1


def _has_unknown_category(record: dict[str, str]) -> bool:
    value = record.get("category", "").strip().casefold()
    if not value:
        return False
    vocabulary = {"món chính", "món thêm", "đồ uống", "combo", "vietnamese", "western", "japanese", "korean", "seafood", "cafe"}
    return value not in vocabulary and len(value) > 1


def _clean_tag_blob(value: str) -> str:
    cleaned = value.strip().replace('"', "").replace("'", "").strip("{}")
    return json.dumps([part.strip() for part in cleaned.split(",") if part.strip()], ensure_ascii=False)


def _valid_url(value: str) -> bool:
    parsed = urlparse(value.strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _has_mojibake(value: str) -> bool:
    return any(marker in value for marker in MOJIBAKE_MARKERS)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    audit_parser = subparsers.add_parser("audit")
    audit_parser.add_argument("--root", default="data")
    import_parser = subparsers.add_parser("import")
    import_parser.add_argument("--dataset", required=True)
    import_parser.add_argument("--version", required=True)
    import_parser.add_argument("--registry", default="data/.dataset-registry.json")
    import_parser.add_argument("--activate", action="store_true")
    activate_parser = subparsers.add_parser("activate")
    activate_parser.add_argument("--dataset", required=True)
    activate_parser.add_argument("--version", required=True)
    activate_parser.add_argument("--registry", default="data/.dataset-registry.json")
    deactivate_parser = subparsers.add_parser("deactivate")
    deactivate_parser.add_argument("--dataset", required=True)
    deactivate_parser.add_argument("--version", required=True)
    deactivate_parser.add_argument("--registry", default="data/.dataset-registry.json")
    args = parser.parse_args(argv)
    if args.command == "audit":
        print(json.dumps([report.as_dict() for report in audit_tree(args.root)], ensure_ascii=False, indent=2))
        return 0
    registry = DatasetRegistry(args.registry)
    if args.command == "import":
        print(json.dumps(import_dataset(args.dataset, args.version, registry, activate=args.activate), ensure_ascii=False, indent=2))
        registry.save()
        return 0
    if args.command == "activate":
        registry.activate(args.dataset, args.version)
        registry.save()
        return 0
    registry.deactivate(args.dataset, args.version)
    registry.save()
    return 0


if __name__ == "__main__":
    sys.exit(main())
