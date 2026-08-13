param(
    [string]$EnvFile = ".env",
    [switch]$SkipLive,
    [switch]$SkipPlaywright
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Invoke-Checked {
    param([Parameter(Mandatory = $true)][string]$FilePath, [Parameter(Mandatory = $true)][string[]]$Arguments, [Parameter(Mandatory = $true)][string]$Label)
    Write-Host "`n== $Label ==" -ForegroundColor Cyan
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE." }
}

function Invoke-PythonTests {
    param([Parameter(Mandatory = $true)][string]$Directory, [Parameter(Mandatory = $true)][string]$Label)
    Push-Location (Join-Path $repoRoot $Directory)
    try {
        Invoke-Checked -FilePath "python" -Arguments @("-m", "ruff", "check", "src", "tests") -Label "$Label ruff"
        Invoke-Checked -FilePath "python" -Arguments @("-m", "pytest", "tests", "-q") -Label "$Label pytest"
    } finally { Pop-Location }
}

function Assert-LiveCredential {
    param([Parameter(Mandatory = $true)][string]$Name)
    if (-not [Environment]::GetEnvironmentVariable($Name)) {
        throw "$Name must be set in the calling shell before live Playwright acceptance."
    }
}

function Restart-LocalRuntime {
    Invoke-Checked -FilePath "powershell.exe" -Arguments @("-ExecutionPolicy", "Bypass", "-File", (Join-Path $repoRoot "scripts\local-stop.ps1")) -Label "Reset local process runtime"
    Invoke-Checked -FilePath "powershell.exe" -Arguments @("-ExecutionPolicy", "Bypass", "-File", (Join-Path $repoRoot "scripts\local-dev.ps1"), "-EnvFile", $EnvFile, "-WaitSeconds", "90") -Label "Restart local process runtime"
}

Push-Location $repoRoot
try {
    Invoke-Checked -FilePath "python" -Arguments @("scripts/validate-env-config.py") -Label "Environment validation"
    Invoke-Checked -FilePath "docker" -Arguments @("compose", "--env-file", $EnvFile, "config", "--quiet") -Label "Compose config"
    Invoke-Checked -FilePath "python" -Arguments @("scripts/check-migration-parity.py") -Label "Migration parity"
    Invoke-Checked -FilePath "python" -Arguments @("-m", "pytest", "tests/contract", "scripts/dataops", "-q") -Label "Contract/DataOps tests"
    $integrationFiles = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot "tests/integration") -Filter "test_*.py" -File -ErrorAction SilentlyContinue)
    if ($integrationFiles.Count -gt 0) {
        Invoke-Checked -FilePath "python" -Arguments @("-m", "pytest", "tests/integration", "-q") -Label "Integration tests"
    } else {
        Write-Host "`n== Integration tests ==" -ForegroundColor Cyan
        Write-Host "UNVERIFIED: tests/integration has no executable test files; live checks remain separate." -ForegroundColor DarkYellow
    }
    Invoke-PythonTests -Directory "apps/agent-service" -Label "Agent"
    Invoke-PythonTests -Directory "services/food-service" -Label "Food"
    Invoke-PythonTests -Directory "services/ride-service" -Label "Ride"
    Invoke-PythonTests -Directory "services/restaurant-service" -Label "Restaurant"
    Invoke-PythonTests -Directory "services/healthcare-service" -Label "Healthcare"
    Invoke-Checked -FilePath "corepack" -Arguments @("pnpm", "--dir", "apps/api-gateway", "lint") -Label "Gateway lint"
    Invoke-Checked -FilePath "corepack" -Arguments @("pnpm", "--dir", "apps/api-gateway", "test") -Label "Gateway Jest"
    Invoke-Checked -FilePath "corepack" -Arguments @("pnpm", "--dir", "apps/api-gateway", "build") -Label "Gateway build"
    Invoke-Checked -FilePath "corepack" -Arguments @("pnpm", "--dir", "apps/web", "lint") -Label "Web typecheck"
    Invoke-Checked -FilePath "corepack" -Arguments @("pnpm", "--dir", "apps/web", "test") -Label "Web Jest"
    Invoke-Checked -FilePath "corepack" -Arguments @("pnpm", "--dir", "apps/web", "build") -Label "Web production build"

    if (-not $SkipLive) {
        Invoke-Checked -FilePath "powershell.exe" -Arguments @("-ExecutionPolicy", "Bypass", "-File", (Join-Path $repoRoot "scripts\local-health.ps1")) -Label "Live service health"
        Invoke-Checked -FilePath "powershell.exe" -Arguments @("-ExecutionPolicy", "Bypass", "-Command", "Invoke-WebRequest -UseBasicParsing http://localhost:3000/health/ready -TimeoutSec 10 | Out-Null; Invoke-WebRequest -UseBasicParsing http://localhost:5173/api/health -TimeoutSec 10 | Out-Null") -Label "Live HTTP smoke"
    }

    if (-not $SkipPlaywright) {
        Invoke-Checked -FilePath "corepack" -Arguments @("pnpm", "--dir", "apps/web", "test:e2e") -Label "Playwright fast responsive suite"
        Assert-LiveCredential -Name "LIVE_E2E_ADMIN_EMAIL"
        Assert-LiveCredential -Name "LIVE_E2E_ADMIN_PASSWORD"
        Assert-LiveCredential -Name "LIVE_E2E_NORMAL_EMAIL"
        Assert-LiveCredential -Name "LIVE_E2E_NORMAL_PASSWORD"
        Assert-LiveCredential -Name "LIVE_E2E_TRANSACTIONS_EMAIL"
        Assert-LiveCredential -Name "LIVE_E2E_TRANSACTIONS_PASSWORD"
        Invoke-Checked -FilePath "corepack" -Arguments @("pnpm", "--dir", "apps/web", "exec", "playwright", "test", "--config=playwright.live.config.ts", "--project=chromium-live", "e2e-live/live-product.spec.ts") -Label "Playwright live Product"
        Restart-LocalRuntime
        Invoke-Checked -FilePath "corepack" -Arguments @("pnpm", "--dir", "apps/web", "exec", "playwright", "test", "--config=playwright.live.config.ts", "--project=chromium-live", "e2e-live/live-admin.spec.ts") -Label "Playwright live Admin"
        Restart-LocalRuntime
        Invoke-Checked -FilePath "corepack" -Arguments @("pnpm", "--dir", "apps/web", "exec", "playwright", "test", "--config=playwright.live.config.ts", "--project=chromium-live", "e2e-live/live-transactions.spec.ts") -Label "Playwright live transactions"
    }
    Invoke-Checked -FilePath "git" -Arguments @("diff", "--check") -Label "Git diff check"
    Write-Host "`nLocal acceptance completed without a failing step." -ForegroundColor Green
} finally {
    Pop-Location
}
