# Timing Middleware Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add comprehensive timing metrics tracking to the webhook server for all operations (scrapes, crawls, embeddings, Qdrant storage) with PostgreSQL persistence and REST API query interface.

**Architecture:** FastAPI middleware captures HTTP request timing, TimingContext utility tracks operation-level metrics (chunking, embedding, Qdrant, BM25), async PostgreSQL storage with SQLAlchemy, REST API endpoints for metrics retrieval and analysis.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 (async), asyncpg, Alembic, PostgreSQL, Pydantic

---

## Prerequisites

### Task 0: Install Dependencies

**Files:**
- Modify: `pyproject.toml` (add dependencies)

**Step 1: Add SQLAlchemy dependencies**

Run:
```bash
cd /home/jmagar/code/fc-bridge
uv add "sqlalchemy[asyncio]>=2.0.0" asyncpg alembic
```

Expected: Dependencies installed successfully

**Step 2: Verify installation**

Run:
```bash
uv run python -c "import sqlalchemy; import asyncpg; import alembic; print('All imports successful')"
```

Expected: "All imports successful"

**Step 3: Commit dependency changes**

```bash
git add pyproject.toml uv.lock
git commit -m "build: add SQLAlchemy, asyncpg, and alembic dependencies"
```

---

## Task 1: Database Models

**Files:**
- Create: `app/models/__init__.py`
- Create: `app/models/timing.py`
- Create: `tests/unit/test_models_timing.py`

**Step 1: Create models package**

Create `app/models/__init__.py`:
```python
"""SQLAlchemy models for the application."""
```

**Step 2: Write test for RequestMetric model**

Create `tests/unit/test_models_timing.py`:
```python
"""Unit tests for timing models."""

from datetime import datetime

import pytest

from app.models.timing import RequestMetric


def test_request_metric_creation():
    """Test RequestMetric model can be instantiated."""
    metric = RequestMetric(
        method="GET",
        path="/api/test",
        status_code=200,
        duration_ms=123.45,
        request_id="test-req-123",
    )

    assert metric.method == "GET"
    assert metric.path == "/api/test"
    assert metric.status_code == 200
    assert metric.duration_ms == 123.45
    assert metric.request_id == "test-req-123"


def test_request_metric_repr():
    """Test RequestMetric __repr__ is meaningful."""
    metric = RequestMetric(
        method="POST",
        path="/api/webhook",
        status_code=201,
        duration_ms=456.78,
    )

    repr_str = repr(metric)
    assert "RequestMetric" in repr_str
    assert "/api/webhook" in repr_str
    assert "456.78" in repr_str
```

**Step 3: Run test to verify it fails**

Run:
```bash
uv run pytest tests/unit/test_models_timing.py -v
```

Expected: FAIL with "ModuleNotFoundError: No module named 'app.models.timing'"

**Step 4: Implement RequestMetric model**

Create `app/models/timing.py`:
```python
"""
SQLAlchemy models for timing metrics.

These models store performance metrics for all operations.
"""

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all models."""
    pass


class RequestMetric(Base):
    """
    HTTP request-level timing metrics.

    Captures total request duration, endpoint information, and response status.
    """

    __tablename__ = "request_metrics"

    id: UUID = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    timestamp: datetime = Column(DateTime(timezone=True), nullable=False, default=func.now(), index=True)
    method: str = Column(String(10), nullable=False, index=True)
    path: str = Column(String(500), nullable=False, index=True)
    status_code: int = Column(Integer, nullable=False, index=True)
    duration_ms: float = Column(Float, nullable=False, index=True)
    request_id: str | None = Column(String(100), nullable=True, index=True)
    client_ip: str | None = Column(String(50), nullable=True)
    user_agent: str | None = Column(String(500), nullable=True)
    metadata: dict[str, Any] | None = Column(JSONB, nullable=True)
    created_at: datetime = Column(DateTime(timezone=True), nullable=False, default=func.now())

    def __repr__(self) -> str:
        return f"<RequestMetric(path={self.path}, duration_ms={self.duration_ms}, status={self.status_code})>"


class OperationMetric(Base):
    """
    Operation-level timing metrics.

    Captures duration of specific operations like chunking, embedding generation,
    Qdrant indexing, and BM25 indexing.
    """

    __tablename__ = "operation_metrics"

    id: UUID = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    timestamp: datetime = Column(DateTime(timezone=True), nullable=False, default=func.now(), index=True)
    operation_type: str = Column(String(50), nullable=False, index=True)
    operation_name: str = Column(String(100), nullable=False, index=True)
    duration_ms: float = Column(Float, nullable=False, index=True)
    success: bool = Column(Boolean, nullable=False, default=True, index=True)
    error_message: str | None = Column(Text, nullable=True)
    request_id: str | None = Column(String(100), nullable=True, index=True)
    job_id: str | None = Column(String(100), nullable=True, index=True)
    document_url: str | None = Column(String(500), nullable=True, index=True)
    metadata: dict[str, Any] | None = Column(JSONB, nullable=True)
    created_at: datetime = Column(DateTime(timezone=True), nullable=False, default=func.now())

    def __repr__(self) -> str:
        return f"<OperationMetric(type={self.operation_type}, name={self.operation_name}, duration_ms={self.duration_ms})>"
```

**Step 5: Run tests to verify they pass**

Run:
```bash
uv run pytest tests/unit/test_models_timing.py -v
```

Expected: All tests PASS

**Step 6: Add test for OperationMetric model**

