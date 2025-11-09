.PHONY: install dev worker test services services-stop clean format lint type-check help

help:
	@echo "Firecrawl Search Bridge - Make Commands"
	@echo "========================================"
	@echo "install         - Install dependencies with uv"
	@echo "dev             - Run API server in development mode"
	@echo "worker          - Run background worker"
	@echo "test            - Run all tests with coverage"
	@echo "services        - Start all Docker services (Redis, Qdrant, TEI)"
	@echo "services-stop   - Stop all Docker services"
	@echo "services-logs   - View Docker service logs"
	@echo "clean           - Clean cache and build artifacts"
	@echo "format          - Format code with ruff"
	@echo "lint            - Lint code with ruff"
	@echo "type-check      - Type check with mypy"
	@echo "check           - Run format, lint, and type-check"
	@echo "ports           - Check if required ports are available"

install:
	uv sync

dev:
	uv run uvicorn app.main:app --host 0.0.0.0 --port 52100 --reload

worker:
	uv run python -m app.worker

test:
	uv run pytest tests/ -v

services:
	docker compose up -d
	@echo "Waiting for services to be ready..."
	@sleep 5
	@echo "Checking service health..."
	@curl -s http://localhost:52101 > /dev/null && echo "✓ Redis is up" || echo "✗ Redis failed"
	@curl -s http://localhost:52102/collections > /dev/null && echo "✓ Qdrant is up" || echo "✗ Qdrant failed"
	@curl -s http://localhost:52104/health > /dev/null && echo "✓ TEI is up" || echo "✗ TEI failed"

services-stop:
	docker compose down

services-logs:
	docker compose logs -f

clean:
	rm -rf .cache .pytest_cache .mypy_cache .ruff_cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete

format:
	uv run ruff format .

lint:
	uv run ruff check .

type-check:
	uv run mypy app/

check: format lint type-check

ports:
	@echo "Checking port availability..."
	@lsof -i :52100 > /dev/null && echo "✗ Port 52100 in use" || echo "✓ Port 52100 available"
	@lsof -i :52101 > /dev/null && echo "✗ Port 52101 in use" || echo "✓ Port 52101 available"
	@lsof -i :52102 > /dev/null && echo "✗ Port 52102 in use" || echo "✓ Port 52102 available"
	@lsof -i :52103 > /dev/null && echo "✗ Port 52103 in use" || echo "✓ Port 52103 available"
	@lsof -i :52104 > /dev/null && echo "✗ Port 52104 in use" || echo "✓ Port 52104 available"
