#!/usr/bin/env sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repository_root"

python3 -c "import sys; assert sys.version_info >= (3, 11), 'Python 3.11+ required'"
python3 -m venv .venv
# shellcheck disable=SC1091
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e 'apps/agent-service[dev]' -e 'services/food-service[dev]'

if [ ! -f .env ]; then
  cp .env.example .env
  echo 'Created .env from .env.example; update local placeholder values before starting Compose.'
else
  echo '.env already exists. No files were changed.'
fi

corepack pnpm install --frozen-lockfile
python scripts/check-migration-parity.py
echo 'Setup complete. Start the canonical stack with: docker compose up --build'
