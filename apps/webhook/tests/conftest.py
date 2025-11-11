"""Pytest configuration and fixtures."""

import importlib
import os
from collections.abc import Generator
from typing import Any
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy import JSON

os.makedirs(".cache", exist_ok=True)

# Configure deterministic test environment before importing app modules.
os.environ.setdefault("SEARCH_BRIDGE_DATABASE_URL", "sqlite+aiosqlite:///./.cache/test_webhook.db")
os.environ.setdefault("SEARCH_BRIDGE_API_SECRET", "test-api-secret-for-testing-only")
os.environ.setdefault(
    "SEARCH_BRIDGE_WEBHOOK_SECRET", "test-webhook-secret-for-testing-hmac-verification"
)
os.environ.setdefault("WEBHOOK_REDIS_URL", "memory://")
os.environ.setdefault("SEARCH_BRIDGE_REDIS_URL", "memory://")
os.environ.setdefault("REDIS_URL", "memory://")
os.environ.setdefault("WEBHOOK_TEST_MODE", "true")
os.environ.setdefault("WEBHOOK_ENABLE_WORKER", "false")
os.environ.setdefault("WEBHOOK_VECTOR_DIM", "3")

# Reload configuration and database modules so they pick up the test settings.
import app.config as app_config

app_config.settings = app_config.Settings()  # type: ignore[call-arg]

import app.database as app_database

importlib.reload(app_database)

from app.models import timing as timing_models

for table in timing_models.Base.metadata.tables.values():
    table.schema = None
    for column in table.columns:
        if column.type.__class__.__name__ == "JSONB":
            column.type = JSON()


_EXTERNAL_ENV_VAR = "WEBHOOK_RUN_EXTERNAL_TESTS"


def _external_tests_requested() -> bool:
    """Return True when external test suite should run against real services."""

    value = os.getenv(_EXTERNAL_ENV_VAR, "")
    return value.lower() in {"1", "true", "yes", "on"}


class InMemoryRedis:
    """Minimal Redis stub that satisfies health checks."""

    def __init__(self) -> None:
        self._closed = False

    def ping(self) -> bool:  # pragma: no cover - trivial
        return True

    def close(self) -> None:  # pragma: no cover - trivial
        self._closed = True

    def delete(self, _key: str) -> None:  # pragma: no cover - used in tests
        return None

    def scan_iter(self, _pattern: str):  # pragma: no cover - used in tests
        return iter(())

    def blpop(self, _key: str, timeout: int = 0):  # pragma: no cover - compatibility
        return None


_JOB_OPTION_KEYS = {
    "at_front",
    "description",
    "depends_on",
    "failure_ttl",
    "job_timeout",
    "meta",
    "result_ttl",
    "retry",
    "ttl",
}


class JobStub:
    """Represents an in-memory RQ job for testing."""

    def __init__(
        self,
        func_ref: Any,
        args: tuple[Any, ...],
        kwargs: dict[str, Any],
        job_id: str,
        options: dict[str, Any],
    ) -> None:
        self.func_ref = func_ref
        self.args = args
        self.kwargs = kwargs
        self.job_id = job_id
        self.job_options = options
        self.id = job_id
        self.result: Any = None
        self._status = "queued"

    def perform(self) -> None:
        """Execute the job synchronously."""

        try:
            if isinstance(self.func_ref, str):
                module_name, attribute = self.func_ref.rsplit(".", 1)
                target = getattr(importlib.import_module(module_name), attribute)
            else:
                target = self.func_ref
            self.result = target(*self.args, **self.kwargs)
            self._status = "finished"
        except Exception as exc:  # pragma: no cover - propagated for visibility
            self.result = exc
            self._status = "failed"
            raise

    def refresh(self) -> None:  # pragma: no cover - compatibility
        return None

    def get_status(self) -> str:  # pragma: no cover - compatibility
        return self._status

    @property
    def is_finished(self) -> bool:
        return self._status == "finished"

    @property
    def is_failed(self) -> bool:
        return self._status == "failed"


