"""Test zombie job cleanup."""

import pytest
from datetime import UTC, datetime, timedelta

from workers.cleanup import cleanup_zombie_jobs
from domain.models import ChangeEvent


@pytest.mark.asyncio
async def test_cleanup_identifies_zombie_jobs(db_session):
    """Should identify jobs stuck in 'in_progress' for >15 minutes."""
    # Create old in-progress job (zombie)
    old_event = ChangeEvent(
        watch_id="old-123",
        watch_url="https://old.example.com",
        rescrape_status="in_progress",
        detected_at=datetime.now(UTC) - timedelta(minutes=20),
    )

    # Create recent in-progress job (active)
    recent_event = ChangeEvent(
        watch_id="recent-123",
        watch_url="https://recent.example.com",
        rescrape_status="in_progress",
        detected_at=datetime.now(UTC) - timedelta(minutes=5),
    )

    db_session.add_all([old_event, recent_event])
    await db_session.commit()

    # Run cleanup
    result = await cleanup_zombie_jobs(max_age_minutes=15)

    # Verify zombie marked as failed
    await db_session.refresh(old_event)
    assert "failed" in old_event.rescrape_status.lower()
    assert "timeout" in old_event.rescrape_status.lower()

    # Verify active job unchanged
    await db_session.refresh(recent_event)
    assert recent_event.rescrape_status == "in_progress"

    assert result["cleaned_up"] == 1


@pytest.mark.asyncio
async def test_cleanup_preserves_completed_jobs(db_session):
    """Should not touch completed or already-failed jobs."""
    # Create various job states
    completed_event = ChangeEvent(
        watch_id="completed-123",
        watch_url="https://completed.example.com",
        rescrape_status="completed",
        detected_at=datetime.now(UTC) - timedelta(minutes=30),
    )

    failed_event = ChangeEvent(
        watch_id="failed-123",
        watch_url="https://failed.example.com",
        rescrape_status="failed: some error",
        detected_at=datetime.now(UTC) - timedelta(minutes=30),
    )

    db_session.add_all([completed_event, failed_event])
    await db_session.commit()

    # Run cleanup
    result = await cleanup_zombie_jobs(max_age_minutes=15)

    # Verify nothing was cleaned up
    assert result["cleaned_up"] == 0

    # Verify statuses unchanged
    await db_session.refresh(completed_event)
    await db_session.refresh(failed_event)
    assert completed_event.rescrape_status == "completed"
    assert failed_event.rescrape_status == "failed: some error"


@pytest.mark.asyncio
async def test_cleanup_handles_no_zombie_jobs(db_session):
    """Should handle case with no zombie jobs gracefully."""
    # Create only active jobs
    active_event = ChangeEvent(
        watch_id="active-123",
        watch_url="https://active.example.com",
        rescrape_status="in_progress",
        detected_at=datetime.now(UTC) - timedelta(minutes=5),
    )

    db_session.add(active_event)
    await db_session.commit()

    # Run cleanup
    result = await cleanup_zombie_jobs(max_age_minutes=15)

    # Should find nothing to clean
    assert result["cleaned_up"] == 0

    # Active job should remain unchanged
    await db_session.refresh(active_event)
    assert active_event.rescrape_status == "in_progress"
