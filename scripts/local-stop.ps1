param([string]$RuntimeFile = ".local-runtime\processes.json")

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$metadataPath = (Resolve-Path (Join-Path $repoRoot $RuntimeFile) -ErrorAction SilentlyContinue)
if (-not $metadataPath) { Write-Host "No local-dev metadata found; nothing to stop."; exit 0 }

function Get-DescendantIds {
    param([Parameter(Mandatory = $true)][int]$ParentId)
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $ParentId" -ErrorAction SilentlyContinue)
    foreach ($child in $children) {
        Write-Output ([int]$child.ProcessId)
        Get-DescendantIds -ParentId ([int]$child.ProcessId)
    }
}

$parsed = ConvertFrom-Json -InputObject (Get-Content -LiteralPath $metadataPath.Path -Raw)
$records = @($parsed)
foreach ($record in $records) {
    $recordPid = [int]$record.pid
    $root = Get-CimInstance Win32_Process -Filter "ProcessId = $recordPid" -ErrorAction SilentlyContinue
    if (-not $root) { continue }
    if ($root.CommandLine -notlike "*local-process.ps1*") {
        Write-Host "Skipping PID $recordPid for $($record.name): recorded process is no longer the local-process runner." -ForegroundColor DarkYellow
        continue
    }
    $descendants = @(Get-DescendantIds -ParentId $recordPid | Sort-Object -Descending)
    foreach ($childPid in $descendants) {
        if (Get-Process -Id $childPid -ErrorAction SilentlyContinue) { Write-Host "Stopping child PID $childPid of $($record.name)."; Stop-Process -Id $childPid -Force -ErrorAction SilentlyContinue }
    }
    Write-Host "Stopping $($record.name) (PID $recordPid)."
    Stop-Process -Id $recordPid -Force -ErrorAction SilentlyContinue
}
Remove-Item -LiteralPath $metadataPath.Path -Force
Write-Host "Only processes recorded by local-dev were stopped. PostgreSQL was left running."
