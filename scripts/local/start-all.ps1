param(
    [switch]$SeedDemo,
    [string]$EnvFile = ".env",
    [ValidateRange(30, 900)]
    [int]$TimeoutSeconds = 180,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ComposeArgs
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$script:ComposeEnvFile = $null

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [Parameter(Mandatory = $true)]
        [string]$FailureMessage
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
}

function Get-ComposeContainerHealth {
    param([Parameter(Mandatory = $true)][string]$Service)

    $containerId = (& docker compose --env-file $script:ComposeEnvFile ps -q $Service 2>$null).Trim()
    if (-not $containerId) {
        return "missing"
    }
    $state = (& docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' $containerId 2>$null).Trim()
    if (-not $state) {
        return "missing"
    }
    $parts = $state -split "\|", 2
    if ($parts.Count -lt 2) {
        return $state
    }
    return "$($parts[0])/$($parts[1])"
}

function Wait-ComposeHealthy {
    param(
        [Parameter(Mandatory = $true)][string[]]$Services,
        [Parameter(Mandatory = $true)][int]$Seconds
    )

    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        $failed = @()
        $pending = @()
        foreach ($service in $Services) {
            $health = Get-ComposeContainerHealth -Service $service
            if ($health -match "^(exited|dead)/" -or $health -eq "missing") {
                $failed += "$service=$health"
            } elseif ($health -ne "running/healthy") {
                $pending += "$service=$health"
            }
        }
        if ($failed.Count -gt 0) {
            throw "Required service failed before readiness: $($failed -join ', ')"
        }
        if ($pending.Count -eq 0) {
            return
        }
        Write-Host "  Waiting for required services: $($pending -join ', ')" -ForegroundColor DarkYellow
        Start-Sleep -Seconds 2
    }
    $snapshot = $Services | ForEach-Object { "$_=$(Get-ComposeContainerHealth -Service $_)" }
    throw "Timed out waiting for required services: $($snapshot -join ', ')"
}

function Test-HttpReady {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [int]$TimeoutSec = 10
    )

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec $TimeoutSec
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

Push-Location $repoRoot
try {
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "          X-One Multi-Service Launcher (PowerShell)         " -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan

    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "Docker is required to start the local stack."
    }

    if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
        if ($EnvFile -ne ".env") {
            throw "Requested env file was not found: $EnvFile"
        }
        Write-Host "[1/7] .env not found. Generating it from .env.example..." -ForegroundColor Yellow
        if (Test-Path "./scripts/setup/setup-env.ps1") {
            Invoke-CheckedCommand -FilePath "./scripts/setup/setup-env.ps1" -Arguments @() -FailureMessage "Environment file setup failed."
        } else {
            Copy-Item ".env.example" ".env"
        }
    } else {
        Write-Host "[1/7] Environment file detected: $EnvFile" -ForegroundColor Green
    }
    if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
        throw "Environment file was not found: $EnvFile"
    }
    $script:ComposeEnvFile = (Resolve-Path -LiteralPath $EnvFile).Path

    Write-Host "[2/7] Validating environment configuration..." -ForegroundColor Yellow
    Invoke-CheckedCommand -FilePath "python" -Arguments @("scripts/quality/validate-env-config.py") -FailureMessage "Environment configuration validation failed."

    Write-Host "[3/7] Building and starting X-One services..." -ForegroundColor Green
    $composeForwardedArguments = @($ComposeArgs | Where-Object { $_ -and -not [string]::IsNullOrWhiteSpace([string]$_) })
    $composeUpArguments = @("compose", "--env-file", $script:ComposeEnvFile, "up", "--build", "-d") + $composeForwardedArguments
    Invoke-CheckedCommand -FilePath "docker" -Arguments $composeUpArguments -FailureMessage "Docker Compose could not start the backend services."

    $requiredServices = @("postgres", "api-gateway", "web", "agent-service", "ride-service", "restaurant-service", "healthcare-service", "food-service")
    Write-Host "[4/7] Waiting for PostgreSQL and application containers to become healthy..." -ForegroundColor Yellow
    Wait-ComposeHealthy -Services $requiredServices -Seconds $TimeoutSeconds

    Write-Host "[5/7] Applying idempotent migrations..." -ForegroundColor Yellow
    Invoke-CheckedCommand -FilePath "./scripts/database/migrate.ps1" -Arguments @($script:ComposeEnvFile) -FailureMessage "Database migration failed."
    if ($SeedDemo) {
        Write-Host "  Demo seed mode enabled; applying deterministic demo data explicitly." -ForegroundColor Yellow
        Invoke-CheckedCommand -FilePath "./scripts/database/seed.ps1" -Arguments @($script:ComposeEnvFile) -FailureMessage "Demo seed failed."
    } else {
        Write-Host "  Normal restart: demo seeds were not run." -ForegroundColor DarkGray
    }

    Write-Host "[6/7] Verifying backend health after migrations..." -ForegroundColor Yellow
    Wait-ComposeHealthy -Services $requiredServices -Seconds $TimeoutSeconds
    $gatewayBinding = (& docker compose --env-file $script:ComposeEnvFile port api-gateway 3000 2>$null).Trim()
    if (-not $gatewayBinding) {
        throw "API Gateway host binding is unavailable."
    }
    $gatewayAddress = $gatewayBinding -replace '^\[::\]:', 'localhost:' -replace '^0\.0\.0\.0:', 'localhost:' -replace '^127\.0\.0\.1:', 'localhost:'
    $gatewayUrl = "http://$gatewayAddress"
    if (-not (Test-HttpReady -Uri "$gatewayUrl/health/ready")) {
        throw "API Gateway readiness check failed at $gatewayUrl/health/ready."
    }

    Write-Host "[7/7] Verifying Next.js Web UI..." -ForegroundColor Cyan
    $webBinding = (& docker compose --env-file $script:ComposeEnvFile port web 3000 2>$null).Trim()
    if (-not $webBinding) { throw "Web host binding is unavailable." }
    $webAddress = $webBinding -replace '^\[::\]:', 'localhost:' -replace '^0\.0\.0\.0:', 'localhost:' -replace '^127\.0\.0\.1:', 'localhost:'
    $webUrl = "http://$webAddress"
    if (-not (Test-HttpReady -Uri "$webUrl/api/health")) { throw "Web UI readiness check failed at $webUrl/api/health." }

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  ALL REQUIRED SERVICES ARE HEALTHY AND WEB IS READY       " -ForegroundColor Green
    Write-Host "  Web:     $webUrl                              " -ForegroundColor Green
    Write-Host "  Gateway: $gatewayUrl                              " -ForegroundColor Cyan
    Write-Host "  Agent/domain services: internal Compose DNS only         " -ForegroundColor DarkGray
    Write-Host "============================================================" -ForegroundColor Cyan
} catch {
    Write-Error "X-One startup failed: $($_.Exception.Message)"
    exit 1
} finally {
    Pop-Location
}
