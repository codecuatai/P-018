#!/usr/bin/env sh
set -eu

# Print styled headers
echo "============================================================"
echo "          X-One Multi-Service Launcher                     "
echo "============================================================"

# Step 1: Environment File Check
if [ ! -f ".env" ]; then
    echo "[1/4] .env file not found. Auto-generating from .env.example..."
    if [ -f "./scripts/setup-env.sh" ]; then
        sh ./scripts/setup-env.sh
    else
        cp .env.example .env
        echo "Created .env file."
    fi
else
    echo "[1/4] .env configuration file detected."
fi

# Step 2: Validate Configuration
echo "[2/4] Validating environment configuration..."
if command -v python > /dev/null 2>&1; then
    python scripts/validate-env-config.py || {
        echo "ERROR: Environment configuration validation failed."
        exit 1
    }
elif command -v python3 > /dev/null 2>&1; then
    python3 scripts/validate-env-config.py || {
        echo "ERROR: Environment configuration validation failed."
        exit 1
    }
fi

# Step 3: Launch Docker Compose Backend Services
echo "[3/4] Building and starting all X-One backend services via Docker..."

if [ "$#" -eq 0 ]; then
    docker compose --env-file .env up --build -d
else
    docker compose --env-file .env up --build "$@"
fi

# Step 4: Launch Web UI (apps/web) locally via npm run dev
echo "[4/4] Starting Web Chat UI (Assistant-018) on http://localhost:5173 ..."

WEB_DIR="$(dirname "$0")/../apps/web"

if [ -d "$WEB_DIR" ]; then
    cd "$WEB_DIR"

    # Install dependencies if node_modules missing
    if [ ! -d "node_modules" ]; then
        echo "  -> Installing web dependencies (npm install)..."
        npm install
    fi

    # Launch Vite dev server in background, redirect output to log
    npm run dev > /tmp/web-dev.log 2>&1 &
    WEB_PID=$!
    echo "  -> Web UI started (PID: $WEB_PID). Logs: /tmp/web-dev.log"
    cd - > /dev/null
else
    echo "  -> WARNING: apps/web directory not found. Skipping Web UI launch."
fi

echo ""
echo "============================================================"
echo "  ALL SERVICES STARTED SUCCESSFULLY!                        "
echo "  SERVICES & WEB LINKS (CLICK TO OPEN):                    "
echo "  • 💬 Web Chat UI:        http://localhost:5173            "
echo "  • ⚡ API Gateway:         http://localhost:3000            "
echo "  • 🤖 Agent Service:       http://localhost:8001/docs       "
echo "  • 🍽️ Restaurant Service:  http://localhost:8102/docs       "
echo "  • 🚗 Ride Service:        http://localhost:8101/docs       "
echo "  • 🏥 Healthcare Service:  http://localhost:8103/docs       "
echo "  • 🍕 Food Service:        http://localhost:8104/docs       "
echo "============================================================"
