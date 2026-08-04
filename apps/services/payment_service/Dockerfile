FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY payment_service ./payment_service

EXPOSE 8001
CMD ["uvicorn", "payment_service.main:app", "--host", "0.0.0.0", "--port", "8001"]