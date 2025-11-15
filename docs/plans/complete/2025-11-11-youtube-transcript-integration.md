# YouTube Transcript Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically fetch and index YouTube video transcripts through the RAG pipeline for all tools (scrape, crawl, search, map).

**Architecture:** YouTube URLs detected in MCP tools are intelligently routed to the webhook service for transcript extraction. The webhook service uses the `youtube-transcript-api` Python library to fetch transcripts directly, then processes them through the existing RAG pipeline (chunking, embeddings, Qdrant, BM25). This ensures YouTube content is searchable like any other scraped content.

**Tech Stack:**
- **Detection:** TypeScript (MCP server tools)
- **Transcript Fetching:** `youtube-transcript-api` Python library (v1.2.3+)
- **Routing:** HTTP redirect from MCP to webhook
- **Processing:** Python webhook service (existing RAG pipeline)
- **Storage:** Qdrant + BM25 (existing infrastructure)

---

## Overview

This plan implements automatic YouTube transcript processing across the entire scraping stack:

1. **MCP Detection & Routing:** Detect YouTube URLs in MCP scrape/crawl/search/map tools and route to webhook
2. **Webhook YouTube Handler:** New endpoint to receive YouTube URLs and fetch transcripts using `youtube-transcript-api`
3. **RAG Pipeline Integration:** Process transcripts through existing indexing pipeline
4. **Cross-Tool Integration:** Ensure search and map tools also detect and process YouTube URLs
5. **Testing:** Comprehensive E2E tests for all entry points
6. **Documentation:** Update tool descriptions and add examples

**Key Design Decisions:**
- Use `youtube-transcript-api` Python library (actively maintained, no MCP dependency)
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

## Task 2: Add youtube-transcript-api Dependency

**Files:**
- Modify: `apps/webhook/pyproject.toml`

**Step 1: Add dependency to pyproject.toml**

```toml
# apps/webhook/pyproject.toml
# Add to [project.dependencies]

dependencies = [
    # ... existing dependencies ...
    "youtube-transcript-api>=1.2.3",
]
```

**Step 2: Install dependency**

```bash
cd apps/webhook && uv sync
```

Expected: youtube-transcript-api installed successfully

**Step 3: Verify installation**

```bash
cd apps/webhook && uv run python -c "from youtube_transcript_api import YouTubeTranscriptApi; print('OK')"
```

Expected: "OK" printed

**Step 4: Commit**

```bash
git add apps/webhook/pyproject.toml apps/webhook/uv.lock
git commit -m "deps(webhook): add youtube-transcript-api library

- Add youtube-transcript-api>=1.2.3 dependency
- Used for fetching YouTube video transcripts
- No API key required, uses public YouTube API"
```

---

## Task 3: Create YouTube Transcript Client

**Files:**
- Create: `apps/webhook/clients/youtube.py`
- Test: `apps/webhook/tests/unit/test_youtube_client.py`

**Step 1: Write failing test for transcript fetching**

