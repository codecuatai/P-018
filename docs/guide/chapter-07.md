---
title: "DevOps và Triển khai"
weight: 7
---

## 7.1 Docker — Container hóa ứng dụng

Docker là một nền tảng (platform) cho phép bạn đóng gói ứng dụng cùng toàn bộ dependencies (thư viện, cấu hình, biến môi trường) vào một đơn vị gọi là **container**. Container đảm bảo ứng dụng chạy đồng nhất trên mọi máy — từ laptop của bạn đến server production. Trong AI20K, 100% BTC chấm điểm DevOps, và Docker là công cụ nền tảng để đạt điểm cao.

Trước Docker, developer thường gặp "tối thứ Sáu" — ứng dụng chạy trên máy mình nhưng lỗi trên server. Nguyên nhân là sự khác biệt về phiên bản Python, thư viện hệ thống, biến môi trường. Docker giải quyết vấn đề này bằng cách đóng gói toàn bộ runtime environment vào một image bất biến (immutable image). Bạn build một lần, chạy ở đâu cũng được.

**Image vs Container** là hai khái niệm cốt lõi cần phân biệt:

- **Image** (ảnh): bản thiết kế (blueprint) bất biến, chứa OS, runtime, code, dependencies. Image được build từ `Dockerfile` và lưu trong registry (Docker Hub, GitHub Container Registry).
- **Container** (thùng chứa): một instance đang chạy của image. Bạn có thể chạy nhiều container từ cùng một image, mỗi container có trạng thái riêng.

Ví dụ vòng đời Docker cơ bản:

```bash
# Build image từ Dockerfile
docker build -t my-agent-api:latest .

# Chạy container từ image
docker run -d -p 8000:8000 --name my-api my-agent-api:latest

# Xem log container
docker logs my-api

# Dừng container
docker stop my-api

# Xóa container
docker rm my-api

# Xóa image
docker rmi my-agent-api:latest
```

Vòng đời hoàn chỉnh: viết `Dockerfile` → build image → chạy container → push image lên registry → pull trên server → chạy production.

> 💡 **MẸO:** Hãy luôn tag image với version cụ thể (ví dụ `my-agent-api:1.0.3`) thay vì chỉ dùng `latest`. Tag `latest` gây nhầm lẫn khi rollback và không đảm bảo reproducibility.

Một số lệnh Docker hữu ích khác khi làm việc hàng ngày:

```bash
# Xem tất cả container đang chạy
docker ps

# Xem tất cả container (kể đã dừng)
docker ps -a

# Xem resource usage
docker stats

# Vào bên trong container để debug
docker exec -it my-api /bin/bash

# Xem chi tiết image (layers, size)
docker images
docker history my-agent-api:latest
```

Khi bạn phát triển ứng dụng AI Agent, Docker đặc biệt quan trọng vì ứng dụng có nhiều dependencies phức tạp: LangChain, LangGraph, các model embedding, vector store client, LLM API keys. Docker đảm bảo tất cả được cấu hình đúng trên mọi môi trường.

> ⚠️ **LƯU Ý:** Không lưu secrets (API keys, passwords) trong Docker image. Sử dụng environment variables hoặc Docker secrets để truyền thông tin nhạy cảm lúc runtime.

## 7.2 Multi-stage Dockerfile

Multi-stage build là kỹ thuật Docker cho phép bạn sử dụng nhiều stage (giai đoạn) trong một `Dockerfile`. Stage đầu tiên (builder) cài đặt dependencies và build ứng dụng. Stage thứ hai (production) chỉ copy kết quả build, bỏ qua toàn bộ công cụ build. Kết quả: image production nhỏ gọn hơn 5-10 lần, an toàn hơn vì không chứa build tools.

Tại sao multi-stage quan trọng? Một image Python thông thường có thể nặng 1-2 GB vì chứa pip cache, build tools (gcc, g++), và các dependencies chỉ cần lúc build. Multi-stage giảm xuống còn 200-400 MB, tiết kiệm bandwidth khi deploy và giảm attack surface.

Dưới đây là `Dockerfile` hoàn chỉnh cho ứng dụng LangGraph + FastAPI:

