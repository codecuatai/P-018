#!/usr/bin/env python3
"""Validate the root Compose environment template without reading .env secrets."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_EXAMPLE = ROOT / ".env.example"
COMPOSE_FILE = ROOT / "docker-compose.yml"
REQUIRED_ROOT_KEYS = {
    "APP_ENV",
    "INTERNAL_SERVICE_TOKEN",
    "POSTGRES_ADMIN_USER",
    "POSTGRES_ADMIN_PASSWORD",
    "POSTGRES_PORT",
    "CORE_DATABASE_URL",
    "AGENT_DATABASE_URL",
    "RIDE_DATABASE_URL",
    "RESTAURANT_DATABASE_URL",
    "HEALTHCARE_DATABASE_URL",
    "FOOD_DATABASE_URL",
    "API_GATEWAY_PORT",
    "WEB_PORT",
    "NEXT_PUBLIC_API_URL",
    "AGENT_SERVICE_PORT",
    "RIDE_SERVICE_PORT",
    "RESTAURANT_SERVICE_PORT",
    "HEALTHCARE_SERVICE_PORT",
    "HEALTHCARE_FACILITY_NAME",
    "HEALTHCARE_FACILITY_ADDRESS",
    "FOOD_SERVICE_PORT",
    "FOOD_SERVICE_URL",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
}
VARIABLE_PATTERN = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)")


def parse_environment_template(path: Path) -> tuple[set[str], list[str]]:
    keys: set[str] = set()
    duplicates: list[str] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" not in stripped:
            raise ValueError(f"{path.name}:{line_number} is not a KEY=value entry")
        key, _ = stripped.split("=", 1)
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            raise ValueError(f"{path.name}:{line_number} has invalid key {key!r}")
        if key in keys:
            duplicates.append(key)
        keys.add(key)
    return keys, duplicates


def main() -> int:
    if not ENV_EXAMPLE.is_file() or not COMPOSE_FILE.is_file():
        print("Root .env.example or docker-compose.yml is missing.", file=sys.stderr)
        return 1

    try:
        keys, duplicates = parse_environment_template(ENV_EXAMPLE)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1

    missing_required = sorted(REQUIRED_ROOT_KEYS - keys)
    compose_variables = set(VARIABLE_PATTERN.findall(COMPOSE_FILE.read_text(encoding="utf-8")))
    missing_compose_variables = sorted(compose_variables - keys)
    errors: list[str] = []
    if duplicates:
        errors.append(f"Duplicate root environment keys: {', '.join(sorted(duplicates))}")
    if missing_required:
        errors.append(f"Missing required root environment keys: {', '.join(missing_required)}")
    if missing_compose_variables:
        errors.append(f"Compose variables absent from .env.example: {', '.join(missing_compose_variables)}")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1

    print(f"Environment configuration is consistent ({len(keys)} root variables, {len(compose_variables)} Compose variables).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