Add to `tests/unit/test_models_timing.py`:
```python
from app.models.timing import OperationMetric


def test_operation_metric_creation():
    """Test OperationMetric model can be instantiated."""
    metric = OperationMetric(
        operation_type="embedding",
        operation_name="embed_batch",
        duration_ms=892.45,
        success=True,
        request_id="test-req-123",
        job_id="test-job-456",
        document_url="https://example.com",
    )

    assert metric.operation_type == "embedding"
    assert metric.operation_name == "embed_batch"
    assert metric.duration_ms == 892.45
    assert metric.success is True
    assert metric.request_id == "test-req-123"
    assert metric.job_id == "test-job-456"
    assert metric.document_url == "https://example.com"


def test_operation_metric_repr():
    """Test OperationMetric __repr__ is meaningful."""
    metric = OperationMetric(
        operation_type="qdrant",
        operation_name="index_chunks",
        duration_ms=156.78,
        success=True,
    )

    repr_str = repr(metric)
    assert "OperationMetric" in repr_str
    assert "qdrant" in repr_str
    assert "index_chunks" in repr_str
    assert "156.78" in repr_str
```

**Step 7: Run tests to verify they pass**

Run:
```bash
uv run pytest tests/unit/test_models_timing.py -v
```

Expected: All tests PASS

**Step 8: Commit models**

```bash
git add app/models/ tests/unit/test_models_timing.py
git commit -m "feat(models): add timing metrics models for request and operation tracking"
```

---

## Task 2: Database Configuration

**Files:**
- Modify: `app/config.py`
- Modify: `.env.example`
- Create: `tests/unit/test_config_database.py`

**Step 1: Write test for database_url config**

Create `tests/unit/test_config_database.py`:
```python
"""Unit tests for database configuration."""

import os

import pytest

from app.config import settings


def test_database_url_from_env():
    """Test database_url can be loaded from environment."""
    # Set environment variable
    os.environ["SEARCH_BRIDGE_DATABASE_URL"] = "postgresql+asyncpg://test:pass@localhost/testdb"

    # Reload settings (this may need adjustment based on your config pattern)
    from app.config import Settings
    test_settings = Settings()

    assert test_settings.database_url == "postgresql+asyncpg://test:pass@localhost/testdb"

    # Cleanup
    del os.environ["SEARCH_BRIDGE_DATABASE_URL"]


def test_database_url_default():
    """Test database_url has a sensible default."""
    from app.config import Settings
    test_settings = Settings()

    assert "postgresql+asyncpg://" in test_settings.database_url
    assert test_settings.database_url is not None
```

**Step 2: Run test to verify it fails**

Run:
```bash
uv run pytest tests/unit/test_config_database.py -v
```

Expected: FAIL with "Settings object has no attribute 'database_url'"

**Step 3: Add database_url to Settings**

Modify `app/config.py` - add to Settings class:
```python
# PostgreSQL Database (for timing metrics)
database_url: str = Field(
    default="postgresql+asyncpg://fc_bridge:password@localhost:5432/fc_bridge",
    description="PostgreSQL connection URL for timing metrics"
)
```

**Step 4: Run tests to verify they pass**

Run:
```bash
uv run pytest tests/unit/test_config_database.py -v
```

Expected: All tests PASS

**Step 5: Update .env.example**

Add to `.env.example`:
```bash
# PostgreSQL Database (for timing metrics)
SEARCH_BRIDGE_DATABASE_URL=postgresql+asyncpg://fc_bridge:password@localhost:5432/fc_bridge
```

**Step 6: Commit configuration changes**

```bash
git add app/config.py .env.example tests/unit/test_config_database.py
git commit -m "feat(config): add database_url setting for timing metrics"
```

---

## Task 3: Database Session Management

**Files:**
- Create: `app/database.py`
- Create: `tests/unit/test_database.py`

**Step 1: Write test for database session creation**

Create `tests/unit/test_database.py`:
```python
"""Unit tests for database session management."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_get_db_session_yields_session():
    """Test get_db_session yields an AsyncSession."""
    from app.database import get_db_session

    async for session in get_db_session():
        assert isinstance(session, AsyncSession)
        break  # Only need to test one iteration


@pytest.mark.asyncio
async def test_get_db_context_returns_session():
    """Test get_db_context returns an AsyncSession."""
    from app.database import get_db_context

    async with get_db_context() as session:
        assert isinstance(session, AsyncSession)
```

**Step 2: Run test to verify it fails**

Run:
```bash
uv run pytest tests/unit/test_database.py -v
```

Expected: FAIL with "ModuleNotFoundError: No module named 'app.database'"

**Step 3: Implement database session management**

Create `app/database.py`:
```python
"""
Database session management for timing metrics.

Provides async database sessions using SQLAlchemy 2.0.
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings
from app.utils.logging import get_logger

logger = get_logger(__name__)

# Create async engine
engine = create_async_engine(
    settings.database_url,
    echo=False,  # Set to True for SQL query logging
    pool_pre_ping=True,  # Verify connections before using
    pool_size=20,  # Connection pool size
    max_overflow=10,  # Additional connections if pool is full
)

# Create session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Provide a database session for dependency injection.

    Yields:
        AsyncSession: Database session

    Example:
        ```python
        @router.get("/metrics")
        async def get_metrics(db: AsyncSession = Depends(get_db_session)):
            result = await db.execute(select(RequestMetric))
            return result.scalars().all()
        ```
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """
    Provide a database session for context manager usage.

    Yields:
        AsyncSession: Database session

    Example:
        ```python
        async with get_db_context() as db:
            db.add(metric)
            await db.commit()
        ```
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_database() -> None:
    """
    Initialize database (create tables if they don't exist).

    Note: In production, use Alembic migrations instead.
    """
    from app.models.timing import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    logger.info("Database initialized")


async def close_database() -> None:
    """Close database connections."""
    await engine.dispose()
    logger.info("Database connections closed")
```

**Step 4: Run tests to verify they pass**

Run:
```bash
uv run pytest tests/unit/test_database.py -v
```

Expected: All tests PASS

**Step 5: Commit database session management**

```bash
git add app/database.py tests/unit/test_database.py
git commit -m "feat(database): add async session management for timing metrics"
```

---

## Task 4: Timing Context Utility

**Files:**
- Create: `app/utils/timing.py`
- Create: `tests/unit/test_timing_context.py`

**Step 1: Write test for TimingContext success case**