```python
# apps/webhook/tests/unit/test_youtube_client.py
import pytest
from unittest.mock import MagicMock, patch

from clients.youtube import YouTubeTranscriptClient


def test_fetch_transcript_success():
    """Test successful transcript fetching."""
    with patch("clients.youtube.YouTubeTranscriptApi.get_transcript") as mock_get:
        mock_get.return_value = [
            {"text": "This is a test transcript.", "start": 0.0, "duration": 2.5},
            {"text": "This is the second part.", "start": 2.5, "duration": 3.0},
        ]

        client = YouTubeTranscriptClient()
        result = client.fetch_transcript("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

        assert result["success"] is True
        assert "transcript" in result
        assert "This is a test transcript" in result["transcript"]
        assert "This is the second part" in result["transcript"]
        assert result["video_id"] == "dQw4w9WgXcQ"
        mock_get.assert_called_once_with("dQw4w9WgXcQ")


def test_fetch_transcript_invalid_url():
    """Test transcript fetching with invalid URL."""
    client = YouTubeTranscriptClient()
    result = client.fetch_transcript("https://example.com")

    assert result["success"] is False
    assert "error" in result
    assert "not a YouTube URL" in result["error"]


def test_fetch_transcript_api_error():
    """Test transcript fetching when YouTube API fails."""
    with patch("clients.youtube.YouTubeTranscriptApi.get_transcript") as mock_get:
        mock_get.side_effect = Exception("Transcript not available")

        client = YouTubeTranscriptClient()
        result = client.fetch_transcript("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

        assert result["success"] is False
        assert "error" in result
        assert "Transcript not available" in result["error"]


def test_fetch_transcript_with_metadata():
    """Test transcript fetching returns video metadata."""
    with patch("clients.youtube.YouTubeTranscriptApi.get_transcript") as mock_get:
        mock_get.return_value = [
            {"text": "Transcript text here", "start": 0.0, "duration": 5.0},
        ]

        client = YouTubeTranscriptClient()
        result = client.fetch_transcript("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

        assert result["success"] is True
        assert result["url"] == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        assert result["video_id"] == "dQw4w9WgXcQ"


def test_fetch_transcript_combines_segments():
    """Test transcript segments are combined into single text."""
    with patch("clients.youtube.YouTubeTranscriptApi.get_transcript") as mock_get:
        mock_get.return_value = [
            {"text": "First segment.", "start": 0.0, "duration": 2.0},
            {"text": "Second segment.", "start": 2.0, "duration": 2.0},
            {"text": "Third segment.", "start": 4.0, "duration": 2.0},
        ]

        client = YouTubeTranscriptClient()
        result = client.fetch_transcript("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

        assert result["success"] is True
        # Segments should be space-separated
        assert result["transcript"] == "First segment. Second segment. Third segment."
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
YouTube transcript client using youtube-transcript-api library.

This client uses the youtube-transcript-api Python library to fetch
video transcripts directly from YouTube.
"""

from typing import Any

from youtube_transcript_api import YouTubeTranscriptApi

from utils.logging import get_logger
from utils.youtube import extract_video_id, is_youtube_url

logger = get_logger(__name__)


class YouTubeTranscriptClient:
    """Client for fetching YouTube video transcripts."""

    def fetch_transcript(self, url: str) -> dict[str, Any]:
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
            >>> client = YouTubeTranscriptClient()
            >>> result = client.fetch_transcript("https://www.youtube.com/watch?v=VIDEO_ID")
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

        # Fetch transcript from YouTube
        try:
            logger.debug("Calling YouTube Transcript API", video_id=video_id)

            # Get transcript segments
            transcript_list = YouTubeTranscriptApi.get_transcript(video_id)

            # Combine segments into single text
            # Each segment has: {"text": str, "start": float, "duration": float}
            transcript_text = " ".join(segment["text"] for segment in transcript_list)

            if not transcript_text:
                error = "No transcript text returned from YouTube"
                logger.warning(error, url=url, video_id=video_id)
                return {
                    "success": False,
                    "error": error,
                }

            logger.info(
                "Transcript fetched successfully",
                url=url,
                video_id=video_id,
                transcript_length=len(transcript_text),
                segments=len(transcript_list),
            )

            return {
                "success": True,
                "transcript": transcript_text,
                "video_id": video_id,
                "url": url,
            }

        except Exception as e:
            error = f"YouTube API error: {str(e)}"
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
git commit -m "feat(webhook): add YouTube transcript client

- Create YouTubeTranscriptClient for fetching transcripts
- Use youtube-transcript-api library (no MCP dependency)
- Validate YouTube URLs before fetching
- Combine transcript segments into single text
- Return structured response with transcript and metadata
- Add comprehensive unit tests with mocked API"
```

---

## Task 4: Create YouTube Transcript Indexing Endpoint

**Files:**
- Modify: `apps/webhook/api/routers/indexing.py`
- Modify: `apps/webhook/api/schemas/indexing.py`
- Test: `apps/webhook/tests/integration/test_youtube_indexing.py`

