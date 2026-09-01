param(
    [string]$EnvFile = ".env",
    [string[]]$ActorId = @(),
    [ValidatePattern("^[A-Za-z0-9+._-]{1,80}$")][string]$EmailPrefix = "e2e+",
    [switch]$IncludeCatalog,
    [switch]$ConfirmReset
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$envPath = (Resolve-Path (Join-Path $repoRoot $EnvFile)).Path

function Quote-Argument {
    param([Parameter(Mandatory = $true)][string]$Value)
    return '"' + $Value.Replace('"', '\"') + '"'
}

function Invoke-PostgresSql {
    param(
        [Parameter(Mandatory = $true)][string]$DatabaseUser,
        [Parameter(Mandatory = $true)][string]$Database,
        [Parameter(Mandatory = $true)][string]$Sql,
        [switch]$Capture
    )
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = "docker"
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $arguments = @("compose", "--env-file", $envPath, "exec", "-T", "postgres", "psql", "-At", "-v", "ON_ERROR_STOP=1", "-U", $DatabaseUser, "-d", $Database)
    $startInfo.Arguments = ($arguments | ForEach-Object { Quote-Argument ([string]$_) }) -join " "
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Sql)
    $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
    $process.StandardInput.Close()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "PostgreSQL reset query failed for $Database. $($stderr.Trim())" }
    if ($Capture) { return $stdout.Trim() }
    if ($stdout.Trim()) { Write-Host $stdout.Trim() }
}

function SqlLiteral {
    param([Parameter(Mandatory = $true)][string]$Value)
    return "'$(($Value -replace "'", "''"))'"
}

if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) { throw "Environment file was not found: $EnvFile" }
$explicitActorIds = @($ActorId | Where-Object { $_ } | ForEach-Object {
    if ($_ -notmatch '^[A-Za-z0-9_-]{1,128}$') { throw "ActorId contains an unsafe value." }
    $_
})
$actorQuery = "SELECT id::text FROM users WHERE email LIKE $(SqlLiteral -Value ($EmailPrefix + '%')) ORDER BY id;"
$queriedActorIds = @((Invoke-PostgresSql -DatabaseUser "core_user" -Database "xone_core" -Sql $actorQuery -Capture) -split "\r?\n" | Where-Object { $_ })
$actorIds = @($explicitActorIds + $queriedActorIds | Sort-Object -Unique)

if ($actorIds.Count -eq 0) {
    Write-Host "No actor-owned demo records matched EmailPrefix '$EmailPrefix' or the supplied ActorId values. Nothing changed."
    exit 0
}

$actorArray = "ARRAY[$(($actorIds | ForEach-Object { SqlLiteral $_ }) -join ',')]::text[]"
Write-Host "Matched $($actorIds.Count) actor id(s)."
Write-Host "Default reset scope: actor-owned mutable data only; catalogs and dataset metadata are preserved."
if ($IncludeCatalog) { Write-Host "Explicit catalog scope requested: Food, Restaurant and Healthcare catalog rows will also be deleted." -ForegroundColor Yellow }
if (-not $ConfirmReset) {
    Write-Host "Dry run only. Re-run with -ConfirmReset to apply the scoped reset." -ForegroundColor Yellow
    exit 0
}

