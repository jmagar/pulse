"""Structured logging configuration using structlog."""

from datetime import datetime
import logging
import sys
from typing import cast
from zoneinfo import ZoneInfo

import structlog
from structlog.typing import EventDict, FilteringBoundLogger, WrappedLogger

EST_ZONE = ZoneInfo("America/New_York")
TIMESTAMP_FORMAT = "%I:%M:%S %p | %m/%d/%Y"


def _est_timestamp(_: WrappedLogger, __: str, event_dict: EventDict) -> EventDict:
    """Inject a 12-hour EST timestamp without microseconds into event dict."""

    event_dict["timestamp"] = datetime.now(EST_ZONE).strftime(TIMESTAMP_FORMAT)
    return event_dict


def configure_logging(log_level: str = "INFO") -> None:
    """
    Configure structured logging with structlog.

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    """
    # Configure standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper()),
    )

    # Configure structlog
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.StackInfoRenderer(),
            structlog.dev.set_exc_info,
            _est_timestamp,
            structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(getattr(logging, log_level.upper())),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=False,
    )


def get_logger(name: str) -> FilteringBoundLogger:
    """
    Get a structured logger instance.

    Args:
        name: Logger name (typically __name__)

    Returns:
        Configured structlog logger
    """
    return cast(FilteringBoundLogger, structlog.get_logger(name))
