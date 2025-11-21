"""
BM25 keyword search engine.

Provides traditional keyword-based search using the BM25 algorithm.
The index is persisted to disk as a pickle file.

This implementation uses file locking (fcntl.flock on Unix) to ensure safe concurrent
access by multiple workers:
- Shared locks (LOCK_SH) are used for reading the index
- Exclusive locks (LOCK_EX) are used for writing the index
- Non-blocking locks (LOCK_NB) with retry logic prevent deadlocks
- A separate lock file (index.pkl.lock) coordinates access between processes

The locking mechanism ensures that:
- Multiple workers can safely read the index simultaneously
- Only one worker can write at a time
- Readers are blocked during writes to prevent reading stale/corrupted data
- All locks are properly released even if exceptions occur

Note: File locking requires a POSIX environment. On Windows, consider using
portalocker library or running in WSL/Docker.
"""

import errno
import pickle
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

# Unix-only file locking - Windows not supported
try:
    import fcntl
except ModuleNotFoundError as exc:
    raise RuntimeError(
        "BM25Engine file locking requires fcntl (Unix-only). "
        "For Windows deployments, use WSL, Docker, or install 'portalocker' "
        "and modify the locking implementation."
    ) from exc

from rank_bm25 import BM25Okapi

from utils.logging import get_logger

logger = get_logger(__name__)


