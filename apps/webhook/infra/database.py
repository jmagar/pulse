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

from config import settings
from utils.logging import get_logger

logger = get_logger(__name__)

# Create async engine with connection pooling
#
# Pool sizing rationale (from capacity analysis 2025-01-15):
# - pool_size=40: Base pool supports 3-4 concurrent crawls with 4 workers each
#   (4 workers × 2.5 operations/worker × 3 crawls = ~30 base connections)
# - max_overflow=20: Burst capacity for transient metric writes and API requests
# - Total capacity: 60 connections (well within PostgreSQL default of 100)
#
# Monitoring: Query pool.size(), pool.checkedout(), pool.checkedin(), pool.overflow()
# See: tests/integration/test_connection_pool.py for pool status checks
engine = create_async_engine(
    settings.database_url,
    echo=False,  # Set to True for SQL query logging
    pool_pre_ping=True,  # Verify connections before using
    pool_size=40,  # Connection pool size (base capacity)
    max_overflow=20,  # Additional connections if pool is full (burst capacity)
)

# Create session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db_session() -> AsyncGenerator[AsyncSession]:
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
async def get_db_context() -> AsyncGenerator[AsyncSession]:
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
    from domain.models import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    logger.info("Database initialized")


async def close_database() -> None:
    """Close database connections."""
    await engine.dispose()
    logger.info("Database connections closed")
