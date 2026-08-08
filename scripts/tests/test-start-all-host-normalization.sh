#!/usr/bin/env bash
set -Eeuo pipefail

normalize_gateway_host() {
    local host="$1"
    if [[ "$host" == "0.0.0.0" || "$host" == "127.0.0.1" || "$host" == "::" || "$host" == "[::]" ]]; then
        printf '%s\n' "localhost"
    else
        printf '%s\n' "$host"
    fi
}

declare -A expected_hosts=(
    ["0.0.0.0"]="localhost"
    ["127.0.0.1"]="localhost"
    ["::"]="localhost"
    ["[::]"]="localhost"
    ["192.168.1.10"]="192.168.1.10"
)

for input in "${!expected_hosts[@]}"; do
    actual="$(normalize_gateway_host "$input")"
    [[ "$actual" == "${expected_hosts[$input]}" ]] || {
        printf 'Unexpected normalization for %s: %s\n' "$input" "$actual" >&2
        exit 1
    }
done

printf '%s\n' "start-all host normalization checks passed"
