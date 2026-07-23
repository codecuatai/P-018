---
title: "Troubleshooting — Sửa lỗi thường gặp"
weight: 99
---

# Troubleshooting — Sửa lỗi thường gặp

Phần này tổng hợp các lỗi phổ biến khi setup và chạy dự án AI Agent, kèm hướng dẫn sửa chi tiết. Nếu bạn gặp lỗi không có trong danh sách, hãy kiểm tra lại các bước trong chương tương ứng hoặc tìm trên GitHub Issues của template.

---

## Python & Environment

### `ModuleNotFoundError: No module named 'xxx'`

**Nguyên nhân:** Bạn chưa kích hoạt virtual environment, hoặc cài package nhầm vào system Python.

**Cách sửa:**
```bash
# 1. Xác nhận đang ở trong venv
which python
# Output phải chứa .venv, ví dụ: /path/to/project/.venv/bin/python

# 2. Nếu không, kích hoạt lại
source .venv/bin/activate

# 3. Cài lại package
pip install -e ".[dev]"
```

**Nếu vẫn lỗi:**
```bash
# Xóa venv cũ và tạo lại
rm -rf .venv
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

### `python3.11: command not found`

**Nguyên nhân:** Chưa cài Python 3.11 hoặc không có trong PATH.

**Cách sửa (macOS):**
```bash
brew install python@3.11
```

**Cách sửa (Ubuntu/WSL):**
```bash
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt update
sudo apt install python3.11 python3.11-venv python3.11-dev
```

### `pip install` chậm hoặc timeout

**Cách sửa:** Dùng mirror gần Việt Nam:
```bash
pip install -e ".[dev]" -i https://pypi.tuna.tsinghua.edu.cn/simple
# Hoặc
pip install -e ".[dev]" -i https://mirror.cloudflare.com/pypi/simple
```

### `ERROR: Could not build wheel for xxx`

**Nguyên nhân:** Thiếu C compiler hoặc development headers.

**Cách sửa (macOS):**
```bash
xcode-select --install
```

**Cách sửa (Ubuntu/WSL):**
```bash
sudo apt install build-essential python3.11-dev
```

---

## FastAPI & Server

### `uvicorn: command not found`

**Nguyên nhân:** uvicorn chưa được cài hoặc chưa kích hoạt venv.

**Cách sửa:**
```bash
source .venv/bin/activate
pip install uvicorn
```

### `ERROR: [Errno 48] Address already in use` (Port 8000 bị chiếm)

**Nguyên nhân:** Một process khác đang dùng port 8000 (có thể là lần chạy server trước chưa tắt).

**Cách sửa:**
```bash
# Tìm process đang chiếm port
lsof -i :8000

# Kill process đó (thay PID bằng số từ lệnh trên)
kill -9 <PID>

# Hoặc dùng port khác
uvicorn src.api.main:app --reload --port 8001
```

### `openai.AuthenticationError: Invalid API Key`

**Nguyên nhân:** API key không hợp lệ, chưa set, hoặc hết hạn.

**Cách sửa:**
```bash
# 1. Kiểm tra file .env đã tạo chưa
ls -la .env
# Nếu chưa: cp .env.example .env

# 2. Kiểm tra API key trong .env
grep OPENAI_API_KEY .env
# Phải có dạng: OPENAI_API_KEY=sk-proj-xxxxx (không có ngoặc kép)

# 3. Test nhanh
python -c "from openai import OpenAI; c=OpenAI(); print(c.models.list().data[:3])"
```

### `pydantic.ValidationError` khi khởi động app

**Nguyên nhân:** Biến môi trường sai kiểu dữ liệu (ví dụ: `API_PORT=abc` thay vì số).

**Cách sửa:** Kiểm tra file `.env` — đảm bảo:
- Port là số nguyên (ví dụ: `8000`, không phải `"8000"`)
- Boolean là `true`/`false` (không phải `yes`/`no`)
- Enum values đúng (`development`/`staging`/`production`)

---

## LangGraph

### `ImportError: cannot import name 'StateGraph' from 'langgraph'`

**Nguyên nhân:** LangGraph chưa cài hoặc version cũ.

**Cách sửa:**
```bash
pip install --upgrade langgraph langchain-core
```

### `GraphRecursionError: Recursion limit reached`

**Nguyên nhân:** Agent bị lặp vô hạn — conditional edge luôn trả về node cũ, không bao giờ đến END.

**Cách sửa:**
1. Thêm `iteration` counter vào state và giới hạn số lần lặp:
```python
def should_continue(state: AgentState) -> str:
    if state.get("iteration", 0) >= 3:  # Tối đa 3 vòng
        return END
    if state.get("needs_more_research"):
        return "research"
    return END
