param(
    [string]$RuntimeFile = ".local-runtime\processes.json",
    [string]$EnvFile = ".env",
    [ValidateSet("Auto", "Local", "Compose", "Host", "Docker")]
    [string]$Runtime = "Auto"
)

$ErrorActionPreference = "Continue"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $PSScriptRoot "_common.ps1")

$metadataPath = Join-Path $repoRoot $RuntimeFile
$composeEnvFile = Resolve-EnvFilePath -EnvFile $EnvFile -RepoRoot $repoRoot
$failed = $false

$gatewayPort = Get-ConfigPort -Name "API_GATEWAY_PORT" -EnvFilePath $composeEnvFile -DefaultPort 3000
$webPort = Get-ConfigPort -Name "WEB_PORT" -EnvFilePath $composeEnvFile -DefaultPort 5173
$agentPort = Get-ConfigPort -Name "AGENT_SERVICE_PORT" -EnvFilePath $composeEnvFile -DefaultPort 8001
$ridePort = Get-ConfigPort -Name "RIDE_SERVICE_PORT" -EnvFilePath $composeEnvFile -DefaultPort 8101
$restaurantPort = Get-ConfigPort -Name "RESTAURANT_SERVICE_PORT" -EnvFilePath $composeEnvFile -DefaultPort 8102
$healthcarePort = Get-ConfigPort -Name "HEALTHCARE_SERVICE_PORT" -EnvFilePath $composeEnvFile -DefaultPort 8103
$foodPort = Get-ConfigPort -Name "FOOD_SERVICE_PORT" -EnvFilePath $composeEnvFile -DefaultPort 8104

$internalServices = @("agent-service", "ride-service", "restaurant-service", "healthcare-service", "food-service")
$composeContainers = Get-RunningComposeContainers -RepoRoot $repoRoot -EnvFilePath $composeEnvFile
$expectedComposeCount = (Get-ComposeAppServices).Count
$composeIsComplete = $composeContainers.Count -ge $expectedComposeCount
$hasCompose = $composeContainers.Count -gt 0

# A live PID whose recorded port is actually listening is the only evidence accepted
# for the direct-process runtime, so a stale processes.json cannot mask a Compose stack.
$aliveLocalRecords = @(Get-LiveLocalProcessRecords -MetadataPath $metadataPath)
$aliveLocalCount = $aliveLocalRecords.Count

$targetRuntime = switch ($Runtime) {
    "Host" { "Local" }
    "Docker" { "Compose" }
    "Local" { "Local" }
    "Compose" { "Compose" }
    "Auto" {
        if ($composeIsComplete) {
            "Compose"
        } elseif ($aliveLocalCount -ge 5) {
            "Local"
        } elseif ($hasCompose) {
            "Compose"
        } elseif ($aliveLocalCount -gt 0) {
            "Local"
        } else {
            "None"
        }
    }
}

function Invoke-HttpCheck {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Uri
    )
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 5
        if ($response.StatusCode -ne 200) { throw "HTTP $($response.StatusCode)" }
        Write-Host "PASS $Name $Uri" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "FAIL $Name $Uri" -ForegroundColor Red
        return $false
    }
}

if ($targetRuntime -eq "None") {
    Write-Host "WARN No active X-One runtime detected (no live local process in $RuntimeFile and no running Docker Compose containers)." -ForegroundColor DarkYellow
    Write-Host "     Start local processes with 'scripts\local-dev.ps1' or Docker Compose with 'scripts\start-all.ps1'." -ForegroundColor DarkGray
    exit 1
}

if ($targetRuntime -eq "Compose") {
    Write-Host "INFO Docker Compose runtime; internal services are verified through container health." -ForegroundColor Cyan
    if (-not $composeIsComplete) {
        Write-Host "WARN Only $($composeContainers.Count) of $expectedComposeCount application containers exist." -ForegroundColor DarkYellow
    }

    # Only the Gateway and Web are published to the host; the domain services stay on
    # the internal Compose network, so probing localhost for them is meaningless.
    if (-not (Invoke-HttpCheck -Name "gateway" -Uri "http://localhost:$gatewayPort/health/live")) { $failed = $true }
    if (-not (Invoke-HttpCheck -Name "web" -Uri "http://localhost:$webPort/api/health")) { $failed = $true }

    foreach ($service in $internalServices) {
        $name = $service -replace "-service$", ""
        $containerId = $composeContainers[$service]
        if (-not $containerId) {
            Write-Host "FAIL $name Docker container is missing" -ForegroundColor Red
            $failed = $true
            continue
        }
        $state = ([string](& docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' $containerId 2>$null)).Trim()
        if ($state -eq "running|healthy") {
            Write-Host "PASS $name Docker container healthy" -ForegroundColor Green
        } else {
            Write-Host "FAIL $name Docker container $state" -ForegroundColor Red
            $failed = $true
        }
    }

    # /health/ready is the only probe proving the Gateway can reach the internal
    # services; container health alone only proves each service can reach itself.
    if (-not (Invoke-HttpCheck -Name "gateway-ready" -Uri "http://localhost:$gatewayPort/health/ready")) { $failed = $true }
    Write-Host "INFO Docker Compose runtime does not use local process metadata." -ForegroundColor DarkGray
} else {
    Write-Host "INFO Local process runtime detected; checking localhost HTTP probes and PID metadata." -ForegroundColor Cyan

    $localChecks = @(
        @{ name = "gateway"; uri = "http://localhost:$gatewayPort/health/live" },
        @{ name = "web"; uri = "http://localhost:$webPort/api/health" },
        @{ name = "agent"; uri = "http://localhost:$agentPort/health/live" },
        @{ name = "ride"; uri = "http://localhost:$ridePort/health/live" },
        @{ name = "restaurant"; uri = "http://localhost:$restaurantPort/health/live" },
        @{ name = "healthcare"; uri = "http://localhost:$healthcarePort/health/live" },
        @{ name = "food"; uri = "http://localhost:$foodPort/health/live" }
    )
    foreach ($check in $localChecks) {
        if (-not (Invoke-HttpCheck -Name $check.name -Uri $check.uri)) { $failed = $true }
    }

    if (Test-Path -LiteralPath $metadataPath -PathType Leaf) {
        $records = @()
        try {
            $records = @(ConvertFrom-Json -InputObject (Get-Content -LiteralPath $metadataPath -Raw))
        } catch {
            Write-Host "FAIL local-dev metadata at $RuntimeFile is not valid JSON." -ForegroundColor Red
            $failed = $true
        }
        foreach ($record in $records) {
            $recordPid = [int]$record.pid
            if (Get-Process -Id $recordPid -ErrorAction SilentlyContinue) {
                Write-Host "PID  $($record.name) $recordPid"
            } else {
                Write-Host "DEAD $($record.name) $recordPid" -ForegroundColor Red
                $failed = $true
            }
        }
    } else {
        Write-Host "WARN local-dev metadata is missing." -ForegroundColor DarkYellow
    }
}

if ($failed) { exit 1 }