class InMemoryQueue:
    """Simple queue that records enqueued jobs."""

    def __init__(self, name: str = "indexing", connection: Any | None = None) -> None:
        self.name = name
        self.connection = connection
        self.jobs: list[JobStub] = []

    def enqueue(self, func: Any, *args: Any, **kwargs: Any) -> JobStub:
        job_id = kwargs.pop("job_id", None) or f"inmem-job-{uuid4().hex[:8]}"
        job_kwargs = {k: v for k, v in kwargs.items() if k not in _JOB_OPTION_KEYS}
        job_options = {k: v for k, v in kwargs.items() if k in _JOB_OPTION_KEYS}
        job = JobStub(func, args, job_kwargs, job_id, job_options)
        self.jobs.append(job)
        return job

    def clear(self) -> None:
        self.jobs.clear()

    def __len__(self) -> int:  # pragma: no cover - trivial
        return len(self.jobs)


class InMemoryVectorStore:
    """In-memory replacement for the Qdrant vector store."""

    collections: dict[str, list[dict[str, Any]]] = {}

    def __init__(
        self,
        url: str,
        collection_name: str,
        vector_dim: int,
        timeout: int = 60,
    ) -> None:
        self.url = url
        self.collection_name = collection_name
        self.vector_dim = vector_dim
        self.timeout = timeout
        self._storage = self.collections.setdefault(collection_name, [])

    async def ensure_collection(self) -> None:  # pragma: no cover - trivial
        return None

    async def health_check(self) -> bool:  # pragma: no cover - trivial
        return True

    async def count_points(self) -> int:
        return len(self._storage)

    async def close(self) -> None:  # pragma: no cover - trivial
        return None

    async def index_chunks(
        self,
        chunks: list[dict[str, Any]],
        embeddings: list[list[float]],
        document_url: str,
    ) -> int:
        if len(chunks) != len(embeddings):
            raise ValueError("Chunks and embeddings must have the same length")

        for chunk, embedding in zip(chunks, embeddings):
            self._storage.append(
                {
                    "chunk": chunk,
                    "embedding": embedding,
                    "document_url": document_url,
                }
            )
        return len(chunks)

    @classmethod
    def reset(cls) -> None:
        cls.collections.clear()


