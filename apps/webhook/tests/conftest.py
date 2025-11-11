"""
Pytest configuration and fixtures.
"""

import importlib
import os
from typing import Any

import pytest
import pytest_asyncio

os.makedirs(".cache", exist_ok=True)

# Configure deterministic test environment before importing app modules.
# Use environment variables for credentials, falling back to common defaults
db_user = os.getenv("POSTGRES_USER", "postgres")
db_pass = os.getenv("POSTGRES_PASSWORD", "postgres")
db_host = os.getenv("POSTGRES_HOST", "localhost")
db_port = os.getenv("POSTGRES_PORT", "5432")
os.environ.setdefault(
    "WEBHOOK_DATABASE_URL",
    f"postgresql+asyncpg://{db_user}:{db_pass}@{db_host}:{db_port}/webhook_test"
)
os.environ.setdefault("WEBHOOK_API_SECRET", "test-api-secret-for-testing-only")
os.environ.setdefault(
    "WEBHOOK_SECRET", "test-webhook-secret-for-testing-hmac-verification"
)
os.environ.setdefault("WEBHOOK_TEST_MODE", "true")
os.environ.setdefault("WEBHOOK_ENABLE_WORKER", "false")

# Reload configuration and database modules so they pick up the test settings.
import app.config as app_config

app_config.settings = app_config.Settings()  # type: ignore[call-arg]

import app.database as app_database

importlib.reload(app_database)


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
    """Ensure PostgreSQL schema exists for tests."""
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
