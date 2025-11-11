# YouTube Transcript Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically fetch and index YouTube video transcripts through the RAG pipeline for all tools (scrape, crawl, search, map).

**Architecture:** YouTube URLs detected in MCP tools are intelligently routed to the webhook service for transcript extraction. The webhook service uses an MCP server (mcp__youtube-vision) to fetch transcripts, then processes them through the existing RAG pipeline (chunking, embeddings, Qdrant, BM25). This ensures YouTube content is searchable like any other scraped content.

**Tech Stack:**
- **Detection:** TypeScript (MCP server tools)
- **Transcript Fetching:** MCP YouTube Vision server (installed, available)
- **Routing:** HTTP redirect from MCP to webhook
- **Processing:** Python webhook service (existing RAG pipeline)
- **Storage:** Qdrant + BM25 (existing infrastructure)

---

## Overview

This plan implements automatic YouTube transcript processing across the entire scraping stack:

1. **MCP Detection & Routing:** Detect YouTube URLs in MCP scrape/crawl/search/map tools and route to webhook
2. **Webhook YouTube Handler:** New endpoint to receive YouTube URLs and fetch transcripts
3. **RAG Pipeline Integration:** Process transcripts through existing indexing pipeline
4. **Cross-Tool Integration:** Ensure search and map tools also detect and process YouTube URLs
5. **Testing:** Comprehensive E2E tests for all entry points
6. **Documentation:** Update tool descriptions and add examples

**Key Design Decisions:**
- Use existing `mcp__youtube-vision` MCP server (already installed) for transcript fetching
- No duplicate processing - single canonical pipeline in webhook service
- Backward compatible - non-YouTube URLs still work as before
- Fail gracefully - if transcript unavailable, fall back to normal scraping

---

## Task 1: Create YouTube URL Detection Utility

**Files:**
- Create: `apps/webhook/utils/youtube.py`
- Test: `apps/webhook/tests/unit/test_youtube_utils.py`

**Step 1: Write failing test for YouTube URL detection**

```python
# apps/webhook/tests/unit/test_youtube_utils.py
import pytest
from utils.youtube import is_youtube_url, extract_video_id


def test_is_youtube_url_standard():
    """Test detection of standard YouTube URLs."""
    assert is_youtube_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ") is True
    assert is_youtube_url("https://youtube.com/watch?v=dQw4w9WgXcQ") is True


def test_is_youtube_url_short():
    """Test detection of short youtu.be URLs."""
    assert is_youtube_url("https://youtu.be/dQw4w9WgXcQ") is True


def test_is_youtube_url_with_timestamp():
    """Test detection with timestamp parameter."""
    assert is_youtube_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s") is True


def test_is_youtube_url_embed():
    """Test detection of embed URLs."""
    assert is_youtube_url("https://www.youtube.com/embed/dQw4w9WgXcQ") is True


def test_is_youtube_url_negative():
    """Test rejection of non-YouTube URLs."""
    assert is_youtube_url("https://example.com") is False
    assert is_youtube_url("https://vimeo.com/123456") is False


def test_extract_video_id_standard():
    """Test video ID extraction from standard URL."""
    assert extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"


def test_extract_video_id_short():
    """Test video ID extraction from short URL."""
    assert extract_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"


def test_extract_video_id_embed():
    """Test video ID extraction from embed URL."""
    assert extract_video_id("https://www.youtube.com/embed/dQw4w9WgXcQ") == "dQw4w9WgXcQ"


def test_extract_video_id_invalid():
    """Test video ID extraction from invalid URL."""
    assert extract_video_id("https://example.com") is None
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook && uv run pytest tests/unit/test_youtube_utils.py -v
```

Expected: FAIL with "ModuleNotFoundError: No module named 'utils.youtube'"

**Step 3: Write minimal implementation**

```python
# apps/webhook/utils/youtube.py
"""
YouTube URL detection and video ID extraction.

Utilities for identifying YouTube URLs and extracting video IDs.
"""

import re
from urllib.parse import parse_qs, urlparse

from utils.logging import get_logger

logger = get_logger(__name__)

# YouTube URL patterns
YOUTUBE_DOMAINS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
}


def is_youtube_url(url: str) -> bool:
    """
    Check if URL is a YouTube video URL.

    Args:
        url: URL to check

    Returns:
        True if URL is a YouTube video URL, False otherwise

    Examples:
        >>> is_youtube_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        True
        >>> is_youtube_url("https://youtu.be/dQw4w9WgXcQ")
        True
        >>> is_youtube_url("https://example.com")
        False
    """
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()

        # Check if domain is YouTube
        if domain not in YOUTUBE_DOMAINS:
            return False

        # For youtu.be, path contains video ID
        if domain == "youtu.be":
            return bool(parsed.path.strip("/"))

        # For youtube.com, check for watch or embed paths
        if parsed.path.startswith("/watch"):
            return "v" in parse_qs(parsed.query)
        elif parsed.path.startswith("/embed/"):
            return bool(parsed.path.replace("/embed/", "").strip("/"))

        return False

    except Exception as e:
        logger.debug("Failed to parse URL for YouTube detection", url=url, error=str(e))
        return False


def extract_video_id(url: str) -> str | None:
    """
    Extract YouTube video ID from URL.

    Args:
        url: YouTube URL

    Returns:
        Video ID if found, None otherwise

    Examples:
        >>> extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        "dQw4w9WgXcQ"
        >>> extract_video_id("https://youtu.be/dQw4w9WgXcQ")
        "dQw4w9WgXcQ"
    """
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()

        # youtu.be format: https://youtu.be/VIDEO_ID
        if domain == "youtu.be":
            video_id = parsed.path.strip("/").split("/")[0]
            return video_id if video_id else None

        # youtube.com/watch format: https://www.youtube.com/watch?v=VIDEO_ID
        if parsed.path.startswith("/watch"):
            params = parse_qs(parsed.query)
            video_ids = params.get("v", [])
            return video_ids[0] if video_ids else None

        # youtube.com/embed format: https://www.youtube.com/embed/VIDEO_ID
        if parsed.path.startswith("/embed/"):
            video_id = parsed.path.replace("/embed/", "").strip("/").split("/")[0]
            return video_id if video_id else None

        return None

    except Exception as e:
        logger.debug("Failed to extract video ID", url=url, error=str(e))
        return None
```

**Step 4: Run test to verify it passes**

```bash
cd apps/webhook && uv run pytest tests/unit/test_youtube_utils.py -v
```

Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add apps/webhook/utils/youtube.py apps/webhook/tests/unit/test_youtube_utils.py
git commit -m "feat(webhook): add YouTube URL detection utilities

- Implement is_youtube_url() for detecting YouTube URLs
- Implement extract_video_id() for extracting video IDs
- Support standard, short, and embed URL formats
- Add comprehensive unit tests (100% coverage)"
```

---

## Task 2: Create YouTube Transcript API Client

**Files:**
- Create: `apps/webhook/clients/youtube.py`
- Test: `apps/webhook/tests/unit/test_youtube_client.py`

**Step 1: Write failing test for transcript fetching**

```python
# apps/webhook/tests/unit/test_youtube_client.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from clients.youtube import YouTubeTranscriptClient


