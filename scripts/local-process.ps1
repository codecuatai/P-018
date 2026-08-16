param(
    [Parameter(Mandatory = $true)][string]$EnvFile,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string]$DatabaseKey,
    [ValidateSet("gateway", "agent", "food", "ride", "restaurant", "healthcare", "web")][string]$ServiceKind,
    [switch]$LocalHostMode,
    [Parameter(Mandatory = $true)][string]$CommandArgumentsBase64
)

$ErrorActionPreference = "Stop"

function Import-LocalEnvironment {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Environment file was not found: $Path" }
    foreach ($entry in Get-Content -LiteralPath $Path) {
        $line = $entry.Trim()
        if (-not $line -or $line.StartsWith("#")) { continue }
        $separator = $line.IndexOf("=")
        if ($separator -lt 1) { continue }
        $name = $line.Substring(0, $separator).Trim()
        $value = $line.Substring($separator + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

function Set-LocalServiceEnvironment {
    if ($LocalHostMode) {
        foreach ($name in @("AGENT_SERVICE_URL", "RIDE_SERVICE_URL", "RESTAURANT_SERVICE_URL", "HEALTHCARE_SERVICE_URL", "FOOD_SERVICE_URL", "API_GATEWAY_INTERNAL_URL", "CORE_DATABASE_URL", "AGENT_DATABASE_URL", "RIDE_DATABASE_URL", "RESTAURANT_DATABASE_URL", "HEALTHCARE_DATABASE_URL", "FOOD_DATABASE_URL")) {
            $current = [Environment]::GetEnvironmentVariable($name, "Process")
            if ($current) {
                $current = $current -replace "(?<=://)(postgres|api-gateway|agent-service|ride-service|restaurant-service|healthcare-service|food-service)(?=[:/])", "localhost"
                $current = $current -replace "(?<=@)(postgres)(?=[:/])", "localhost"
                [Environment]::SetEnvironmentVariable($name, $current, "Process")
            }
        }
        [Environment]::SetEnvironmentVariable("API_GATEWAY_INTERNAL_URL", "http://localhost:3000", "Process")
    }
    if ($DatabaseKey) {
        $databaseUrl = [Environment]::GetEnvironmentVariable($DatabaseKey, "Process")
        if (-not $databaseUrl) { throw "$DatabaseKey is missing from the environment file." }
        if ($LocalHostMode) { $databaseUrl = $databaseUrl -replace "(?<=@)postgres(?=[:/])", "localhost" }
        [Environment]::SetEnvironmentVariable("DATABASE_URL", $databaseUrl, "Process")
    }
    switch ($ServiceKind) {
        "gateway" { [Environment]::SetEnvironmentVariable("PORT", [Environment]::GetEnvironmentVariable("API_GATEWAY_PORT", "Process"), "Process") }
        "agent" {
            [Environment]::SetEnvironmentVariable("SERVICE_PORT", [Environment]::GetEnvironmentVariable("AGENT_SERVICE_PORT", "Process"), "Process")
            [Environment]::SetEnvironmentVariable("PORT", [Environment]::GetEnvironmentVariable("AGENT_SERVICE_PORT", "Process"), "Process")
            [Environment]::SetEnvironmentVariable("CORS_ORIGINS", [Environment]::GetEnvironmentVariable("AGENT_CORS_ORIGINS", "Process"), "Process")
        }
        "food" {
            [Environment]::SetEnvironmentVariable("SERVICE_PORT", [Environment]::GetEnvironmentVariable("FOOD_SERVICE_PORT", "Process"), "Process")
            [Environment]::SetEnvironmentVariable("PERSISTENCE", [Environment]::GetEnvironmentVariable("FOOD_PERSISTENCE", "Process"), "Process")
        }
        "ride" {
            [Environment]::SetEnvironmentVariable("SERVICE_PORT", [Environment]::GetEnvironmentVariable("RIDE_SERVICE_PORT", "Process"), "Process")
            [Environment]::SetEnvironmentVariable("TRACKING_TIME_SCALE", [Environment]::GetEnvironmentVariable("RIDE_TRACKING_TIME_SCALE", "Process"), "Process")
        }
        "restaurant" { [Environment]::SetEnvironmentVariable("SERVICE_PORT", [Environment]::GetEnvironmentVariable("RESTAURANT_SERVICE_PORT", "Process"), "Process") }
        "healthcare" { [Environment]::SetEnvironmentVariable("SERVICE_PORT", [Environment]::GetEnvironmentVariable("HEALTHCARE_SERVICE_PORT", "Process"), "Process") }
    }
}

Import-LocalEnvironment -Path (Resolve-Path -LiteralPath $EnvFile).Path
Set-LocalServiceEnvironment
Set-Location -LiteralPath (Resolve-Path -LiteralPath $WorkingDirectory).Path
$decodedArgumentsJson = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($CommandArgumentsBase64))
$decodedArguments = ConvertFrom-Json -InputObject $decodedArgumentsJson
$commandArguments = [System.Collections.Generic.List[string]]::new()
foreach ($argument in $decodedArguments) { [void]$commandArguments.Add([string]$argument) }
& $FilePath $commandArguments.ToArray()
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) { Write-Error "Local $ServiceKind process exited with code $exitCode." }
exit $exitCode
