"""Test rescrape job transaction handling."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from domain.models import ChangeEvent
from workers.jobs import rescrape_changed_url


@pytest.mark.asyncio
async def test_rescrape_rolls_back_on_firecrawl_failure():
    """Should rollback status update if Firecrawl fails."""
    # Mock change event
    mock_event = ChangeEvent(
        id=123,
        watch_id="test-123",
        watch_url="https://example.com",
        detected_at=datetime.now(UTC),
        rescrape_status="queued",
        extra_metadata={},
    )

    # Track how many separate transaction contexts are entered
    transaction_count = []

    def create_mock_session():
        """Create a fresh mock session for each transaction."""
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_event
        mock_session.execute.return_value = mock_result
        transaction_count.append("transaction")
        return mock_session

    with patch("workers.jobs.get_db_context") as mock_db_context:
        # Each call to get_db_context() creates a new session
        mock_db_context.return_value.__aenter__.side_effect = lambda: create_mock_session()

        # Mock Firecrawl to fail
        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.post.side_effect = Exception("Firecrawl error")
            mock_client.return_value.__aenter__.return_value = mock_instance

            with pytest.raises(Exception, match="Firecrawl error"):
                await rescrape_changed_url(123)

    # Verify: Should have TWO separate transaction contexts
    # Transaction 1: Fetch event and mark as in_progress
    # Transaction 2: Mark as failed after error
    assert len(transaction_count) >= 2, (
        f"Expected at least 2 separate transaction contexts, got {len(transaction_count)}"
    )


@pytest.mark.asyncio
async def test_rescrape_commits_only_on_full_success():
    """Should commit status update only after indexing succeeds."""
    # Mock change event
    mock_event = ChangeEvent(
        id=123,
        watch_id="test-123",
        watch_url="https://example.com",
        detected_at=datetime.now(UTC),
        rescrape_status="queued",
        extra_metadata={},
    )

    # Track how many separate transaction contexts are entered
    transaction_count = []

    def create_mock_session():
        """Create a fresh mock session for each transaction."""
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_event
        mock_session.execute.return_value = mock_result
        transaction_count.append("transaction")
        return mock_session

    with patch("workers.jobs.get_db_context") as mock_db_context:
        # Each call to get_db_context() creates a new session
        mock_db_context.return_value.__aenter__.side_effect = lambda: create_mock_session()

        # Mock Firecrawl success but indexing failure
        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_response.json = MagicMock(
                return_value={"success": True, "data": {"markdown": "content", "metadata": {}}}
            )
            mock_instance.post.return_value = mock_response
            mock_client.return_value.__aenter__.return_value = mock_instance

            with patch(
                "workers.jobs._index_document_helper", side_effect=Exception("Indexing error")
            ):
                with pytest.raises(Exception, match="Indexing error"):
                    await rescrape_changed_url(123)

    # Verify: Should have TWO separate transaction contexts
    # Transaction 1: Fetch event and mark as in_progress
    # Transaction 2: Mark as failed after indexing error
    assert len(transaction_count) >= 2, (
        f"Expected at least 2 separate transaction contexts, got {len(transaction_count)}"
    )


@pytest.mark.asyncio
async def test_rescrape_successful_transaction_sequence():
    """Should properly commit status changes through the complete workflow."""
    # Mock change event
    mock_event = ChangeEvent(
        id=123,
        watch_id="test-123",
        watch_url="https://example.com/test",
        detected_at=datetime.now(UTC),
        rescrape_status="queued",
        extra_metadata={},
    )

    # Track how many separate transaction contexts are entered
    transaction_count = []

    def create_mock_session():
        """Create a fresh mock session for each transaction."""
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_event
        mock_session.execute.return_value = mock_result
        transaction_count.append("transaction")
        return mock_session

    with patch("workers.jobs.get_db_context") as mock_db_context:
        # Each call to get_db_context() creates a new session
        mock_db_context.return_value.__aenter__.side_effect = lambda: create_mock_session()

        # Mock successful Firecrawl and indexing
        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_response.json = MagicMock(
                return_value={
                    "success": True,
                    "status": "completed",
                    "data": {
                        "markdown": "# Test Content",
                        "metadata": {"title": "Test Page", "description": "Test description"},
                    },
                }
            )
            mock_instance.post.return_value = mock_response
            mock_client.return_value.__aenter__.return_value = mock_instance

            with patch(
                "workers.jobs._index_document_helper", return_value="https://example.com/test"
            ):
                result = await rescrape_changed_url(123)

    # Verify: Should have TWO separate transaction contexts
    # Transaction 1: Fetch event and mark as in_progress
    # Transaction 2: Mark as completed
    assert len(transaction_count) >= 2, (
        f"Expected at least 2 separate transaction contexts, got {len(transaction_count)}"
    )
    assert result["status"] == "success"