class InMemoryEmbeddingService:
    """Deterministic embedding stub for tests."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:  # pragma: no cover - configuration
        self.vector_dim = 3

    async def close(self) -> None:  # pragma: no cover - trivial
        return None

    async def health_check(self) -> bool:  # pragma: no cover - trivial
        return True

    async def embed_single(self, text: str) -> list[float]:
        return self._embed_text(text)

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_text(text) for text in texts]

    async def embed(self, text_or_texts: str | list[str]) -> list[float] | list[list[float]]:
        if isinstance(text_or_texts, list):
            return await self.embed_batch(text_or_texts)
        return await self.embed_single(text_or_texts)

    def _embed_text(self, text: str) -> list[float]:
        length = float(len(text))
        return [length, length % 7, length % 3]


@pytest.fixture
def in_memory_queue() -> InMemoryQueue:
    """Provide an in-memory queue shared with dependency overrides."""

    return InMemoryQueue()


@pytest.fixture
def in_memory_vector_store_cls() -> type[InMemoryVectorStore]:
    """Expose the in-memory vector store class for assertions."""

    return InMemoryVectorStore


@pytest.fixture(autouse=True)
def stub_external_services(
    monkeypatch: pytest.MonkeyPatch,
    request: pytest.FixtureRequest,
    in_memory_queue: InMemoryQueue,
) -> Generator[None, None, None]:
    """Swap external infrastructure with in-memory doubles unless opted out."""

    if request.node.get_closest_marker("external"):
        if not _external_tests_requested():
            pytest.skip(
                "External integration tests require WEBHOOK_RUN_EXTERNAL_TESTS=1",
            )
        yield
        return

    import app.api.dependencies as deps
    import app.api.routes as routes
    import app.rate_limit as rate_limit_module
    import app.services.embedding as embedding_module
    import app.services.vector_store as vector_store_module
    import app.worker as worker_module

    redis_conn = InMemoryRedis()
    InMemoryVectorStore.reset()
    in_memory_queue.clear()

    deps._text_chunker = None
    deps._embedding_service = None
    deps._vector_store = None
    deps._bm25_engine = None
    deps._indexing_service = None
    deps._search_orchestrator = None

    monkeypatch.setattr(deps, "get_redis_connection", lambda: redis_conn)
    monkeypatch.setattr(deps, "_redis_conn", redis_conn, raising=False)
    monkeypatch.setattr(deps, "_rq_queue", in_memory_queue, raising=False)
    monkeypatch.setattr(deps, "VectorStore", InMemoryVectorStore)
    monkeypatch.setattr(deps, "EmbeddingService", InMemoryEmbeddingService)
    monkeypatch.setattr(deps, "Queue", lambda *args, **kwargs: in_memory_queue)

    monkeypatch.setattr(routes, "Queue", lambda *args, **kwargs: in_memory_queue)

    monkeypatch.setattr(vector_store_module, "VectorStore", InMemoryVectorStore)
    monkeypatch.setattr(embedding_module, "EmbeddingService", InMemoryEmbeddingService)
    monkeypatch.setattr(worker_module, "VectorStore", InMemoryVectorStore)
    monkeypatch.setattr(worker_module, "EmbeddingService", InMemoryEmbeddingService)
    rate_limit_module.limiter.enabled = False

    try:
        yield
    finally:
        InMemoryVectorStore.reset()
        in_memory_queue.clear()
        deps._text_chunker = None
        deps._embedding_service = None
        deps._vector_store = None
        deps._bm25_engine = None
        deps._indexing_service = None
        deps._search_orchestrator = None


@pytest_asyncio.fixture(autouse=True)
async def cleanup_database_engine():
    """
    Cleanup database engine after each test.

    This ensures the database engine is disposed after each test,
    preventing event loop conflicts when tests run in different event loops.
    The engine will be recreated on next use.
    """
    yield
    # Clean up after test
    from app import database

    if database.engine:
        await database.engine.dispose()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def initialize_test_database():
    """Ensure SQLite schema exists for tests."""
    from app.database import close_database, init_database

    await init_database()
    yield
    await close_database()


@pytest.fixture
def sample_markdown() -> str:
    """Sample markdown text for testing."""
    return """
    # Machine Learning Guide

    Machine learning is a subset of artificial intelligence that enables systems
    to learn and improve from experience without being explicitly programmed.

    ## Types of Machine Learning

    1. **Supervised Learning**: Learn from labeled data
    2. **Unsupervised Learning**: Find patterns in unlabeled data
    3. **Reinforcement Learning**: Learn through trial and error

    Machine learning algorithms can be used for classification, regression,
    clustering, and dimensionality reduction tasks.
    """


@pytest.fixture
def sample_document_dict() -> dict[str, Any]:
    """Sample document for testing."""
    return {
        "url": "https://example.com/ml-guide",
        "resolvedUrl": "https://example.com/ml-guide",
        "title": "Machine Learning Guide",
        "description": "A comprehensive guide to machine learning",
        "markdown": """
        # Machine Learning Guide

        Machine learning is a subset of artificial intelligence.
        """,
        "html": "<html><body><h1>Machine Learning Guide</h1></body></html>",
        "statusCode": 200,
        "language": "en",
        "country": "US",
        "isMobile": False,
    }


@pytest.fixture
def api_secret_header() -> dict[str, str]:
    """Provide API secret header for authenticated requests."""
    from app.config import settings

    return {"Authorization": f"Bearer {settings.api_secret}"}


@pytest.fixture
def api_secret() -> str:
    """Expose the API secret string for authenticated requests."""

    from app.config import settings

    return settings.api_secret


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """Create a FastAPI test client with application lifespan support."""

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest_asyncio.fixture
async def db_session():
    """
    Provide a database session for tests that need direct database access.

    This fixture creates a new session for each test and rolls back
    changes after the test completes to maintain test isolation.
    """
    from app.database import get_db_context

    async with get_db_context() as session:
        yield session
        # Rollback is handled by get_db_context on exception
        # For successful tests, we still want to rollback to maintain isolation
        await session.rollback()


@pytest.fixture
def test_queue():
    """
    Provide a mock RQ queue for testing webhook handlers.

    Returns a MagicMock that can be used to verify queue.enqueue calls.
    """
    from unittest.mock import MagicMock

    queue = MagicMock()
    # Configure enqueue to return a job with an ID
    job = MagicMock()
    job.id = "test-job-id"
    queue.enqueue.return_value = job
    return queue
