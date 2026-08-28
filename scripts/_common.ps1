#Requires -Version 5.1
# Shared helpers for the local runtime scripts. Dot-source this file:
#   . (Join-Path $PSScriptRoot "_common.ps1")

function Resolve-EnvFilePath {
    param(
        [Parameter(Mandatory = $true)][string]$EnvFile,
        [Parameter(Mandatory = $true)][string]$RepoRoot
    )
    if ([IO.Path]::IsPathRooted($EnvFile)) { return $EnvFile }
    return (Join-Path $RepoRoot $EnvFile)
}

function Get-ConfigValue {
    <#
        .SYNOPSIS
        Reads a configuration value from the Compose env file, falling back to the
        process environment and then to an explicit default.
        .NOTES
        Never write the returned value to the host; it may be a secret.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$EnvFilePath,
        [AllowEmptyString()][string]$DefaultValue = ""
    )
    if ($EnvFilePath -and (Test-Path -LiteralPath $EnvFilePath -PathType Leaf)) {
        $line = Get-Content -LiteralPath $EnvFilePath |
            Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
            Select-Object -First 1
        if ($line) {
            $value = ($line -split "=", 2)[1].Trim().Trim('"').Trim("'")
            if ($value) { return $value }
        }
    }
    $fromProcess = [Environment]::GetEnvironmentVariable($Name)
    if ($fromProcess) { return $fromProcess }
    return $DefaultValue
}

function Get-ConfigPort {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$EnvFilePath,
        [Parameter(Mandatory = $true)][int]$DefaultPort
    )
    $value = Get-ConfigValue -Name $Name -EnvFilePath $EnvFilePath
    if ($value -match "^\d+$") { return [int]$value }
    return $DefaultPort
}

function Test-PortListening {
    param([Parameter(Mandatory = $true)][int]$Port)
    try {
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
        return [bool]$listener
    } catch {
        return $false
    }
}

function Get-ComposeContainerId {
    param(
        [Parameter(Mandatory = $true)][string]$Service,
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$EnvFilePath
    )
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return "" }
    $output = & docker compose --project-directory $RepoRoot --env-file $EnvFilePath ps -q $Service 2>$null
    if ($LASTEXITCODE -ne 0) { return "" }
    return ([string]($output | Select-Object -First 1)).Trim()
}

function Get-ComposeAppServices {
    return @("api-gateway", "web", "agent-service", "ride-service", "restaurant-service", "healthcare-service", "food-service")
}

function Get-RunningComposeContainers {
    <#
        .SYNOPSIS
        Returns a hashtable of compose service name -> container id for the
        application services that currently have a container.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$EnvFilePath
    )
    $found = @{}
    foreach ($service in (Get-ComposeAppServices)) {
        $containerId = Get-ComposeContainerId -Service $service -RepoRoot $RepoRoot -EnvFilePath $EnvFilePath
        if ($containerId) { $found[$service] = $containerId }
    }
    return $found
}

function Get-LiveLocalProcessRecords {
    <#
        .SYNOPSIS
        Returns the local-dev process records whose PID is alive AND whose recorded
        port is actually listening. Requiring both prevents a stale or partially
        written processes.json from masking a Docker Compose runtime.
    #>
    param([Parameter(Mandatory = $true)][string]$MetadataPath)
    if (-not (Test-Path -LiteralPath $MetadataPath -PathType Leaf)) { return @() }
    try {
        $parsed = ConvertFrom-Json -InputObject (Get-Content -LiteralPath $MetadataPath -Raw)
    } catch {
        return @()
    }
    $live = @()
    foreach ($record in @($parsed)) {
        $recordPid = 0
        if (-not [int]::TryParse([string]$record.pid, [ref]$recordPid)) { continue }
        if (-not (Get-Process -Id $recordPid -ErrorAction SilentlyContinue)) { continue }
        $recordPort = 0
        if ([int]::TryParse([string]$record.port, [ref]$recordPort) -and $recordPort -gt 0) {
            if (-not (Test-PortListening -Port $recordPort)) { continue }
        }
        $live += $record
    }
    return $live
}