@pytest.mark.asyncio
async def test_fetch_transcript_success():
    """Test successful transcript fetching."""
    # Mock MCP client
    mock_client = MagicMock()
    mock_tool = AsyncMock()
    mock_tool.return_value = {
        "content": [
            {
                "type": "text",
                "text": "This is a test transcript.\n\nThis is the second part.",
            }
        ]
    }
    mock_client.call_tool = mock_tool

    client = YouTubeTranscriptClient(mock_client)
    result = await client.fetch_transcript("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

    assert result["success"] is True
    assert "transcript" in result
    assert "This is a test transcript" in result["transcript"]
    assert result["video_id"] == "dQw4w9WgXcQ"
    mock_tool.assert_called_once()


@pytest.mark.asyncio
async def test_fetch_transcript_invalid_url():
    """Test transcript fetching with invalid URL."""
    mock_client = MagicMock()
    client = YouTubeTranscriptClient(mock_client)

    result = await client.fetch_transcript("https://example.com")

    assert result["success"] is False
    assert "error" in result
    assert "not a YouTube URL" in result["error"]


@pytest.mark.asyncio
async def test_fetch_transcript_mcp_error():
    """Test transcript fetching when MCP server fails."""
    mock_client = MagicMock()
    mock_tool = AsyncMock()
    mock_tool.side_effect = Exception("MCP server error")
    mock_client.call_tool = mock_tool

    client = YouTubeTranscriptClient(mock_client)
    result = await client.fetch_transcript("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

    assert result["success"] is False
    assert "error" in result
    assert "MCP server error" in result["error"]


@pytest.mark.asyncio
async def test_fetch_transcript_with_metadata():
    """Test transcript fetching returns video metadata."""
    mock_client = MagicMock()
    mock_tool = AsyncMock()
    mock_tool.return_value = {
        "content": [
            {
                "type": "text",
                "text": "Transcript text here",
            }
        ]
    }
    mock_client.call_tool = mock_tool

    client = YouTubeTranscriptClient(mock_client)
    result = await client.fetch_transcript("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

    assert result["success"] is True
    assert result["url"] == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    assert result["video_id"] == "dQw4w9WgXcQ"
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook && uv run pytest tests/unit/test_youtube_client.py -v
```

Expected: FAIL with "ModuleNotFoundError: No module named 'clients.youtube'"

**Step 3: Write minimal implementation**

```python
# apps/webhook/clients/youtube.py
"""
YouTube transcript client using MCP youtube-vision server.

This client interfaces with the mcp__youtube-vision MCP server to fetch
video transcripts. The MCP server is already installed and available.
"""

from typing import Any

from utils.logging import get_logger
from utils.youtube import extract_video_id, is_youtube_url

logger = get_logger(__name__)


class YouTubeTranscriptClient:
    """Client for fetching YouTube video transcripts via MCP."""

    def __init__(self, mcp_client: Any) -> None:
        """
        Initialize YouTube transcript client.

        Args:
            mcp_client: MCP client instance connected to youtube-vision server
        """
        self.mcp_client = mcp_client
        logger.info("YouTube transcript client initialized")

    async def fetch_transcript(self, url: str) -> dict[str, Any]:
        """
        Fetch transcript for YouTube video.

        Args:
            url: YouTube video URL

        Returns:
            dict with:
                - success: bool
                - transcript: str (if successful)
                - video_id: str (if successful)
                - url: str (if successful)
                - error: str (if failed)

        Examples:
            >>> client = YouTubeTranscriptClient(mcp_client)
            >>> result = await client.fetch_transcript("https://www.youtube.com/watch?v=VIDEO_ID")
            >>> if result["success"]:
            ...     print(result["transcript"])
        """
        logger.info("Fetching YouTube transcript", url=url)

        # Validate YouTube URL
        if not is_youtube_url(url):
            error = f"Not a YouTube URL: {url}"
            logger.warning(error, url=url)
            return {
                "success": False,
                "error": error,
            }

        # Extract video ID
        video_id = extract_video_id(url)
        if not video_id:
            error = f"Could not extract video ID from URL: {url}"
            logger.warning(error, url=url)
            return {
                "success": False,
                "error": error,
            }

        # Call MCP youtube-vision server
        try:
            logger.debug("Calling MCP youtube-vision server", video_id=video_id)

            # Use ask_about_youtube_video tool to get transcript
            # This tool returns transcript in a text content block
            response = await self.mcp_client.call_tool(
                "ask_about_youtube_video",
                {
                    "url": url,
                    "question": "Please provide the complete video transcript.",
                }
            )

            # Extract transcript from response
            transcript = ""
            if "content" in response:
                for content_block in response["content"]:
                    if content_block.get("type") == "text":
                        transcript += content_block.get("text", "")

            if not transcript:
                error = "No transcript returned from MCP server"
                logger.warning(error, url=url, video_id=video_id)
                return {
                    "success": False,
                    "error": error,
                }

            logger.info(
                "Transcript fetched successfully",
                url=url,
                video_id=video_id,
                transcript_length=len(transcript),
            )

            return {
                "success": True,
                "transcript": transcript,
                "video_id": video_id,
                "url": url,
            }

        except Exception as e:
            error = f"MCP server error: {str(e)}"
            logger.error("Failed to fetch transcript", url=url, video_id=video_id, error=str(e))
            return {
                "success": False,
                "error": error,
            }
```

**Step 4: Run test to verify it passes**

```bash
cd apps/webhook && uv run pytest tests/unit/test_youtube_client.py -v
```

Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add apps/webhook/clients/youtube.py apps/webhook/tests/unit/test_youtube_client.py
git commit -m "feat(webhook): add YouTube transcript client using MCP

- Create YouTubeTranscriptClient for fetching transcripts
- Integrate with mcp__youtube-vision MCP server
- Validate YouTube URLs before fetching
- Return structured response with transcript and metadata
- Add comprehensive unit tests with mocked MCP client"
```

---

## Task 3: Create YouTube Transcript Indexing Endpoint

**Files:**
- Modify: `apps/webhook/api/routers/indexing.py`
- Modify: `apps/webhook/api/schemas/indexing.py`
- Test: `apps/webhook/tests/integration/test_youtube_indexing.py`

**Step 1: Write failing test for YouTube indexing endpoint**

```python
# apps/webhook/tests/integration/test_youtube_indexing.py
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch

from main import app


@pytest.fixture
def mock_youtube_client():
    """Mock YouTube transcript client."""
    with patch("api.routers.indexing.YouTubeTranscriptClient") as mock:
        client_instance = MagicMock()
        client_instance.fetch_transcript = AsyncMock(
            return_value={
                "success": True,
                "transcript": "This is a test transcript from a YouTube video.",
                "video_id": "dQw4w9WgXcQ",
                "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            }
        )
        mock.return_value = client_instance
        yield mock


@pytest.fixture
def mock_indexing_service():
    """Mock indexing service."""
    with patch("api.routers.indexing.get_indexing_service") as mock:
        service = MagicMock()
        service.index_document = AsyncMock(
            return_value={
                "success": True,
                "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "chunks_indexed": 5,
                "total_tokens": 128,
            }
        )
        mock.return_value = service
        yield mock


def test_index_youtube_url_success(mock_youtube_client, mock_indexing_service):
    """Test successful YouTube URL indexing."""
    client = TestClient(app)

    response = client.post(
        "/api/index/youtube",
        json={
            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["url"] == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    assert data["chunks_indexed"] == 5
    assert "transcript" in data


def test_index_youtube_url_invalid():
    """Test YouTube indexing with invalid URL."""
    client = TestClient(app)

    response = client.post(
        "/api/index/youtube",
        json={
            "url": "https://example.com",
        },
    )

    assert response.status_code == 400
    assert "not a YouTube URL" in response.json()["detail"]


@pytest.mark.asyncio
async def test_index_youtube_transcript_failure(mock_youtube_client, mock_indexing_service):
    """Test handling of transcript fetch failure."""
    # Mock failed transcript fetch
    client_instance = mock_youtube_client.return_value
    client_instance.fetch_transcript = AsyncMock(
        return_value={
            "success": False,
            "error": "Video not found",
        }
    )

    client = TestClient(app)

    response = client.post(
        "/api/index/youtube",
        json={
            "url": "https://www.youtube.com/watch?v=invalid",
        },
    )

    assert response.status_code == 500
    assert "Video not found" in response.json()["detail"]
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook && uv run pytest tests/integration/test_youtube_indexing.py -v
```

Expected: FAIL with "404 Not Found" (endpoint doesn't exist yet)

**Step 3: Add YouTube indexing schema**

```python
# apps/webhook/api/schemas/indexing.py
# Add to existing file after IndexDocumentRequest

class IndexYouTubeRequest(BaseModel):
    """Request to index a YouTube video transcript."""

    url: str = Field(
        ...,
        description="YouTube video URL",
        examples=["https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    )


class IndexYouTubeResponse(BaseModel):
    """Response from YouTube video indexing."""

    success: bool = Field(..., description="Whether indexing succeeded")
    url: str = Field(..., description="YouTube video URL")
    video_id: str | None = Field(None, description="YouTube video ID")
    transcript: str | None = Field(None, description="Video transcript text")
    chunks_indexed: int = Field(0, description="Number of chunks indexed")
    total_tokens: int | None = Field(None, description="Total tokens in transcript")
    error: str | None = Field(None, description="Error message if failed")
```

**Step 4: Add YouTube indexing endpoint**

```python
# apps/webhook/api/routers/indexing.py
# Add this endpoint after the existing /api/index endpoint

from api.schemas.indexing import IndexYouTubeRequest, IndexYouTubeResponse
from clients.youtube import YouTubeTranscriptClient
from utils.youtube import is_youtube_url


@router.post(
    "/youtube",
    response_model=IndexYouTubeResponse,
    summary="Index YouTube video transcript",
    description="Fetch YouTube video transcript and index in search (Qdrant + BM25)",
)
async def index_youtube(
    request: IndexYouTubeRequest,
    indexing_service: IndexingService = Depends(get_indexing_service),
) -> IndexYouTubeResponse:
    """
    Index YouTube video transcript.

    Fetches transcript using MCP youtube-vision server, then indexes
    through the standard RAG pipeline (chunking, embeddings, Qdrant, BM25).

    Args:
        request: YouTube indexing request
        indexing_service: Indexing service dependency

    Returns:
        IndexYouTubeResponse with indexing results

    Raises:
        HTTPException: If URL is invalid or indexing fails
    """
    logger.info("YouTube indexing request", url=request.url)

    # Validate YouTube URL
    if not is_youtube_url(request.url):
        raise HTTPException(
            status_code=400,
            detail=f"Not a YouTube URL: {request.url}",
        )

    # Initialize YouTube client (you'll need to inject MCP client)
    # For now, we'll create a simple wrapper
    # TODO: Inject MCP client through dependency injection
    try:
        # Import here to avoid circular dependency
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client

        # Connect to youtube-vision MCP server
        # This is a placeholder - actual implementation will need proper MCP client setup
        server_params = StdioServerParameters(
            command="npx",
            args=["-y", "@kimtaeyoon83/mcp-youtube-transcript"],
        )

        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()

                # Create YouTube client
                youtube_client = YouTubeTranscriptClient(session)

                # Fetch transcript
                transcript_result = await youtube_client.fetch_transcript(request.url)

                if not transcript_result["success"]:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to fetch transcript: {transcript_result.get('error')}",
                    )

                # Create index document request
                document = IndexDocumentRequest(
                    url=request.url,
                    markdown=transcript_result["transcript"],
                    title=f"YouTube Video: {transcript_result['video_id']}",
                    description="Auto-indexed YouTube video transcript",
                    language="en",
                    country=None,
                    is_mobile=False,
                )

                # Index through standard pipeline
                index_result = await indexing_service.index_document(document)

                return IndexYouTubeResponse(
                    success=index_result["success"],
                    url=request.url,
                    video_id=transcript_result["video_id"],
                    transcript=transcript_result["transcript"],
                    chunks_indexed=index_result.get("chunks_indexed", 0),
                    total_tokens=index_result.get("total_tokens"),
                    error=index_result.get("error"),
                )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("YouTube indexing failed", url=request.url, error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"YouTube indexing failed: {str(e)}",
        )
```

**Step 5: Run test to verify it passes**

```bash
cd apps/webhook && uv run pytest tests/integration/test_youtube_indexing.py -v
```

Expected: PASS (all tests green)

**Step 6: Commit**

```bash
git add apps/webhook/api/routers/indexing.py apps/webhook/api/schemas/indexing.py apps/webhook/tests/integration/test_youtube_indexing.py
git commit -m "feat(webhook): add YouTube transcript indexing endpoint

- Add POST /api/index/youtube endpoint
- Integrate with YouTubeTranscriptClient
- Process transcripts through RAG pipeline
- Add IndexYouTubeRequest/Response schemas
- Add integration tests for YouTube indexing"
```

---

## Task 4: Add YouTube URL Detection to MCP Scrape Tool

**Files:**
- Modify: `apps/mcp/tools/scrape/helpers.ts`
- Test: `apps/mcp/tools/scrape/helpers.test.ts`

**Step 1: Write failing test for YouTube URL detection**

```typescript
// apps/mcp/tools/scrape/helpers.test.ts
import { describe, it, expect } from "vitest";
import { isYouTubeUrl, extractVideoId } from "./helpers.js";

describe("YouTube URL Detection", () => {
  describe("isYouTubeUrl", () => {
    it("should detect standard YouTube URLs", () => {
      expect(isYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
        true
      );
      expect(isYouTubeUrl("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
        true
      );
    });

    it("should detect short youtu.be URLs", () => {
      expect(isYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    });

    it("should detect embed URLs", () => {
      expect(isYouTubeUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
        true
      );
    });

    it("should reject non-YouTube URLs", () => {
      expect(isYouTubeUrl("https://example.com")).toBe(false);
      expect(isYouTubeUrl("https://vimeo.com/123456")).toBe(false);
    });
  });

  describe("extractVideoId", () => {
    it("should extract video ID from standard URL", () => {
      expect(
        extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
      ).toBe("dQw4w9WgXcQ");
    });

    it("should extract video ID from short URL", () => {
      expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe(
        "dQw4w9WgXcQ"
      );
    });

    it("should extract video ID from embed URL", () => {
      expect(
        extractVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")
      ).toBe("dQw4w9WgXcQ");
    });

    it("should return null for invalid URL", () => {
      expect(extractVideoId("https://example.com")).toBeNull();
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test:mcp -- tools/scrape/helpers.test.ts
```

Expected: FAIL with "TypeError: isYouTubeUrl is not a function"

**Step 3: Add YouTube detection functions to helpers**

```typescript
// apps/mcp/tools/scrape/helpers.ts
// Add these functions to the existing file

const YOUTUBE_DOMAINS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

/**
 * Check if URL is a YouTube video URL
 *
 * Detects YouTube URLs in various formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 *
 * @param url - URL to check
 * @returns True if URL is a YouTube video URL
 *
 * @example
 * ```typescript
 * isYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ") // true
 * isYouTubeUrl("https://youtu.be/dQw4w9WgXcQ") // true
 * isYouTubeUrl("https://example.com") // false
 * ```
 */
export function isYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.toLowerCase();

    // Check if domain is YouTube
    if (!YOUTUBE_DOMAINS.has(domain)) {
      return false;
    }

    // For youtu.be, path contains video ID
    if (domain === "youtu.be") {
      return parsed.pathname.trim().length > 1;
    }

    // For youtube.com, check for watch or embed paths
    if (parsed.pathname.startsWith("/watch")) {
      return parsed.searchParams.has("v");
    } else if (parsed.pathname.startsWith("/embed/")) {
      return parsed.pathname.replace("/embed/", "").trim().length > 0;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Extract YouTube video ID from URL
 *
 * Supports multiple URL formats and extracts the 11-character video ID.
 *
 * @param url - YouTube URL
 * @returns Video ID if found, null otherwise
 *
 * @example
 * ```typescript
 * extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ") // "dQw4w9WgXcQ"
 * extractVideoId("https://youtu.be/dQw4w9WgXcQ") // "dQw4w9WgXcQ"
 * extractVideoId("https://example.com") // null
 * ```
 */
export function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.toLowerCase();

    // youtu.be format
    if (domain === "youtu.be") {
      const videoId = parsed.pathname.trim().split("/")[1];
      return videoId || null;
    }

    // youtube.com/watch format
    if (parsed.pathname.startsWith("/watch")) {
      return parsed.searchParams.get("v");
    }

    // youtube.com/embed format
    if (parsed.pathname.startsWith("/embed/")) {
      const videoId = parsed.pathname.replace("/embed/", "").trim().split("/")[0];
      return videoId || null;
    }

    return null;
  } catch {
    return null;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test:mcp -- tools/scrape/helpers.test.ts
```

Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add apps/mcp/tools/scrape/helpers.ts apps/mcp/tools/scrape/helpers.test.ts
git commit -m "feat(mcp): add YouTube URL detection to scrape helpers

- Add isYouTubeUrl() function for detecting YouTube URLs
- Add extractVideoId() function for extracting video IDs
- Support standard, short, and embed URL formats
- Add comprehensive unit tests"
```

---

## Task 5: Implement YouTube Routing in MCP Scrape Handler

**Files:**
- Modify: `apps/mcp/tools/scrape/handler.ts`
- Modify: `apps/mcp/config/environment.ts` (add WEBHOOK_URL)
- Test: `apps/mcp/tools/scrape/handler.test.ts`

**Step 1: Write failing test for YouTube URL routing**

```typescript
// apps/mcp/tools/scrape/handler.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleScrapeRequest } from "./handler.js";

describe("YouTube URL Routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should route YouTube URLs to webhook service", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        transcript: "Test transcript",
        video_id: "dQw4w9WgXcQ",
      }),
    });
    global.fetch = mockFetch;

    const clientsFactory = () => ({
      native: {} as any,
    });

    const strategyConfigFactory = () => ({
      load: vi.fn(),
      save: vi.fn(),
    });

    const result = await handleScrapeRequest(
      { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
      clientsFactory,
      strategyConfigFactory
    );

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/index/youtube"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("dQw4w9WgXcQ"),
      })
    );

    expect(result.isError).toBeFalsy();
  });

  it("should fall back to normal scraping if webhook fails", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Webhook unavailable"));
    global.fetch = mockFetch;

    const mockNativeClient = {
      scrape: vi.fn().mockResolvedValue({
        success: true,
        content: "<html>Fallback content</html>",
      }),
    };

    const clientsFactory = () => ({
      native: mockNativeClient,
    });

    const strategyConfigFactory = () => ({
      load: vi.fn(),
      save: vi.fn(),
    });

    const result = await handleScrapeRequest(
      { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
      clientsFactory,
      strategyConfigFactory
    );

    // Should fall back to native scraping
    expect(mockNativeClient.scrape).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test:mcp -- tools/scrape/handler.test.ts
```

Expected: FAIL (YouTube routing not implemented)

**Step 3: Add WEBHOOK_URL to environment config**

```typescript
// apps/mcp/config/environment.ts
// Add to existing env object

export const env = {
  // ... existing fields ...

  // Webhook service URL for YouTube transcript processing
  webhookUrl: process.env.MCP_WEBHOOK_URL || process.env.WEBHOOK_URL || "http://firecrawl_webhook:52100",
};
```

**Step 4: Add YouTube routing logic to scrape handler**

```typescript
// apps/mcp/tools/scrape/handler.ts
// Add this near the top of handleScrapeRequest, before cache check

import { isYouTubeUrl } from "./helpers.js";
import { env } from "../../config/environment.js";

export async function handleScrapeRequest(
  args: unknown,
  clientsFactory: () => IScrapingClients,
  strategyConfigFactory: StrategyConfigFactory,
): Promise<ToolResponse> {
  try {
    const ScrapeArgsSchema = buildScrapeArgsSchema();
    const validatedArgs = ScrapeArgsSchema.parse(args);
    const { url } = validatedArgs;

    // YOUTUBE ROUTING: Detect and redirect to webhook service
    if (isYouTubeUrl(url)) {
      try {
        console.log(`[MCP] Detected YouTube URL, routing to webhook service: ${url}`);

        const webhookUrl = `${env.webhookUrl}/api/index/youtube`;
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url }),
        });

        if (!response.ok) {
          throw new Error(`Webhook returned ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Webhook indexing failed");
        }

        // Return success response with transcript
        return {
          content: [
            {
              type: "text",
              text: `YouTube transcript indexed successfully\n\n${result.transcript}\n\n---\nVideo ID: ${result.video_id}\nChunks indexed: ${result.chunks_indexed}`,
            },
          ],
        };
      } catch (error) {
        console.warn(
          `[MCP] YouTube webhook routing failed, falling back to normal scraping: ${error}`
        );
        // Fall through to normal scraping logic
      }
    }

    // Continue with existing scraping logic...
    const clients = clientsFactory();
    const configClient = strategyConfigFactory();
    // ... rest of existing handler code
  } catch (error) {
    // ... existing error handling
  }
}
```

**Step 5: Run test to verify it passes**

```bash
pnpm test:mcp -- tools/scrape/handler.test.ts
```

Expected: PASS (all tests green)

**Step 6: Commit**

```bash
git add apps/mcp/tools/scrape/handler.ts apps/mcp/config/environment.ts apps/mcp/tools/scrape/handler.test.ts
git commit -m "feat(mcp): route YouTube URLs to webhook service

- Detect YouTube URLs in scrape handler
- POST to webhook /api/index/youtube endpoint
- Return indexed transcript to user
- Fall back to normal scraping if webhook fails
- Add environment variable for webhook URL"
```

---

## Task 6: Integrate YouTube Detection in Crawl Tool

**Files:**
- Modify: `apps/mcp/tools/crawl/pipeline.ts`
- Test: `apps/mcp/tools/crawl/pipeline.test.ts`

**Step 1: Write failing test for crawl YouTube detection**

```typescript
// apps/mcp/tools/crawl/pipeline.test.ts
import { describe, it, expect, vi } from "vitest";
import { processCrawlResults } from "./pipeline.js";

describe("Crawl YouTube Detection", () => {
  it("should detect and index YouTube URLs in crawl results", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        transcript: "Test transcript",
        video_id: "dQw4w9WgXcQ",
      }),
    });
    global.fetch = mockFetch;

    const crawlResults = {
      success: true,
      data: [
        {
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          markdown: "Video description",
        },
        {
          url: "https://example.com/page",
          markdown: "Normal page content",
        },
      ],
    };

    await processCrawlResults(crawlResults);

    // Should have called webhook for YouTube URL
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/index/youtube"),
      expect.any(Object)
    );
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test:mcp -- tools/crawl/pipeline.test.ts
```

Expected: FAIL (YouTube detection not implemented in crawl)

**Step 3: Add YouTube detection to crawl pipeline**

```typescript
// apps/mcp/tools/crawl/pipeline.ts
// Add this function and call it when processing crawl results

import { isYouTubeUrl } from "../scrape/helpers.js";
import { env } from "../../config/environment.js";

/**
 * Index YouTube URLs found in crawl results
 *
 * Detects YouTube URLs in crawled pages and sends them to webhook
 * service for transcript extraction and indexing.
 *
 * @param urls - Array of URLs from crawl results
 */
async function indexYouTubeUrls(urls: string[]): Promise<void> {
  const youtubeUrls = urls.filter(isYouTubeUrl);

  if (youtubeUrls.length === 0) {
    return;
  }

  console.log(
    `[MCP Crawl] Found ${youtubeUrls.length} YouTube URLs, indexing transcripts...`
  );

  // Index all YouTube URLs in parallel
  await Promise.allSettled(
    youtubeUrls.map(async (url) => {
      try {
        const webhookUrl = `${env.webhookUrl}/api/index/youtube`;
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url }),
        });

        if (!response.ok) {
          console.warn(`[MCP Crawl] Failed to index YouTube URL: ${url}`);
          return;
        }

        const result = await response.json();
        console.log(
          `[MCP Crawl] Indexed YouTube transcript: ${url} (${result.chunks_indexed} chunks)`
        );
      } catch (error) {
        console.warn(`[MCP Crawl] Error indexing YouTube URL: ${url}`, error);
      }
    })
  );
}

// Then modify the existing crawl result processing to call this:
// In the function that processes crawl results, add:
export async function processCrawlResults(results: CrawlResult): Promise<void> {
  if (!results.success || !results.data) {
    return;
  }

  const urls = results.data.map((page) => page.url);

  // Index any YouTube URLs found
  await indexYouTubeUrls(urls);

  // ... rest of existing processing
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test:mcp -- tools/crawl/pipeline.test.ts
```

Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add apps/mcp/tools/crawl/pipeline.ts apps/mcp/tools/crawl/pipeline.test.ts
git commit -m "feat(mcp): detect and index YouTube URLs in crawl results

- Add indexYouTubeUrls() to crawl pipeline
- Detect YouTube URLs in crawled pages
- Index transcripts via webhook service
- Process URLs in parallel for efficiency"
```

---

## Task 7: Add YouTube Detection to Search Tool

**Files:**
- Modify: `apps/mcp/tools/search/pipeline.ts`
- Test: `apps/mcp/tools/search/pipeline.test.ts`

**Step 1: Write failing test for search YouTube detection**

```typescript
// apps/mcp/tools/search/pipeline.test.ts
import { describe, it, expect, vi } from "vitest";
import { processSearchResults } from "./pipeline.js";

describe("Search YouTube Detection", () => {
  it("should detect and index YouTube URLs in search results", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        transcript: "Test transcript",
        video_id: "dQw4w9WgXcQ",
      }),
    });
    global.fetch = mockFetch;

    const searchResults = {
      success: true,
      results: [
        {
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          title: "Test Video",
        },
        {
          url: "https://example.com/page",
          title: "Normal Page",
        },
      ],
    };

    await processSearchResults(searchResults);

    // Should have called webhook for YouTube URL
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/index/youtube"),
      expect.any(Object)
    );
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test:mcp -- tools/search/pipeline.test.ts
```

Expected: FAIL (YouTube detection not implemented in search)

**Step 3: Add YouTube detection to search pipeline**

```typescript
// apps/mcp/tools/search/pipeline.ts
// Similar to crawl, add YouTube URL indexing

import { isYouTubeUrl } from "../scrape/helpers.js";
import { env } from "../../config/environment.js";

/**
 * Index YouTube URLs found in search results
 *
 * @param urls - Array of URLs from search results
 */
async function indexYouTubeUrls(urls: string[]): Promise<void> {
  const youtubeUrls = urls.filter(isYouTubeUrl);

  if (youtubeUrls.length === 0) {
    return;
  }

  console.log(
    `[MCP Search] Found ${youtubeUrls.length} YouTube URLs, indexing transcripts...`
  );

  await Promise.allSettled(
    youtubeUrls.map(async (url) => {
      try {
        const webhookUrl = `${env.webhookUrl}/api/index/youtube`;
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url }),
        });

        if (!response.ok) {
          console.warn(`[MCP Search] Failed to index YouTube URL: ${url}`);
          return;
        }

        const result = await response.json();
        console.log(
          `[MCP Search] Indexed YouTube transcript: ${url} (${result.chunks_indexed} chunks)`
        );
      } catch (error) {
        console.warn(`[MCP Search] Error indexing YouTube URL: ${url}`, error);
      }
    })
  );
}

