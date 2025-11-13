"""Structured logging configuration using structlog."""

from datetime import datetime
import logging
import re
import sys
from typing import Any, cast
from zoneinfo import ZoneInfo

import structlog
from structlog.typing import EventDict, FilteringBoundLogger, WrappedLogger

EST_ZONE = ZoneInfo("America/New_York")
TIMESTAMP_FORMAT = "%I:%M:%S %p | %m/%d/%Y"


def mask_secrets(data: Any) -> Any:
    """
    Recursively mask sensitive data in logs.

    Handles:
    - Bearer tokens
    - API keys in dict keys/values
    - Credentials in URLs
    - HMAC signatures

    Args:
        data: Data to mask (str, dict, list, or other)

    Returns:
        Masked version of data
    """
    if isinstance(data, str):
        # Mask Bearer tokens
        data = re.sub(r"Bearer\s+[^\s]+", "Bearer ***", data, flags=re.IGNORECASE)

        # Mask API keys in text
        data = re.sub(
            r'(api[_-]?key|token|secret)["\']?\s*[:=]\s*["\']?([^\s&"\'>]+)',
            r"\1=***",
            data,
            flags=re.IGNORECASE,
        )

        # Mask credentials in URLs
        data = re.sub(r"://([^:]+):([^@]+)@", r"://\1:***@", data)

        # Mask HMAC signatures
        data = re.sub(r"sha256=[a-f0-9]{64}", "sha256=***", data)

        return data

    elif isinstance(data, dict):
        masked = {}
        for key, value in data.items():
            # Mask sensitive keys
            if any(
                sensitive in key.lower()
                for sensitive in ["key", "secret", "token", "password"]
            ):
                masked[key] = "***"
            else:
                masked[key] = mask_secrets(value)
        return masked

    elif isinstance(data, (list, tuple)):
        return type(data)(mask_secrets(item) for item in data)

    else:
        return data


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
    Get a structured logger instance with secret masking.

    Args:
        name: Logger name (typically __name__)

    Returns:
        Configured structlog logger with masked logging methods
    """
    logger = cast(FilteringBoundLogger, structlog.get_logger(name))

    # Wrap logging methods to apply masking
    original_info = logger.info
    original_error = logger.error
    original_warning = logger.warning
    original_debug = logger.debug

    def masked_info(event: str, **kwargs):
        return original_info(mask_secrets(event), **mask_secrets(kwargs))

    def masked_error(event: str, **kwargs):
        return original_error(mask_secrets(event), **mask_secrets(kwargs))

    def masked_warning(event: str, **kwargs):
        return original_warning(mask_secrets(event), **mask_secrets(kwargs))

    def masked_debug(event: str, **kwargs):
        return original_debug(mask_secrets(event), **mask_secrets(kwargs))

    logger.info = masked_info
    logger.error = masked_error
    logger.warning = masked_warning
    logger.debug = masked_debug

    return logger
