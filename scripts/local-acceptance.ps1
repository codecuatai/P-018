param(
    [string]$EnvFile = ".env",
    [switch]$SkipLive,
    [switch]$SkipCrossServiceE2E,
    [switch]$SkipPlaywright
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $PSScriptRoot "_common.ps1")
$envFilePath = Resolve-EnvFilePath -EnvFile $EnvFile -RepoRoot $repoRoot

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
    # This resets the direct-process runtime only. Doing it while a Compose stack owns
    # the published ports would start a second Gateway/Web on the same ports, so the
    # mismatch is a hard failure instead of a confusing port conflict mid-run.
    $composeContainers = Get-RunningComposeContainers -RepoRoot $repoRoot -EnvFilePath $envFilePath
    if ($composeContainers.Count -gt 0) {
        throw ("Live Playwright acceptance restarts the direct-process runtime, but " +
            "$($composeContainers.Count) Docker Compose application containers are running. " +
            "Run the Compose stack with -SkipPlaywright, or stop Compose before the live browser suites.")
    }
    Invoke-Checked -FilePath "powershell.exe" -Arguments @("-ExecutionPolicy", "Bypass", "-File", (Join-Path $repoRoot "scripts\local-stop.ps1")) -Label "Reset local process runtime"
    Invoke-Checked -FilePath "powershell.exe" -Arguments @("-ExecutionPolicy", "Bypass", "-File", (Join-Path $repoRoot "scripts\local-dev.ps1"), "-EnvFile", $EnvFile, "-WaitSeconds", "90") -Label "Restart local process runtime"
}

function Invoke-CrossServiceE2E {
    <#
        .SYNOPSIS
        Runs the Compose cross-service E2E suite (tests/e2e).
        .NOTES
        The suite shells out to `docker compose exec/restart`, so it only makes sense
        against the Compose runtime. A direct-process runtime is a hard failure rather
        than a skip: silently skipping this layer is what let Gateway-to-domain
        regressions pass acceptance before.
    #>
    param([Parameter(Mandatory = $true)][int]$GatewayPort)

    $composeContainers = Get-RunningComposeContainers -RepoRoot $repoRoot -EnvFilePath $envFilePath
    $expected = (Get-ComposeAppServices).Count
    if ($composeContainers.Count -lt $expected) {
        throw ("Cross-service E2E requires the Docker Compose runtime, but only " +
            "$($composeContainers.Count) of $expected application containers are running. " +
            "Start the stack with 'scripts\start-all.ps1', or pass -SkipCrossServiceE2E to " +
            "acknowledge that the cross-service layer is unverified.")
    }

    $demoEmail = Get-ConfigValue -Name "DEMO_AUTH_EMAIL" -EnvFilePath $envFilePath
    $demoPassword = Get-ConfigValue -Name "DEMO_AUTH_PASSWORD" -EnvFilePath $envFilePath
    if (-not $demoEmail -or -not $demoPassword) {
        throw "DEMO_AUTH_EMAIL and DEMO_AUTH_PASSWORD must be set in $EnvFile for the cross-service E2E suite."
    }
    $internalToken = Get-ConfigValue -Name "INTERNAL_SERVICE_TOKEN" -EnvFilePath $envFilePath

    $composeProject = Get-ConfigValue -Name "COMPOSE_PROJECT_NAME" -EnvFilePath $envFilePath -DefaultValue (Split-Path -Leaf $repoRoot).ToLowerInvariant()
    $previous = @{}
    $overrides = @{
        E2E_GATEWAY_URL          = "http://localhost:$GatewayPort"
        E2E_REQUIRE_GATEWAY      = "1"
        E2E_COMPOSE_PROJECT_NAME = $composeProject
        E2E_COMPOSE_ENV_FILE     = $EnvFile
        E2E_DEMO_EMAIL           = $demoEmail
        E2E_DEMO_PASSWORD        = $demoPassword
    }
    if ($internalToken) { $overrides["E2E_INTERNAL_SERVICE_TOKEN"] = $internalToken }

    foreach ($name in $overrides.Keys) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name)
        Set-Item -Path "env:$name" -Value $overrides[$name]
    }
    try {
        Invoke-Checked -FilePath "python" -Arguments @("-m", "pytest", "tests/e2e", "-q") -Label "Cross-service Compose E2E"
    } finally {
        foreach ($name in $previous.Keys) {
            if ($null -eq $previous[$name]) {
                Remove-Item -Path "env:$name" -ErrorAction SilentlyContinue
            } else {
                Set-Item -Path "env:$name" -Value $previous[$name]
            }
        }
    }
}

Push-Location $repoRoot
try {
    Invoke-Checked -FilePath "python" -Arguments @("scripts/validate-env-config.py") -Label "Environment validation"
    Invoke-Checked -FilePath "docker" -Arguments @("compose", "--env-file", $EnvFile, "config", "--quiet") -Label "Compose config"
    Invoke-Checked -FilePath "python" -Arguments @("scripts/check-migration-parity.py") -Label "Migration parity"
    Invoke-Checked -FilePath "python" -Arguments @("-m", "pytest", "tests/contract", "scripts/dataops", "-q") -Label "Contract/DataOps tests"
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

    $gatewayPort = Get-ConfigPort -Name "API_GATEWAY_PORT" -EnvFilePath $envFilePath -DefaultPort 3000
    $webPort = Get-ConfigPort -Name "WEB_PORT" -EnvFilePath $envFilePath -DefaultPort 5173

    if (-not $SkipLive) {
        Invoke-Checked -FilePath "powershell.exe" -Arguments @("-ExecutionPolicy", "Bypass", "-File", (Join-Path $repoRoot "scripts\local-health.ps1"), "-EnvFile", $EnvFile, "-Runtime", "Auto") -Label "Live service health"
        Invoke-Checked -FilePath "powershell.exe" -Arguments @("-ExecutionPolicy", "Bypass", "-Command", "Invoke-WebRequest -UseBasicParsing http://localhost:$gatewayPort/health/ready -TimeoutSec 10 | Out-Null; Invoke-WebRequest -UseBasicParsing http://localhost:$webPort/api/health -TimeoutSec 10 | Out-Null") -Label "Live HTTP smoke"
    }

    if (-not $SkipCrossServiceE2E) {
        Invoke-CrossServiceE2E -GatewayPort $gatewayPort
    } else {
        Write-Host "`n== Cross-service Compose E2E ==" -ForegroundColor Cyan
        Write-Host "UNVERIFIED skipped via -SkipCrossServiceE2E; Gateway-to-domain contracts, auth, idempotency and cross-service data are NOT covered by this run." -ForegroundColor DarkYellow
    }

    if (-not $SkipPlaywright) {
        # Assert credentials before any browser work so a missing secret fails in
        # seconds instead of after the fast responsive suite has already run.
        Assert-LiveCredential -Name "LIVE_E2E_ADMIN_EMAIL"
        Assert-LiveCredential -Name "LIVE_E2E_ADMIN_PASSWORD"
        Assert-LiveCredential -Name "LIVE_E2E_NORMAL_EMAIL"
        Assert-LiveCredential -Name "LIVE_E2E_NORMAL_PASSWORD"
        Assert-LiveCredential -Name "LIVE_E2E_TRANSACTIONS_EMAIL"
        Assert-LiveCredential -Name "LIVE_E2E_TRANSACTIONS_PASSWORD"
        Invoke-Checked -FilePath "corepack" -Arguments @("pnpm", "--dir", "apps/web", "test:e2e") -Label "Playwright fast responsive suite"
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