Push-Location $repoRoot
try {
    Invoke-PostgresSql -DatabaseUser "core_user" -Database "xone_core" -Sql @"
BEGIN;
DELETE FROM support_ticket_events WHERE ticket_id IN (SELECT id FROM support_tickets WHERE actor_id = ANY($actorArray));
DELETE FROM support_tickets WHERE actor_id = ANY($actorArray);
DELETE FROM notifications WHERE actor_id = ANY($actorArray);
DELETE FROM user_favorites WHERE actor_id = ANY($actorArray);
DELETE FROM service_feedback WHERE actor_id = ANY($actorArray);
DELETE FROM user_addresses WHERE actor_id = ANY($actorArray);
DELETE FROM multi_service_workflows WHERE actor_id = ANY($actorArray);
DELETE FROM conversation_states WHERE actor_id = ANY($actorArray);
DELETE FROM payment_refunds WHERE actor_id = ANY($actorArray);
DELETE FROM receipts WHERE payment_id IN (SELECT id FROM payments WHERE actor_id = ANY($actorArray));
DELETE FROM payments WHERE actor_id = ANY($actorArray);
DELETE FROM confirmations WHERE actor_id = ANY($actorArray);
DELETE FROM audit_events WHERE actor_id = ANY($actorArray);
DELETE FROM user_sessions WHERE user_id::text = ANY($actorArray);
DELETE FROM password_reset_tokens WHERE user_id::text = ANY($actorArray);
DELETE FROM user_credentials WHERE user_id::text = ANY($actorArray);
DELETE FROM users WHERE id::text = ANY($actorArray);
COMMIT;
"@

    Invoke-PostgresSql -DatabaseUser "food_user" -Database "xone_food" -Sql @"
BEGIN;
DELETE FROM food_order_operations WHERE order_id IN (SELECT id FROM food_orders WHERE user_id = ANY($actorArray));
DELETE FROM food_voucher_redemptions WHERE user_id = ANY($actorArray);
DELETE FROM food_order_status_events WHERE order_id IN (SELECT id FROM food_orders WHERE user_id = ANY($actorArray));
UPDATE food_drivers SET available = TRUE, assigned_order_id = NULL, updated_at = now() WHERE assigned_order_id IN (SELECT id FROM food_orders WHERE user_id = ANY($actorArray));
DELETE FROM food_orders WHERE user_id = ANY($actorArray);
DELETE FROM food_carts WHERE user_id = ANY($actorArray);
$(if ($IncludeCatalog) { 'DELETE FROM food_drivers; DELETE FROM food_catalog;' } else { '' })
COMMIT;
"@

    Invoke-PostgresSql -DatabaseUser "ride_user" -Database "xone_ride" -Sql @"
BEGIN;
WITH affected AS (SELECT driver_id FROM ride_bookings WHERE actor_id = ANY($actorArray) AND driver_id IS NOT NULL)
UPDATE ride_drivers SET availability_status = 'AVAILABLE', updated_at = now() WHERE id IN (SELECT driver_id FROM affected);
DELETE FROM ride_tracking_events WHERE booking_id IN (SELECT id FROM ride_bookings WHERE actor_id = ANY($actorArray));
DELETE FROM ride_confirmation_consumptions WHERE actor_id = ANY($actorArray);
DELETE FROM ride_idempotency_records WHERE actor_id = ANY($actorArray);
DELETE FROM ride_bookings WHERE actor_id = ANY($actorArray);
DELETE FROM ride_quotes WHERE actor_id = ANY($actorArray);
COMMIT;
"@

    Invoke-PostgresSql -DatabaseUser "restaurant_user" -Database "xone_restaurant" -Sql @"
BEGIN;
DELETE FROM reservation_events WHERE actor_id = ANY($actorArray);
DELETE FROM reservation_holds WHERE actor_id = ANY($actorArray);
DELETE FROM reservations WHERE actor_id = ANY($actorArray);
DELETE FROM restaurant_idempotency_records WHERE actor_id = ANY($actorArray);
$(if ($IncludeCatalog) { 'DELETE FROM restaurant_opening_hours; DELETE FROM restaurant_tables; DELETE FROM restaurants;' } else { '' })
COMMIT;
"@

    Invoke-PostgresSql -DatabaseUser "healthcare_user" -Database "xone_healthcare" -Sql @"
BEGIN;
DELETE FROM audit_logs WHERE appointment_id IN (SELECT id FROM appointments WHERE actor_id = ANY($actorArray));
DELETE FROM appointments WHERE actor_id = ANY($actorArray);
WITH actor_patients AS (SELECT patient_id FROM patient_user_links WHERE actor_user_id = ANY($actorArray)),
deleted_links AS (DELETE FROM patient_user_links WHERE actor_user_id = ANY($actorArray) RETURNING patient_id)
DELETE FROM patients
WHERE id IN (SELECT patient_id FROM actor_patients)
  AND id IN (SELECT patient_id FROM deleted_links)
  AND NOT EXISTS (SELECT 1 FROM patient_user_links WHERE patient_id = patients.id)
  AND NOT EXISTS (SELECT 1 FROM appointments WHERE patient_id = patients.id);
DELETE FROM idempotency_records WHERE actor_id = ANY($actorArray);
$(if ($IncludeCatalog) { 'DELETE FROM time_slots; DELETE FROM doctors; DELETE FROM departments; DELETE FROM healthcare_facilities; DELETE FROM catalog_dataset_versions;' } else { '' })
COMMIT;
"@
    Write-Host "Scoped demo reset completed. Catalogs were $(if ($IncludeCatalog) { 'included by explicit request' } else { 'preserved' })." -ForegroundColor Green
} finally {
    Pop-Location
}
