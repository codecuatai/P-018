#!/usr/bin/env sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$script_dir/../services/ride-service"
python -m alembic upgrade head
echo 'Ride migrations applied. Other domain migrations are not implemented.'
