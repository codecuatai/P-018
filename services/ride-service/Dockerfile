FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml ./
COPY alembic.ini ./
COPY migrations ./migrations
COPY seeds ./seeds
COPY src ./src
RUN pip install --no-cache-dir .
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser
EXPOSE 8101
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import os, urllib.request; urllib.request.urlopen('http://localhost:' + os.environ['SERVICE_PORT'] + '/health/live')" || exit 1
CMD ["sh", "-c", "exec uvicorn src.main:app --host 0.0.0.0 --port \"$SERVICE_PORT\""]
