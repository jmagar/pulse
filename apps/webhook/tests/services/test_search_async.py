import os
from unittest.mock import AsyncMock, Mock, patch

import pytest

# Skip DB initialization
os.environ["WEBHOOK_SKIP_DB_FIXTURES"] = "1"

# Import after env var set
from services.search import SearchOrchestrator


@pytest.mark.asyncio
async def test_keyword_search_offloads_to_executor():
    embedding_service = Mock()
    vector_store = Mock()
    bm25_engine = Mock()
    bm25_engine.search.return_value = ([], 0)

    orchestrator = SearchOrchestrator(embedding_service, vector_store, bm25_engine)

    with patch("asyncio.get_running_loop") as mock_get_loop:
        mock_loop = Mock()
        mock_get_loop.return_value = mock_loop
        mock_loop.run_in_executor = AsyncMock(return_value=([], 0))

        # We access the private method directly since it's what we want to test
        # Note: In the actual implementation, we'll make sure this is awaited
        await orchestrator._keyword_search("query", 10, 0, None, None, None, None)

        # Verify run_in_executor was called
        mock_loop.run_in_executor.assert_called_once()
        # First arg should be None (default executor), second is the function
        assert mock_loop.run_in_executor.call_args[0][0] is None
