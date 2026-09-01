$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $repoRoot
try {
  python -m ruff check apps/agent-service/src apps/agent-service/tests
  python -m pytest apps/agent-service/tests -q
  foreach ($service in 'ride-service', 'restaurant-service', 'healthcare-service', 'food-service') {
    Push-Location "services/$service"
    try { python -m pytest tests -q } finally { Pop-Location }
  }
} finally {
  Pop-Location
}
