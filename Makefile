.PHONY: run-backend run-web run-mobile test-backend lint format check clean

run-backend:
	cd apps/backend && uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

run-web:
	cd apps/web && npm run dev

run-mobile:
	cd apps/mobile && npm start

test-backend:
	cd apps/backend && PYTHONPATH=. pytest tests/ -v

lint:
	cd apps/backend && ruff check src/ tests/

format:
	cd apps/backend && ruff format src/ tests/

check: lint test-backend

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
	find . -type d -name .ruff_cache -exec rm -rf {} +
