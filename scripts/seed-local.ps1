param([string]$EnvFile = ".env")

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envPath = (Resolve-Path (Join-Path $repoRoot $EnvFile)).Path

function Invoke-Utf8PostgresSeed {
    param([Parameter(Mandatory = $true)][string]$SqlPath)

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = "docker"
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $arguments = @("compose", "--env-file", $envPath, "exec", "-T", "postgres", "psql", "-U", "food_user", "-d", "xone_food", "-v", "ON_ERROR_STOP=1")
    $startInfo.Arguments = ($arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join " "

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $sql = [System.IO.File]::ReadAllText((Resolve-Path (Join-Path $repoRoot $SqlPath)).Path, [System.Text.Encoding]::UTF8)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($sql)
    $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
    $process.StandardInput.Close()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($stdout) { Write-Output $stdout.TrimEnd() }
    if ($process.ExitCode -ne 0) { throw "Food seed failed: $($stderr.Trim())" }
}

function Invoke-LocalPython {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("ride", "restaurant", "healthcare")][string]$Kind,
        [Parameter(Mandatory = $true)][string]$DatabaseKey,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $argumentsJson = ConvertTo-Json -InputObject @($Arguments) -Compress
    $argumentsBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($argumentsJson))
    & powershell.exe -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts\local-process.ps1") -EnvFile $envPath -WorkingDirectory (Join-Path $repoRoot $WorkingDirectory) -FilePath "python" -ServiceKind $Kind -LocalHostMode -DatabaseKey $DatabaseKey -CommandArgumentsBase64 $argumentsBase64
    if ($LASTEXITCODE -ne 0) { throw "$Kind local seed failed." }
}

Push-Location $repoRoot
try {
    if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) { throw "Environment file was not found: $EnvFile" }
    Invoke-Utf8PostgresSeed -SqlPath "services/food-service/seeds/001_demo_hanoi.sql"
    Invoke-LocalPython -Kind "restaurant" -DatabaseKey "RESTAURANT_DATABASE_URL" -WorkingDirectory "services\restaurant-service" -Arguments @("-m", "seeds.seed")
    Invoke-LocalPython -Kind "healthcare" -DatabaseKey "HEALTHCARE_DATABASE_URL" -WorkingDirectory "services\healthcare-service" -Arguments @("-m", "seeds.seed_demo_catalog")
    Invoke-LocalPython -Kind "ride" -DatabaseKey "RIDE_DATABASE_URL" -WorkingDirectory "services\ride-service" -Arguments @("seeds/seed_demo_drivers.py")
    Write-Host "Deterministic local demo data seeded additively. Existing catalog, bookings, and imported rows were preserved."
} finally {
    Pop-Location
}
