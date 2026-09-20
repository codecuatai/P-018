$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $repoRoot
try {
  Write-Host "=== Running quality checks for P-018 ===" -ForegroundColor Cyan
  python -m ruff check apps/agent-service/src apps/agent-service/tests
  python -m pytest apps/agent-service/tests -q
} finally {
  Pop-Location
}
