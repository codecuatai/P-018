param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ComposeArgs
)

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "          X-One Multi-Service Launcher (PowerShell)         " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Step 1: Environment File Check
if (-not (Test-Path ".env")) {
    Write-Host "[1/4] .env file not found. Auto-generating from .env.example..." -ForegroundColor Yellow
    if (Test-Path "./scripts/setup-env.ps1") {
        & ./scripts/setup-env.ps1
    } else {
        Copy-Item .env.example .env
        Write-Host "Created .env file." -ForegroundColor Green
    }
} else {
    Write-Host "[1/4] .env configuration file detected." -ForegroundColor Green
}

# Step 2: Validate Configuration
Write-Host "[2/4] Validating environment configuration..." -ForegroundColor Yellow
python scripts/validate-env-config.py
if ($LASTEXITCODE -ne 0) {
    Write-Error "ERROR: Environment configuration validation failed."
    exit 1
}

# Step 3: Launch Docker Compose Backend Services
Write-Host "[3/4] Building and starting all X-One backend services via Docker..." -ForegroundColor Green

if ($ComposeArgs.Count -eq 0) {
    docker compose --env-file .env up --build -d
} else {
    docker compose --env-file .env up --build @ComposeArgs
}

# Step 4: Launch Web UI (apps/web) locally via npm run dev
Write-Host "[4/4] Starting Web Chat UI (Assistant-018) on http://localhost:5173 ..." -ForegroundColor Cyan

$WebDir = Join-Path $PSScriptRoot "..\apps\web"

if (Test-Path $WebDir) {
    Push-Location $WebDir

    # Install dependencies if node_modules missing
    if (-not (Test-Path "node_modules")) {
        Write-Host "  -> Installing web dependencies (npm install)..." -ForegroundColor Yellow
        npm install
    }

    # Launch Vite dev server in a new background PowerShell window
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev" -WorkingDirectory $WebDir
    Write-Host "  -> Web UI launched in a new terminal window." -ForegroundColor Green

    Pop-Location
} else {
    Write-Host "  -> WARNING: apps/web directory not found. Skipping Web UI launch." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  ALL SERVICES STARTED SUCCESSFULLY!                        " -ForegroundColor Green
Write-Host "  SERVICES & WEB LINKS (CLICK TO OPEN):                    " -ForegroundColor Yellow
Write-Host "  • 💬 Web Chat UI:        http://localhost:5173            " -ForegroundColor Green
Write-Host "  • ⚡ API Gateway:         http://localhost:3000            " -ForegroundColor Cyan
Write-Host "  • 🤖 Agent Service:       http://localhost:8001/docs       " -ForegroundColor Cyan
Write-Host "  • 🍽️ Restaurant Service:  http://localhost:8102/docs       " -ForegroundColor Cyan
Write-Host "  • 🚗 Ride Service:        http://localhost:8101/docs       " -ForegroundColor Cyan
Write-Host "  • 🏥 Healthcare Service:  http://localhost:8103/docs       " -ForegroundColor Cyan
Write-Host "  • 🍕 Food Service:        http://localhost:8104/docs       " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
