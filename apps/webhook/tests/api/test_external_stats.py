"""Tests for external service stats API."""

import json
import os
from collections.abc import Awaitable, Callable
from importlib import reload

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import config
from api import deps

os.environ.setdefault("WEBHOOK_SKIP_DB_FIXTURES", "1")


async def _noop_verify_api_secret(
    authorization: str | None = None,
) -> None:  # pragma: no cover - test helper
    return None


def _build_client(
    monkeypatch: pytest.MonkeyPatch,
    services: list[dict[str, object]],
    run_command: Callable[[list[str]], Awaitable[str]],
) -> TestClient:
    """Create a TestClient with patched settings and command runner."""

    monkeypatch.setenv("WEBHOOK_API_SECRET", "dev-unsafe-api-secret-change-in-production")
    monkeypatch.setenv("WEBHOOK_SECRET", "dev-unsafe-hmac-secret-change-in-production")
    monkeypatch.setenv("WEBHOOK_TEST_MODE", "true")
    monkeypatch.setenv("WEBHOOK_SKIP_DB_FIXTURES", "1")
    monkeypatch.setenv("WEBHOOK_EXTERNAL_SERVICES", json.dumps(services))
    monkeypatch.setenv("WEBHOOK_DOCKER_BIN", "/usr/bin/docker")

    reload(config)

    import api.routers.external_stats as external_stats

    reload(external_stats)
    monkeypatch.setattr(external_stats, "run_command", run_command)

    app = FastAPI()
    app.dependency_overrides[deps.verify_api_secret] = _noop_verify_api_secret
    app.include_router(external_stats.router)

    return TestClient(app)


def test_external_services_returns_parsed_stats(monkeypatch: pytest.MonkeyPatch) -> None:
    """API should surface parsed docker stats for configured services."""

    async def fake_run_command(args: list[str]) -> str:
        if args[:2] == ["/usr/bin/docker", "--context"] and "inspect" in args:
            return json.dumps(
                [
                    {
                        "Id": "abc123",
                        "Name": "/pulse_tei",
                        "State": {
                            "Status": "running",
                            "RestartCount": 2,
                            "StartedAt": "2025-11-17T12:00:00Z",
                            "FinishedAt": "0001-01-01T00:00:00Z",
                            "Health": {"Status": "healthy"},
                        },
                    }
                ]
            )

        if args[:2] == ["/usr/bin/docker", "--context"] and "stats" in args:
            return "\n".join(
                [
                    json.dumps(
                        {
                            "Container": "abc123",
                            "CPUPerc": "12.5%",
                            "MemUsage": "64.5MiB / 2GiB",
                        }
                    )
                ]
            )

        if args[:2] == ["du", "-sb"]:
            return "4096\t/data/pulse_tei\n"

        raise AssertionError(f"Unexpected command: {args}")

    client = _build_client(
        monkeypatch,
        services=[
            {
                "name": "pulse_tei",
                "context": "remote-gpu",
                "health_host": "pulse_tei",
                "health_port": 52000,
                "health_path": "/health",
                "volumes": ["/data/pulse_tei"],
                "port": 52000,
            }
        ],
        run_command=fake_run_command,
    )

    response = client.get("/api/external/services")

    assert response.status_code == 200
    body = response.json()
    assert body["services"][0]["name"] == "pulse_tei"
    assert body["services"][0]["status"] == "running"
    assert body["services"][0]["cpu_percent"] == pytest.approx(12.5)
    assert body["services"][0]["memory_mb"] == pytest.approx(64.5)
    assert body["services"][0]["volume_bytes"] == 4096
    assert body["services"][0]["health_check"]["status"] == "healthy"
    assert body["services"][0]["replica_count"] == 1


def test_external_services_handles_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    """API should gracefully return unknown status when docker calls fail."""

    async def failing_run_command(args: list[str]) -> str:
        if args[:2] == ["du", "-sb"]:
            raise RuntimeError("du failed")

        raise RuntimeError("docker unavailable")

    client = _build_client(
        monkeypatch,
        services=[
            {
                "name": "missing_service",
                "context": "remote-gpu",
                "volumes": ["/data/missing"],
                "port": 52001,
            }
        ],
        run_command=failing_run_command,
    )

    response = client.get("/api/external/services")

    assert response.status_code == 200
    body = response.json()
    service = body["services"][0]
    assert service["name"] == "missing_service"
    assert service["status"] == "unknown"
    assert service["cpu_percent"] == 0
    assert service["memory_mb"] == 0
    assert service["volume_bytes"] == 0
    assert service["replica_count"] == 0
