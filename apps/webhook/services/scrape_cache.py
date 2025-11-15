"""
Scrape cache service for storing and retrieving scraped content.

Provides intelligent caching with cache key generation, expiration handling,
and access tracking for the /api/v2/scrape endpoint.
"""
import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from pydantic import BaseModel
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from domain.models import ScrapeCache
from utils.logging import logger


class ScrapeCacheEntry(BaseModel):
    """Scrape cache entry data model."""

    id: int
    url: str
    url_hash: str
    raw_content: Optional[str]
    cleaned_content: Optional[str]
    extracted_content: Optional[str]
    extract_query: Optional[str]
    source: str
    content_type: Optional[str]
    content_length_raw: Optional[int]
    content_length_cleaned: Optional[int]
    content_length_extracted: Optional[int]
    screenshot: Optional[bytes]
    screenshot_format: Optional[str]
    strategy_used: Optional[str]
    scrape_options: Optional[dict[str, Any]]
    scraped_at: datetime
    expires_at: Optional[datetime]
    cache_key: str
    access_count: int
    last_accessed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ScrapeCacheService:
    """
    Service for managing scrape content cache.

    Handles cache storage, retrieval, expiration, and invalidation with
    intelligent cache key generation based on URL and scraping parameters.
    """

    @staticmethod
    def _compute_url_hash(url: str) -> str:
        """
        Compute SHA-256 hash of URL for fast lookups.

        Args:
            url: The URL to hash

        Returns:
            64-character hex string (SHA-256 digest)
        """
        return hashlib.sha256(url.encode('utf-8')).hexdigest()

    @staticmethod
    def compute_cache_key(
        url: str,
        extract: Optional[str] = None,
        cleanScrape: bool = True,
        onlyMainContent: bool = True,
        includeTags: Optional[list[str]] = None,
        excludeTags: Optional[list[str]] = None,
        formats: Optional[list[str]] = None,
        **_kwargs: Any
    ) -> str:
        """
        Compute deterministic cache key from scraping parameters.

        Cache key includes URL and all parameters that affect output:
        - extract query (LLM prompt)
        - cleanScrape flag
        - onlyMainContent flag
        - includeTags/excludeTags filters
        - formats requested

        Parameters that don't affect output (timeout, proxy, etc.) are ignored.

        Args:
            url: Target URL
            extract: LLM extraction query
            cleanScrape: Whether to clean HTML to Markdown
            onlyMainContent: Extract only main content area
            includeTags: HTML tags/classes to include
            excludeTags: HTML tags/classes to exclude
            formats: Output formats requested

        Returns:
            64-character SHA-256 hex digest
        """
        key_options = {
            "url": url,
            "extract": extract,
            "cleanScrape": cleanScrape,
            "onlyMainContent": onlyMainContent,
            "includeTags": sorted(includeTags or []),
            "excludeTags": sorted(excludeTags or []),
            "formats": sorted(formats or []),
        }

        json_str = json.dumps(key_options, sort_keys=True)
        return hashlib.sha256(json_str.encode('utf-8')).hexdigest()

    @staticmethod
    def _compute_expires_at(max_age: int) -> datetime:
        """
        Compute expiration timestamp from max_age in milliseconds.

        Args:
            max_age: Cache age threshold in milliseconds

        Returns:
            Expiration datetime (now + max_age)
        """
        return datetime.now(timezone.utc) + timedelta(milliseconds=max_age)

    async def save_scrape(
        self,
        session: AsyncSession,
        url: str,
        raw_content: str,
        source: str,
        cache_key: str,
        max_age: int,
        cleaned_content: Optional[str] = None,
        extracted_content: Optional[str] = None,
        extract_query: Optional[str] = None,
        content_type: Optional[str] = None,
        strategy_used: Optional[str] = None,
        scrape_options: Optional[dict[str, Any]] = None,
        screenshot: Optional[bytes] = None,
        screenshot_format: Optional[str] = None,
    ) -> ScrapeCacheEntry:
        """
        Save scrape results to cache.

        Args:
            session: Database session
            url: Scraped URL
            raw_content: Raw HTML/text from scraper
            source: Scraping source (firecrawl, native)
            cache_key: Cache key for retrieval
            max_age: Cache TTL in milliseconds
            cleaned_content: Cleaned Markdown/text (optional)
            extracted_content: LLM-extracted content (optional)
            extract_query: LLM extraction query (optional)
            content_type: MIME type (optional)
            strategy_used: Specific strategy that worked (optional)
            scrape_options: Full request options (optional)
            screenshot: Screenshot binary data (optional)
            screenshot_format: Screenshot MIME type (optional)

        Returns:
            Saved cache entry
        """
        url_hash = self._compute_url_hash(url)
        expires_at = self._compute_expires_at(max_age)

        cache_entry = ScrapeCache(
            url=url,
            url_hash=url_hash,
            raw_content=raw_content,
            cleaned_content=cleaned_content,
            extracted_content=extracted_content,
            extract_query=extract_query,
            source=source,
            content_type=content_type,
            content_length_raw=len(raw_content) if raw_content else None,
            content_length_cleaned=len(cleaned_content) if cleaned_content else None,
            content_length_extracted=len(extracted_content) if extracted_content else None,
            screenshot=screenshot,
            screenshot_format=screenshot_format,
            strategy_used=strategy_used,
            scrape_options=scrape_options,
            scraped_at=datetime.now(timezone.utc),
            expires_at=expires_at,
            cache_key=cache_key,
            access_count=0,
            last_accessed_at=None,
        )

        session.add(cache_entry)
        await session.flush()  # Get ID assigned
        await session.refresh(cache_entry)

        logger.info(
            "Saved scrape to cache",
            url=url,
            cache_key=cache_key,
            source=source,
            has_cleaned=cleaned_content is not None,
            has_extracted=extracted_content is not None,
            has_screenshot=screenshot is not None,
        )

        return ScrapeCacheEntry.model_validate(cache_entry)

    async def get_cached_scrape(
        self,
        session: AsyncSession,
        cache_key: str,
        max_age: int,
    ) -> Optional[ScrapeCacheEntry]:
        """
        Retrieve cached scrape if exists and not expired.

        Increments access_count and updates last_accessed_at on successful retrieval.

        Args:
            session: Database session
            cache_key: Cache key to look up
            max_age: Maximum acceptable age in milliseconds

        Returns:
            Cached entry if found and not expired, None otherwise
        """
        now = datetime.now(timezone.utc)

        # Query for non-expired entry
        stmt = select(ScrapeCache).where(
            ScrapeCache.cache_key == cache_key,
            (ScrapeCache.expires_at.is_(None) | (ScrapeCache.expires_at > now))
        )

        result = await session.execute(stmt)
        cache_entry = result.scalar_one_or_none()

        if cache_entry is None:
            logger.debug("Cache miss", cache_key=cache_key)
            return None

        # Update access tracking
        await session.execute(
            update(ScrapeCache)
            .where(ScrapeCache.id == cache_entry.id)
            .values(
                access_count=ScrapeCache.access_count + 1,
                last_accessed_at=now
            )
        )
        await session.flush()

        # Refresh to get updated values
        await session.refresh(cache_entry)

        logger.info(
            "Cache hit",
            cache_key=cache_key,
            url=cache_entry.url,
            age_seconds=(now - cache_entry.scraped_at).total_seconds(),
            access_count=cache_entry.access_count
        )

        return ScrapeCacheEntry.model_validate(cache_entry)

    async def invalidate_url(
        self,
        session: AsyncSession,
        url: str
    ) -> int:
        """
        Invalidate all cache entries for a URL.

        Removes all cached entries regardless of extract_query or other parameters.

        Args:
            session: Database session
            url: URL to invalidate

        Returns:
            Number of entries deleted
        """
        url_hash = self._compute_url_hash(url)

        stmt = delete(ScrapeCache).where(ScrapeCache.url_hash == url_hash)
        result = await session.execute(stmt)
        await session.flush()

        deleted_count = result.rowcount or 0

        logger.info(
            "Invalidated cache entries",
            url=url,
            deleted_count=deleted_count
        )

        return deleted_count

    async def cleanup_expired(
        self,
        session: AsyncSession
    ) -> int:
        """
        Remove expired cache entries.

        Should be called periodically by background task.

        Args:
            session: Database session

        Returns:
            Number of entries deleted
        """
        now = datetime.now(timezone.utc)

        stmt = delete(ScrapeCache).where(
            ScrapeCache.expires_at.isnot(None),
            ScrapeCache.expires_at < now
        )

        result = await session.execute(stmt)
        await session.flush()

        deleted_count = result.rowcount or 0

        if deleted_count > 0:
            logger.info(
                "Cleaned up expired cache entries",
                deleted_count=deleted_count
            )

        return deleted_count
