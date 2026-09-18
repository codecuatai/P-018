param([string]$EnvFile = ".env")

$ErrorActionPreference = "Stop"

Write-Host "Core and Agent services run on PostgreSQL port 5432 (xone_core, xone_agent)." -ForegroundColor Green
Write-Host "Domain services seed data (Food, Restaurant, Healthcare, Ride) is managed in P-018-Service." -ForegroundColor Yellow
Write-Host "Please run .\scripts\database\seed.ps1 inside the P-018-Service repository." -ForegroundColor Cyan