```dockerfile
# ============================================
# Stage 1: Builder — cài đặt dependencies
# ============================================
FROM python:3.11-slim AS builder

WORKDIR /app

# Cài build tools cần thiết cho compile C extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements trước — tận dụng Docker layer caching
COPY requirements.txt .

# Cài Python dependencies vào virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir -r requirements.txt

# ============================================
# Stage 2: Production — image cuối cùng
# ============================================
FROM python:3.11-slim AS production

# Thiết lập biến môi trường
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    PORT=8000

WORKDIR /app

# Tạo non-root user cho bảo mật
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy virtual environment từ builder stage
COPY --from=builder /opt/venv /opt/venv

# Copy source code
COPY . .

# Chown tất cả file cho appuser
RUN chown -R appuser:appuser /app

# Chuyển sang non-root user
USER appuser

# Expose port
EXPOSE 8000

# Health check — kiểm tra API còn sống
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Chạy ứng dụng với uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Giải thích chi tiết từng phần:

**Layer caching:** Docker build theo từng layer (từng lệnh trong Dockerfile). Khi bạn sửa code, chỉ các layer từ `COPY . .` trở đi bị rebuild. Nếu `requirements.txt` không đổi, layer `pip install` được cache — tiết kiệm 2-5 phút mỗi lần build. Đây là lý do `COPY requirements.txt` đặt trước `COPY . .`.

**Non-root user:** Mặc định Docker chạy container với user `root`. Nếu attacker khai thác lỗ hổng trong ứng dụng, họ có quyền root trong container. Tạo `appuser` giới hạn quyền truy cập, tuân thủ nguyên tắc least privilege (quyền tối thiểu).

**HEALTHCHECK directive:** Docker tự động kiểm tra sức khỏe container mỗi 30 giây. Nếu kiểm tra thất bại 3 lần liên tiếp, container được đánh dấu `unhealthy` và orchestrator (Docker Compose, Kubernetes) có thể tự động restart. Điều này đảm bảo tính available cho API.

> 🔑 **ĐIỂM CHÍNH:** Luôn sử dụng multi-stage build cho production. Image nhỏ hơn, an toàn hơn, và deploy nhanh hơn. Stage 1 build, Stage 2 chạy — pattern này áp dụng cho mọi ứng dụng Python.

Thêm file `.dockerignore` để loại bỏ file không cần thiết:

```text
__pycache__/
*.pyc
*.pyo
.env
.git
.gitignore
.venv/
venv/
*.md
tests/
.dockerignore
Dockerfile
docker-compose.yml
```

File `.dockerignore` giống `.gitignore` — ngăn các file không cần thiết vào Docker context, giúp build nhanh hơn và image nhỏ hơn.

## 7.3 Docker Compose — Quản lý nhiều dịch vụ

Docker Compose là công cụ cho phép bạn định nghĩa và chạy nhiều container (nhiều dịch vụ) cùng lúc bằng một file YAML. Thay vì gõ 5-6 lệnh `docker run` dài dòng, bạn viết một file `docker-compose.yml` và chạy `docker compose up` — mọi thứ tự động khởi động, kết nối mạng, và quản lý vòng đời.

Trong ứng dụng AI Agent điển hình, bạn cần ít nhất 3-4 dịch vụ chạy cùng nhau: API server, database (PostgreSQL), vector store (Chroma/PGVector), và có thể Redis cho caching. Docker Compose quản lý toàn bộ stack này.

Dưới đây là `docker-compose.yml` hoàn chỉnh cho dự án AI Agent:

```yaml
version: "3.9"

services:
  # ============================================
  # API Server — FastAPI + LangGraph
  # ============================================
  api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: agent-api
    ports:
      - "8000:8000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - DATABASE_URL=postgresql://agentuser:agentpass@db:5432/agentdb
      - REDIS_URL=redis://redis:6379/0
      - LANGSMITH_API_KEY=${LANGSMITH_API_KEY}
      - LANGSMITH_PROJECT=ai20k-agent
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    volumes:
      - ./app:/app/app  # Hot reload khi dev
    networks:
      - agent-network
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "0.5"
        reservations:
          memory: 256M
          cpus: "0.25"
    restart: unless-stopped

  # ============================================
  # PostgreSQL — Database chính
  # ============================================
  db:
    image: postgres:16-alpine
    container_name: agent-db
    environment:
      POSTGRES_USER: agentuser
      POSTGRES_PASSWORD: agentpass
      POSTGRES_DB: agentdb
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U agentuser -d agentdb"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - agent-network
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: "0.25"
    restart: unless-stopped

  # ============================================
  # Redis — Cache & Session Store
  # ============================================
  redis:
    image: redis:7-alpine
    container_name: agent-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - agent-network
    deploy:
      resources:
        limits:
          memory: 128M
          cpus: "0.1"
    restart: unless-stopped

