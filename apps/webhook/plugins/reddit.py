"""
Reddit plugin for fetching posts and subreddit content.

This plugin extracts content from Reddit posts and subreddits,
transforming them into documents suitable for RAG indexing.
"""

import re
from typing import TYPE_CHECKING, Any

from plugins.base import BasePlugin

if TYPE_CHECKING:
    from api.schemas.indexing import IndexDocumentRequest

try:
    from utils.logging import get_logger

    logger = get_logger(__name__)
except ImportError:
    import logging

    logger = logging.getLogger(__name__)


class RedditPlugin(BasePlugin):
    """
    Plugin for fetching Reddit posts and subreddit content.

    Supports:
    - reddit.com/r/SUBREDDIT/comments/POST_ID/*
    - reddit.com/r/SUBREDDIT (fetch top posts)
    """

    # Regex patterns for Reddit URLs
    POST_PATTERN = r"reddit\.com/r/([^/]+)/comments/([^/]+)(?:/([^/?]+))?"
    SUBREDDIT_PATTERN = r"reddit\.com/r/([^/?]+)/?$"

    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        """
        Initialize Reddit plugin.

        Args:
            client_id: Reddit API client ID (optional, falls back to env)
            client_secret: Reddit API client secret (optional, falls back to env)
            user_agent: User agent for Reddit API (optional)
        """
        self.client_id = client_id
        self.client_secret = client_secret
        self.user_agent = user_agent or "webhook-bridge/1.0"

    def can_handle(self, url: str) -> bool:
        """
        Check if URL is a Reddit post or subreddit.

        Args:
            url: URL to check

        Returns:
            True if URL matches Reddit patterns
        """
        return (
            re.search(self.POST_PATTERN, url) is not None
            or re.search(self.SUBREDDIT_PATTERN, url) is not None
        )

    def _is_post_url(self, url: str) -> bool:
        """Check if URL is a Reddit post."""
        return re.search(self.POST_PATTERN, url) is not None

    def _is_subreddit_url(self, url: str) -> bool:
        """Check if URL is a subreddit."""
        return re.search(self.SUBREDDIT_PATTERN, url) is not None

    async def fetch_content(
        self,
        url: str,
        **kwargs: Any,
    ) -> "IndexDocumentRequest":
        """
        Fetch Reddit content.

        Args:
            url: Reddit URL (post or subreddit)
            **kwargs: Additional options
                - limit: Number of posts to fetch for subreddits (default: 10)
                - time_filter: Time filter for subreddit posts (default: 'day')
                - include_comments: Include top comments in post (default: True)
                - comment_limit: Max comments to include (default: 20)

        Returns:
            IndexDocumentRequest with Reddit content as markdown

        Raises:
            ValueError: If URL format is invalid
            Exception: If content fetching fails
        """
        if self._is_post_url(url):
            return await self._fetch_post(url, **kwargs)
        elif self._is_subreddit_url(url):
            return await self._fetch_subreddit(url, **kwargs)
        else:
            raise ValueError(f"Invalid Reddit URL format: {url}")

    async def _fetch_post(
        self,
        url: str,
        **kwargs: Any,
    ) -> "IndexDocumentRequest":
        """Fetch a single Reddit post with comments."""
        try:
            import praw
        except ImportError:
            raise ImportError(
                "praw (Python Reddit API Wrapper) is required for Reddit plugin. "
                "Install with: pip install praw"
            )

        match = re.search(self.POST_PATTERN, url)
        if not match:
            raise ValueError(f"Could not parse Reddit post URL: {url}")

        subreddit_name = match.group(1)
        post_id = match.group(2)

        logger.info(
            "Fetching Reddit post",
            url=url,
            subreddit=subreddit_name,
            post_id=post_id,
        )

        # Initialize Reddit API client
        reddit = praw.Reddit(
            client_id=self.client_id or "REDDIT_CLIENT_ID",
            client_secret=self.client_secret or "REDDIT_CLIENT_SECRET",
            user_agent=self.user_agent,
        )

        try:
            # Fetch the submission
            submission = reddit.submission(id=post_id)

            # Build markdown content
            markdown_lines = [f"# {submission.title}\n"]
            markdown_lines.append(f"**Subreddit:** r/{submission.subreddit.display_name}\n")
            markdown_lines.append(
                f"**Author:** u/{submission.author.name if submission.author else '[deleted]'}\n"
            )
            markdown_lines.append(f"**Score:** {submission.score}\n")
            markdown_lines.append(f"**URL:** {url}\n")
            markdown_lines.append("\n## Post Content\n")

            if submission.selftext:
                markdown_lines.append(f"{submission.selftext}\n")
            elif submission.is_self:
                markdown_lines.append("*[No text content]*\n")
            else:
                markdown_lines.append(f"*Link post: {submission.url}*\n")

            # Include comments if requested
            include_comments = kwargs.get("include_comments", True)
            comment_limit = kwargs.get("comment_limit", 20)

            if include_comments:
                markdown_lines.append("\n## Top Comments\n")

                # Replace MoreComments objects with actual comments
                submission.comments.replace_more(limit=0)

                # Get top-level comments sorted by score
                top_comments = sorted(
                    submission.comments,
                    key=lambda c: c.score,
                    reverse=True,
                )[:comment_limit]

                for i, comment in enumerate(top_comments, 1):
                    author = comment.author.name if comment.author else "[deleted]"
                    markdown_lines.append(f"\n### Comment {i} (Score: {comment.score})\n")
                    markdown_lines.append(f"**Author:** u/{author}\n")
                    markdown_lines.append(f"\n{comment.body}\n")

            full_content = "\n".join(markdown_lines)

            logger.info(
                "Reddit post fetched successfully",
                url=url,
                post_id=post_id,
                title=submission.title[:50],
                comments_included=include_comments,
            )

            return IndexDocumentRequest(
                url=url,
                resolvedUrl=url,
                title=submission.title,
                description=f"Reddit post from r/{subreddit_name}",
                markdown=full_content,
                html="",
                statusCode=200,
                gcsPath=None,
                screenshotUrl=None,
                language="en",  # Reddit is primarily English
                country=None,
                isMobile=False,
            )

        except Exception as e:
            logger.error(
                "Error fetching Reddit post",
                url=url,
                post_id=post_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            raise

    async def _fetch_subreddit(
        self,
        url: str,
        **kwargs: Any,
    ) -> "IndexDocumentRequest":
        """Fetch top posts from a subreddit."""
        try:
            import praw
        except ImportError:
            raise ImportError(
                "praw (Python Reddit API Wrapper) is required for Reddit plugin. "
                "Install with: pip install praw"
            )

        match = re.search(self.SUBREDDIT_PATTERN, url)
        if not match:
            raise ValueError(f"Could not parse Reddit subreddit URL: {url}")

        subreddit_name = match.group(1)
        limit = kwargs.get("limit", 10)
        time_filter = kwargs.get("time_filter", "day")

        logger.info(
            "Fetching Reddit subreddit",
            url=url,
            subreddit=subreddit_name,
            limit=limit,
            time_filter=time_filter,
        )

        # Initialize Reddit API client
        reddit = praw.Reddit(
            client_id=self.client_id or "REDDIT_CLIENT_ID",
            client_secret=self.client_secret or "REDDIT_CLIENT_SECRET",
            user_agent=self.user_agent,
        )

        try:
            subreddit = reddit.subreddit(subreddit_name)

            # Fetch top posts
            posts = list(subreddit.top(time_filter=time_filter, limit=limit))

            # Build markdown content
            markdown_lines = [f"# r/{subreddit_name}\n"]
            markdown_lines.append(f"**Subscribers:** {subreddit.subscribers:,}\n")
            markdown_lines.append(f"**Description:** {subreddit.public_description}\n")
            markdown_lines.append(f"\n## Top {limit} Posts ({time_filter})\n")

            for i, post in enumerate(posts, 1):
                author = post.author.name if post.author else "[deleted]"
                markdown_lines.append(f"\n### {i}. {post.title}\n")
                markdown_lines.append(
                    f"**Author:** u/{author} | **Score:** {post.score} | **Comments:** {post.num_comments}\n"
                )
                markdown_lines.append(f"**URL:** https://reddit.com{post.permalink}\n")

                if post.selftext:
                    # Truncate long posts
                    text = post.selftext[:500]
                    if len(post.selftext) > 500:
                        text += "..."
                    markdown_lines.append(f"\n{text}\n")

            full_content = "\n".join(markdown_lines)

            logger.info(
                "Reddit subreddit fetched successfully",
                url=url,
                subreddit=subreddit_name,
                posts_fetched=len(posts),
            )

            return IndexDocumentRequest(
                url=url,
                resolvedUrl=url,
                title=f"r/{subreddit_name}",
                description=subreddit.public_description or f"Reddit subreddit r/{subreddit_name}",
                markdown=full_content,
                html="",
                statusCode=200,
                gcsPath=None,
                screenshotUrl=None,
                language="en",
                country=None,
                isMobile=False,
            )

        except Exception as e:
            logger.error(
                "Error fetching Reddit subreddit",
                url=url,
                subreddit=subreddit_name,
                error=str(e),
                error_type=type(e).__name__,
            )
            raise

    def get_priority(self) -> int:
        """
        Return high priority for Reddit URLs.

        Returns:
            Priority of 90 (high priority for specific source)
        """
        return 90

    def get_name(self) -> str:
        """
        Return plugin name.

        Returns:
            Plugin name
        """
        return "Reddit Content Plugin"

    def get_supported_patterns(self) -> list[str]:
        """
        Get supported URL patterns.

        Returns:
            List of supported Reddit URL patterns
        """
        return [
            "reddit.com/r/*/comments/*/*",
            "reddit.com/r/*",
        ]

    async def health_check(self) -> bool:
        """
        Check if praw library is available.

        Returns:
            True if library is importable, False otherwise
        """
        import importlib.util

        if importlib.util.find_spec("praw") is not None:
            return True

        logger.warning(
            "praw not available",
            plugin=self.get_name(),
        )
        return False
