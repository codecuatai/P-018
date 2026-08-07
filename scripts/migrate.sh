#!/usr/bin/env sh
set -eu
echo 'Applying Restaurant Service migrations...'
docker compose exec -T restaurant-service alembic upgrade head
echo 'Restaurant Service migrations applied.'
