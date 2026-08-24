"""Check that Bash and PowerShell apply the same migrations in the same order."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION_PATTERN = re.compile(
    r"((?:apps/agent-service|apps/api-gateway|services/food-service|"
    r"services/healthcare-service)/migrations/[^'\"\s]+\.sql)"
)


def migration_paths(path: Path) -> list[str]:
    return MIGRATION_PATTERN.findall(path.read_text(encoding="utf-8"))


def main() -> int:
    bash = migration_paths(ROOT / "scripts" / "migrate.sh")
    powershell = migration_paths(ROOT / "scripts" / "migrate.ps1")
    if bash != powershell:
        raise SystemExit(f"Migration order drift detected:\nBash: {bash}\nPowerShell: {powershell}")
    missing = [path for path in bash if not (ROOT / path).is_file()]
    if missing:
        raise SystemExit(f"Migration files missing: {missing}")
    print(f"Migration parity OK ({len(bash)} files).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
