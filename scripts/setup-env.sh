#!/usr/bin/env sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
example_path="$repository_root/.env.example"
environment_path="$repository_root/.env"

if [ ! -f "$example_path" ]; then
  echo '.env.example does not exist at the repository root.' >&2
  exit 1
fi

if [ -f "$environment_path" ]; then
  echo '.env already exists. No files were changed.'
  exit 0
fi

cp "$example_path" "$environment_path"
echo '.env does not exist.'
echo 'Created .env from .env.example.'
echo 'Update local placeholder values before starting the stack.'
