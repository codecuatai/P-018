#!/usr/bin/env sh
set -eu
REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$REPO_ROOT"
echo "=== Running quality checks for P-018 ==="
python -m ruff check apps/agent-service/src apps/agent-service/tests
python -m pytest apps/agent-service/tests -q