**Step 1: Write failing test for YouTube indexing endpoint**

```python
# apps/webhook/tests/integration/test_youtube_indexing.py
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch

from main import app


@pytest.fixture
def mock_youtube_client():
    """Mock YouTube transcript client."""
    with patch("api.routers.indexing.YouTubeTranscriptClient") as mock:
        client_instance = MagicMock()
        client_instance.fetch_transcript = MagicMock(
            return_value={
                "success": True,
                "transcript": "This is a test transcript from a YouTube video.",
                "video_id": "dQw4w9WgXcQ",
                "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            }
        )
        mock.return_value = client_instance
        yield mock


def test_index_youtube_url_success(mock_youtube_client):
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


def test_index_youtube_transcript_failure(mock_youtube_client):
    """Test handling of transcript fetch failure."""
    # Mock failed transcript fetch
    client_instance = mock_youtube_client.return_value
    client_instance.fetch_transcript = MagicMock(
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

from pydantic import BaseModel, Field


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
# Add imports at top
from fastapi import HTTPException

from api.schemas.indexing import IndexYouTubeRequest, IndexYouTubeResponse
from clients.youtube import YouTubeTranscriptClient
from utils.youtube import is_youtube_url

# Add this endpoint after the existing /api/index endpoint

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

    Fetches transcript using youtube-transcript-api library, then indexes
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

    try:
        # Create YouTube client
        youtube_client = YouTubeTranscriptClient()

        # Fetch transcript
        transcript_result = youtube_client.fetch_transcript(request.url)

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

## Task 5: Add YouTube URL Detection to MCP Scrape Tool

**Files:**
- Modify: `apps/mcp/tools/scrape/helpers.ts`
- Test: `apps/mcp/tools/scrape/helpers.test.ts`

**Step 1: Write failing test for YouTube URL detection**

```typescript
// apps/mcp/tools/scrape/helpers.test.ts (create new file if doesn't exist)
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

## Task 6: Implement YouTube Routing in MCP Scrape Handler

**Files:**
- Modify: `apps/mcp/tools/scrape/handler.ts`
- Modify: `apps/mcp/config/environment.ts` (add WEBHOOK_URL)

**Step 1: Add WEBHOOK_URL to environment config**

```typescript
// apps/mcp/config/environment.ts
// Find the env object and add this field

export const env = {
  // ... existing fields ...

  // Webhook service URL for YouTube transcript processing
  webhookUrl: process.env.MCP_WEBHOOK_URL || process.env.WEBHOOK_URL || "http://pulse_webhook:52100",
};
```

**Step 2: Add YouTube routing logic to scrape handler**

```typescript
// apps/mcp/tools/scrape/handler.ts
// Add import at top
import { isYouTubeUrl } from "./helpers.js";
import { env } from "../../config/environment.js";

// Add this near the top of handleScrapeRequest, before cache check

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

**Step 3: Commit**

```bash
git add apps/mcp/tools/scrape/handler.ts apps/mcp/config/environment.ts
git commit -m "feat(mcp): route YouTube URLs to webhook service

- Detect YouTube URLs in scrape handler
- POST to webhook /api/index/youtube endpoint
- Return indexed transcript to user
- Fall back to normal scraping if webhook fails
- Add environment variable for webhook URL"
```

---

## Task 7-10: Add YouTube Detection to Crawl/Search/Map Tools

**Note:** These tasks follow the same pattern as Task 6 (scrape tool). For brevity, I'll provide a consolidated implementation guide rather than full TDD steps for each.

**Implementation Pattern:**

1. Import YouTube detection helpers
2. Filter URLs for YouTube videos
3. Call webhook `/api/index/youtube` endpoint for each YouTube URL
4. Process in parallel using `Promise.allSettled`

**Files to Modify:**
- `apps/mcp/tools/crawl/pipeline.ts`
- `apps/mcp/tools/search/pipeline.ts`
- `apps/mcp/tools/map/pipeline.ts`

**Commit:**

```bash
git add apps/mcp/tools/crawl/pipeline.ts apps/mcp/tools/search/pipeline.ts apps/mcp/tools/map/pipeline.ts
git commit -m "feat(mcp): detect and index YouTube URLs in crawl/search/map