class BM25Engine:
    """BM25 keyword search engine with disk persistence."""

    def __init__(
        self,
        index_path: str = "./data/bm25/index.pkl",
        k1: float = 1.5,
        b: float = 0.75,
    ) -> None:
        """
        Initialize BM25 engine.

        Args:
            index_path: Path to persist the BM25 index
            k1: BM25 k1 parameter (term frequency saturation)
            b: BM25 b parameter (length normalization)
        """
        self.index_path = Path(index_path)
        self.lock_path = Path(f"{self.index_path}.lock")
        self.k1 = k1
        self.b = b

        # Lock configuration
        self.lock_timeout = 30.0  # Maximum seconds to wait for lock
        self.lock_retry_delay = 0.1  # Seconds between lock acquisition attempts

        # Ensure directory exists
        self.index_path.parent.mkdir(parents=True, exist_ok=True)

        # In-memory structures
        self.corpus: list[str] = []  # Original texts
        self.tokenized_corpus: list[list[str]] = []  # Tokenized texts
        self.metadata: list[dict[str, Any]] = []  # Document metadata (URL, title, etc.)
        self.bm25: BM25Okapi | None = None

        # Load existing index if available
        try:
            self._load_index()
        except TimeoutError:
            # If we can't acquire lock during initialization, start with empty index
            # This prevents worker startup failures during deployments/scaling
            logger.warning(
                "Could not load BM25 index due to lock timeout during initialization. "
                "Starting with empty index. Index will be loaded on next operation.",
                lock_timeout=self.lock_timeout,
            )

        logger.info(
            "BM25 engine initialized",
            index_path=str(self.index_path),
            lock_path=str(self.lock_path),
            documents=len(self.corpus),
            k1=k1,
            b=b,
        )

    def _tokenize(self, text: str) -> list[str]:
        """
        Simple tokenization (split on whitespace and lowercase).

        Args:
            text: Text to tokenize

        Returns:
            List of tokens
        """
        return text.lower().split()

    @contextmanager
    def _acquire_lock(self, exclusive: bool = False) -> Iterator[None]:
        """
        Acquire a file lock with timeout and retry logic.

        Args:
            exclusive: If True, acquire exclusive lock (LOCK_EX) for writing.
                      If False, acquire shared lock (LOCK_SH) for reading.

        Yields:
            None when lock is acquired

        Raises:
            TimeoutError: If lock cannot be acquired within timeout period
        """
        lock_type = fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH
        lock_type_str = "exclusive" if exclusive else "shared"

        # Open lock file
        lock_file = None
        try:
            lock_file = open(self.lock_path, "a")
            start_time = time.time()

            # Try to acquire lock with retry logic
            while True:
                try:
                    # Try non-blocking lock acquisition
                    fcntl.flock(lock_file.fileno(), lock_type | fcntl.LOCK_NB)
                    logger.debug(
                        "Acquired lock",
                        lock_type=lock_type_str,
                        lock_path=str(self.lock_path),
                    )
                    break
                except OSError as e:
                    if e.errno != errno.EWOULDBLOCK:
                        # Unexpected error
                        raise

                    # Lock is held by another process
                    elapsed = time.time() - start_time
                    if elapsed >= self.lock_timeout:
                        raise TimeoutError(
                            f"Could not acquire {lock_type_str} lock within "
                            f"{self.lock_timeout} seconds"
                        )

                    # Wait before retrying
                    time.sleep(self.lock_retry_delay)

            # Lock acquired successfully
            yield

        finally:
            # Always release lock and close file
            if lock_file:
                try:
                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
                    logger.debug(
                        "Released lock",
                        lock_type=lock_type_str,
                        lock_path=str(self.lock_path),
                    )
                except Exception:
                    logger.exception(
                        "Failed to release lock",
                        lock_path=str(self.lock_path),
                    )
                finally:
                    lock_file.close()

    def _load_index(self) -> None:
        """Load index from disk if it exists with shared lock."""
        if not self.index_path.exists():
            logger.info("No existing BM25 index found")
            return

        try:
            # Acquire shared lock for reading
            with self._acquire_lock(exclusive=False):
                with open(self.index_path, "rb") as f:
                    data = pickle.load(f)

                self.corpus = data.get("corpus", [])
                self.tokenized_corpus = data.get("tokenized_corpus", [])
                self.metadata = data.get("metadata", [])

                # Rebuild BM25 index
                if self.tokenized_corpus:
                    self.bm25 = BM25Okapi(self.tokenized_corpus, k1=self.k1, b=self.b)

                logger.info("BM25 index loaded", documents=len(self.corpus))

        except TimeoutError:
            logger.exception("Timeout acquiring lock to load BM25 index")
            # Re-raise to let caller handle - don't wipe existing index
            raise

        except Exception:
            logger.exception("Failed to load BM25 index")
            # Reset to empty state only on other errors (corrupted file, etc.)
            self.corpus = []
            self.tokenized_corpus = []
            self.metadata = []
            self.bm25 = None

    def _save_index(self) -> None:
        """Save index to disk with exclusive lock."""
        try:
            # Acquire exclusive lock for writing
            with self._acquire_lock(exclusive=True):
                data = {
                    "corpus": self.corpus,
                    "tokenized_corpus": self.tokenized_corpus,
                    "metadata": self.metadata,
                }

                with open(self.index_path, "wb") as f:
                    pickle.dump(data, f)

                logger.debug("BM25 index saved", documents=len(self.corpus))

        except TimeoutError:
            logger.exception("Timeout acquiring lock to save BM25 index")
            # Timeout during save is non-fatal, just log it
            # Index is still in memory and can be saved later

        except Exception:
            logger.exception("Failed to save BM25 index")

    def index_document(
        self,
        text: str,
        metadata: dict[str, Any],
    ) -> None:
        """
        Index a single document.

        Args:
            text: Document text (typically full markdown)
            metadata: Document metadata (url, title, etc.)
        """
        if not text or not text.strip():
            logger.warning("Empty text provided for BM25 indexing")
            return

        # Tokenize
        tokens = self._tokenize(text)

        # Add to corpus
        self.corpus.append(text)
        self.tokenized_corpus.append(tokens)
        self.metadata.append(metadata)

        # Rebuild BM25 index
        self.bm25 = BM25Okapi(self.tokenized_corpus, k1=self.k1, b=self.b)

        # Save to disk
        self._save_index()

        logger.info(
            "Indexed document in BM25",
            total_documents=len(self.corpus),
            url=metadata.get("url", "unknown"),
        )

    def search(
        self,
        query: str,
        limit: int = 10,
        offset: int = 0,
        domain: str | None = None,
        language: str | None = None,
        country: str | None = None,
        is_mobile: bool | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """
        Search documents using BM25.

        Args:
            query: Search query
            limit: Maximum results
            domain: Filter by domain
            language: Filter by language
            country: Filter by country
            is_mobile: Filter by mobile flag

        Returns:
            Tuple of (results, total_count)
        """
        if not self.bm25 or not self.corpus:
            logger.warning("BM25 index is empty")
            return [], 0

        # Tokenize query
        query_tokens = self._tokenize(query)

        # Get BM25 scores
        scores = self.bm25.get_scores(query_tokens)

        # Create (index, score) pairs
        doc_scores = list(enumerate(scores))

        # Apply filters
        if any([domain, language, country, is_mobile is not None]):
            filtered_scores = []
            for idx, score in doc_scores:
                meta = self.metadata[idx]

                # Check filters
                if domain and meta.get("domain") != domain:
                    continue
                if language and meta.get("language") != language:
                    continue
                if country and meta.get("country") != country:
                    continue
                if is_mobile is not None and meta.get("isMobile") != is_mobile:
                    continue

                filtered_scores.append((idx, score))

            doc_scores = filtered_scores

        # Sort by score (descending)
        doc_scores.sort(key=lambda x: x[1], reverse=True)

        # Take window respecting offset/limit
        top_results = doc_scores[offset : offset + limit]

        # Build result list
        results: list[dict[str, Any]] = []
        for idx, score in top_results:
            results.append(
                {
                    "index": idx,
                    "score": float(score),
                    "text": self.corpus[idx],
                    "metadata": self.metadata[idx],
                }
            )

        logger.info(
            "BM25 search completed",
            query=query,
            total_matches=len(doc_scores),
            returned=len(results),
        )

        return results, len(doc_scores)

    def get_document_count(self) -> int:
        """
        Get total number of indexed documents.

        Returns:
            Document count
        """
        return len(self.corpus)
