"""Background cleanup tasks for stale jobs."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

from domain.models import ChangeEvent
from infra.database import get_db_context
from utils.logging import get_logger
from utils.time import format_est_timestamp

logger = get_logger(__name__)


async def cleanup_zombie_jobs(max_age_minutes: int = 15) -> dict[str, int]:
    """
    Clean up zombie jobs stuck in 'in_progress' state.

    Jobs are considered zombies if:
    - rescrape_status = 'in_progress'
    - detected_at > max_age_minutes ago

    Args:
        max_age_minutes: Maximum age in minutes before job is considered zombie

    Returns:
        dict with count of cleaned up jobs
    """
    cutoff_time = datetime.now(UTC) - timedelta(minutes=max_age_minutes)

    logger.info("Starting zombie job cleanup", cutoff_time=cutoff_time, max_age_minutes=max_age_minutes)

    async with get_db_context() as session:
        # Find zombie jobs
        result = await session.execute(
            select(ChangeEvent)
            .where(ChangeEvent.rescrape_status == "in_progress")
            .where(ChangeEvent.detected_at < cutoff_time)
        )
        zombie_jobs = result.scalars().all()

        if not zombie_jobs:
            logger.info("No zombie jobs found")
            return {"cleaned_up": 0}

        # Mark as failed with timeout reason
        for job in zombie_jobs:
            await session.execute(
                update(ChangeEvent)
                .where(ChangeEvent.id == job.id)
                .values(
                    rescrape_status=f"failed: job timeout after {max_age_minutes} minutes",
                    extra_metadata={
                        **(job.extra_metadata or {}),
                        "zombie_cleanup_at": format_est_timestamp(),
                        "original_detected_at": format_est_timestamp(job.detected_at),
                    },
                )
            )

        await session.commit()

        logger.info(
            "Zombie job cleanup completed",
            cleaned_up=len(zombie_jobs),
            job_ids=[job.id for job in zombie_jobs],
        )

        return {"cleaned_up": len(zombie_jobs)}
