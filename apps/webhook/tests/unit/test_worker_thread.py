import time
from unittest.mock import Mock, patch

import pytest


def test_worker_thread_manager_start():
    """WorkerThreadManager starts worker in background thread."""
    from worker_thread import WorkerThreadManager

    manager = WorkerThreadManager()

    # Start worker (should not block)
    manager.start()

    # Thread should be running
    assert manager._thread is not None
    assert manager._thread.is_alive()
    assert manager._running is True

    # Cleanup
    manager.stop()


def test_worker_thread_manager_stop():
    """WorkerThreadManager stops worker gracefully."""
    from worker_thread import WorkerThreadManager

    manager = WorkerThreadManager()
    manager.start()

    # Stop worker
    manager.stop()

    # Thread should be stopped
    assert manager._running is False
    # Give thread time to exit
    time.sleep(0.5)
    assert not manager._thread.is_alive()


def test_worker_thread_manager_does_not_start_twice():
    """WorkerThreadManager cannot be started twice."""
    from worker_thread import WorkerThreadManager

    manager = WorkerThreadManager()

    with patch("worker_thread.Redis") as mock_redis:
        mock_redis.from_url.return_value = Mock()

        manager.start()

        # Trying to start again should raise
        with pytest.raises(RuntimeError, match="Worker thread already running"):
            manager.start()

        manager.stop()
