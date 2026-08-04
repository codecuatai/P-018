FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ride_service ./ride_service

EXPOSE 8000
CMD ["uvicorn", "ride_service.main:app", "--host", "0.0.0.0", "--port", "8000"]