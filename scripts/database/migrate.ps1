param(
    [string]$EnvFile,
    [switch]$LocalProcesses
)

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is required to run migrations.' }
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$requestedEnvFile = if ($EnvFile) { $EnvFile } elseif ($args.Count -gt 0) { $args[0] } elseif (Test-Path -LiteralPath (Join-Path $repoRoot '.env') -PathType Leaf) { '.env' } else { '.env.example' }

function ConvertTo-ProcessArgument {
    param([Parameter(Mandatory = $true)][string]$Value)

    return '"' + $Value.Replace('"', '\"') + '"'
}

function Invoke-Utf8PostgresMigration {
    param(
        [Parameter(Mandatory = $true)][string]$Domain,
        [Parameter(Mandatory = $true)][string]$MigrationPath,
        [Parameter(Mandatory = $true)][string]$DatabaseUser,
        [Parameter(Mandatory = $true)][string]$Database,
        [Parameter(Mandatory = $true)][string]$EnvFile
    )

    $absoluteMigrationPath = Join-Path $repoRoot $MigrationPath
    if (-not (Test-Path -LiteralPath $absoluteMigrationPath -PathType Leaf)) {
        throw "$Domain migration file not found: $MigrationPath"
    }

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'docker'
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $arguments = @(
        'compose', '--env-file', $EnvFile, 'exec', '-T', 'postgres', 'psql',
        '-U', $DatabaseUser, '-d', $Database, '-v', 'ON_ERROR_STOP=1'
    )
    $startInfo.Arguments = ($arguments | ForEach-Object { ConvertTo-ProcessArgument ([string]$_) }) -join ' '

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    $exitCode = -1
    $processStarted = $false
    try {
        if (-not $process.Start()) {
            throw 'The docker process could not be started.'
        }
        $processStarted = $true
        $sql = [System.IO.File]::ReadAllText($absoluteMigrationPath, [System.Text.Encoding]::UTF8)
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($sql)
        $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
        $process.StandardInput.Close()
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        $exitCode = $process.ExitCode
    } catch {
        if ($processStarted -and $process.HasExited) {
            $exitCode = $process.ExitCode
        }
        throw "$Domain migration failed: $MigrationPath (exit code $exitCode). $($_.Exception.Message)"
    }

    if ($stdout) { Write-Output $stdout.TrimEnd() }
    if ($exitCode -ne 0) {
        $detail = if ($stderr) { " $($stderr.Trim())" } else { '' }
        throw "$Domain migration failed: $MigrationPath (exit code $exitCode).$detail"
    }
    Write-Host "$Domain migration applied: $MigrationPath"
}

function Invoke-AlembicMigration {
    param(
        [Parameter(Mandatory = $true)][string]$Service,
        [Parameter(Mandatory = $true)][string]$Domain,
        [Parameter(Mandatory = $true)][string]$MigrationPath,
        [Parameter(Mandatory = $true)][string]$DatabaseKey,
        [Parameter(Mandatory = $true)][string]$EnvFile
    )

    if ($LocalProcesses) {
        if ($Service -eq 'restaurant-service') { $serviceKind = 'restaurant'; $serviceRelativeRoot = 'services\restaurant-service' }
        elseif ($Service -eq 'ride-service') { $serviceKind = 'ride'; $serviceRelativeRoot = 'services\ride-service' }
        else { throw "No local process mapping exists for $Service." }
        $serviceRoot = Join-Path $repoRoot $serviceRelativeRoot
        $argumentsJson = ConvertTo-Json -InputObject @('-m', 'alembic', 'upgrade', 'head') -Compress
        $argumentsBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($argumentsJson))
        & powershell.exe -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'scripts\local-process.ps1') -EnvFile $EnvFile -WorkingDirectory $serviceRoot -FilePath 'python' -ServiceKind $serviceKind -LocalHostMode -DatabaseKey $DatabaseKey -CommandArgumentsBase64 $argumentsBase64
    } else {
        # Use a one-shot container from the freshly built image. `exec` could
        # run the migration inside an older long-lived service container during
        # deployment.
        & docker compose --env-file $EnvFile run --rm --no-deps -T $Service alembic upgrade head
    }
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) { throw "$Domain migration failed: $MigrationPath (alembic upgrade head; exit code $exitCode)." }
    Write-Host "$Domain migration applied: $MigrationPath"
}

