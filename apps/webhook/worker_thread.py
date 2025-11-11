"""
Background worker thread manager.

Runs the RQ worker in a background thread within the FastAPI process.
"""

import threading

from rq import Worker

from config import settings
from utils.logging import get_logger
from infra.redis import get_redis_connection

logger = get_logger(__name__)


class WorkerThreadManager:
    """
    Manages the RQ worker in a background thread.

    The worker thread runs alongside the FastAPI application, processing
    indexing jobs from the Redis queue. It can be started and stopped
    independently of the API server.
    """

    def __init__(self) -> None:
        """Initialize the worker thread manager."""
        self._thread: threading.Thread | None = None
        self._running: bool = False
        self._worker: Worker | None = None

    def start(self) -> None:
        """
        Start the worker thread.

        Raises:
            RuntimeError: If worker thread is already running
        """
        if self._thread is not None and self._thread.is_alive():
            raise RuntimeError("Worker thread already running")

        self._running = True
        self._thread = threading.Thread(
            target=self._run_worker,
            name="rq-worker",
            daemon=True,
        )
        self._thread.start()
        logger.info("Worker thread started")

    def stop(self) -> None:
        """Stop the worker thread gracefully."""
        if not self._running:
            logger.warning("Worker thread not running")
            return

        logger.info("Stopping worker thread...")
        self._running = False

        # Send stop signal to RQ worker
        if self._worker is not None:
            self._worker.request_stop(signum=None, frame=None)  # type: ignore[no-untyped-call]

        # Wait for thread to exit (with timeout)
        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=10.0)
            if self._thread.is_alive():
                logger.error("Worker thread did not stop gracefully")
            else:
                logger.info("Worker thread stopped")

    def _run_worker(self) -> None:
        """
        Run the RQ worker (called in background thread).

        This method runs in a separate thread and processes jobs from Redis.
        """
        try:
            logger.info("Connecting to Redis for worker", redis_url=settings.redis_url)
            redis_conn = get_redis_connection()

            # Create worker
            self._worker = Worker(
                queues=["indexing"],
                connection=redis_conn,
                name="search-bridge-worker",
            )

            # Disable signal handlers since we're in a background thread
            # Signal handlers only work in the main thread
            # See: .docs/webhook-worker-debug-2025-11-11.md for full explanation
            self._worker._install_signal_handlers = lambda: None  # type: ignore[method-assign]

            logger.info("Worker initialized, listening for jobs...")

            # Work loop
            self._worker.work(with_scheduler=False)

        except Exception:
            logger.exception("Worker thread crashed")
        finally:
            self._running = False
            logger.info("Worker thread exiting")
