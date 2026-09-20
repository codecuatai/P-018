#!/usr/bin/env sh
set -eu
REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
SERVICE_ROOT=$(CDPATH= cd -- "$REPO_ROOT/../P-018-Service" && pwd)
cd "$REPO_ROOT"
python -m ruff check apps/agent-service/src apps/agent-service/tests
python -m pytest apps/agent-service/tests -q
for service in ride-service restaurant-service healthcare-service food-service delivery-service; do
  (cd "$SERVICE_ROOT/services/$service" && python -m ruff check src tests && python -m pytest tests -q)
done
