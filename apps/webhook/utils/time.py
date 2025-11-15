"""Shared timestamp utilities for EST-formatted strings."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

EST_ZONE = ZoneInfo("America/New_York")
TIMESTAMP_FORMAT = "%I:%M:%S %p | %m/%d/%Y"


def ensure_aware(moment: datetime) -> datetime:
    """Guarantee the datetime is timezone-aware (defaulting to UTC)."""

    if moment.tzinfo is None:
        return moment.replace(tzinfo=UTC)
    return moment


def parse_iso_timestamp(value: str) -> datetime:
    """Parse ISO timestamps (optionally Z-suffixed) into aware datetimes."""

    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    return ensure_aware(datetime.fromisoformat(normalized))


def format_est_timestamp(moment: datetime | None = None) -> str:
    """Return a 12-hour EST timestamp (no microseconds)."""

    if moment is None:
        moment = datetime.now(UTC)
    else:
        moment = ensure_aware(moment)

    return moment.astimezone(EST_ZONE).strftime(TIMESTAMP_FORMAT)
