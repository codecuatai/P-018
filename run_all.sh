#!/usr/bin/env bash

# ==============================================================================
# Script khởi chạy Full Luồng Hệ thống AI Concierge (X-One Assistant)
# Yêu cầu: Bash environment (Git Bash / WSL / Linux / macOS)
# ==============================================================================

echo "======================================================================"
echo "🚀 ĐANG KHỞI ĐỘNG TOÀN BỘ HỆ THỐNG AI CONCIERGE (X-ONE ASSISTANT)"
echo "======================================================================"

# Tự động dừng tất cả các process con khi nhấn Ctrl+C
trap 'echo -e "\n🛑 Đang dừng toàn bộ dịch vụ..."; kill $(jobs -p) 2>/dev/null; exit 0' INT TERM EXIT

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR" || exit 1

# 1. Khởi động Backend FastAPI Server (Port 8000)
echo "----------------------------------------------------------------------"
echo "⚙️  1/3 Khởi động Backend FastAPI Engine (Port 8000)..."
echo "----------------------------------------------------------------------"
python -m uvicorn apps.backend.src.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
sleep 2

# 2. Khởi động Restaurant Microservice (Port 8001)
echo "----------------------------------------------------------------------"
echo "🍽️  2/3 Khởi động Restaurant Microservice (Port 8001)..."
echo "----------------------------------------------------------------------"
python -m uvicorn apps.services.restaurant.main:app --host 0.0.0.0 --port 8001 --reload &
RESTAURANT_PID=$!
sleep 2

# 3. Khởi động Web Frontend (Vite React UI)
echo "----------------------------------------------------------------------"
echo "💻 3/3 Khởi động Web Frontend (Vite React UI)..."
echo "----------------------------------------------------------------------"
if [ -d "$ROOT_DIR/apps/web" ]; then
    cd "$ROOT_DIR/apps/web" || exit 1
    npm run dev &
    FRONTEND_PID=$!
else
    echo "⚠️ Không tìm thấy thư mục apps/web!"
fi

echo "======================================================================"
echo "✅ TẤT CẢ CÁC DỊCH VỤ ĐÃ ĐƯỢC KHỞI ĐỘNG THÀNH CÔNG!"
echo "🌐 Backend API:           http://localhost:8000 (Swagger: http://localhost:8000/docs)"
echo "🍽️ Restaurant Service:    http://localhost:8001"
echo "💻 Web App Frontend:      http://localhost:3000 (hoặc http://localhost:5173)"
echo "======================================================================"
echo "👉 Nhấn [Ctrl + C] để dừng toàn bộ dịch vụ."

# Giữ script chạy liên tục để quản lý background processes
wait
