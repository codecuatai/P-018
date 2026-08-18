param(
    [int]$Samples = 10
)

$ErrorActionPreference = "Stop"
if ($Samples -lt 5 -or $Samples -gt 50) { throw "Samples must be between 5 and 50." }

$baseUrl = "http://localhost:3000"
$webOrigin = "http://localhost:5173"
$perfEmail = [Environment]::GetEnvironmentVariable("PERF_SMOKE_EMAIL")
$perfPassword = [Environment]::GetEnvironmentVariable("PERF_SMOKE_PASSWORD")
$perfAdminEmail = [Environment]::GetEnvironmentVariable("PERF_SMOKE_ADMIN_EMAIL")
$perfAdminPassword = [Environment]::GetEnvironmentVariable("PERF_SMOKE_ADMIN_PASSWORD")
if (-not $perfEmail -or -not $perfPassword -or -not $perfAdminEmail -or -not $perfAdminPassword) {
    throw "PERF_SMOKE_EMAIL/PASSWORD and PERF_SMOKE_ADMIN_EMAIL/PASSWORD must be set in the calling shell."
}

$script:measurements = @{}

function Invoke-Api {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("GET", "POST")][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [hashtable]$Headers = @{},
        [string]$Body
    )
    $request = @{ Method = $Method; Uri = "$baseUrl$Path"; Headers = $Headers; UseBasicParsing = $true }
    if ($Body) { $request.ContentType = "application/json"; $request.Body = $Body }
    return Invoke-RestMethod @request
}

function Login-Api {
    param([Parameter(Mandatory = $true)][string]$Email, [Parameter(Mandatory = $true)][string]$Password)
    $body = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
    $result = Invoke-Api -Method POST -Path "/api/v1/auth/login" -Headers @{ Origin = $webOrigin } -Body $body
    return [string]$result.data.access_token
}

function Measure-Api {
    param([Parameter(Mandatory = $true)][string]$Name, [Parameter(Mandatory = $true)][scriptblock]$Request, [int]$Count = $Samples)
    $values = @()
    for ($index = 0; $index -lt $Count; $index++) {
        $timer = [Diagnostics.Stopwatch]::StartNew()
        & $Request | Out-Null
        $timer.Stop()
        $values += [math]::Round($timer.Elapsed.TotalMilliseconds, 2)
    }
    $sorted = @($values | Sort-Object)
    $p50Index = [math]::Max(0, [int][math]::Ceiling($sorted.Count * 0.50) - 1)
    $p95Index = [math]::Max(0, [int][math]::Ceiling($sorted.Count * 0.95) - 1)
    $summary = [pscustomobject]@{
        name = $Name
        samples = $sorted.Count
        p50_ms = $sorted[$p50Index]
        p95_ms = if ($sorted.Count -ge 5) { $sorted[$p95Index] } else { $null }
        max_ms = ($sorted | Measure-Object -Maximum).Maximum
    }
    $script:measurements[$Name] = $summary
}

$userToken = Login-Api -Email $perfEmail -Password $perfPassword
$userHeaders = @{ Authorization = "Bearer $userToken"; Origin = $webOrigin }
$adminToken = Login-Api -Email $perfAdminEmail -Password $perfAdminPassword
$adminHeaders = @{ Authorization = "Bearer $adminToken"; Origin = $webOrigin }

Measure-Api -Name "gateway_health" -Request { Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/health/live" -TimeoutSec 10 | Out-Null }
Measure-Api -Name "auth_login" -Count 3 -Request { Login-Api -Email $perfEmail -Password $perfPassword | Out-Null }
Measure-Api -Name "food_search" -Request { Invoke-Api -Method GET -Path "/api/v1/services/food" -Headers $userHeaders | Out-Null }
Measure-Api -Name "restaurant_search" -Request { Invoke-Api -Method GET -Path "/api/v1/services/restaurant" -Headers $userHeaders | Out-Null }
Measure-Api -Name "healthcare_search" -Request { Invoke-Api -Method GET -Path "/api/v1/services/healthcare" -Headers $userHeaders | Out-Null }
Measure-Api -Name "history_list" -Request { Invoke-Api -Method GET -Path "/api/v1/history" -Headers $userHeaders | Out-Null }
Measure-Api -Name "admin_dashboard" -Request { Invoke-Api -Method GET -Path "/api/v1/admin/summary" -Headers $adminHeaders | Out-Null }

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$quoteBody = @{ pickup_address = "34 Ngoc Ha, Ba Dinh, Ha Noi"; dropoff_address = "20 Dinh Tien Hoang, Hoan Kiem, Ha Noi"; vehicle_type = "CAR_4"; pickup_latitude = 21.039; pickup_longitude = 105.834; dropoff_latitude = 21.028; dropoff_longitude = 105.852 } | ConvertTo-Json -Compress
$quote = Invoke-Api -Method POST -Path "/api/v1/services/ride/quote" -Headers ($userHeaders + @{ "Idempotency-Key" = "perf-quote-$suffix" }) -Body $quoteBody
$quoteId = [string]$quote.data.id
$prepared = Invoke-Api -Method POST -Path "/api/v1/service-actions/ride/prepare" -Headers ($userHeaders + @{ "Idempotency-Key" = "perf-prepare-$suffix" }) -Body (@{ quote_id = $quoteId } | ConvertTo-Json -Compress)
$bookingId = [string]$prepared.data.id
Invoke-Api -Method POST -Path "/api/v1/service-actions/ride/$bookingId/confirm" -Headers ($userHeaders + @{ "Idempotency-Key" = "perf-confirm-$suffix" }) | Out-Null
Measure-Api -Name "ride_tracking_poll" -Request { Invoke-Api -Method GET -Path "/api/v1/rides/$bookingId/tracking" -Headers $userHeaders | Out-Null }

$script:measurements.Values | Sort-Object name | Format-Table -AutoSize
Write-Host "Performance smoke completed with $Samples samples per read endpoint; auth_login used 3 samples because the local login limiter is intentionally bounded."
