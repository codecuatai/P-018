$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$serviceRoot = (Resolve-Path (Join-Path $repoRoot "..\P-018-Service")).Path
Push-Location $repoRoot
try {
  python -m ruff check apps/agent-service/src apps/agent-service/tests
  python -m pytest apps/agent-service/tests -q
  foreach ($service in 'ride-service', 'restaurant-service', 'healthcare-service', 'food-service', 'delivery-service') {
    Push-Location (Join-Path $serviceRoot "services/$service")
    try {
      python -m ruff check src tests
      python -m pytest tests -q
    } finally { Pop-Location }
  }
} finally {
  Pop-Location
}