- Add YouTube detection to crawl/search/map pipelines
- Index transcripts via webhook service in parallel
- Log success/failure for each YouTube URL found"
```

---

## Task 11: End-to-End Integration Test

**Files:**
- Create: `apps/webhook/tests/integration/test_youtube_e2e.py`

**Implementation:**

```python
# apps/webhook/tests/integration/test_youtube_e2e.py
import pytest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def mock_youtube_api():
    """Mock YouTube Transcript API."""
    with patch("clients.youtube.YouTubeTranscriptApi.get_transcript") as mock:
        mock.return_value = [
            {"text": "This is a comprehensive test transcript", "start": 0.0, "duration": 3.0},
            {"text": "for a YouTube video.", "start": 3.0, "duration": 2.0},
            {"text": "It contains multiple sentences", "start": 5.0, "duration": 3.0},
            {"text": "and paragraphs to test chunking.", "start": 8.0, "duration": 3.0},
        ]
        yield mock


@pytest.mark.integration
def test_youtube_full_pipeline(mock_youtube_api):
    """
    Test complete YouTube transcript pipeline.

    Flow:
    1. POST YouTube URL to /api/index/youtube
    2. Fetch transcript via youtube-transcript-api
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

**Commit:**

```bash
git add apps/webhook/tests/integration/test_youtube_e2e.py
git commit -m "test(webhook): add end-to-end YouTube integration test

- Test complete YouTube transcript pipeline
- Verify indexing, chunking, and embedding
- Verify search returns YouTube content
- Use mocked youtube-transcript-api for isolation"
```

---

## Task 12: Update Documentation and Environment

**Files:**
- Modify: `apps/webhook/README.md`
- Modify: `.env.example`
- Create: `docs/YOUTUBE_INTEGRATION.md`

**Key Documentation Points:**

1. **Webhook README:** Add YouTube section with API examples
2. **.env.example:** Add `MCP_WEBHOOK_URL` variable
3. **Integration Guide:** Complete architecture, usage, troubleshooting

**Commit:**

```bash
git add apps/webhook/README.md .env.example docs/YOUTUBE_INTEGRATION.md
git commit -m "docs: add comprehensive YouTube integration documentation

- Update webhook README with YouTube section
- Add MCP_WEBHOOK_URL to environment config
- Create detailed YouTube integration guide
- Document architecture, usage, and troubleshooting"
```

---

## Final Review Checklist

Before marking this plan complete, verify:

- [ ] All unit tests pass: `cd apps/webhook && uv run pytest tests/unit/test_youtube*.py`
- [ ] All integration tests pass: `cd apps/webhook && uv run pytest tests/integration/test_youtube*.py`
- [ ] All MCP tests pass: `pnpm test:mcp`
- [ ] Documentation updated (README, integration guide)
- [ ] Environment variables documented in `.env.example`
- [ ] YouTube URLs detected in all tools (scrape, crawl, search, map)
- [ ] Transcripts indexed and searchable
- [ ] Error handling graceful (falls back to normal scraping if webhook fails)

---

## Execution Notes

**Estimated Time:** 3-4 hours for complete implementation

**Dependencies:**
- `youtube-transcript-api` Python library (>=1.2.3)
- Webhook service must be running
- Qdrant and TEI services must be available

**Risk Areas:**
- YouTube API rate limiting (public API, no key required)
- Transcript availability (not all videos have transcripts)
- Network connectivity between MCP and webhook services

**Testing Strategy:**
- Unit tests with mocked `youtube-transcript-api` (fast, reliable)
- Integration tests with real services (comprehensive)
- E2E tests verify full pipeline functionality
