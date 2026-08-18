$ErrorActionPreference = 'Stop'
$envFile = if ($args.Count -gt 0) { $args[0] } elseif (Test-Path .env) { '.env' } else { '.env.example' }

function Invoke-Utf8PostgresSeed {
    param([string]$SqlPath)

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'docker'
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $arguments = @('compose', '--env-file', $envFile, 'exec', '-T', 'postgres', 'psql', '-U', 'food_user', '-d', 'xone_food', '-v', 'ON_ERROR_STOP=1')
    $startInfo.Arguments = ($arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $sql = [System.IO.File]::ReadAllText((Resolve-Path $SqlPath).Path, [System.Text.Encoding]::UTF8)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($sql)
    $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
    $process.StandardInput.Close()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($stdout) { Write-Output $stdout.TrimEnd() }
    if ($process.ExitCode -ne 0) { throw "Food seed failed: $stderr" }
}

Invoke-Utf8PostgresSeed 'services/food-service/seeds/001_demo_hanoi.sql'
Write-Host 'Deterministic Food demo seed applied.'
docker compose --env-file $envFile exec -T food-service python -m seeds.import_food_csv
if ($LASTEXITCODE -ne 0) { throw 'Food CSV catalog import failed.' }
Write-Host 'Food CSV catalog imported.'
docker compose --env-file $envFile exec -T restaurant-service python -m seeds.seed
if ($LASTEXITCODE -ne 0) { throw 'Restaurant Service seed failed.' }
Write-Host 'Restaurant Service seeds applied.'
docker compose --env-file $envFile exec -T restaurant-service python -m seeds.import_restaurant_csv
if ($LASTEXITCODE -ne 0) { throw 'Restaurant CSV catalog import failed.' }
Write-Host 'Restaurant CSV catalog imported.'
docker compose --env-file $envFile exec -T healthcare-service python -m seeds.seed_medical
if ($LASTEXITCODE -ne 0) { throw 'Healthcare Service seed failed.' }
Write-Host 'Healthcare Service seeds applied.'
docker compose --env-file $envFile exec -T healthcare-service python -m seeds.import_healthcare_csv
if ($LASTEXITCODE -ne 0) { throw 'Healthcare CSV catalog import failed.' }
Write-Host 'Healthcare CSV catalog imported.'