Create `tests/unit/test_timing_context.py`:
```python
"""Unit tests for TimingContext."""

import asyncio

import pytest


@pytest.mark.asyncio
async def test_timing_context_success():
    """Test timing context tracks duration correctly."""
    from app.utils.timing import TimingContext

    async with TimingContext("test", "test_operation") as ctx:
        # Simulate some work
        await asyncio.sleep(0.1)

    assert ctx.duration_ms >= 100  # At least 100ms
    assert ctx.success is True
    assert ctx.error_message is None


@pytest.mark.asyncio
async def test_timing_context_failure():
    """Test timing context captures errors."""
    from app.utils.timing import TimingContext

    ctx = TimingContext("test", "test_operation")

    with pytest.raises(ValueError):
        async with ctx:
            raise ValueError("Test error")

    assert ctx.success is False
    assert ctx.error_message == "Test error"
    assert ctx.duration_ms > 0


@pytest.mark.asyncio
async def test_timing_context_metadata():
    """Test timing context stores metadata."""
    from app.utils.timing import TimingContext

    async with TimingContext(
        "test",
        "test_operation",
        metadata={"key": "value"}
    ) as ctx:
        ctx.metadata["added"] = "runtime"

    assert ctx.metadata["key"] == "value"
    assert ctx.metadata["added"] == "runtime"
```

**Step 2: Run test to verify it fails**

Run:
```bash
uv run pytest tests/unit/test_timing_context.py -v
```

Expected: FAIL with "ModuleNotFoundError: No module named 'app.utils.timing'"

**Step 3: Implement TimingContext (minimal, no DB)**

Create `app/utils/timing.py`:
```python
"""
Timing utilities for tracking operation performance.

Provides context managers and decorators for timing operations.
"""

import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any
from uuid import uuid4

from app.utils.logging import get_logger

logger = get_logger(__name__)


class TimingContext:
    """
    Context manager for timing operations with automatic database recording.

    Usage:
        ```python
        async with TimingContext("embedding", "embed_batch", document_url="https://example.com") as ctx:
            embeddings = await embedding_service.embed_batch(texts)
            ctx.metadata = {"batch_size": len(texts), "embedding_dim": len(embeddings[0])}
        ```
    """

    def __init__(
        self,
        operation_type: str,
        operation_name: str,
        request_id: str | None = None,
        job_id: str | None = None,
        document_url: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """
        Initialize timing context.

        Args:
            operation_type: Type of operation ('webhook', 'chunking', 'embedding', 'qdrant', 'bm25')
            operation_name: Specific operation name (e.g., 'crawl.page', 'embed_batch')
            request_id: Optional request ID for correlation
            job_id: Optional job ID for worker correlation
            document_url: Optional document URL being processed
            metadata: Optional additional metadata
        """
        self.operation_type = operation_type
        self.operation_name = operation_name
        self.request_id = request_id or str(uuid4())
        self.job_id = job_id
        self.document_url = document_url
        self.metadata = metadata or {}
        self.start_time: float = 0.0
        self.duration_ms: float = 0.0
        self.success: bool = True
        self.error_message: str | None = None

    async def __aenter__(self) -> "TimingContext":
        """Start timing."""
        self.start_time = time.perf_counter()
        logger.debug(
            "Operation started",
            operation_type=self.operation_type,
            operation_name=self.operation_name,
            request_id=self.request_id,
        )
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """
        Stop timing and record to database.

        Args:
            exc_type: Exception type if error occurred
            exc_val: Exception value if error occurred
            exc_tb: Exception traceback if error occurred
        """
        self.duration_ms = (time.perf_counter() - self.start_time) * 1000

        if exc_type is not None:
            self.success = False
            self.error_message = str(exc_val)

        # Log timing
        log_level = "info" if self.success else "error"
        log_method = getattr(logger, log_level)
        log_method(
            "Operation completed",
            operation_type=self.operation_type,
            operation_name=self.operation_name,
            duration_ms=round(self.duration_ms, 2),
            success=self.success,
            error=self.error_message,
            request_id=self.request_id,
        )

        # Database storage will be added later


@asynccontextmanager
async def time_operation(
    operation_type: str,
    operation_name: str,
    **kwargs: Any,
) -> AsyncGenerator[TimingContext, None]:
    """
    Async context manager for timing operations.

    Args:
        operation_type: Type of operation
        operation_name: Name of operation
        **kwargs: Additional arguments passed to TimingContext

    Yields:
        TimingContext: Timing context

    Example:
        ```python
        async with time_operation("qdrant", "index_chunks", document_url=url) as ctx:
            await vector_store.index_chunks(chunks, embeddings, url)
            ctx.metadata = {"chunks": len(chunks)}
        ```
    """
    ctx = TimingContext(operation_type, operation_name, **kwargs)
    async with ctx:
        yield ctx
```

**Step 4: Run tests to verify they pass**

Run:
```bash
uv run pytest tests/unit/test_timing_context.py -v
```

Expected: All tests PASS

**Step 5: Add database storage to TimingContext**

Modify `app/utils/timing.py` - update `__aexit__` method to add database storage:
```python
# Add import at top
from app.database import get_db_context
from app.models.timing import OperationMetric

# In __aexit__ method, add after logging:
        # Store to database (non-blocking - fire and forget)
        try:
            async with get_db_context() as db:
                metric = OperationMetric(
                    operation_type=self.operation_type,
                    operation_name=self.operation_name,
                    duration_ms=self.duration_ms,
                    success=self.success,
                    error_message=self.error_message,
                    request_id=self.request_id,
                    job_id=self.job_id,
                    document_url=self.document_url,
                    metadata=self.metadata,
                )
                db.add(metric)
                await db.commit()
        except Exception as db_error:
            # Don't fail the operation if metrics storage fails
            logger.warning(
                "Failed to store operation metric",
                error=str(db_error),
                operation_type=self.operation_type,
            )
```

**Step 6: Run tests to verify they still pass**

