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

# Precompile regex patterns (module level - compiled once)
_BEARER_PATTERN = re.compile(r"Bearer\s+[^\s]+", flags=re.IGNORECASE)
_API_KEY_PATTERN = re.compile(
    r'(api[_-]?key|token|secret)["\']?\s*[:=]\s*["\']?([^\s&"\'>]+)',
    flags=re.IGNORECASE,
)
_URL_CREDS_PATTERN = re.compile(r"://([^:]+):([^@]+)@")
_HMAC_PATTERN = re.compile(r"sha256=[a-f0-9]{64}")

# Sensitive key patterns
_SENSITIVE_KEYS = {"key", "secret", "token", "password", "credential", "auth"}


def mask_secrets(data: Any, _depth: int = 0) -> Any:
    """
    Recursively mask sensitive data in logs.

    Handles:
    - Bearer tokens
    - API keys in dict keys/values
    - Credentials in URLs
    - HMAC signatures

    Args:
        data: Data to mask (string, dict, list, or other)
        _depth: Current recursion depth (internal)

    Returns:
        Masked data with same structure
    """
    # Prevent infinite recursion / stack overflow
    if _depth > 10:
        return "*** (max depth exceeded) ***"

    if isinstance(data, str):
        # Apply all regex patterns (now precompiled)
        data = _BEARER_PATTERN.sub("Bearer ***", data)
        data = _API_KEY_PATTERN.sub(r"\1=***", data)
        data = _URL_CREDS_PATTERN.sub(r"://\1:***@", data)
        data = _HMAC_PATTERN.sub("sha256=***", data)
        return data

    elif isinstance(data, dict):
        masked = {}
        for key, value in data.items():
            key_lower = key.lower()
            # Mask sensitive keys
            if any(sensitive in key_lower for sensitive in _SENSITIVE_KEYS):
                masked[key] = "***"
            else:
                masked[key] = mask_secrets(value, _depth + 1)
        return masked

    elif isinstance(data, (list, tuple)):
        return type(data)(mask_secrets(item, _depth + 1) for item in data)

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
