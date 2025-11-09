"""Unit tests for database session management."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_get_db_session_yields_session() -> None:
    """Test get_db_session yields an AsyncSession."""
    from app.database import get_db_session

    async for session in get_db_session():
        assert isinstance(session, AsyncSession)
        break  # Only need to test one iteration


@pytest.mark.asyncio
async def test_get_db_context_returns_session() -> None:
    """Test get_db_context returns an AsyncSession."""
    from app.database import get_db_context

    async with get_db_context() as session:
        assert isinstance(session, AsyncSession)
