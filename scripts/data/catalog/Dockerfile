FROM python:3.11-slim

WORKDIR /workspace

COPY scripts/data/catalog/catalog_import.py ./scripts/data/catalog/catalog_import.py

RUN pip install --no-cache-dir "asyncpg>=0.29.0" "pydantic>=2.10.0"

ENTRYPOINT ["python", "scripts/data/catalog/catalog_import.py"]
