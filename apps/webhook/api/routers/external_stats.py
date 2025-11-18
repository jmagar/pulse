"""
External service statistics API.

Provides CPU, memory, uptime, and volume usage for externally managed Docker
services via Docker contexts. Intended for consumption by the dashboard so that
Docker CLI access remains inside the webhook container instead of the web app.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends

from api.deps import verify_api_secret
from config import ExternalServiceConfig, settings
from utils.logging import get_logger

router = APIRouter(prefix="/api/external", tags=["external"])
logger = get_logger(__name__)

# Constants for unit conversions
BYTES_PER_KB = 1024
BYTES_PER_MB = 1024**2
BYTES_PER_GB = 1024**3


def validate_service_name(name: str) -> str:
    """Validate service name to prevent command injection."""
    if not re.match(r"^[a-zA-Z0-9_-]+$", name):
        raise ValueError(f"Invalid service name: {name}")
    return name


def validate_volume_path(path: str) -> str:
    """Validate volume path to prevent path traversal attacks."""
    normalized = os.path.normpath(path)
    if not os.path.isabs(normalized):
        raise ValueError(f"Volume path must be absolute: {path}")
    if any(c in normalized for c in [";", "&", "|", "$", "`", ".."]):
        raise ValueError(f"Invalid characters in path: {path}")
    return normalized


async def run_command(args: list[str]) -> str:
    """Run a subprocess command and return stdout, raising on failure."""

    process = await asyncio.create_subprocess_exec(  # type: ignore[attr-defined]
        *args,
        stdout=asyncio.subprocess.PIPE,  # type: ignore[attr-defined]
        stderr=asyncio.subprocess.PIPE,  # type: ignore[attr-defined]
    )
    stdout, stderr = await process.communicate()
    if process.returncode not in {0, None}:
        raise RuntimeError(
            f"Command failed ({process.returncode}): {' '.join(args)} | {stderr.decode().strip()}"
        )
    return stdout.decode().strip()


def _normalize_status(raw: str | None) -> str:
    """Normalize docker status strings into dashboard-friendly values."""

    if not raw:
        return "unknown"

    lowered = raw.lower()
    if lowered == "running":
        return "running"
    if lowered == "paused":
        return "paused"
    if lowered in {"exited", "dead"}:
        return "exited"
    return "unknown"


def _parse_datetime(value: str | None) -> datetime | None:
    """Parse ISO datetime strings, tolerating trailing Z."""

    if not value:
        return None

    cleaned = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(cleaned)
    except ValueError:
        return None


def _compute_uptime_seconds(state: dict[str, Any]) -> int:
    """Compute uptime seconds from docker inspect state."""

    started_at = _parse_datetime(state.get("StartedAt"))
    finished_at = _parse_datetime(state.get("FinishedAt"))
    status = state.get("Status")

    if started_at is None:
        return 0

    now = datetime.now(UTC)
    if isinstance(status, str) and status.lower() == "running":
        return max(0, int((now - started_at).total_seconds()))

    if finished_at is not None:
        return max(0, int((finished_at - started_at).total_seconds()))

    return 0


def _parse_cpu_percent(raw: str | None) -> float:
    """Parse docker stats CPU percent strings like '12.5%' into floats."""

    if not raw:
        return 0.0

    cleaned = raw.strip().rstrip("%")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _parse_memory_mb(raw: str | None) -> float:
    """Parse memory usage strings (e.g., '64.5MiB / 2GiB') into MB."""

    if not raw:
        return 0.0

    head = raw.split("/")[0].strip()
    match = re.match(r"([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z]+)?", head)
    if not match:
        return 0.0

    value = float(match.group(1))
    unit = (match.group(2) or "").lower()
    multipliers = {
        "b": 1 / BYTES_PER_MB,
        "kb": 1 / BYTES_PER_KB,
        "kib": 1 / BYTES_PER_KB,
        "mb": 1,
        "mib": 1,
        "gb": BYTES_PER_KB,
        "gib": BYTES_PER_KB,
        "tb": BYTES_PER_MB,
        "tib": BYTES_PER_MB,
    }

    return round(value * multipliers.get(unit, 1.0), 3)


def _parse_stats_output(output: str) -> dict[str, dict[str, float]]:
    """Parse docker stats JSON lines into a mapping of container id to metrics."""

    results: dict[str, dict[str, float]] = {}
    for line in output.splitlines():
        candidate = line.strip()
        if not candidate:
            continue

        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue

        container_id = parsed.get("Container") or parsed.get("ID")
        if not container_id:
            continue

        results[container_id] = {
            "cpu": _parse_cpu_percent(parsed.get("CPUPerc")),
            "memory": _parse_memory_mb(parsed.get("MemUsage")),
        }

    return results


def _build_health_check(state: dict[str, Any]) -> dict[str, Any]:
    """Build a dashboard health check object from container state."""

    raw_status = (state.get("Health") or {}).get("Status")
    normalized = "unknown"
    if isinstance(raw_status, str):
        normalized = "healthy" if raw_status.lower() == "healthy" else "unhealthy"
    elif isinstance(state.get("Status"), str):
        normalized = "healthy" if state.get("Status") == "running" else "unhealthy"

    return {
        "status": normalized,
        "last_check": datetime.now(UTC).isoformat(),
        "response_time_ms": 0,
    }


async def _compute_volume_bytes(volumes: list[str]) -> int:
    """Compute total volume usage in bytes using du -sb for provided paths."""

    total = 0
    for path in volumes:
        try:
            validated_path = validate_volume_path(path)
            output = await run_command(["du", "-sb", validated_path])
            size_str = output.split()[0]
            total += int(size_str)
        except ValueError as exc:
            logger.warning("Volume path validation failed", path=path, error=str(exc))
        except Exception as exc:  # pragma: no cover - error logged for visibility
            logger.warning("Volume calculation failed", path=path, error=str(exc))

    return total


def _build_docker_args(context: str | None, *command: str) -> list[str]:
    """Construct docker CLI arguments with optional context."""

    args = [settings.docker_bin]
    if context:
        args.extend(["--context", context])
    args.extend(command)
    return args


async def _gather_service_status(service: ExternalServiceConfig) -> dict[str, Any]:
    """Collect inspect, stats, and volume data for a single external service."""

    # Validate service name to prevent command injection
    try:
        validated_name = validate_service_name(service.name)
    except ValueError as exc:
        logger.error("Invalid service name", service=service.name, error=str(exc))
        return {
            "name": service.name,
            "status": "unknown",
            "port": service.port,
            "restart_count": 0,
            "uptime_seconds": 0,
            "cpu_percent": 0.0,
            "memory_mb": 0.0,
            "health_check": {
                "status": "unknown",
                "last_check": datetime.now(UTC).isoformat(),
                "response_time_ms": 0,
            },
            "replica_count": 0,
            "volume_bytes": 0,
        }

    context = service.context or settings.external_context
    volume_bytes = await _compute_volume_bytes(service.volumes)

    if not context:
        return {
            "name": service.name,
            "status": "unknown",
            "port": service.port,
            "restart_count": 0,
            "uptime_seconds": 0,
            "cpu_percent": 0.0,
            "memory_mb": 0.0,
            "health_check": {
                "status": "unknown",
                "last_check": datetime.now(UTC).isoformat(),
                "response_time_ms": 0,
            },
            "replica_count": 0,
            "volume_bytes": volume_bytes,
        }

    container_state: dict[str, Any] = {}
    container_id: str | None = None
    replica_count = 0

    try:
        inspect_output = await run_command(_build_docker_args(context, "inspect", validated_name))
        inspect_data = json.loads(inspect_output)
        if isinstance(inspect_data, list) and inspect_data:
            record = inspect_data[0]
            container_state = record.get("State", {}) or {}
            container_id = record.get("Id") or service.name
            replica_count = len(inspect_data)
        else:
            logger.warning("Inspect returned no data", service=service.name, context=context)
    except Exception as exc:  # pragma: no cover - logged for debugging
        logger.error("Inspect failed", service=service.name, context=context, error=str(exc))

    stats_cpu = 0.0
    stats_mem = 0.0
    if container_id:
        try:
            stats_output = await run_command(
                _build_docker_args(
                    context,
                    "stats",
                    "--no-stream",
                    "--format",
                    "{{json .}}",
                    container_id,
                )
            )
            stats = _parse_stats_output(stats_output)
            metrics = stats.get(container_id)
            if metrics:
                stats_cpu = metrics.get("cpu", 0.0)
                stats_mem = metrics.get("memory", 0.0)
        except Exception as exc:  # pragma: no cover - logged for debugging
            logger.error(
                "Stats collection failed", service=service.name, context=context, error=str(exc)
            )

    status = _normalize_status(container_state.get("Status"))
    health = (
        _build_health_check(container_state)
        if container_state
        else {
            "status": "unknown",
            "last_check": datetime.now(UTC).isoformat(),
            "response_time_ms": 0,
        }
    )

    return {
        "name": service.name,
        "status": status,
        "port": service.port,
        "restart_count": int(container_state.get("RestartCount") or 0),
        "uptime_seconds": _compute_uptime_seconds(container_state),
        "cpu_percent": stats_cpu,
        "memory_mb": stats_mem,
        "health_check": health,
        "replica_count": replica_count,
        "volume_bytes": volume_bytes,
    }


@router.get("/services", dependencies=[Depends(verify_api_secret)])
async def get_external_services() -> dict[str, Any]:
    """Expose summaries for configured external services with timestamp."""

    services = [await _gather_service_status(service) for service in settings.external_services]
    return {
        "timestamp": datetime.now(UTC).isoformat(),
        "services": services,
    }