Run:
```bash
uv run pytest tests/unit/test_timing_context.py -v
```

Expected: All tests PASS

**Step 7: Commit timing context utility**

```bash
git add app/utils/timing.py tests/unit/test_timing_context.py
git commit -m "feat(utils): add TimingContext for operation-level metrics tracking"
```

---

## Task 5: Timing Middleware

**Files:**
- Create: `app/middleware/__init__.py`
- Create: `app/middleware/timing.py`
- Create: `tests/unit/test_timing_middleware.py`

**Step 1: Create middleware package**

Create `app/middleware/__init__.py`:
```python
"""Middleware components for the application."""
```

**Step 2: Write test for timing middleware headers**

Create `tests/unit/test_timing_middleware.py`:
```python
"""Unit tests for TimingMiddleware."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_timing_middleware_adds_headers():
    """Test middleware adds timing headers."""
    from app.middleware.timing import TimingMiddleware

    app = FastAPI()
    app.add_middleware(TimingMiddleware)

    @app.get("/test")
    async def test_endpoint():
        return {"status": "ok"}

    client = TestClient(app)
    response = client.get("/test")

    assert response.status_code == 200
    assert "X-Request-ID" in response.headers
    assert "X-Process-Time" in response.headers

    # Process time should be a float
    process_time = float(response.headers["X-Process-Time"])
    assert process_time > 0


def test_timing_middleware_handles_errors():
    """Test middleware records timing even on errors."""
    from app.middleware.timing import TimingMiddleware

    app = FastAPI()
    app.add_middleware(TimingMiddleware)

    @app.get("/error")
    async def error_endpoint():
        raise ValueError("Test error")

    client = TestClient(app)

    # This will raise an exception, catch it
    with pytest.raises(ValueError):
        client.get("/error")
```

**Step 3: Run test to verify it fails**

Run:
```bash
uv run pytest tests/unit/test_timing_middleware.py -v
```

Expected: FAIL with "ModuleNotFoundError: No module named 'app.middleware.timing'"

**Step 4: Implement timing middleware (minimal, no DB)**

Create `app/middleware/timing.py`:
```python
"""
Timing middleware for FastAPI.

Captures request-level timing metrics and stores them in PostgreSQL.
"""

import time
from typing import Any
from uuid import uuid4

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.utils.logging import get_logger

logger = get_logger(__name__)


class TimingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to track request timing and store metrics.

    For each request:
    - Records start time
    - Generates unique request ID
    - Processes request through chain
    - Records end time and stores metrics to database
    - Adds X-Request-ID and X-Process-Time headers to response
    """

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        """
        Process request and record timing metrics.

        Args:
            request: Incoming HTTP request
            call_next: Next middleware/handler in chain

        Returns:
            Response with timing headers
        """
        # Generate request ID
        request_id = str(uuid4())
        request.state.request_id = request_id

        # Start timing
        start_time = time.perf_counter()

        # Process request
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception as exc:
            # Record error
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.error(
                "Request failed",
                method=request.method,
                path=request.url.path,
                error=str(exc),
                duration_ms=round(duration_ms, 2),
                request_id=request_id,
            )

            # Re-raise
            raise

        # Calculate duration
        duration_ms = (time.perf_counter() - start_time) * 1000

        # Add timing headers
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time"] = f"{duration_ms:.2f}"

        # Log request
        logger.info(
            "Request completed",
            method=request.method,
            path=request.url.path,
            status_code=status_code,
            duration_ms=round(duration_ms, 2),
            request_id=request_id,
        )

        return response
```

**Step 5: Run tests to verify they pass**

Run:
```bash
uv run pytest tests/unit/test_timing_middleware.py::test_timing_middleware_adds_headers -v
```

Expected: Test PASS

**Step 6: Add database storage to middleware**

Modify `app/middleware/timing.py` - add helper method and use it:
```python
# Add imports at top
from app.database import get_db_context
from app.models.timing import RequestMetric

# Add method to class (after dispatch method):
    async def _store_metric(
        self,
        request: Request,
        request_id: str,
        status_code: int,
        duration_ms: float,
    ) -> None:
        """
        Store request metric to database.

        Args:
            request: HTTP request
            request_id: Unique request ID
            status_code: HTTP status code
            duration_ms: Request duration in milliseconds
        """
        try:
            # Extract client info
            client_ip = None
            if request.client:
                client_ip = request.client.host

            user_agent = request.headers.get("user-agent")

            # Build metadata
            metadata = {
                "query_params": dict(request.query_params),
                "path_params": request.path_params,
            }

            # Store to database
            async with get_db_context() as db:
                metric = RequestMetric(
                    method=request.method,
                    path=request.url.path,
                    status_code=status_code,
                    duration_ms=duration_ms,
                    request_id=request_id,
                    client_ip=client_ip,
                    user_agent=user_agent,
                    metadata=metadata,
                )
                db.add(metric)
                await db.commit()

        except Exception as e:
            # Don't fail the request if metrics storage fails
            logger.warning(
                "Failed to store request metric",
                error=str(e),
                request_id=request_id,
            )

# In dispatch method, add before the final return:
        # Store metric (non-blocking)
        await self._store_metric(
            request=request,
            request_id=request_id,
            status_code=status_code,
            duration_ms=duration_ms,
        )

# In dispatch method, also add after error logging in except block:
            # Store error metric
            await self._store_metric(
                request=request,
                request_id=request_id,
                status_code=500,
                duration_ms=duration_ms,
            )
```

**Step 7: Run all middleware tests**

Run:
```bash
uv run pytest tests/unit/test_timing_middleware.py -v
```

Expected: All tests PASS

**Step 8: Commit timing middleware**

```bash
git add app/middleware/ tests/unit/test_timing_middleware.py
git commit -m "feat(middleware): add TimingMiddleware for request-level metrics"
```

---

## Task 6: Integrate Middleware into Application

**Files:**
- Modify: `app/main.py`
- Create: `tests/integration/test_middleware_integration.py`

