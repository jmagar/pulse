"""Reusable fixture overrides for tests that do not need the DB."""

from __future__ import annotations

import pytest_asyncio


@pytest_asyncio.fixture(scope="session", autouse=True)
async def initialize_test_database():
    """No-op override for session-level database initialization."""

    yield


@pytest_asyncio.fixture(autouse=True)
async def cleanup_database_engine():
    """No-op override for database cleanup between tests."""

    yield
