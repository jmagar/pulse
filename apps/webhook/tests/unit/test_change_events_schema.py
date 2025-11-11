"""Test change_events table schema."""

import pytest
from sqlalchemy import inspect

from infra.database import engine


@pytest.mark.asyncio
async def test_change_events_table_exists():
    """Test that change_events table exists in webhook schema."""
    async with engine.begin() as conn:
        inspector = inspect(conn)
        tables = await conn.run_sync(lambda sync_conn: inspector.get_table_names(schema="webhook"))
        assert "change_events" in tables


@pytest.mark.asyncio
async def test_change_events_columns():
    """Test change_events has all required columns."""
    async with engine.begin() as conn:
        inspector = inspect(conn)
        columns = await conn.run_sync(
            lambda sync_conn: [
                col["name"] for col in inspector.get_columns("change_events", schema="webhook")
            ]
        )

        required_columns = [
            "id",
            "watch_id",
            "watch_url",
            "detected_at",
            "diff_summary",
            "snapshot_url",
            "rescrape_job_id",
            "rescrape_status",
            "indexed_at",
            "metadata",
            "created_at",
        ]

        for col in required_columns:
            assert col in columns, f"Missing column: {col}"


@pytest.mark.asyncio
async def test_change_events_indexes():
    """Test change_events has required indexes."""
    async with engine.begin() as conn:
        inspector = inspect(conn)
        indexes = await conn.run_sync(
            lambda sync_conn: inspector.get_indexes("change_events", schema="webhook")
        )

        index_names = [idx["name"] for idx in indexes]

        assert "idx_change_events_watch_id" in index_names
        assert "idx_change_events_detected_at" in index_names
