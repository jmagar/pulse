"""Pytest configuration and fixtures."""

import importlib
import json
import os
import re
from pathlib import Path
from typing import Any

import pytest
import pytest_asyncio

os.makedirs(".cache", exist_ok=True)

# Configure deterministic test environment before importing app modules.
os.environ.setdefault("SEARCH_BRIDGE_DATABASE_URL", "sqlite+aiosqlite:///./.cache/test_webhook.db")
os.environ.setdefault("SEARCH_BRIDGE_API_SECRET", "test-api-secret-for-testing-only")
os.environ.setdefault(
    "SEARCH_BRIDGE_WEBHOOK_SECRET", "test-webhook-secret-for-testing-hmac-verification"
)
os.environ.setdefault("WEBHOOK_TEST_MODE", "true")
os.environ.setdefault("WEBHOOK_ENABLE_WORKER", "false")

# Reload configuration and database modules so they pick up the test settings.
import app.config as app_config

app_config.settings = app_config.Settings()  # type: ignore[call-arg]

import app.database as app_database

importlib.reload(app_database)


@pytest_asyncio.fixture(autouse=True)
async def cleanup_database_engine():
    """
    Cleanup database engine after each test.

    This ensures the database engine is disposed after each test,
    preventing event loop conflicts when tests run in different event loops.
    The engine will be recreated on next use.
    """
    yield
    # Clean up after test
    from app import database

    if database.engine:
        await database.engine.dispose()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def initialize_test_database():
    """Ensure SQLite schema exists for tests."""
    from app.database import close_database, init_database

    await init_database()
    yield
    await close_database()


@pytest.fixture
def sample_markdown() -> str:
    """Sample markdown text for testing."""
    return """
    # Machine Learning Guide

    Machine learning is a subset of artificial intelligence that enables systems
    to learn and improve from experience without being explicitly programmed.

    ## Types of Machine Learning

    1. **Supervised Learning**: Learn from labeled data
    2. **Unsupervised Learning**: Find patterns in unlabeled data
    3. **Reinforcement Learning**: Learn through trial and error

    Machine learning algorithms can be used for classification, regression,
    clustering, and dimensionality reduction tasks.
    """


@pytest.fixture
def sample_document_dict() -> dict[str, Any]:
    """Sample document for testing."""
    return {
        "url": "https://example.com/ml-guide",
        "resolvedUrl": "https://example.com/ml-guide",
        "title": "Machine Learning Guide",
        "description": "A comprehensive guide to machine learning",
        "markdown": """
        # Machine Learning Guide

        Machine learning is a subset of artificial intelligence.
        """,
        "html": "<html><body><h1>Machine Learning Guide</h1></body></html>",
        "statusCode": 200,
        "language": "en",
        "country": "US",
        "isMobile": False,
    }


@pytest.fixture
def api_secret_header() -> dict[str, str]:
    """Provide API secret header for authenticated requests."""
    from app.config import settings

    return {"Authorization": f"Bearer {settings.api_secret}"}


@pytest_asyncio.fixture
async def db_session():
    """
    Provide a database session for tests that need direct database access.

    This fixture creates a new session for each test and rolls back
    changes after the test completes to maintain test isolation.
    """
    from app.database import get_db_context

    async with get_db_context() as session:
        yield session
        # Rollback is handled by get_db_context on exception
        # For successful tests, we still want to rollback to maintain isolation
        await session.rollback()


@pytest.fixture
def test_queue():
    """
    Provide a mock RQ queue for testing webhook handlers.

    Returns a MagicMock that can be used to verify queue.enqueue calls.
    """
    from unittest.mock import MagicMock

    queue = MagicMock()
    # Configure enqueue to return a job with an ID
    job = MagicMock()
    job.id = "test-job-id"
    queue.enqueue.return_value = job
    return queue


@pytest.fixture(scope="session")
def stub_tokenizer_config_path() -> Path:
    """Return the path to the stub tokenizer configuration."""

    return Path(__file__).parent / "fixtures" / "stub_tokenizer.json"


