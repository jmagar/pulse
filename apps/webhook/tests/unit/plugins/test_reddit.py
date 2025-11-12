"""
Unit tests for Reddit plugin.
"""

from unittest.mock import MagicMock, patch

import pytest

from plugins.reddit import RedditPlugin


class TestRedditPlugin:
    """Test cases for RedditPlugin."""

    def test_plugin_name(self):
        """Test plugin name."""
        plugin = RedditPlugin()
        assert plugin.get_name() == "Reddit Content Plugin"

    def test_plugin_priority(self):
        """Test plugin priority."""
        plugin = RedditPlugin()
        assert plugin.get_priority() == 90

    def test_supported_patterns(self):
        """Test supported URL patterns."""
        plugin = RedditPlugin()
        patterns = plugin.get_supported_patterns()
        assert len(patterns) > 0
        assert "reddit.com/r/*/comments/*/*" in patterns
        assert "reddit.com/r/*" in patterns

    @pytest.mark.parametrize(
        "url,expected",
        [
            ("https://reddit.com/r/python/comments/abc/title", True),
            ("https://www.reddit.com/r/python/comments/abc/title", True),
            ("https://reddit.com/r/python", True),
            ("https://www.reddit.com/r/python", True),
            ("https://youtube.com/watch?v=abc", False),
            ("https://example.com", False),
            ("not-a-url", False),
        ],
    )
    def test_can_handle(self, url, expected):
        """Test URL pattern matching."""
        plugin = RedditPlugin()
        assert plugin.can_handle(url) == expected

    def test_is_post_url(self):
        """Test post URL detection."""
        plugin = RedditPlugin()
        assert plugin._is_post_url("https://reddit.com/r/python/comments/abc/title")
        assert not plugin._is_post_url("https://reddit.com/r/python")

    def test_is_subreddit_url(self):
        """Test subreddit URL detection."""
        plugin = RedditPlugin()
        assert plugin._is_subreddit_url("https://reddit.com/r/python")
        assert plugin._is_subreddit_url("https://reddit.com/r/python/")
        assert not plugin._is_subreddit_url("https://reddit.com/r/python/comments/abc/title")

    @pytest.mark.asyncio
    async def test_fetch_content_invalid_url(self):
        """Test fetching content with invalid URL."""
        plugin = RedditPlugin()

        with pytest.raises(ValueError, match="Invalid Reddit URL format"):
            await plugin.fetch_content("https://example.com")

    @pytest.mark.asyncio
    async def test_fetch_post_success(self):
        """Test successful post fetching."""
        plugin = RedditPlugin(client_id="test", client_secret="test")

        # Mock submission
        mock_submission = MagicMock()
        mock_submission.title = "Test Post"
        mock_submission.subreddit.display_name = "python"
        mock_submission.author.name = "testuser"
        mock_submission.score = 100
        mock_submission.selftext = "This is test content"
        mock_submission.is_self = True

        # Mock comments
        mock_comment = MagicMock()
        mock_comment.author.name = "commenter"
        mock_comment.score = 50
        mock_comment.body = "Great post!"
        mock_submission.comments = [mock_comment]
        mock_submission.comments.replace_more = MagicMock()

        with patch("plugins.reddit.praw") as mock_praw:
            mock_reddit = MagicMock()
            mock_reddit.submission.return_value = mock_submission
            mock_praw.Reddit.return_value = mock_reddit

            result = await plugin._fetch_post(
                "https://reddit.com/r/python/comments/abc/test",
                include_comments=True,
                comment_limit=10,
            )

            assert "url" in result
            assert result["title"] == "Test Post"
            assert "Test Post" in result["markdown"]
            assert "This is test content" in result["markdown"]

    @pytest.mark.asyncio
    async def test_fetch_subreddit_success(self):
        """Test successful subreddit fetching."""
        plugin = RedditPlugin(client_id="test", client_secret="test")

        # Mock subreddit
        mock_subreddit = MagicMock()
        mock_subreddit.display_name = "python"
        mock_subreddit.subscribers = 1000000
        mock_subreddit.public_description = "Python programming"

        # Mock posts
        mock_post = MagicMock()
        mock_post.title = "Test Post"
        mock_post.author.name = "testuser"
        mock_post.score = 100
        mock_post.num_comments = 50
        mock_post.permalink = "/r/python/comments/abc/test"
        mock_post.selftext = "Post content"

        mock_subreddit.top.return_value = [mock_post]

        with patch("plugins.reddit.praw") as mock_praw:
            mock_reddit = MagicMock()
            mock_reddit.subreddit.return_value = mock_subreddit
            mock_praw.Reddit.return_value = mock_reddit

            result = await plugin._fetch_subreddit(
                "https://reddit.com/r/python", limit=10, time_filter="day"
            )

            assert "url" in result
            assert result["title"] == "r/python"
            assert "python" in result["markdown"].lower()
            assert "Test Post" in result["markdown"]

    @pytest.mark.asyncio
    async def test_health_check_library_available(self):
        """Test health check when library is available."""
        plugin = RedditPlugin()

        import importlib.util

        if importlib.util.find_spec("praw") is not None:
            result = await plugin.health_check()
            assert result is True
        else:
            result = await plugin.health_check()
            assert result is False

    def test_initialization_with_credentials(self):
        """Test plugin initialization with credentials."""
        plugin = RedditPlugin(
            client_id="test_id", client_secret="test_secret", user_agent="test_agent"
        )

        assert plugin.client_id == "test_id"
        assert plugin.client_secret == "test_secret"
        assert plugin.user_agent == "test_agent"
