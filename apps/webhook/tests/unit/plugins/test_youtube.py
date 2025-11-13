"""
Unit tests for YouTube plugin.
"""

from unittest.mock import MagicMock, patch

import pytest

from plugins.youtube import YouTubePlugin


class TestYouTubePlugin:
    """Test cases for YouTubePlugin."""

    def test_plugin_name(self):
        """Test plugin name."""
        plugin = YouTubePlugin()
        assert plugin.get_name() == "YouTube Transcript Plugin"

    def test_plugin_priority(self):
        """Test plugin priority."""
        plugin = YouTubePlugin()
        assert plugin.get_priority() == 90

    def test_supported_patterns(self):
        """Test supported URL patterns."""
        plugin = YouTubePlugin()
        patterns = plugin.get_supported_patterns()
        assert len(patterns) > 0
        assert "youtube.com/watch?v=*" in patterns
        assert "youtu.be/*" in patterns

    @pytest.mark.parametrize(
        "url,expected",
        [
            ("https://youtube.com/watch?v=dQw4w9WgXcQ", True),
            ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", True),
            ("https://youtu.be/dQw4w9WgXcQ", True),
            ("https://youtube.com/embed/dQw4w9WgXcQ", True),
            ("https://youtube.com/v/dQw4w9WgXcQ", True),
            ("https://reddit.com/r/test", False),
            ("https://example.com", False),
            ("not-a-url", False),
        ],
    )
    def test_can_handle(self, url, expected):
        """Test URL pattern matching."""
        plugin = YouTubePlugin()
        assert plugin.can_handle(url) == expected

    @pytest.mark.parametrize(
        "url,expected_id",
        [
            ("https://youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
            ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
            ("https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
            ("https://youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
            ("https://youtube.com/v/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
            ("https://youtube.com/watch?v=dQw4w9WgXcQ&list=PLtest", "dQw4w9WgXcQ"),
            ("https://reddit.com/r/test", None),
        ],
    )
    def test_extract_video_id(self, url, expected_id):
        """Test video ID extraction."""
        plugin = YouTubePlugin()
        video_id = plugin._extract_video_id(url)
        assert video_id == expected_id

    @pytest.mark.asyncio
    async def test_fetch_content_invalid_url(self):
        """Test fetching content with invalid URL."""
        plugin = YouTubePlugin()

        with pytest.raises(ValueError, match="Could not extract video ID"):
            await plugin.fetch_content("https://reddit.com/r/test")

    @pytest.mark.asyncio
    async def test_fetch_content_missing_library(self):
        """Test fetching content when youtube-transcript-api is not installed."""
        plugin = YouTubePlugin()

        with patch("plugins.youtube.YouTubeTranscriptApi", side_effect=ImportError):
            with pytest.raises(ImportError, match="youtube-transcript-api is required"):
                await plugin.fetch_content("https://youtube.com/watch?v=dQw4w9WgXcQ")

    @pytest.mark.asyncio
    async def test_fetch_content_success(self):
        """Test successful content fetching."""
        plugin = YouTubePlugin()

        # Mock transcript data
        mock_transcript_data = [
            {"text": "Hello world", "start": 0.0, "duration": 2.0},
            {"text": "This is a test", "start": 2.0, "duration": 3.0},
        ]

        # Mock transcript object
        mock_transcript = MagicMock()
        mock_transcript.language = "en"
        mock_transcript.is_generated = False
        mock_transcript.fetch.return_value = mock_transcript_data

        # Mock transcript list
        mock_transcript_list = MagicMock()
        mock_transcript_list.find_transcript.return_value = mock_transcript

        with patch("plugins.youtube.YouTubeTranscriptApi") as mock_api:
            mock_api.list_transcripts.return_value = mock_transcript_list

            result = await plugin.fetch_content("https://youtube.com/watch?v=dQw4w9WgXcQ")

            assert result.url == "https://youtube.com/watch?v=dQw4w9WgXcQ"
            assert "dQw4w9WgXcQ" in result.title
            assert result.statusCode == 200
            assert result.language == "en"
            assert "Hello world" in result.markdown
            assert "This is a test" in result.markdown
            assert "YouTube Video Transcript" in result.markdown

    @pytest.mark.asyncio
    async def test_fetch_content_video_unavailable(self):
        """Test fetching content for unavailable video."""
        plugin = YouTubePlugin()

        with patch("plugins.youtube.YouTubeTranscriptApi") as mock_api:
            from youtube_transcript_api._errors import VideoUnavailable

            mock_api.list_transcripts.side_effect = VideoUnavailable("test_id")

            with pytest.raises(ValueError, match="Video is unavailable"):
                await plugin.fetch_content("https://youtube.com/watch?v=test_id")

    @pytest.mark.asyncio
    async def test_fetch_content_transcripts_disabled(self):
        """Test fetching content when transcripts are disabled."""
        plugin = YouTubePlugin()

        with patch("plugins.youtube.YouTubeTranscriptApi") as mock_api:
            from youtube_transcript_api._errors import TranscriptsDisabled

            mock_api.list_transcripts.side_effect = TranscriptsDisabled("test_id")

            with pytest.raises(ValueError, match="Transcripts are disabled"):
                await plugin.fetch_content("https://youtube.com/watch?v=test_id")

    @pytest.mark.asyncio
    async def test_fetch_content_no_transcript_found(self):
        """Test fetching content when no transcript is found."""
        plugin = YouTubePlugin()

        mock_transcript_list = MagicMock()
        mock_transcript_list._manually_created_transcripts = {}
        mock_transcript_list._generated_transcripts = {}

        with patch("plugins.youtube.YouTubeTranscriptApi") as mock_api:
            from youtube_transcript_api._errors import NoTranscriptFound

            mock_api.list_transcripts.return_value = mock_transcript_list
            mock_transcript_list.find_transcript.side_effect = NoTranscriptFound(
                "test_id", ["en"], mock_transcript_list
            )

            with pytest.raises(ValueError, match="No transcript found"):
                await plugin.fetch_content("https://youtube.com/watch?v=test_id")

    @pytest.mark.asyncio
    async def test_fetch_content_custom_languages(self):
        """Test fetching content with custom language preferences."""
        plugin = YouTubePlugin()

        mock_transcript_data = [{"text": "Bonjour", "start": 0.0, "duration": 1.0}]
        mock_transcript = MagicMock()
        mock_transcript.language = "fr"
        mock_transcript.is_generated = False
        mock_transcript.fetch.return_value = mock_transcript_data

        mock_transcript_list = MagicMock()
        mock_transcript_list.find_transcript.return_value = mock_transcript

        with patch("plugins.youtube.YouTubeTranscriptApi") as mock_api:
            mock_api.list_transcripts.return_value = mock_transcript_list

            result = await plugin.fetch_content(
                "https://youtube.com/watch?v=test", languages=["fr", "en"]
            )

            assert result.language == "fr"
            assert "Bonjour" in result.markdown

    @pytest.mark.asyncio
    async def test_health_check_library_available(self):
        """Test health check when library is available."""
        plugin = YouTubePlugin()

        with patch("plugins.youtube.YouTubeTranscriptApi"):
            result = await plugin.health_check()
            assert result is True

    @pytest.mark.asyncio
    async def test_health_check_library_unavailable(self):
        """Test health check when library is not available."""
        plugin = YouTubePlugin()

        with patch.dict("sys.modules", {"youtube_transcript_api": None}):
            result = await plugin.health_check()
            assert result is False