# ============================================
# Named Volumes — Data persistence
# ============================================
volumes:
  postgres-data:
    driver: local
  redis-data:
    driver: local

# ============================================
# Network — Cách ly các dịch vụ
# ============================================
networks:
  agent-network:
    driver: bridge
```

Giải thích các khái niệm chính:

**depends_on với condition:** Service `api` sẽ đợi `db` và `redis` healthy trước khi khởi động. Nếu không có `condition`, API có thể start trước khi database sẵn sàng → connection error. `service_healthy` đảm bảo API chỉ start khi healthcheck của dependencies pass.

**Named volumes:** `postgres-data` và `redis-data` là named volumes — dữ liệu được lưu ngoài container. Khi bạn chạy `docker compose down`, container bị xóa nhưng data vẫn còn. Chạy `docker compose down -v` mới xóa data. Đây là cách bảo vệ data quan trọng khỏi mất mát.

**Resource limits:** `deploy.resources.limits` giới hạn memory và CPU cho mỗi container. Nếu API bị memory leak (rất phổ biến với Python + AI models), nó chỉ dùng tối đa 512MB thay vì chiếm toàn bộ RAM server, ảnh hưởng đến các dịch vụ khác.

> 💡 **MẸO:** Khi phát triển (development), thêm `volumes: - ./app:/app/app` để hot reload — thay đổi code trên máy local sẽ lập tức phản ánh trong container. Khi deploy production, xóa dòng này đi.

Các lệnh Docker Compose cần biết:

```bash
# Khởi động tất cả dịch vụ (nền)
docker compose up -d

# Xem log tất cả dịch vụ
docker compose logs -f

# Xem log một dịch vụ cụ thể
docker compose logs -f api

# Khởi động lại một dịch vụ
docker compose restart api

# Dừng tất cả (giữ data)
docker compose down

# Dừng tất cả (xóa data)
docker compose down -v

# Rebuild và khởi động
docker compose up -d --build
```

> ⚠️ **LƯU Ý:** Không commit `docker-compose.yml` chứa password thật vào git. Sử dụng `.env` file cho secrets và thêm `.env` vào `.gitignore`. Docker Compose tự động đọc file `.env` trong cùng thư mục.

## 7.4 CI/CD với GitHub Actions

CI/CD là viết tắt của Continuous Integration (Tích hợp liên tục) và Continuous Deployment (Triển khai liên tục). CI đảm bảo mỗi lần push code lên GitHub, toàn bộ test suite tự động chạy — phát hiện lỗi sớm trước khi merge. CD tự động deploy lên server khi code pass tất cả tests. Đây là lỗi phổ biến nhất và mất điểm nghiêm trọng ở tiêu chí DevOps — phần lớn đội bỏ qua CI/CD.

GitHub Actions là CI/CD platform tích hợp sẵn trong GitHub. Bạn định nghĩa workflow bằng file YAML trong thư mục `.github/workflows/`. Mỗi workflow chứa một hoặc nhiều job, mỗi job chứa nhiều step (bước). Workflow được trigger bởi events như push, pull request, hoặc manual dispatch.

Dưới đây là workflow CI hoàn chỉnh:

```yaml
# .github/workflows/ci.yml
name: CI — Lint, Test, Build

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  # ============================================
  # Job 1: Lint & Format Check
  # ============================================
  lint:
    name: Lint với Ruff
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install Ruff
        run: pip install ruff

      - name: Run Ruff check
        run: ruff check . --output-format=github

      - name: Check formatting
        run: ruff format --check .

  # ============================================
  # Job 2: Run Tests
  # ============================================
  test:
    name: Chạy Tests
    runs-on: ubuntu-latest
    needs: lint  # Chỉ chạy sau khi lint pass
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Cache pip dependencies
        uses: actions/cache@v4
        with:
          path: ~/.cache/pip
          key: ${{ runner.os }}-pip-${{ hashFiles('requirements.txt') }}
          restore-keys: |
            ${{ runner.os }}-pip-

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install pytest pytest-asyncio pytest-cov httpx

      - name: Run tests with coverage
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          pytest tests/ -v --cov=app --cov-report=xml --cov-report=term-missing

      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-report
          path: coverage.xml

  # ============================================
  # Job 3: Build Docker Image
  # ============================================
  build:
    name: Build Docker Image
    runs-on: ubuntu-latest
    needs: test  # Chỉ chạy sau khi test pass
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: false
          tags: agent-api:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

