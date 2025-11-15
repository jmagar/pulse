"""
Unit tests for RSS plugin.
"""

from unittest.mock import MagicMock, patch

import pytest

from plugins.rss import RSSPlugin


class TestRSSPlugin:
    """Test cases for RSSPlugin."""

    def test_plugin_name(self):
        """Test plugin name."""
        plugin = RSSPlugin()
        assert plugin.get_name() == "RSS/Atom Feed Plugin"

    def test_plugin_priority(self):
        """Test plugin priority."""
        plugin = RSSPlugin()
        assert plugin.get_priority() == 60

    def test_supported_patterns(self):
        """Test supported URL patterns."""
        plugin = RSSPlugin()
        patterns = plugin.get_supported_patterns()
        assert len(patterns) > 0
        assert "*/feed" in patterns
        assert "*/rss" in patterns
        assert "*.xml" in patterns

    @pytest.mark.parametrize(
        "url,expected",
        [
            ("https://example.com/feed", True),
            ("https://example.com/feed.xml", True),
            ("https://example.com/rss", True),
            ("https://example.com/rss.xml", True),
            ("https://example.com/atom.xml", True),
            ("https://example.com/feed/atom", True),
            ("https://example.com", False),
            ("https://youtube.com/watch?v=abc", False),
        ],
    )
    def test_can_handle(self, url, expected):
        """Test URL pattern matching."""
        plugin = RSSPlugin()
        assert plugin.can_handle(url) == expected

    @pytest.mark.asyncio
    async def test_fetch_content_invalid_feed(self):
        """Test fetching content from invalid feed."""
        plugin = RSSPlugin()

        mock_feed = MagicMock()
        mock_feed.bozo = True
        mock_feed.entries = []
        mock_feed.bozo_exception = Exception("Invalid feed")

        with patch("plugins.rss.feedparser") as mock_feedparser:
            mock_feedparser.parse.return_value = mock_feed

            with pytest.raises(ValueError, match="Invalid feed format"):
                await plugin.fetch_content("https://example.com/feed.xml")

    @pytest.mark.asyncio
    async def test_fetch_content_empty_feed(self):
        """Test fetching content from empty feed."""
        plugin = RSSPlugin()

        mock_feed = MagicMock()
        mock_feed.bozo = False
        mock_feed.entries = []
        mock_feed.feed = {"title": "Empty Feed"}

        with patch("plugins.rss.feedparser") as mock_feedparser:
            mock_feedparser.parse.return_value = mock_feed

            with pytest.raises(ValueError, match="Feed contains no entries"):
                await plugin.fetch_content("https://example.com/feed.xml")

    @pytest.mark.asyncio
    async def test_fetch_content_success(self):
        """Test successful feed fetching."""
        plugin = RSSPlugin()

        # Mock feed
        mock_feed = MagicMock()
        mock_feed.bozo = False
        mock_feed.feed = {
            "title": "Test Feed",
            "description": "Test Description",
            "link": "https://example.com",
            "updated": "2024-01-01T00:00:00Z",
        }

        # Mock entries
        mock_entry = MagicMock()
        mock_entry.title = "Test Entry"
        mock_entry.link = "https://example.com/entry1"
        mock_entry.published = "2024-01-01T00:00:00Z"
        mock_entry.author = "Test Author"
        mock_entry.summary = "Test summary"
        mock_entry.content = [{"value": "<p>Test content</p>"}]
        mock_feed.entries = [mock_entry]

        with patch("plugins.rss.feedparser") as mock_feedparser:
            mock_feedparser.parse.return_value = mock_feed

            result = await plugin.fetch_content(
                "https://example.com/feed.xml",
                limit=10,
                include_content=True,
                include_summary=True,
            )

            assert result.url == "https://example.com/feed.xml"
            assert result.title == "Test Feed"
            assert "Test Entry" in result.markdown
            assert "Test summary" in result.markdown

    @pytest.mark.asyncio
    async def test_fetch_content_with_options(self):
        """Test feed fetching with custom options."""
        plugin = RSSPlugin()

        mock_feed = MagicMock()
        mock_feed.bozo = False
        mock_feed.feed = {"title": "Test Feed", "link": "https://example.com"}

        mock_entries = []
        for i in range(20):
            entry = MagicMock()
            entry.title = f"Entry {i}"
            entry.link = f"https://example.com/entry{i}"
            entry.summary = f"Summary {i}"
            mock_entries.append(entry)

        mock_feed.entries = mock_entries

        with patch("plugins.rss.feedparser") as mock_feedparser:
            mock_feedparser.parse.return_value = mock_feed

            result = await plugin.fetch_content(
                "https://example.com/feed.xml",
                limit=5,
                include_content=False,
                include_summary=True,
            )

            # Should only include 5 entries
            for i in range(5):
                assert f"Entry {i}" in result.markdown

            # Should not include entries beyond limit
            assert "Entry 5" not in result.markdown

    @pytest.mark.asyncio
    async def test_health_check_library_available(self):
        """Test health check when library is available."""
        plugin = RSSPlugin()

        import importlib.util

        if importlib.util.find_spec("feedparser") is not None:
            result = await plugin.health_check()
            assert result is True
        else:
            result = await plugin.health_check()
            assert result is False

    @pytest.mark.asyncio
    async def test_fetch_content_html_stripping(self):
        """Test that HTML is stripped from content."""
        plugin = RSSPlugin()

        mock_feed = MagicMock()
        mock_feed.bozo = False
        mock_feed.feed = {"title": "Test Feed", "link": "https://example.com"}

        mock_entry = MagicMock()
        mock_entry.title = "HTML Test"
        mock_entry.link = "https://example.com/entry1"
        mock_entry.content = [{"value": "<p>Text with <strong>HTML</strong> tags</p>"}]
        mock_feed.entries = [mock_entry]

        with patch("plugins.rss.feedparser") as mock_feedparser:
            mock_feedparser.parse.return_value = mock_feed

            result = await plugin.fetch_content(
                "https://example.com/feed.xml", include_content=True
            )

            # HTML tags should be stripped
            assert "Text with HTML tags" in result.markdown
            assert "<p>" not in result.markdown
            assert "<strong>" not in result.markdown
