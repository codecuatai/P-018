FROM python:3.11-slim AS builder

WORKDIR /app
COPY apps/backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --user -r requirements.txt

FROM python:3.11-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH
COPY apps/backend/src ./src
RUN mkdir -p /app/data
EXPOSE 8002
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8002/health')" || exit 1
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8002"]