**Giải thích workflow:**

Workflow này có 3 jobs chạy tuần tự: lint → test → build. Nếu lint thất bại, test và build không chạy — tiết kiệm tài nguyên. Nếu test thất bại, build không chạy — không build code có lỗi.

**Lint với Ruff:** Ruff là Python linter và formatter siêu nhanh (viết bằng Rust), thay thế Flake8, isort, Black. Nó kiểm tra code style, import order, unused imports, và nhiều lỗi phổ biến khác. Output format `github` tạo annotation trực tiếp trên pull request — reviewer thấy lỗi ngay trên diff.

**Cache pip dependencies:** Action `actions/cache` lưu cache của pip, tránh download lại 100+ packages mỗi lần chạy. Key cache dựa trên hash của `requirements.txt` — chỉ invalidate khi dependencies thay đổi.

> 🔑 **ĐIỂM CHÍNH:** Luôn có ít nhất lint + test trong CI pipeline. Đây là dấu hiệu chuyên nghiệp nhất cho BTC. Phần lớn đội không có CI/CD — chỉ cần bạn có, bạn đã vượt xa.

**Deploy workflow** riêng cho production:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:  # Cho phép trigger thủ công

jobs:
  deploy:
    name: Deploy lên Render
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Trigger Render Deploy Hook
        run: |
          curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK }}"

      - name: Notify deployment
        run: |
          echo "Deployed commit ${{ github.sha }} to production"
```

Workflow này tự động deploy mỗi khi code được merge vào nhánh `main`. Nó gọi Render Deploy Hook qua HTTP POST — Render sẽ pull image mới nhất và deploy.

## 7.5 Deploy lên Cloud

Sau khi đã có Docker image và CI/CD pipeline, bước tiếp theo là deploy ứng dụng lên cloud để người dùng thực sự truy cập được. Trong AI20K, Live URL (URL truy cập được) là một trong 10 deliverables bắt buộc.

Có nhiều lựa chọn deploy, nhưng đây là những lựa chọn tốt nhất cho dự án AI Agent:

### Backend — Render hoặc Railway

**Render** (render.com) là platform-as-a-service (PaaS) cho phép deploy ứng dụng từ Docker image hoặc git repository. Ưu điểm: free tier, tự động SSL, tự động deploy từ GitHub, hỗ trợ Docker.

**Railway** (railway.app) tương tự Render nhưng có UX thân thiện hơn và hỗ trợ thêm nhiều loại database. Cả hai đều phù hợp cho AI20K.

Các bước deploy lên Render:

1. Đăng ký Render bằng GitHub account
2. Chọn "New Web Service" → "Build and deploy from a Docker image"
3. Connect GitHub repository
4. Thêm environment variables: `OPENAI_API_KEY`, `DATABASE_URL`, `LANGSMITH_API_KEY`
5. Chọn instance type: Free (512MB RAM) hoặc Starter ($7/tháng)
6. Render tự động build Docker image và deploy

**Environment variables** là nơi lưu cấu hình và secrets. Trên Render, bạn thêm trong Dashboard → Environment:

```
OPENAI_API_KEY=sk-proj-xxxxx
DATABASE_URL=postgresql://user:pass@host:5432/db
LANGSMITH_API_KEY=lsv2_pt_xxxxx
LANGSMITH_PROJECT=ai20k-agent-production
ENVIRONMENT=production
LOG_LEVEL=INFO
```

### Frontend — Vercel

Nếu bạn có giao diện web (React, Next.js, Streamlit), deploy lên **Vercel** (vercel.com). Vercel tối ưu cho frontend, có CDN global, và free tier rất hào phóng.

```bash
# Deploy frontend lên Vercel
npm install -g vercel
vercel --prod
```

### Custom Domain

Mua domain từ Namecheap hoặc GoDaddy (~$10/năm), trỏ DNS về Render/Vercel:

- Render: thêm custom domain trong Settings → Custom Domains
- Vercel: thêm trong Project Settings → Domains
- CNAME record: `your-subdomain.yourdomain.com` → `your-app.onrender.com`

> 💡 **MẸO:** Mua domain `.app` hoặc `.dev` — Google tự động bật HTTPS cho các TLD này, tiết kiệm cấu hình SSL. Domain `.me` cũng phổ biến cho project demo.

Kiểm tra sau khi deploy:

```bash
# Test health endpoint
curl https://your-app.onrender.com/health