**Step 1: Write integration test for middleware**

Create `tests/integration/test_middleware_integration.py`:
```python
"""Integration tests for timing middleware."""

import pytest
from httpx import AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_health_endpoint_has_timing_headers():
    """Test /health endpoint returns timing headers."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert "X-Request-ID" in response.headers
    assert "X-Process-Time" in response.headers

    process_time = float(response.headers["X-Process-Time"])
    assert process_time > 0
```

**Step 2: Run test to verify it fails**

Run:
```bash
uv run pytest tests/integration/test_middleware_integration.py -v
```

Expected: FAIL with "AssertionError: assert 'X-Request-ID' in response.headers"

**Step 3: Add timing middleware to application**

Modify `app/main.py` - add imports and middleware:
```python
# Add imports at top (after existing imports)
from app.database import close_database, init_database
from app.middleware.timing import TimingMiddleware

# After app creation, add middleware (BEFORE SlowAPI middleware line if it exists):
app.add_middleware(TimingMiddleware)
```

**Step 4: Update lifespan function for database**

Modify `app/main.py` - update lifespan function:
```python
# Modify existing lifespan function - add database init/close
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan manager.

    Handles startup and shutdown tasks.
    """
    # Startup
    logger.info("Starting Search Bridge API", version="0.1.0", port=settings.port)

    # Initialize database for timing metrics
    try:
        await init_database()
        logger.info("Timing metrics database initialized")
    except Exception as e:
        logger.error("Failed to initialize timing metrics database", error=str(e))
        # Don't fail startup - metrics are non-critical

    # ... rest of existing startup code ...

    yield

    # Shutdown
    logger.info("Shutting down Search Bridge API")

    # ... existing shutdown code ...

    # Close database connections
    try:
        await close_database()
        logger.info("Database connections closed")
    except Exception:
        logger.exception("Failed to close database connections")
```

**Step 5: Run integration test**

Run:
```bash
uv run pytest tests/integration/test_middleware_integration.py -v
```

Expected: Test PASS

**Step 6: Commit application integration**

```bash
git add app/main.py tests/integration/test_middleware_integration.py
git commit -m "feat(app): integrate timing middleware and database lifecycle"
```

---

## Task 7: Metrics API Endpoints

**Files:**
- Create: `app/api/metrics_routes.py`
- Create: `tests/integration/test_metrics_api.py`

**Step 1: Write test for request metrics endpoint**

Create `tests/integration/test_metrics_api.py`:
```python
"""Integration tests for metrics API endpoints."""

import pytest
from httpx import AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_get_request_metrics_unauthorized():
    """Test metrics endpoint requires authentication."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/metrics/requests")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_request_metrics_authorized(api_secret_header):
    """Test metrics endpoint returns data with valid auth."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        # First make a request to generate some metrics
        await client.get("/health")

        # Now query metrics
        response = await client.get(
            "/api/metrics/requests",
            headers=api_secret_header
        )

    assert response.status_code == 200
    data = response.json()
    assert "metrics" in data
    assert "summary" in data
    assert "total" in data
```

**Step 2: Add pytest fixture for API secret**

Create/modify `tests/conftest.py`:
```python
"""Pytest configuration and fixtures."""

import pytest


@pytest.fixture
def api_secret_header():
    """Provide API secret header for authenticated requests."""
    return {"X-API-Secret": "test_secret"}  # Use test secret from settings
```

**Step 3: Run test to verify it fails**

Run:
```bash
uv run pytest tests/integration/test_metrics_api.py::test_get_request_metrics_unauthorized -v
```

