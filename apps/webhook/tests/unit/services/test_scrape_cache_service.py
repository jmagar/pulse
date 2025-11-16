"""
Unit tests for ScrapeCacheService.

Tests cache storage, retrieval, expiration, and invalidation logic.
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from domain.models import ScrapeCache
from services.scrape_cache import ScrapeCacheService


@pytest.mark.asyncio
class TestScrapeCacheService:
    """Test scrape cache operations."""

    @pytest.fixture
    async def cache_service(self) -> ScrapeCacheService:
        """Create cache service instance."""
        return ScrapeCacheService()

    async def test_save_minimal_scrape(
        self, cache_service: ScrapeCacheService, db_session: AsyncSession
    ) -> None:
        """Test saving minimal scrape with only required fields."""
        url = "https://example.com/test"
        cache_key = "test_cache_key_123"
        raw_content = "<html><body>Test content</body></html>"

        entry = await cache_service.save_scrape(
            session=db_session,
            url=url,
            raw_content=raw_content,
            source="firecrawl",
            cache_key=cache_key,
            max_age=172800000,  # 2 days
        )

        assert entry.url == url
        assert entry.cache_key == cache_key
        assert entry.raw_content == raw_content
        assert entry.source == "firecrawl"
        assert entry.content_length_raw == len(raw_content)
        assert entry.expires_at is not None
        assert entry.scraped_at is not None

    async def test_save_full_scrape_with_extraction(
        self, cache_service: ScrapeCacheService, db_session: AsyncSession
    ) -> None:
        """Test saving complete scrape with cleaning and extraction."""
        url = "https://example.com/article"
        cache_key = "full_cache_key_456"
        raw_content = "<html><body><article>Full article</article></body></html>"
        cleaned_content = "# Full Article\n\nContent here."
        extracted_content = "Author: John Doe\nDate: 2025-11-15"
        extract_query = "extract the author and date"

        entry = await cache_service.save_scrape(
            session=db_session,
            url=url,
            raw_content=raw_content,
            cleaned_content=cleaned_content,
            extracted_content=extracted_content,
            extract_query=extract_query,
            source="firecrawl",
            cache_key=cache_key,
            max_age=172800000,
            content_type="text/html",
            strategy_used="firecrawl_default",
            scrape_options={"timeout": 60000, "proxy": "auto"},
        )

        assert entry.cleaned_content == cleaned_content
        assert entry.extracted_content == extracted_content
        assert entry.extract_query == extract_query
        assert entry.content_length_cleaned == len(cleaned_content)
        assert entry.content_length_extracted == len(extracted_content)
        assert entry.strategy_used == "firecrawl_default"
        assert entry.scrape_options == {"timeout": 60000, "proxy": "auto"}

    async def test_save_scrape_with_screenshot(
        self, cache_service: ScrapeCacheService, db_session: AsyncSession
    ) -> None:
        """Test saving scrape with screenshot binary data."""
        url = "https://example.com/screenshot"
        cache_key = "screenshot_cache_key"
        raw_content = "<html>Page content</html>"
        screenshot_data = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"  # PNG header

        entry = await cache_service.save_scrape(
            session=db_session,
            url=url,
            raw_content=raw_content,
            source="firecrawl",
            cache_key=cache_key,
            max_age=172800000,
            screenshot=screenshot_data,
            screenshot_format="image/png",
        )

        assert entry.screenshot == screenshot_data
        assert entry.screenshot_format == "image/png"

    async def test_get_cached_scrape_by_cache_key(
        self, cache_service: ScrapeCacheService, db_session: AsyncSession
    ) -> None:
        """Test retrieving cached scrape by cache_key."""
        # Save entry
        cache_key = "retrieval_test_key"
        await cache_service.save_scrape(
            session=db_session,
            url="https://example.com/retrieve",
            raw_content="<html>Cached content</html>",
            source="firecrawl",
            cache_key=cache_key,
            max_age=172800000,
        )
        await db_session.commit()

        # Retrieve entry
        entry = await cache_service.get_cached_scrape(
            session=db_session, cache_key=cache_key, max_age=172800000
        )

        assert entry is not None
        assert entry.cache_key == cache_key
        assert entry.raw_content == "<html>Cached content</html>"
        assert entry.access_count == 1  # Should increment on retrieval
        assert entry.last_accessed_at is not None

    async def test_get_cached_scrape_returns_none_when_not_found(
        self, cache_service: ScrapeCacheService, db_session: AsyncSession
    ) -> None:
        """Test cache miss returns None."""
        entry = await cache_service.get_cached_scrape(
            session=db_session, cache_key="nonexistent_key", max_age=172800000
        )

        assert entry is None

    async def test_get_cached_scrape_returns_none_when_expired(
        self, cache_service: ScrapeCacheService, db_session: AsyncSession
    ) -> None:
        """Test expired entries are not returned."""
        # Create expired entry
        cache_key = "expired_entry"
        past_time = datetime.now(UTC) - timedelta(days=3)

        # Manually insert expired entry
        expired_entry = ScrapeCache(
            url="https://example.com/expired",
            url_hash=cache_service._compute_url_hash("https://example.com/expired"),
            raw_content="<html>Old content</html>",
            source="firecrawl",
            cache_key=cache_key,
            scraped_at=past_time,
            expires_at=past_time + timedelta(days=2),  # Expired 1 day ago
        )
        db_session.add(expired_entry)
        await db_session.commit()

        # Attempt retrieval
        entry = await cache_service.get_cached_scrape(
            session=db_session, cache_key=cache_key, max_age=172800000
        )

        assert entry is None

    async def test_cache_key_computation_is_deterministic(
        self, cache_service: ScrapeCacheService
    ) -> None:
        """Test cache key generation is consistent for same inputs."""
        params1 = {
            "url": "https://example.com/article",
            "extract": "the author",
            "cleanScrape": True,
            "formats": ["markdown", "html"],
        }

        params2 = {
            "url": "https://example.com/article",
            "extract": "the author",
            "cleanScrape": True,
            "formats": ["html", "markdown"],  # Different order
        }

        key1 = cache_service.compute_cache_key(**params1)
        key2 = cache_service.compute_cache_key(**params2)

        # Should be same because formats are sorted
        assert key1 == key2
        assert len(key1) == 64  # SHA-256 produces 64 hex characters

    async def test_cache_key_differs_for_different_extract_query(
        self, cache_service: ScrapeCacheService
    ) -> None:
        """Test different extract queries produce different cache keys."""
        params_base = {"url": "https://example.com/article", "cleanScrape": True}

        key1 = cache_service.compute_cache_key(**params_base, extract="the author")
        key2 = cache_service.compute_cache_key(**params_base, extract="the date")

        assert key1 != key2

    async def test_cache_key_same_url_no_extract(self, cache_service: ScrapeCacheService) -> None:
        """Test URLs without extraction use simpler cache key."""
        key1 = cache_service.compute_cache_key(url="https://example.com/page", cleanScrape=True)
        key2 = cache_service.compute_cache_key(url="https://example.com/page", cleanScrape=True)

        assert key1 == key2

    async def test_invalidate_url_removes_all_entries(
        self, cache_service: ScrapeCacheService, db_session: AsyncSession
    ) -> None:
        """Test invalidating URL removes all related cache entries."""
        url = "https://example.com/multi"

        # Create multiple entries for same URL (different extract queries)
        await cache_service.save_scrape(
            session=db_session,
            url=url,
            raw_content="<html>Content 1</html>",
            source="firecrawl",
            cache_key="key1",
            max_age=172800000,
        )
        await cache_service.save_scrape(
            session=db_session,
            url=url,
            raw_content="<html>Content 2</html>",
            extracted_content="Extracted data",
            extract_query="some query",
            source="firecrawl",
            cache_key="key2",
            max_age=172800000,
        )
        await db_session.commit()

        # Invalidate URL
        deleted_count = await cache_service.invalidate_url(session=db_session, url=url)

        assert deleted_count == 2

        # Verify entries are gone
        entry1 = await cache_service.get_cached_scrape(
            session=db_session, cache_key="key1", max_age=172800000
        )
        entry2 = await cache_service.get_cached_scrape(
            session=db_session, cache_key="key2", max_age=172800000
        )

        assert entry1 is None
        assert entry2 is None

    async def test_url_hash_computation(self, cache_service: ScrapeCacheService) -> None:
        """Test URL hash is SHA-256 of normalized URL."""
        url = "https://example.com/test"
        url_hash = cache_service._compute_url_hash(url)

        assert len(url_hash) == 64  # SHA-256 hex length
        assert url_hash.isalnum()  # Only hex characters

        # Same URL produces same hash
        url_hash2 = cache_service._compute_url_hash(url)
        assert url_hash == url_hash2

    async def test_expiration_calculation(
        self, cache_service: ScrapeCacheService, db_session: AsyncSession
    ) -> None:
        """Test expires_at is computed correctly from max_age."""
        before_time = datetime.now(UTC)

        entry = await cache_service.save_scrape(
            session=db_session,
            url="https://example.com/expiry",
            raw_content="<html>Test</html>",
            source="firecrawl",
            cache_key="expiry_test",
            max_age=86400000,  # 1 day in milliseconds
        )

        after_time = datetime.now(UTC) + timedelta(days=1)

        assert entry.expires_at is not None
        assert entry.expires_at > before_time + timedelta(days=1, seconds=-5)
        assert entry.expires_at < after_time + timedelta(seconds=5)

    async def test_access_count_increments(
        self, cache_service: ScrapeCacheService, db_session: AsyncSession
    ) -> None:
        """Test access_count increments on each retrieval."""
        cache_key = "access_count_test"

        # Save entry
        await cache_service.save_scrape(
            session=db_session,
            url="https://example.com/count",
            raw_content="<html>Content</html>",
            source="firecrawl",
            cache_key=cache_key,
            max_age=172800000,
        )
        await db_session.commit()

        # Retrieve multiple times
        for expected_count in [1, 2, 3]:
            entry = await cache_service.get_cached_scrape(
                session=db_session, cache_key=cache_key, max_age=172800000
            )
            await db_session.commit()
            assert entry.access_count == expected_count
