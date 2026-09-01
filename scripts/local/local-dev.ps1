param(
    [string]$EnvFile = ".env",
    [switch]$Migrate,
    [switch]$SeedDemo,
    [ValidateRange(20, 600)][int]$WaitSeconds = 90
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$envPath = (Resolve-Path (Join-Path $repoRoot $EnvFile)).Path
$runtimeDir = Join-Path $repoRoot ".local-runtime"
$metadataPath = Join-Path $runtimeDir "processes.json"
$runnerPath = Join-Path $repoRoot "scripts\local\local-process.ps1"
$agentRunnerPath = Join-Path $repoRoot "apps\agent-service\run_local.py"
$started = @()

function Get-EnvironmentValue {
    param([Parameter(Mandatory = $true)][string]$Name)
    $line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } | Select-Object -First 1
    if (-not $line) { throw "$Name is missing from $EnvFile." }
    return ($line -split "=", 2)[1].Trim().Trim('"').Trim("'")
}

function Invoke-Checked {
    param([string]$FilePath, [string[]]$Arguments, [string]$FailureMessage)
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) { throw $FailureMessage }
}

function Port-Owner {
    param([int]$Port)
    try { return Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1 } catch { return $null }
}

function Assert-PortFree {
    param([int]$Port, [string]$Name)
    $owner = Port-Owner $Port
    if (-not $owner) { return }
    $process = Get-Process -Id $owner.OwningProcess -ErrorAction SilentlyContinue
    $processName = if ($process) { $process.ProcessName } else { "unknown" }
    throw "Port $Port for $Name is occupied by PID $($owner.OwningProcess) ($processName). Stop or verify it manually; local-dev will not kill it."
}

function Wait-Http {
    param([string]$Uri, [int]$Seconds)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 3
            if ($response.StatusCode -eq 200) { return }
        } catch { }
        Start-Sleep -Seconds 2
    }
    throw "Timed out waiting for $Uri."
}

function Wait-TcpPort {
    param([int]$Port, [int]$Seconds)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Port-Owner -Port $Port) { return }
        Start-Sleep -Seconds 2
    }
    throw "Timed out waiting for TCP port $Port."
}

function Encode-CommandArguments {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    $json = ConvertTo-Json -InputObject @($Arguments) -Compress
    return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
}

function Start-LocalService {
    param([string]$Name, [string]$Kind, [string]$WorkingDirectory, [string]$FilePath, [string[]]$CommandArguments, [int]$Port, [string]$DatabaseKey)
    Assert-PortFree -Port $Port -Name $Name
    $arguments = @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", $runnerPath, "-EnvFile", $envPath, "-WorkingDirectory", $WorkingDirectory, "-FilePath", $FilePath, "-ServiceKind", $Kind, "-LocalHostMode")
    if ($DatabaseKey) { $arguments += @("-DatabaseKey", $DatabaseKey) }
    $arguments += @("-CommandArgumentsBase64", (Encode-CommandArguments -Arguments $CommandArguments))
    $process = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru
    $record = [pscustomobject]@{ name = $Name; kind = $Kind; pid = $process.Id; port = $Port; started_at = (Get-Date).ToUniversalTime().ToString("o") }
    $script:started += $record
}

