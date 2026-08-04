.PHONY: run-backend run-web run-mobile run-ride run-payment run-services test-backend test-services lint format check clean

run-backend:
	cd apps/backend && uvicorn src.main:app --reload --host 0.0.0.0 --port 8002

run-web:
	cd apps/web && npm run dev

run-mobile:
	cd apps/mobile && npm start

run-ride:
	cd apps/services && python -m uvicorn ride_service.main:app --port 8000 --reload

run-payment:
	cd apps/services && python -m uvicorn payment_service.main:app --port 8001 --reload

run-services:
	start "Ride Service" cmd /c "cd apps/services && python -m uvicorn ride_service.main:app --port 8000 --reload"
	start "Payment Service" cmd /c "cd apps/services && python -m uvicorn payment_service.main:app --port 8001 --reload"

test-backend:
	cd apps/backend && PYTHONPATH=. pytest tests/ -v

test-services:
	set PYTHONPATH=apps/services && pytest apps/services/tests/ -v

lint:
	cd apps/backend && ruff check src/ tests/
	cd apps/services && ruff check ride_service/ payment_service/ tests/

format:
	cd apps/backend && ruff format src/ tests/
	cd apps/services && ruff format ride_service/ payment_service/ tests/

check: lint test-backend test-services

clean:
	Get-ChildItem -Recurse -Directory -Force | Where-Object { $_.Name -in @('__pycache__','.pytest_cache','.ruff_cache') } | Remove-Item -Recurse -Force