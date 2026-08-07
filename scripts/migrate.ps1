$rideService = Join-Path $PSScriptRoot '..\services\ride-service'
Push-Location $rideService
try {
    python -m alembic upgrade head
}
finally {
    Pop-Location
}
Write-Host 'Ride migrations applied. Other domain migrations are not implemented.'