Push-Location $repoRoot
try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker is required for the local PostgreSQL container." }
    Invoke-Checked -FilePath "python" -Arguments @("scripts/quality/validate-env-config.py") -FailureMessage "Environment configuration validation failed."
    Invoke-Checked -FilePath "docker" -Arguments @("compose", "--env-file", $envPath, "up", "-d", "postgres") -FailureMessage "PostgreSQL could not be started."
    Wait-TcpPort -Port ([int](Get-EnvironmentValue -Name "POSTGRES_PORT")) -Seconds $WaitSeconds
    if ($Migrate) {
        Write-Host "Migrate requested; applying the repository migration helper before local processes."
        Invoke-Checked -FilePath "powershell.exe" -Arguments @("-ExecutionPolicy", "Bypass", "-File", (Join-Path $repoRoot "scripts\database\migrate.ps1"), "-EnvFile", $envPath, "-LocalProcesses") -FailureMessage "Migration helper failed."
    }
    foreach ($portSpec in @(@(3000, "Gateway"), @(5173, "Web"), @(8001, "Agent"), @(8101, "Ride"), @(8102, "Restaurant"), @(8103, "Healthcare"), @(8104, "Food"))) { Assert-PortFree -Port $portSpec[0] -Name $portSpec[1] }
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "apps\api-gateway\dist\main.js") -PathType Leaf)) { Invoke-Checked -FilePath "corepack" -Arguments @("pnpm", "--dir", "apps/api-gateway", "build") -FailureMessage "Gateway build failed." }
    if (-not (Test-Path -LiteralPath $agentRunnerPath -PathType Leaf)) { throw "Windows-safe Agent runner was not found: $agentRunnerPath" }
    New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
    Start-LocalService -Name "gateway" -Kind "gateway" -WorkingDirectory (Join-Path $repoRoot "apps\api-gateway") -FilePath "node" -CommandArguments @("dist/main.js") -Port 3000 -DatabaseKey "CORE_DATABASE_URL"
    Start-LocalService -Name "agent" -Kind "agent" -WorkingDirectory (Join-Path $repoRoot "apps\agent-service") -FilePath "python" -CommandArguments @($agentRunnerPath, "--host", "127.0.0.1", "--port", "8001") -Port 8001 -DatabaseKey "AGENT_DATABASE_URL"
    Start-LocalService -Name "food" -Kind "food" -WorkingDirectory (Join-Path $repoRoot "services\food-service") -FilePath "python" -CommandArguments @("-m", "uvicorn", "src.main:app", "--host", "127.0.0.1", "--port", "8104") -Port 8104 -DatabaseKey "FOOD_DATABASE_URL"
    Start-LocalService -Name "ride" -Kind "ride" -WorkingDirectory (Join-Path $repoRoot "services\ride-service") -FilePath "python" -CommandArguments @("-m", "uvicorn", "src.main:app", "--host", "127.0.0.1", "--port", "8101") -Port 8101 -DatabaseKey "RIDE_DATABASE_URL"
    Start-LocalService -Name "restaurant" -Kind "restaurant" -WorkingDirectory (Join-Path $repoRoot "services\restaurant-service") -FilePath "python" -CommandArguments @("-m", "uvicorn", "src.main:app", "--host", "127.0.0.1", "--port", "8102") -Port 8102 -DatabaseKey "RESTAURANT_DATABASE_URL"
    Start-LocalService -Name "healthcare" -Kind "healthcare" -WorkingDirectory (Join-Path $repoRoot "services\healthcare-service") -FilePath "python" -CommandArguments @("-m", "uvicorn", "src.main:app", "--host", "127.0.0.1", "--port", "8103") -Port 8103 -DatabaseKey "HEALTHCARE_DATABASE_URL"
    Start-LocalService -Name "web" -Kind "web" -WorkingDirectory (Join-Path $repoRoot "apps\web") -FilePath "corepack" -CommandArguments @("pnpm", "dev") -Port 5173 -DatabaseKey ""
    $started | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $metadataPath -Encoding UTF8
    Wait-Http -Uri "http://localhost:8001/health/ready" -Seconds $WaitSeconds
    Wait-Http -Uri "http://localhost:3000/health/live" -Seconds $WaitSeconds
    Wait-Http -Uri "http://localhost:5173/api/health" -Seconds $WaitSeconds
    Write-Host "Local X-One processes are ready." -ForegroundColor Green
    Write-Host "Web: http://localhost:5173"
    Write-Host "Gateway: http://localhost:3000"
    Write-Host "Metadata: $metadataPath"
    if ($SeedDemo) { Invoke-Checked -FilePath "powershell.exe" -Arguments @("-ExecutionPolicy", "Bypass", "-File", (Join-Path $repoRoot "scripts\database\seed-local.ps1"), $envPath) -FailureMessage "Demo seed failed." }
} catch {
    if ($started.Count -gt 0) { $started | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $metadataPath -Encoding UTF8 }
    throw
} finally {
    Pop-Location
}
