#!/usr/bin/env sh
set -eu
REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$REPO_ROOT"
python -m ruff check apps/agent-service/src apps/agent-service/tests
python -m pytest apps/agent-service/tests -q
for service in ride-service restaurant-service healthcare-service food-service; do
  (cd "services/$service" && python -m pytest tests -q)
done