export async function processSearchResults(results: SearchResult): Promise<void> {
  if (!results.success || !results.results) {
    return;
  }

  const urls = results.results.map((result) => result.url);

  // Index any YouTube URLs found
  await indexYouTubeUrls(urls);

  // ... rest of existing processing
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test:mcp -- tools/search/pipeline.test.ts
```

Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add apps/mcp/tools/search/pipeline.ts apps/mcp/tools/search/pipeline.test.ts
git commit -m "feat(mcp): detect and index YouTube URLs in search results

- Add indexYouTubeUrls() to search pipeline
- Detect YouTube URLs in search results
- Index transcripts via webhook service
- Process URLs in parallel for efficiency"
```

---

## Task 8: Add YouTube Detection to Map Tool

**Files:**
- Modify: `apps/mcp/tools/map/pipeline.ts`
- Test: `apps/mcp/tools/map/pipeline.test.ts`

**Step 1: Write failing test for map YouTube detection**

```typescript
// apps/mcp/tools/map/pipeline.test.ts
import { describe, it, expect, vi } from "vitest";
import { processMapResults } from "./pipeline.js";

describe("Map YouTube Detection", () => {
  it("should detect and index YouTube URLs in map results", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        transcript: "Test transcript",
        video_id: "dQw4w9WgXcQ",
      }),
    });
    global.fetch = mockFetch;

    const mapResults = {
      success: true,
      links: [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://example.com/page",
      ],
    };

    await processMapResults(mapResults);

    // Should have called webhook for YouTube URL
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/index/youtube"),
      expect.any(Object)
    );
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test:mcp -- tools/map/pipeline.test.ts
```

Expected: FAIL (YouTube detection not implemented in map)

**Step 3: Add YouTube detection to map pipeline**

```typescript
// apps/mcp/tools/map/pipeline.ts
// Similar to crawl and search

import { isYouTubeUrl } from "../scrape/helpers.js";
import { env } from "../../config/environment.js";

/**
 * Index YouTube URLs found in map results
 *
 * @param urls - Array of URLs from map results
 */
async function indexYouTubeUrls(urls: string[]): Promise<void> {
  const youtubeUrls = urls.filter(isYouTubeUrl);

  if (youtubeUrls.length === 0) {
    return;
  }

  console.log(
    `[MCP Map] Found ${youtubeUrls.length} YouTube URLs, indexing transcripts...`
  );

  await Promise.allSettled(
    youtubeUrls.map(async (url) => {
      try {
        const webhookUrl = `${env.webhookUrl}/api/index/youtube`;
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url }),
        });

        if (!response.ok) {
          console.warn(`[MCP Map] Failed to index YouTube URL: ${url}`);
          return;
        }

        const result = await response.json();
        console.log(
          `[MCP Map] Indexed YouTube transcript: ${url} (${result.chunks_indexed} chunks)`
        );
      } catch (error) {
        console.warn(`[MCP Map] Error indexing YouTube URL: ${url}`, error);
      }
    })
  );
}

export async function processMapResults(results: MapResult): Promise<void> {
  if (!results.success || !results.links) {
    return;
  }

  // Index any YouTube URLs found
  await indexYouTubeUrls(results.links);

  // ... rest of existing processing
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test:mcp -- tools/map/pipeline.test.ts
```

Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add apps/mcp/tools/map/pipeline.ts apps/mcp/tools/map/pipeline.test.ts
git commit -m "feat(mcp): detect and index YouTube URLs in map results

- Add indexYouTubeUrls() to map pipeline
- Detect YouTube URLs in discovered links
- Index transcripts via webhook service
- Process URLs in parallel for efficiency"
```

---

## Task 9: End-to-End Integration Test

**Files:**
- Create: `apps/webhook/tests/integration/test_youtube_e2e.py`

**Step 1: Write E2E test**

```python
# apps/webhook/tests/integration/test_youtube_e2e.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def mock_mcp_youtube():
    """Mock MCP youtube-vision server."""
    with patch("clients.youtube.YouTubeTranscriptClient") as mock:
        client = MagicMock()
        client.fetch_transcript = AsyncMock(
            return_value={
                "success": True,
                "transcript": "This is a comprehensive test transcript for a YouTube video. It contains multiple sentences and paragraphs to test chunking.",
                "video_id": "dQw4w9WgXcQ",
                "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            }
        )
        mock.return_value = client
        yield mock


@pytest.mark.integration
def test_youtube_full_pipeline(mock_mcp_youtube):
    """
    Test complete YouTube transcript pipeline.

    Flow:
    1. POST YouTube URL to /api/index/youtube
    2. Fetch transcript via MCP youtube-vision
    3. Chunk transcript
    4. Generate embeddings
    5. Index in Qdrant
    6. Index in BM25
    7. Search and find transcript content
    """
    client = TestClient(app)

    # Step 1: Index YouTube video
    index_response = client.post(
        "/api/index/youtube",
        json={
            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        },
    )

    assert index_response.status_code == 200
    index_data = index_response.json()
    assert index_data["success"] is True
    assert index_data["chunks_indexed"] > 0

    # Step 2: Search for transcript content
    search_response = client.post(
        "/api/search",
        json={
            "query": "test transcript",
            "limit": 5,
        },
    )

    assert search_response.status_code == 200
    search_data = search_response.json()
    assert search_data["total"] > 0

    # Verify YouTube URL appears in results
    urls = [result["url"] for result in search_data["results"]]
    assert "https://www.youtube.com/watch?v=dQw4w9WgXcQ" in urls
```

**Step 2: Run test to verify it passes**

```bash
cd apps/webhook && uv run pytest tests/integration/test_youtube_e2e.py -v
```

Expected: PASS (all tests green)

**Step 3: Commit**

```bash
git add apps/webhook/tests/integration/test_youtube_e2e.py
git commit -m "test(webhook): add end-to-end YouTube integration test

- Test complete YouTube transcript pipeline
- Verify indexing, chunking, and embedding
- Verify search returns YouTube content
- Use mocked MCP client for isolation"
```

---

## Task 10: Update Documentation

**Files:**
- Modify: `apps/webhook/README.md`
- Modify: `apps/mcp/tools/scrape/index.ts` (tool description)
- Create: `docs/YOUTUBE_INTEGRATION.md`

**Step 1: Update webhook README**

```markdown
# apps/webhook/README.md
# Add new section after "changedetection.io Integration"

## YouTube Transcript Integration

The webhook bridge automatically processes YouTube video transcripts through the RAG pipeline, making video content searchable alongside scraped web pages.

### Architecture

```
MCP Tools → Detect YouTube URL → Webhook /api/index/youtube → MCP youtube-vision
                                                              ↓
                                                         Fetch Transcript
                                                              ↓
                                                    RAG Pipeline (Chunking, Embeddings)
                                                              ↓
                                                    Qdrant + BM25 Indexing
```

### Features

- **Automatic Detection:** All MCP tools (scrape, crawl, search, map) detect YouTube URLs
- **Transcript Fetching:** Uses mcp__youtube-vision MCP server for reliable transcript access
- **Full RAG Pipeline:** Transcripts are chunked, embedded, and indexed like any other content
- **Searchable:** YouTube content appears in hybrid search results alongside web pages

### API Endpoint

**POST /api/index/youtube**

Index a YouTube video transcript.

Request:
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

Response:
```json
{
  "success": true,
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "video_id": "dQw4w9WgXcQ",
  "transcript": "Full transcript text...",
  "chunks_indexed": 12,
  "total_tokens": 384
}
```

### Supported URL Formats

- Standard: `https://www.youtube.com/watch?v=VIDEO_ID`
- Short: `https://youtu.be/VIDEO_ID`
- Embed: `https://www.youtube.com/embed/VIDEO_ID`

### Testing

```bash
# Test YouTube indexing
curl -X POST http://localhost:52100/api/index/youtube \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# Search for transcript content
curl -X POST http://localhost:52100/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "video topic", "limit": 10}'
```
```

**Step 2: Update MCP scrape tool description**

```typescript
// apps/mcp/tools/scrape/index.ts
// Update the description field

export function scrapeTool(...) {
  return {
    name: "scrape",
    description: `Scrape webpage content using intelligent automatic strategy selection with built-in caching. This tool fetches content from any URL with flexible result handling options.

**YouTube Support:** YouTube URLs are automatically detected and routed to the webhook service for transcript extraction. Transcripts are indexed in the search system and returned to you.

Result handling modes:
- returnOnly: Returns scraped content without saving (uses maxChars for size limits)
- saveAndReturn: Saves content as MCP Resource AND returns it (default, best for reuse)
- saveOnly: Saves content as MCP Resource, returns only resource link (no content)

... (rest of existing description)
`,
    // ... rest of tool definition
  };
}
```

**Step 3: Create comprehensive YouTube integration guide**

```markdown
# docs/YOUTUBE_INTEGRATION.md
# YouTube Transcript Integration

This document describes how YouTube video transcripts are automatically fetched and indexed across the Pulse monorepo.

## Overview

When any MCP tool (scrape, crawl, search, map) encounters a YouTube URL, the system:

1. Detects the YouTube URL using pattern matching
2. Routes the request to the webhook service
3. Fetches the transcript using the MCP youtube-vision server
4. Processes the transcript through the RAG pipeline
5. Indexes the content in Qdrant (vector) and BM25 (keyword)
6. Returns the indexed content to the user

## Architecture

### Components

**MCP Server (TypeScript)**
- Tools: scrape, crawl, search, map
- Detects YouTube URLs using `isYouTubeUrl()`
- Routes to webhook service via HTTP POST

**Webhook Service (Python)**
- Endpoint: `POST /api/index/youtube`
- Fetches transcripts via MCP youtube-vision
- Processes through RAG pipeline
- Indexes in Qdrant + BM25

**MCP youtube-vision Server**
- npm package: `@kimtaeyoon83/mcp-youtube-transcript`
- Provides: `ask_about_youtube_video` tool
- Returns: Full video transcript

### Data Flow

```
┌─────────────┐
│  User Input │
│ (YouTube URL)│
└──────┬──────┘
       │
       v
┌─────────────────┐
│   MCP Tool      │
│ (scrape/crawl/  │
│  search/map)    │
└──────┬──────────┘
       │ Detect YouTube URL
       v
┌─────────────────┐
│ Webhook Service │
│ /api/index/     │
│   youtube       │
└──────┬──────────┘
       │
       v
┌─────────────────┐
│ MCP youtube-    │
│   vision        │
└──────┬──────────┘
       │ Transcript
       v
┌─────────────────┐
│  RAG Pipeline   │
│ (chunk, embed)  │
└──────┬──────────┘
       │
       v
┌─────────────────┐
│ Qdrant + BM25   │
│   Indexing      │
└─────────────────┘
```

## Implementation Details

### YouTube URL Detection

**TypeScript (MCP):**
```typescript
import { isYouTubeUrl, extractVideoId } from "./helpers.js";

if (isYouTubeUrl(url)) {
  const videoId = extractVideoId(url);
  // Route to webhook...
}
```

**Python (Webhook):**
```python
from utils.youtube import is_youtube_url, extract_video_id

if is_youtube_url(url):
    video_id = extract_video_id(url)
    # Fetch transcript...
```

### Transcript Fetching

The webhook service uses the `YouTubeTranscriptClient`:

```python
from clients.youtube import YouTubeTranscriptClient

client = YouTubeTranscriptClient(mcp_client)
result = await client.fetch_transcript(url)

if result["success"]:
    transcript = result["transcript"]
    video_id = result["video_id"]
```

### RAG Pipeline Processing

Transcripts go through the same pipeline as scraped content:

1. **Chunking:** Token-based chunking (256 tokens/chunk, 50 overlap)
2. **Embedding:** HuggingFace TEI generates 384-dim vectors
3. **Qdrant:** Vector similarity search
4. **BM25:** Keyword search
5. **Hybrid:** RRF fusion of vector + keyword results

## Configuration

### Environment Variables

```bash
# MCP Server
MCP_WEBHOOK_URL=http://firecrawl_webhook:52100

# Webhook Service (uses existing RAG config)
WEBHOOK_TEI_URL=http://tei:80
WEBHOOK_QDRANT_URL=http://qdrant:6333
WEBHOOK_MAX_CHUNK_TOKENS=256
WEBHOOK_CHUNK_OVERLAP_TOKENS=50
```

### Docker Compose

The youtube-vision MCP server must be available to the webhook service. This is typically handled through the Claude Code MCP configuration.

## Usage Examples

### Direct API Call

```bash
curl -X POST http://localhost:52100/api/index/youtube \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  }'
```

### Via MCP Scrape Tool

```typescript
// Claude Code or any MCP client
const result = await callTool("scrape", {
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
});
// Returns indexed transcript
```

### Searching Transcripts

```bash
curl -X POST http://localhost:52100/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "machine learning tutorial",
    "limit": 10,
    "mode": "hybrid"
  }'
```

## Testing

### Unit Tests

```bash
# Python (webhook)
cd apps/webhook
uv run pytest tests/unit/test_youtube_utils.py -v
uv run pytest tests/unit/test_youtube_client.py -v

# TypeScript (MCP)
pnpm test:mcp -- tools/scrape/helpers.test.ts
```

### Integration Tests

```bash
# Full pipeline test
cd apps/webhook
uv run pytest tests/integration/test_youtube_e2e.py -v
```

### Manual Testing

1. Start all services: `pnpm services:up`
2. Index a YouTube video:
   ```bash
   curl -X POST http://localhost:52100/api/index/youtube \
     -H "Content-Type: application/json" \
     -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
   ```
3. Search for content:
   ```bash
   curl -X POST http://localhost:52100/api/search \
     -H "Content-Type: application/json" \
     -d '{"query": "never gonna give you up", "limit": 5}'
   ```

## Troubleshooting

### Transcript Not Found

**Symptom:** `"No transcript returned from MCP server"`

**Causes:**
- Video has no captions/transcript
- Video is private or restricted
- MCP youtube-vision server not responding

**Solution:**
- Verify video has captions on YouTube
- Check MCP server logs
- Test with known-good video (public, with captions)

### Webhook Routing Failed

**Symptom:** YouTube URLs fall back to normal scraping

**Causes:**
- Webhook service not running
- `MCP_WEBHOOK_URL` incorrect
- Network connectivity issues

**Solution:**
- Check webhook service: `curl http://localhost:52100/health`
- Verify environment variable: `echo $MCP_WEBHOOK_URL`
- Check Docker network connectivity

### Indexing Failed

**Symptom:** Transcript fetched but not searchable

**Causes:**
- Qdrant collection not initialized
- TEI service unavailable
- Database connection issues

**Solution:**
- Check Qdrant: `curl http://localhost:52102/collections/firecrawl_docs`
- Check TEI: `curl http://localhost:52104/health`
- Review webhook logs: `docker logs firecrawl_webhook`

## Performance Considerations

### Transcript Size

YouTube transcripts can be large (1-10 KB for short videos, 100+ KB for long videos). The chunking system handles this efficiently:

- **Small videos (< 1 KB):** 1-5 chunks
- **Medium videos (1-10 KB):** 5-50 chunks
- **Long videos (> 10 KB):** 50-200+ chunks

### Indexing Time

Typical indexing times:
- Transcript fetch: 2-5 seconds
- Chunking: < 100ms
- Embedding: 100-500ms (depends on chunk count)
- Qdrant indexing: 100-300ms
- **Total:** 3-10 seconds per video

### Caching

YouTube transcripts are indexed once and cached in Qdrant. Subsequent searches are instant (no re-fetching).

## Future Enhancements

- [ ] Support for auto-generated captions
- [ ] Multi-language transcript support
- [ ] Timestamp-based chunking (link chunks to video timestamps)
- [ ] Thumbnail extraction and storage
- [ ] Video metadata extraction (title, description, tags)
- [ ] Playlist support (batch indexing)

## References

- [MCP youtube-vision Documentation](https://github.com/kimtaeyoon83/mcp-youtube-transcript)
- [Webhook RAG Pipeline](../apps/webhook/README.md)
- [MCP Tool Development](../apps/mcp/README.md)
```

**Step 4: Commit**

```bash
git add apps/webhook/README.md apps/mcp/tools/scrape/index.ts docs/YOUTUBE_INTEGRATION.md
git commit -m "docs: add comprehensive YouTube integration documentation

- Update webhook README with YouTube section
- Update MCP scrape tool description
- Create detailed YouTube integration guide
- Add architecture diagrams and usage examples
- Document troubleshooting and performance"
```

---

## Task 11: Update Environment Configuration

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yaml`

**Step 1: Add MCP_WEBHOOK_URL to .env.example**

```bash
# .env.example
# Add to MCP Server section

# -----------------
# MCP Server
# -----------------
# ... existing MCP variables ...

# Webhook Service URL (for YouTube transcript routing)
MCP_WEBHOOK_URL=http://firecrawl_webhook:52100
```

**Step 2: Verify docker-compose.yaml includes youtube-vision**

Ensure the MCP service has access to the youtube-vision MCP server. This is typically configured through Claude Code's MCP settings, not docker-compose.

**Step 3: Commit**

```bash
git add .env.example
git commit -m "config: add MCP_WEBHOOK_URL for YouTube routing

- Add environment variable for webhook service URL
- Used by MCP tools to route YouTube URLs
- Defaults to Docker network internal URL"
```

---

## Task 12: Final Integration Testing

**Files:**
- Create: `tests/e2e/test_youtube_full_stack.sh`

**Step 1: Create E2E test script**

```bash
#!/bin/bash
# tests/e2e/test_youtube_full_stack.sh

set -e

echo "=== YouTube Integration E2E Test ==="
echo ""

WEBHOOK_URL="${WEBHOOK_URL:-http://localhost:52100}"
TEST_VIDEO="https://www.youtube.com/watch?v=dQw4w9WgXcQ"

echo "1. Testing webhook health..."
curl -f "${WEBHOOK_URL}/health" || {
  echo "ERROR: Webhook service not responding"
  exit 1
}
echo "✓ Webhook healthy"
echo ""

echo "2. Indexing YouTube video..."
RESPONSE=$(curl -s -X POST "${WEBHOOK_URL}/api/index/youtube" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${TEST_VIDEO}\"}")

SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
if [ "$SUCCESS" != "true" ]; then
  echo "ERROR: Indexing failed"
  echo "$RESPONSE" | jq .
  exit 1
fi

CHUNKS=$(echo "$RESPONSE" | jq -r '.chunks_indexed')
echo "✓ Indexed $CHUNKS chunks"
echo ""

echo "3. Searching for transcript content..."
SEARCH_RESPONSE=$(curl -s -X POST "${WEBHOOK_URL}/api/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "limit": 5}')

TOTAL=$(echo "$SEARCH_RESPONSE" | jq -r '.total')
echo "✓ Found $TOTAL results"
echo ""

echo "4. Verifying YouTube URL in results..."
URLS=$(echo "$SEARCH_RESPONSE" | jq -r '.results[].url')
if echo "$URLS" | grep -q "youtube.com"; then
  echo "✓ YouTube content found in search results"
else
  echo "ERROR: YouTube content not found in search"
  exit 1
fi
echo ""

echo "=== All tests passed! ==="
```

**Step 2: Make script executable and run**

```bash
chmod +x tests/e2e/test_youtube_full_stack.sh
./tests/e2e/test_youtube_full_stack.sh
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add tests/e2e/test_youtube_full_stack.sh
git commit -m "test: add full-stack E2E test for YouTube integration

- Test webhook health check
- Test YouTube video indexing
- Test search returns transcript content
- Verify YouTube URLs in search results
- Bash script for CI/CD integration"
```

---

## Final Review Checklist

Before marking this plan complete, verify:

- [ ] All unit tests pass: `cd apps/webhook && uv run pytest tests/unit/test_youtube*.py`
- [ ] All integration tests pass: `cd apps/webhook && uv run pytest tests/integration/test_youtube*.py`
- [ ] All MCP tests pass: `pnpm test:mcp`
- [ ] E2E test passes: `./tests/e2e/test_youtube_full_stack.sh`
- [ ] Documentation updated (README, tool descriptions, integration guide)
- [ ] Environment variables documented in `.env.example`
- [ ] YouTube URLs detected in all tools (scrape, crawl, search, map)
- [ ] Transcripts indexed and searchable
- [ ] Error handling graceful (falls back to normal scraping if webhook fails)

---

## Execution Notes

**Estimated Time:** 4-6 hours for complete implementation

**Dependencies:**
- `mcp__youtube-vision` MCP server must be installed
- Webhook service must be running
- Qdrant and TEI services must be available

**Risk Areas:**
- MCP client initialization in webhook service (may need dependency injection refactor)
- Network connectivity between MCP and webhook services
- YouTube transcript availability (not all videos have transcripts)

**Testing Strategy:**
- Unit tests with mocked MCP client (fast, reliable)
- Integration tests with real services (comprehensive)
- E2E tests with actual YouTube URLs (realistic)
