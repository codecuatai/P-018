param([string]$RuntimeFile = ".local-runtime\processes.json")

$ErrorActionPreference = "Continue"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$metadataPath = Join-Path $repoRoot $RuntimeFile
$checks = @(
    @{ name = "gateway"; uri = "http://localhost:3000/health/live" },
    @{ name = "web"; uri = "http://localhost:5173/api/health" },
    @{ name = "agent"; uri = "http://localhost:8001/health/live" },
    @{ name = "ride"; uri = "http://localhost:8101/health/live" },
    @{ name = "restaurant"; uri = "http://localhost:8102/health/live" },
    @{ name = "healthcare"; uri = "http://localhost:8103/health/live" },
    @{ name = "food"; uri = "http://localhost:8104/health/live" }
)
$failed = $false
foreach ($check in $checks) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $check.uri -TimeoutSec 5
        if ($response.StatusCode -eq 200) { Write-Host "PASS $($check.name) $($check.uri)" -ForegroundColor Green } else { throw "HTTP $($response.StatusCode)" }
    } catch { Write-Host "FAIL $($check.name) $($check.uri)" -ForegroundColor Red; $failed = $true }
}
if (Test-Path -LiteralPath $metadataPath -PathType Leaf) {
    $parsed = ConvertFrom-Json -InputObject (Get-Content -LiteralPath $metadataPath -Raw)
    $records = @($parsed)
    foreach ($record in $records) { $recordPid = [int]$record.pid; $process = Get-Process -Id $recordPid -ErrorAction SilentlyContinue; if ($process) { Write-Host "PID  $($record.name) $recordPid" } else { Write-Host "DEAD $($record.name) $recordPid" -ForegroundColor Red; $failed = $true } }
} else { Write-Host "WARN local-dev metadata is missing." -ForegroundColor DarkYellow }
if ($failed) { exit 1 }