Expected: FAIL with 404 Not Found (endpoint doesn't exist)

**Step 4: Create metrics routes (minimal endpoint)**

Create `app/api/metrics_routes.py`:
```python
"""
API routes for querying timing metrics.

Provides endpoints to retrieve and analyze performance metrics.
"""

from datetime import datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import verify_api_secret
from app.database import get_db_session
from app.models.timing import OperationMetric, RequestMetric
from app.utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.get("/requests", dependencies=[Depends(verify_api_secret)])
async def get_request_metrics(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    path: str | None = Query(default=None, description="Filter by path"),
    method: str | None = Query(default=None, description="Filter by HTTP method"),
    min_duration_ms: float | None = Query(default=None, description="Minimum duration in ms"),
    hours: int = Query(default=24, ge=1, le=168, description="Look back hours"),
) -> dict[str, Any]:
    """
    Retrieve request-level timing metrics.

    Args:
        db: Database session
        limit: Maximum number of results
        offset: Offset for pagination
        path: Optional path filter
        method: Optional HTTP method filter
        min_duration_ms: Optional minimum duration filter
        hours: Look back period in hours

    Returns:
        List of request metrics with summary statistics
    """
    # Build query
    query = select(RequestMetric).where(
        RequestMetric.timestamp >= datetime.utcnow() - timedelta(hours=hours)
    )

    if path:
        query = query.where(RequestMetric.path == path)

    if method:
        query = query.where(RequestMetric.method == method.upper())

    if min_duration_ms is not None:
        query = query.where(RequestMetric.duration_ms >= min_duration_ms)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Get metrics
    query = query.order_by(desc(RequestMetric.timestamp)).limit(limit).offset(offset)
    result = await db.execute(query)
    metrics = result.scalars().all()

    # Calculate summary statistics
    stats_query = select(
        func.avg(RequestMetric.duration_ms).label("avg_duration_ms"),
        func.min(RequestMetric.duration_ms).label("min_duration_ms"),
        func.max(RequestMetric.duration_ms).label("max_duration_ms"),
        func.count().label("total_requests"),
    ).where(
        RequestMetric.timestamp >= datetime.utcnow() - timedelta(hours=hours)
    )

    if path:
        stats_query = stats_query.where(RequestMetric.path == path)
    if method:
        stats_query = stats_query.where(RequestMetric.method == method.upper())

    stats_result = await db.execute(stats_query)
    stats = stats_result.one()

    return {
        "metrics": [
            {
                "id": str(m.id),
                "timestamp": m.timestamp.isoformat(),
                "method": m.method,
                "path": m.path,
                "status_code": m.status_code,
                "duration_ms": round(m.duration_ms, 2),
                "request_id": m.request_id,
                "client_ip": m.client_ip,
            }
            for m in metrics
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
        "summary": {
            "avg_duration_ms": round(float(stats.avg_duration_ms or 0), 2),
            "min_duration_ms": round(float(stats.min_duration_ms or 0), 2),
            "max_duration_ms": round(float(stats.max_duration_ms or 0), 2),
            "total_requests": stats.total_requests,
        },
    }
```

**Step 5: Register metrics router in main app**

Modify `app/main.py`:
```python
# Add import
from app.api.metrics_routes import router as metrics_router

# After including main router
app.include_router(metrics_router)
```

**Step 6: Run tests**

Run:
```bash
uv run pytest tests/integration/test_metrics_api.py -v
```

Expected: Tests PASS

**Step 7: Add operations metrics endpoint**

Add to `app/api/metrics_routes.py`:
```python
import sqlalchemy as sa  # Add at top

@router.get("/operations", dependencies=[Depends(verify_api_secret)])
async def get_operation_metrics(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    operation_type: str | None = Query(default=None, description="Filter by operation type"),
    operation_name: str | None = Query(default=None, description="Filter by operation name"),
    document_url: str | None = Query(default=None, description="Filter by document URL"),
    success: bool | None = Query(default=None, description="Filter by success status"),
    hours: int = Query(default=24, ge=1, le=168, description="Look back hours"),
) -> dict[str, Any]:
    """
    Retrieve operation-level timing metrics.

    Args:
        db: Database session
        limit: Maximum number of results
        offset: Offset for pagination
        operation_type: Optional operation type filter
        operation_name: Optional operation name filter
        document_url: Optional document URL filter
        success: Optional success status filter
        hours: Look back period in hours

    Returns:
        List of operation metrics with summary statistics
    """
    # Build query
    query = select(OperationMetric).where(
        OperationMetric.timestamp >= datetime.utcnow() - timedelta(hours=hours)
    )

    if operation_type:
        query = query.where(OperationMetric.operation_type == operation_type)

    if operation_name:
        query = query.where(OperationMetric.operation_name == operation_name)

    if document_url:
        query = query.where(OperationMetric.document_url == document_url)

    if success is not None:
        query = query.where(OperationMetric.success == success)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Get metrics
    query = query.order_by(desc(OperationMetric.timestamp)).limit(limit).offset(offset)
    result = await db.execute(query)
    metrics = result.scalars().all()

    # Calculate summary statistics by operation type
    stats_query = select(
        OperationMetric.operation_type,
        func.avg(OperationMetric.duration_ms).label("avg_duration_ms"),
        func.min(OperationMetric.duration_ms).label("min_duration_ms"),
        func.max(OperationMetric.duration_ms).label("max_duration_ms"),
        func.count().label("total_operations"),
        func.sum(func.cast(OperationMetric.success, sa.Integer)).label("successful_operations"),
    ).where(
        OperationMetric.timestamp >= datetime.utcnow() - timedelta(hours=hours)
    ).group_by(OperationMetric.operation_type)

    if operation_type:
        stats_query = stats_query.where(OperationMetric.operation_type == operation_type)

    stats_result = await db.execute(stats_query)
    stats_by_type = {
        row.operation_type: {
            "avg_duration_ms": round(float(row.avg_duration_ms or 0), 2),
            "min_duration_ms": round(float(row.min_duration_ms or 0), 2),
            "max_duration_ms": round(float(row.max_duration_ms or 0), 2),
            "total_operations": row.total_operations,
            "successful_operations": row.successful_operations,
            "failed_operations": row.total_operations - row.successful_operations,
            "success_rate": round((row.successful_operations / row.total_operations * 100), 2) if row.total_operations > 0 else 0,
        }
        for row in stats_result.all()
    }

    return {
        "metrics": [
            {
                "id": str(m.id),
                "timestamp": m.timestamp.isoformat(),
                "operation_type": m.operation_type,
                "operation_name": m.operation_name,
                "duration_ms": round(m.duration_ms, 2),
                "success": m.success,
                "error_message": m.error_message,
                "request_id": m.request_id,
                "job_id": m.job_id,
                "document_url": m.document_url,
            }
            for m in metrics
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
        "summary_by_type": stats_by_type,
    }


@router.get("/summary", dependencies=[Depends(verify_api_secret)])
async def get_metrics_summary(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    hours: int = Query(default=24, ge=1, le=168, description="Look back hours"),
) -> dict[str, Any]:
    """
    Get high-level metrics summary.

    Args:
        db: Database session
        hours: Look back period in hours

    Returns:
        Summary statistics across all metrics
    """
    time_cutoff = datetime.utcnow() - timedelta(hours=hours)

    # Request metrics summary
    request_stats_query = select(
        func.count().label("total_requests"),
        func.avg(RequestMetric.duration_ms).label("avg_duration_ms"),
        func.sum(func.cast(RequestMetric.status_code >= 400, sa.Integer)).label("error_count"),
    ).where(RequestMetric.timestamp >= time_cutoff)

    request_stats = await db.execute(request_stats_query)
    request_row = request_stats.one()

    # Operation metrics summary by type
    operation_stats_query = select(
        OperationMetric.operation_type,
        func.count().label("total_operations"),
        func.avg(OperationMetric.duration_ms).label("avg_duration_ms"),
        func.sum(func.cast(~OperationMetric.success, sa.Integer)).label("error_count"),
    ).where(
        OperationMetric.timestamp >= time_cutoff
    ).group_by(OperationMetric.operation_type)

    operation_stats = await db.execute(operation_stats_query)
    operations_by_type = {
        row.operation_type: {
            "total_operations": row.total_operations,
            "avg_duration_ms": round(float(row.avg_duration_ms or 0), 2),
            "error_count": row.error_count,
        }
        for row in operation_stats.all()
    }

    # Slowest endpoints
    slowest_query = select(
        RequestMetric.path,
        func.avg(RequestMetric.duration_ms).label("avg_duration_ms"),
        func.count().label("request_count"),
    ).where(
        RequestMetric.timestamp >= time_cutoff
    ).group_by(
        RequestMetric.path
    ).order_by(
        desc(func.avg(RequestMetric.duration_ms))
    ).limit(10)

    slowest_result = await db.execute(slowest_query)
    slowest_endpoints = [
        {
            "path": row.path,
            "avg_duration_ms": round(float(row.avg_duration_ms), 2),
            "request_count": row.request_count,
        }
        for row in slowest_result.all()
    ]

    return {
        "time_period_hours": hours,
        "requests": {
            "total": request_row.total_requests,
            "avg_duration_ms": round(float(request_row.avg_duration_ms or 0), 2),
            "error_count": request_row.error_count,
        },
        "operations_by_type": operations_by_type,
        "slowest_endpoints": slowest_endpoints,
    }
```

**Step 8: Add test for operations endpoint**

Add to `tests/integration/test_metrics_api.py`:
```python
@pytest.mark.asyncio
async def test_get_operation_metrics_authorized(api_secret_header):
    """Test operations metrics endpoint returns data with valid auth."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get(
            "/api/metrics/operations",
            headers=api_secret_header
        )

    assert response.status_code == 200
    data = response.json()
    assert "metrics" in data
    assert "summary_by_type" in data


@pytest.mark.asyncio
async def test_get_metrics_summary_authorized(api_secret_header):
    """Test summary endpoint returns data with valid auth."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get(
            "/api/metrics/summary",
            headers=api_secret_header
        )

    assert response.status_code == 200
    data = response.json()
    assert "requests" in data
    assert "operations_by_type" in data
    assert "slowest_endpoints" in data
```

**Step 9: Run all API tests**

Run:
```bash
uv run pytest tests/integration/test_metrics_api.py -v
```

Expected: All tests PASS

**Step 10: Commit metrics API**

```bash
git add app/api/metrics_routes.py tests/integration/test_metrics_api.py tests/conftest.py app/main.py
git commit -m "feat(api): add metrics API endpoints for request and operation metrics"
```

---

## Task 8: Database Migration with Alembic

**Files:**
- Initialize: `alembic/` directory
- Create: `alembic/env.py`
- Create: `alembic/versions/001_add_timing_metrics.py`

**Step 1: Initialize Alembic**

Run:
```bash
cd /home/jmagar/code/fc-bridge
alembic init alembic
```

Expected: `alembic/` directory created with default files

**Step 2: Configure Alembic for async**

Modify `alembic/env.py` - replace entire file:
```python
"""Alembic environment configuration."""

from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

from app.config import settings
from app.models.timing import Base

# this is the Alembic Config object
config = context.config

# Override sqlalchemy.url with settings
config.set_main_option("sqlalchemy.url", str(settings.database_url))

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Run migrations with a connection."""
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations asynchronously."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    import asyncio
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

**Step 3: Generate migration**

Run:
```bash
alembic revision --autogenerate -m "Add timing metrics tables"
```

Expected: Migration file created in `alembic/versions/`

**Step 4: Review generated migration**

Run:
```bash
ls -la alembic/versions/
cat alembic/versions/*_add_timing_metrics_tables.py
```

Expected: Migration file contains create_table operations for request_metrics and operation_metrics

**Step 5: Apply migration (if PostgreSQL is running)**

Run:
```bash
# Only if PostgreSQL is accessible
alembic upgrade head
```

Expected: Tables created successfully (or skip if DB not ready)

**Step 6: Commit migration files**

```bash
git add alembic/
git commit -m "feat(db): add Alembic migrations for timing metrics tables"
```

---

## Task 9: Worker Integration (Optional - for async jobs)

**Files:**
- Modify: `app/worker.py`
- Modify: `app/services/indexing.py`

**Step 1: Add timing to worker job execution**

Modify `app/worker.py` - add TimingContext around index_document call:
```python
# Add import at top
from uuid import uuid4
from app.utils.timing import TimingContext

# In _index_document_async function, wrap indexing call:
    # Generate job ID for correlation
    job_id = str(uuid4())

    # ... existing code ...

    # Index document with timing
    async with TimingContext(
        "worker",
        "index_document",
        job_id=job_id,
        document_url=document.url,
    ) as ctx:
        result = await indexing_service.index_document(document, job_id=job_id)
        ctx.metadata = {
            "chunks_indexed": result.get("chunks_indexed", 0),
            "total_tokens": result.get("total_tokens", 0),
        }
```

**Step 2: Add timing to indexing operations**

Modify `app/services/indexing.py` - add TimingContext to each operation:
```python
# Add import at top
from app.utils.timing import TimingContext

# In index_document method, wrap chunking:
    async with TimingContext(
        "chunking",
        "chunk_text",
        job_id=job_id,
        document_url=document.url,
    ) as ctx:
        chunks = self.text_chunker.chunk_text(cleaned_markdown, metadata=chunk_metadata)
        ctx.metadata = {
            "chunks_created": len(chunks),
            "text_length": len(cleaned_markdown),
        }

# Wrap embedding generation:
    async with TimingContext(
        "embedding",
        "embed_batch",
        job_id=job_id,
        document_url=document.url,
    ) as ctx:
        chunk_texts = [chunk["text"] for chunk in chunks]
        embeddings = await self.embedding_service.embed_batch(chunk_texts)
        ctx.metadata = {
            "batch_size": len(chunk_texts),
            "embedding_dim": len(embeddings[0]) if embeddings else 0,
        }

# Wrap Qdrant indexing:
    async with TimingContext(
        "qdrant",
        "index_chunks",
        job_id=job_id,
        document_url=document.url,
    ) as ctx:
        indexed_count = await self.vector_store.index_chunks(
            chunks=chunks,
            embeddings=embeddings,
            document_url=document.url,
        )
        ctx.metadata = {
            "chunks_indexed": indexed_count,
            "collection": self.vector_store.collection_name,
        }

# Wrap BM25 indexing:
    async with TimingContext(
        "bm25",
        "index_document",
        job_id=job_id,
        document_url=document.url,
    ) as ctx:
        self.bm25_engine.index_document(
            text=cleaned_markdown,
            metadata=bm25_metadata,
        )
        ctx.metadata = {
            "text_length": len(cleaned_markdown),
        }
```

**Step 3: Run worker tests (if they exist)**

Run:
```bash
uv run pytest tests/ -k worker -v
```

Expected: Tests PASS

**Step 4: Commit worker integration**

```bash
git add app/worker.py app/services/indexing.py
git commit -m "feat(worker): add timing metrics to indexing operations"
```

---

## Task 10: Environment Configuration

**Files:**
- Create: `.env` (if doesn't exist)
- Modify: `.env.example`

**Step 1: Add database URL to .env.example**

Modify `.env.example`:
```bash
# PostgreSQL Database (for timing metrics)
SEARCH_BRIDGE_DATABASE_URL=postgresql+asyncpg://fc_bridge:password@localhost:5432/fc_bridge
```

**Step 2: Create .env from example (if needed)**

Run:
```bash
# Only if .env doesn't exist
cp .env.example .env
```

**Step 3: Update .env with actual credentials**

Edit `.env` manually with actual PostgreSQL credentials

**Step 4: Commit .env.example only**

```bash
git add .env.example
git commit -m "docs: add database URL to environment template"
```

---

## Verification & Testing

### Task 11: End-to-End Verification

**Step 1: Start PostgreSQL**

Run:
```bash
# Example - adjust for your setup
docker compose up -d postgres
# OR
sudo systemctl start postgresql
```

**Step 2: Run migrations**

Run:
```bash
alembic upgrade head
```

Expected: Tables created successfully

**Step 3: Start the application**

Run:
```bash
docker compose up -d api
# OR
uv run uvicorn app.main:app --reload --port 52100
```

**Step 4: Test middleware headers**

Run:
```bash
curl -i http://localhost:52100/health
```

Expected: Response includes `X-Request-ID` and `X-Process-Time` headers

**Step 5: Check database for metrics**

Run:
```bash
# Connect to PostgreSQL
psql -h localhost -U fc_bridge -d fc_bridge

# Query metrics
SELECT path, method, status_code, ROUND(duration_ms::numeric, 2) as duration_ms
FROM request_metrics
ORDER BY timestamp DESC
LIMIT 5;
```

Expected: Rows returned showing /health requests

**Step 6: Test metrics API**

Run:
```bash
# Replace YOUR_API_SECRET with actual secret
curl -H "X-API-Secret: YOUR_API_SECRET" \
  "http://localhost:52100/api/metrics/requests?limit=10"
```

Expected: JSON response with metrics array and summary

**Step 7: Test operations endpoint**

Run:
```bash
curl -H "X-API-Secret: YOUR_API_SECRET" \
  "http://localhost:52100/api/metrics/operations?operation_type=embedding"
```

Expected: JSON response (may be empty if no indexing has occurred)

**Step 8: Test summary endpoint**

Run:
```bash
curl -H "X-API-Secret: YOUR_API_SECRET" \
  "http://localhost:52100/api/metrics/summary?hours=24"
```

Expected: JSON response with request and operation summaries

**Step 9: Run full test suite**

Run:
```bash
uv run pytest tests/ -v --cov=app --cov-report=term-missing
```

Expected: All tests PASS with >85% coverage

**Step 10: Document verification results**

Create `.docs/sessions/2025-11-07-timing-middleware-implementation.md`:
```markdown
# Timing Middleware Implementation - 2025-11-07

## Summary
Implemented comprehensive timing metrics tracking for webhook server.

## Components Implemented
- [x] Database models (RequestMetric, OperationMetric)
- [x] Database session management
- [x] TimingContext utility
- [x] TimingMiddleware for HTTP requests
- [x] Metrics API endpoints (/api/metrics/*)
- [x] Alembic migrations
- [x] Worker integration
- [x] Tests (unit + integration)

## Verification Results
- Middleware headers: ✓ Working
- Database storage: ✓ Metrics stored
- API endpoints: ✓ All endpoints functional
- Test coverage: XX% (>85% target)

## Deployment Notes
- PostgreSQL required for metrics storage
- Run migrations: `alembic upgrade head`
- Environment variable: SEARCH_BRIDGE_DATABASE_URL

## Next Steps
- [ ] Monitor metrics in production
- [ ] Set up alerting for slow operations
- [ ] Create Grafana dashboard (optional)
```

**Step 11: Final commit**

```bash
git add .docs/sessions/
git commit -m "docs: add timing middleware implementation session log"
```

---

## Plan Complete

**Total Tasks:** 11 main tasks
**Estimated Time:** 3-5 hours for full implementation
**Test Coverage Target:** >85%

### Key Files Created
1. `app/models/timing.py` - Database models
2. `app/database.py` - Session management
3. `app/utils/timing.py` - TimingContext utility
4. `app/middleware/timing.py` - HTTP middleware
5. `app/api/metrics_routes.py` - Metrics API
6. `alembic/versions/*_add_timing_metrics.py` - Migration
7. Multiple test files

### Key Files Modified
1. `app/config.py` - Database URL setting
2. `app/main.py` - Middleware integration
3. `app/worker.py` - Worker timing
4. `app/services/indexing.py` - Operation timing
5. `.env.example` - Environment template

### Dependencies Added
- sqlalchemy[asyncio] >=2.0.0
- asyncpg
- alembic

---

**Plan saved to:** `docs/plans/2025-11-07-timing-middleware.md`
