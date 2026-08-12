FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
COPY migrations ./migrations
COPY seeds ./seeds
COPY bacsi.csv benhvien.csv chuyenkhoa.csv ./import-data/
RUN pip install --no-cache-dir .
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser
EXPOSE 8103
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8103/health/live')" || exit 1
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8103"]