@pytest.fixture(scope="session")
def stub_tokenizer_config(stub_tokenizer_config_path: Path) -> dict[str, Any]:
    """Load the stub tokenizer configuration from disk."""

    with stub_tokenizer_config_path.open("r", encoding="utf-8") as config_file:
        return json.load(config_file)


@pytest.fixture
def stub_auto_tokenizer(monkeypatch: pytest.MonkeyPatch, stub_tokenizer_config: dict[str, Any]):
    """Patch ``AutoTokenizer.from_pretrained`` to return a lightweight stub tokenizer."""

    pattern = re.compile(stub_tokenizer_config.get("pattern", r"\s+|\w+|[^\w\s]"), re.UNICODE)

    class StubTokenizer:
        """Very small tokenizer implementation backed by an on-disk vocabulary."""

        def __init__(self) -> None:
            vocab: dict[str, int] = dict(stub_tokenizer_config.get("vocab", {}))
            if not vocab:
                msg = "Stub tokenizer configuration is missing a vocabulary"
                raise ValueError(msg)

            self.vocab: dict[str, int] = vocab
            self.id_to_token: dict[int, str] = {idx: token for token, idx in vocab.items()}

            self.unk_token = stub_tokenizer_config.get("unk_token", "[UNK]")
            if self.unk_token not in self.vocab:
                next_id = max(self.vocab.values(), default=-1) + 1
                self.vocab[self.unk_token] = next_id
                self.id_to_token[next_id] = self.unk_token

            self.pad_token = stub_tokenizer_config.get("pad_token")
            self.cls_token = stub_tokenizer_config.get("cls_token")
            self.sep_token = stub_tokenizer_config.get("sep_token")
            self.mask_token = stub_tokenizer_config.get("mask_token")

            self.pad_token_id = self.vocab.get(self.pad_token) if self.pad_token else None
            self.model_max_length = stub_tokenizer_config.get("model_max_length", 512)

            special_tokens = set(stub_tokenizer_config.get("special_tokens", []))
            for key, token in {
                "pad_token": self.pad_token,
                "cls_token": self.cls_token,
                "sep_token": self.sep_token,
                "mask_token": self.mask_token,
                "unk_token": self.unk_token,
            }.items():
                if token:
                    special_tokens.add(token)

            self._special_tokens = special_tokens
            self._token_pattern = pattern
            self._next_token_id = max(self.vocab.values(), default=-1) + 1
            self._is_stub_tokenizer = True

        def _tokenize(self, text: str) -> list[str]:
            return self._token_pattern.findall(text)

        def encode(self, text: str, add_special_tokens: bool = False) -> list[int]:
            tokens = self._tokenize(text)
            token_ids: list[int] = []

            for token in tokens:
                if token not in self.vocab:
                    token_id = self._next_token_id
                    self.vocab[token] = token_id
                    self.id_to_token[token_id] = token
                    self._next_token_id += 1
                token_ids.append(self.vocab[token])

            if add_special_tokens:
                if self.cls_token and self.cls_token in self.vocab:
                    token_ids.insert(0, self.vocab[self.cls_token])
                if self.sep_token and self.sep_token in self.vocab:
                    token_ids.append(self.vocab[self.sep_token])

            return token_ids

        def decode(self, token_ids: list[int], skip_special_tokens: bool = True) -> str:
            tokens: list[str] = []

            for token_id in token_ids:
                token = self.id_to_token.get(token_id, self.unk_token)
                if skip_special_tokens and token in self._special_tokens:
                    continue
                tokens.append(token)

            return "".join(tokens)

    def _from_pretrained_stub(model_name: str, *args: Any, **kwargs: Any) -> StubTokenizer:  # noqa: ARG001
        return StubTokenizer()

    monkeypatch.setattr(
        "app.utils.text_processing.AutoTokenizer.from_pretrained",
        _from_pretrained_stub,
    )

    return _from_pretrained_stub