# Test API endpoint
curl https://your-app.onrender.com/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Xin chào", "thread_id": "test-123"}'

# Kiểm tra response time
curl -o /dev/null -s -w "Time: %{time_total}s\n" \
  https://your-app.onrender.com/health
```

> ⚠️ **LƯU Ý:** Render free tier "sleeps" sau 15 phút không có request. Lần truy cập đầu tiên sau sleep mất 30-60 giây để "wake up". Dùng cron job (như UptimeRobot) ping mỗi 5 phút để giữ server awake, hoặc upgrade lên paid plan.

## 7.6 Monitoring và Logging

Monitoring (giám sát) và Logging (ghi log) là hai pilre của vận hành ứng dụng production. Không có monitoring, bạn không biết ứng dụng đang chạy tốt hay không. Không có logging, bạn không thể debug khi có lỗi. Trong tiêu chí DevOps của AI20K, monitoring và logging là yếu tố phân biệt giữa điểm trung bình và điểm cao.

### Python Logging Setup

Python có thư viện `logging` tích hợp sẵn, nhưng cấu hình mặc định khá cơ bản. Dưới đây là cấu hình logging production-ready:

```python
# app/core/logging_config.py
import logging
import sys
import json
from datetime import datetime, timezone


class JSONFormatter(logging.Formatter):
    """Format log thành JSON structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Thêm extra fields nếu có
        if hasattr(record, "extra_data"):
            log_entry["data"] = record.extra_data

        # Thêm exception info nếu có
        if record.exc_info and record.exc_info[0] is not None:
            log_entry["exception"] = {
                "type": record.exc_info[0].__name__,
                "message": str(record.exc_info[1]),
            }

        return json.dumps(log_entry, ensure_ascii=False)


def setup_logging(log_level: str = "INFO") -> None:
    """Cấu hình logging cho ứng dụng."""
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper()))

    # Handler cho stdout (console)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(JSONFormatter())
    root_logger.addHandler(console_handler)

    # Giảm log level cho các thư viện noisy
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
```

**Structured logging** (logging có cấu trúc) ghi log dưới dạng JSON thay vì plain text. Ưu điểm: dễ parse, dễ search, dễ integrate với công cụ monitoring như ELK Stack, Datadog, Grafana Loki.

```python
# Cách sử dụng logging trong code
import logging

logger = logging.getLogger(__name__)

@app.post("/api/v1/chat")
async def chat(request: ChatRequest):
    logger.info(
        "Processing chat request",
        extra={
            "extra_data": {
                "thread_id": request.thread_id,
                "message_length": len(request.message),
            }
        },
    )
    try:
        response = await agent.arun(request.message)
        logger.info(
            "Chat request completed",
            extra={
                "extra_data": {
                    "thread_id": request.thread_id,
                    "response_length": len(response),
                }
            },
        )
        return {"response": response}
    except Exception as e:
        logger.error(
            "Chat request failed",
            exc_info=True,
            extra={
                "extra_data": {
                    "thread_id": request.thread_id,
                    "error_type": type(e).__name__,
                }
            },
        )
        raise
```

### LangSmith cho AI Tracing

LangSmith là công cụ monitoring chuyên biệt cho ứng dụng LLM/LangChain/LangGraph. Nó trace từng bước của agent — từ lúc nhận input, gọi LLM, retrieve documents, đến lúc trả output. AI Logs là deliverable thường được hoàn thành tốt nhất vì dễ thiết lập.

Cấu hình LangSmith chỉ cần 3 environment variables:

```bash
export LANGSMITH_API_KEY="lsv2_pt_xxxxx"
export LANGSMITH_PROJECT="ai20k-agent"
export LANGCHAIN_TRACING_V2="true"
```

```python
# Trong app, LangSmith tự động trace khi biến môi trường được set
# Không cần code thêm — chỉ cần import langchain
import os

# Verify LangSmith config
assert os.getenv("LANGCHAIN_TRACING_V2") == "true", "LangSmith not configured"
```

Trên LangSmith dashboard, bạn sẽ thấy:
- Mỗi request là một trace
- Mỗi bước trong graph là một span
- Token usage, latency, cost cho mỗi LLM call
- Input/output của mỗi node — debug dễ dàng

### Health Check Endpoint

Health check endpoint là URL mà monitoring tools gọi định kỳ để kiểm tra ứng dụng còn sống và hoạt động đúng:

```python
# app/api/health.py
from fastapi import APIRouter, Depends
from datetime import datetime, timezone
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health")
async def health_check():
    """
    Health check endpoint cho monitoring.
    Kiểm tra: API sống, database kết nối, các dependencies.
    """
    checks = {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0",
    }

    # Kiểm tra database connection
    try:
        # Thay bằng logic check thực tế của bạn
        # async with db.session() as session:
        #     await session.execute(text("SELECT 1"))
        checks["database"] = "connected"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        checks["database"] = "disconnected"
        checks["status"] = "degraded"

    # Kiểm tra LLM API
    try:
        # Có thể ping OpenAI API nhẹ
        checks["llm_api"] = "reachable"
    except Exception as e:
        logger.error(f"LLM API health check failed: {e}")
        checks["llm_api"] = "unreachable"
        checks["status"] = "degraded"

    status_code = 200 if checks["status"] == "healthy" else 503
    return JSONResponse(content=checks, status_code=status_code)


@router.get("/health/live")
async def liveness_probe():
    """Kubernetes liveness probe — chỉ kiểm tra process còn sống."""
    return {"status": "alive"}


@router.get("/health/ready")
async def readiness_probe():
    """Kubernetes readiness probe — kiểm tra sẵn sàng nhận traffic."""
    # Kiểm tra tất cả dependencies
    return {"status": "ready"}
```

> 🔑 **ĐIỂM CHÍNH:** Ba công cụ monitoring cần có: (1) Structured logging cho application logs, (2) LangSmith cho AI tracing, (3) Health check endpoint cho uptime monitoring. BTC đặc biệt chú ý AI Logs — đây là bằng chứng rõ ràng nhất rằng agent hoạt động đúng.

## Tóm tắt

Trong chương này, chúng ta đã tìm hiểu toàn bộ pipeline DevOps cho ứng dụng AI Agent:

- **Docker** đóng gói ứng dụng vào container, đảm bảo chạy đồng nhất trên mọi môi trường
- **Multi-stage Dockerfile** tạo image production nhỏ gọn, an toàn với non-root user và HEALTHCHECK
- **Docker Compose** quản lý nhiều dịch vụ (API, database, Redis) cùng lúc với health checks và resource limits
- **GitHub Actions CI/CD** tự động lint, test, build trên mỗi push — chuyên nghiệp và bắt buộc cho Demo Day
- **Cloud deploy** với Render (backend) và Vercel (frontend) — đơn giản, nhanh chóng
- **Monitoring và Logging** với structured logging, LangSmith tracing, và health check endpoint

DevOps là tiêu chí chấm điểm riêng trong AI20K. Phần lớn đội thiếu CI/CD và không có test. Chỉ cần bạn có Docker + CI/CD + tests + health check, bạn đã ở top về DevOps.

## Câu hỏi ôn tập

1. Sự khác biệt giữa Docker image và Docker container là gì?
2. Tại sao multi-stage build làm image nhỏ hơn? Giải thích cơ chế layer caching.
3. `depends_on` với `condition: service_healthy` khác gì với `depends_on` không có condition?
4. Nếu GitHub Actions CI pipeline của bạn thất bại ở bước test, bước build có chạy không? Tại sao?
5. Tại sao không nên lưu API keys trong Docker image? Cách đúng là gì?
6. Structured logging (JSON) ưu điểm gì so với plain text logging?
7. LangSmith trace những thông tin gì? Tại sao nó quan trọng cho AI Agent?
8. Health check endpoint trả về HTTP status code nào khi ứng dụng không khỏe?