Push-Location $repoRoot
try {
    if (-not (Test-Path -LiteralPath $requestedEnvFile -PathType Leaf)) {
        throw "Environment file was not found: $requestedEnvFile"
    }
    $envFile = (Resolve-Path -LiteralPath $requestedEnvFile).Path

    Invoke-Utf8PostgresMigration -Domain 'Core' -MigrationPath 'apps/api-gateway/migrations/001_core_vertical_slice.sql' -DatabaseUser 'core_user' -Database 'xone_core' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Core' -MigrationPath 'apps/api-gateway/migrations/002_core_persistence_slice.sql' -DatabaseUser 'core_user' -Database 'xone_core' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Core' -MigrationPath 'apps/api-gateway/migrations/003_core_atomicity.sql' -DatabaseUser 'core_user' -Database 'xone_core' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Core' -MigrationPath 'apps/api-gateway/migrations/004_core_recovery.sql' -DatabaseUser 'core_user' -Database 'xone_core' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Core' -MigrationPath 'apps/api-gateway/migrations/005_core_payment_provider_saga.sql' -DatabaseUser 'core_user' -Database 'xone_core' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Core' -MigrationPath 'apps/api-gateway/migrations/006_core_payment_recovery_claims.sql' -DatabaseUser 'core_user' -Database 'xone_core' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Core' -MigrationPath 'apps/api-gateway/migrations/007_core_assistant_action_executions.sql' -DatabaseUser 'core_user' -Database 'xone_core' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Core' -MigrationPath 'apps/api-gateway/migrations/008_core_assistant_action_recovery.sql' -DatabaseUser 'core_user' -Database 'xone_core' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Core' -MigrationPath 'apps/api-gateway/migrations/009_core_auth.sql' -DatabaseUser 'core_user' -Database 'xone_core' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Core' -MigrationPath 'apps/api-gateway/migrations/010_core_personal_context.sql' -DatabaseUser 'core_user' -Database 'xone_core' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Core' -MigrationPath 'apps/api-gateway/migrations/011_core_multi_service_workflows.sql' -DatabaseUser 'core_user' -Database 'xone_core' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Core' -MigrationPath 'apps/api-gateway/migrations/012_core_product_ops.sql' -DatabaseUser 'core_user' -Database 'xone_core' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Core' -MigrationPath 'apps/api-gateway/migrations/013_core_admin_support_idempotency.sql' -DatabaseUser 'core_user' -Database 'xone_core' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Core' -MigrationPath 'apps/api-gateway/migrations/014_core_memory_system.sql' -DatabaseUser 'core_user' -Database 'xone_core' -EnvFile $envFile

    Invoke-Utf8PostgresMigration -Domain 'Food' -MigrationPath 'services/food-service/migrations/001_food_vertical_slice.sql' -DatabaseUser 'food_user' -Database 'xone_food' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Food' -MigrationPath 'services/food-service/migrations/002_food_workflow_concurrency.sql' -DatabaseUser 'food_user' -Database 'xone_food' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Food' -MigrationPath 'services/food-service/migrations/003_food_atomicity.sql' -DatabaseUser 'food_user' -Database 'xone_food' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Food' -MigrationPath 'services/food-service/migrations/004_food_authoritative_operations.sql' -DatabaseUser 'food_user' -Database 'xone_food' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Food' -MigrationPath 'services/food-service/migrations/005_food_idempotency_eligibility.sql' -DatabaseUser 'food_user' -Database 'xone_food' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Food' -MigrationPath 'services/food-service/migrations/006_food_catalog_provenance.sql' -DatabaseUser 'food_user' -Database 'xone_food' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Food' -MigrationPath 'services/food-service/migrations/007_food_cart_write_idempotency.sql' -DatabaseUser 'food_user' -Database 'xone_food' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Food' -MigrationPath 'services/food-service/migrations/008_food_catalog_search.sql' -DatabaseUser 'food_user' -Database 'xone_food' -EnvFile $envFile

    Invoke-Utf8PostgresMigration -Domain 'Agent Service' -MigrationPath 'apps/agent-service/migrations/001_agent_workflow_states.sql' -DatabaseUser 'agent_user' -Database 'xone_agent' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Agent Service' -MigrationPath 'apps/agent-service/migrations/002_agent_run_metadata.sql' -DatabaseUser 'agent_user' -Database 'xone_agent' -EnvFile $envFile
    Write-Host 'Core, Agent and Food migrations applied.'

    Invoke-AlembicMigration -Service 'restaurant-service' -Domain 'Restaurant Service' -MigrationPath 'services/restaurant-service/migrations/versions/0003_restaurant_legacy_idempotency_backfill.py' -DatabaseKey 'RESTAURANT_DATABASE_URL' -EnvFile $envFile
    Write-Host 'Restaurant Service migrations applied.'

    Invoke-Utf8PostgresMigration -Domain 'Healthcare Service' -MigrationPath 'services/healthcare-service/migrations/001_healthcare_booking.sql' -DatabaseUser 'healthcare_user' -Database 'xone_healthcare' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Healthcare Service' -MigrationPath 'services/healthcare-service/migrations/002_healthcare_slot_reuse.sql' -DatabaseUser 'healthcare_user' -Database 'xone_healthcare' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Healthcare Service' -MigrationPath 'services/healthcare-service/migrations/003_patient_user_links.sql' -DatabaseUser 'healthcare_user' -Database 'xone_healthcare' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Healthcare Service' -MigrationPath 'services/healthcare-service/migrations/003a_healthcare_legacy_catalog_bridge.sql' -DatabaseUser 'healthcare_user' -Database 'xone_healthcare' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Healthcare Service' -MigrationPath 'services/healthcare-service/migrations/004_healthcare_catalog_provenance.sql' -DatabaseUser 'healthcare_user' -Database 'xone_healthcare' -EnvFile $envFile
    Invoke-Utf8PostgresMigration -Domain 'Healthcare Service' -MigrationPath 'services/healthcare-service/migrations/005_healthcare_catalog_nullable_price.sql' -DatabaseUser 'healthcare_user' -Database 'xone_healthcare' -EnvFile $envFile
    Write-Host 'Healthcare Service migrations applied.'

    Invoke-AlembicMigration -Service 'ride-service' -Domain 'Ride Service' -MigrationPath 'services/ride-service/migrations/versions/20260814_0005_route_geometry.py' -DatabaseKey 'RIDE_DATABASE_URL' -EnvFile $envFile
    Write-Host 'Ride Service migrations applied.'
} finally {
    Pop-Location
}
