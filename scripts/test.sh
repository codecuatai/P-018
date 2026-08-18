#!/usr/bin/env sh
set -eu
python -m ruff check apps/agent-service/src apps/agent-service/tests
python -m pytest apps/agent-service/tests -q
for service in ride-service restaurant-service healthcare-service food-service; do
  (cd "services/$service" && python -m pytest tests -q)
done
