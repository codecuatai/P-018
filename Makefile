.PHONY: run-agent run-web run-mobile test-agent lint-agent compose-config

run-agent:
	cd apps/agent-service && uvicorn src.main:app --reload --host 0.0.0.0 --port 8001

run-web:
	cd apps/web && npm run dev

run-mobile:
	cd apps/mobile && npm start

test-agent:
	cd apps/agent-service && python -m pytest tests -q

lint-agent:
	python -m ruff check apps/agent-service/src apps/agent-service/tests

compose-config:
	docker compose config --quiet
