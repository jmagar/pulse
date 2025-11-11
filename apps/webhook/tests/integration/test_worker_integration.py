import sys
from unittest.mock import patch

from fastapi.testclient import TestClient


def test_worker_starts_with_api_when_enabled(monkeypatch):
    """Worker thread starts during API startup when enabled."""
    # Set env var before importing app
    monkeypatch.setenv("WEBHOOK_ENABLE_WORKER", "true")

    # Clear cached modules to ensure fresh import with new env vars
    for module in list(sys.modules.keys()):
        if module.startswith("app."):
            del sys.modules[module]

    # Mock the worker's _run_worker method to keep thread alive
    import time

    def mock_run_worker(self):
        # Keep thread alive during test
        while self._running:
            time.sleep(0.1)

    with patch("app.worker_thread.WorkerThreadManager._run_worker", mock_run_worker):
        # Import after setting env var and patching
        from app.config import settings
        from app.main import app

        assert settings.enable_worker is True

        # Use TestClient which triggers lifespan
        with TestClient(app) as client:
            # API should be running
            response = client.get("/health")
            assert response.status_code == 200

            # Worker thread should be running (check via app state)
            assert hasattr(app.state, "worker_manager")
            # Thread exists and is alive
            assert app.state.worker_manager._thread is not None
            assert app.state.worker_manager._thread.is_alive()
            assert app.state.worker_manager._running is True


def test_worker_does_not_start_when_disabled(monkeypatch):
    """Worker thread does not start when disabled."""
    # Set env var before importing app
    monkeypatch.setenv("WEBHOOK_ENABLE_WORKER", "false")

    # Clear cached modules to ensure fresh import with new env vars
    for module in list(sys.modules.keys()):
        if module.startswith("app."):
            del sys.modules[module]

    # Import after setting env var
    from app.config import settings
    from app.main import app

    assert settings.enable_worker is False

    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200

        # Worker manager should not exist when disabled
        assert not hasattr(app.state, "worker_manager")