```
2. Kiểm tra routing function có fallback (default case) không.

### `TypeError: expected string or bytes-like object` trong routing function

**Nguyên nhân:** Routing function trả về giá trị không khớp với map trong `add_conditional_edges`.

**Cách sửa:** Đảm bảo mọi giá trị trả về của routing function có trong map:
```python
# ✅ Đúng — có fallback
def route(state) -> str:
    if state.get("type") == "search":
        return "search"
    return "answer"  # Fallback

graph.add_conditional_edges(
    "router", route,
    {"search": "search", "answer": "answer"}  # Map chứa cả fallback
)
```

---

## Docker

### `docker: command not found`

**Cách sửa (macOS):** Cài Docker Desktop từ https://docker.com/products/docker-desktop

**Cách sửa (Ubuntu):**
```bash
sudo apt update
sudo apt install docker.io docker-compose
sudo usermod -aG docker $USER
# Logout và login lại
```

### `docker build` fails ở `pip install`

**Nguyên nhân:** Docker không cache layer do `requirements.txt` thay đổi, hoặc network issue.

**Cách sửa:**
```bash
# Build không cache
docker build --no-cache -t my-agent .

# Nếu lỗi network, thêm pip mirror vào Dockerfile:
# RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### `docker compose up` fails — service unhealthy

**Cách sửa:**
```bash
# Xem log chi tiết
docker compose logs api
docker compose logs db

# Rebuild từ đầu
docker compose down -v
docker compose up -d --build
```

### Container restart liên tục

**Cách debug:**
```bash
# Xem log container
docker logs <container_name> --tail 50

# Vào container để debug
docker exec -it <container_name> /bin/bash

# Kiểm tra health check
docker inspect <container_name> | grep -A 5 Health
```

---

## Git & GitHub

### `! [rejected] main -> main (fetch first)`

**Nguyên nhân:** Remote có commit mới mà local chưa pull.

**Cách sửa:**
```bash
git pull origin main --rebase
# Giải quyết conflict nếu có
git rebase --continue
git push origin main
```

### `fatal: not a git repository`

**Cách sửa:**
```bash
git init
git add .
git commit -m "feat: khởi tạo dự án"
git remote add origin https://github.com/your-org/your-repo.git
git push -u origin main
```

### Kích hoạt GitHub Actions

Nếu CI không chạy sau khi push:
1. Vào repo trên GitHub → **Actions** tab
2. Nếu thấy "Workflows aren't being run on this fork", click **Enable workflows**
3. Kiểm tra file `.github/workflows/ci.yml` có trong branch đúng không

---

## Deploy

### Render deploy fails — build error

**Cách sửa:**
1. Kiểm tra build log chi tiết trên Render Dashboard
2. Đảm bảo `Dockerfile` hoặc `requirements.txt` có trong repo
3. Thêm `runtime.txt` với nội dung `3.11.x` nếu Render chọn sai Python version

### Render free tier "sleeping" — response chậm

**Cách khắc phục:**
- Dùng UptimeRobot (free) ping `/health` mỗi 5 phút để giữ server awake
- Hoặc upgrade lên paid plan ($7/tháng)

### API trả về `403 Forbidden` sau khi deploy

**Nguyên nhân:** CORS chưa cấu hình đúng cho production URL.

**Cách sửa:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://your-frontend.vercel.app",  # Thêm production URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Lỗi không xác định?

1. **Đọc error message kỹ** — Python traceback thường chỉ rõ file và dòng gây lỗi
2. **Google lỗi** — Copy paste error message vào Google, thường có giải pháp trên StackOverflow
3. **Check `.env`** — 80% lỗi production do biến môi trường thiếu hoặc sai
4. **Chạy `make check`** — Lint + format + typecheck + test trong một lệnh
5. **Xóa và tạo lại** — `rm -rf .venv && python3.11 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"`
