"""
Unit tests for scrape_cache table schema validation.

Tests verify that the scrape_cache table schema supports all required
operations for the webhook scrape API.
"""
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
class TestScrapeCacheSchema:
    """Test scrape_cache table structure and constraints."""

    async def test_table_exists(self, db_session: AsyncSession) -> None:
        """Verify scrape_cache table exists in webhook schema."""
        result = await db_session.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'webhook'
                AND table_name = 'scrape_cache'
            );
        """))
        exists = result.scalar()
        assert exists, "scrape_cache table should exist in webhook schema"

    async def test_required_columns_exist(self, db_session: AsyncSession) -> None:
        """Verify all required columns are present."""
        result = await db_session.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'webhook'
            AND table_name = 'scrape_cache'
            ORDER BY ordinal_position;
        """))
        columns = {row[0] for row in result}

        required_columns = {
            'id', 'url', 'url_hash', 'raw_content', 'cleaned_content',
            'extracted_content', 'extract_query', 'source', 'content_type',
            'content_length_raw', 'content_length_cleaned', 'content_length_extracted',
            'screenshot', 'screenshot_format', 'strategy_used', 'scrape_options',
            'scraped_at', 'expires_at', 'cache_key', 'access_count', 'last_accessed_at'
        }

        assert required_columns.issubset(columns), \
            f"Missing columns: {required_columns - columns}"

    async def test_primary_key_constraint(self, db_session: AsyncSession) -> None:
        """Verify id is the primary key."""
        result = await db_session.execute(text("""
            SELECT constraint_name
            FROM information_schema.table_constraints
            WHERE table_schema = 'webhook'
            AND table_name = 'scrape_cache'
            AND constraint_type = 'PRIMARY KEY';
        """))
        pk_name = result.scalar()
        assert pk_name == 'pk_scrape_cache', "Primary key should be named pk_scrape_cache"

    async def test_unique_constraints(self, db_session: AsyncSession) -> None:
        """Verify unique constraints on url_hash and cache_key."""
        result = await db_session.execute(text("""
            SELECT constraint_name, column_name
            FROM information_schema.constraint_column_usage
            WHERE table_schema = 'webhook'
            AND table_name = 'scrape_cache'
            AND constraint_name LIKE 'uq_%'
            ORDER BY constraint_name;
        """))
        constraints = {row[0]: row[1] for row in result}

        assert 'uq_scrape_cache_url_hash' in constraints
        assert constraints['uq_scrape_cache_url_hash'] == 'url_hash'
        assert 'uq_scrape_cache_cache_key' in constraints
        assert constraints['uq_scrape_cache_cache_key'] == 'cache_key'

    async def test_indexes_exist(self, db_session: AsyncSession) -> None:
        """Verify performance indexes are created."""
        result = await db_session.execute(text("""
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'webhook'
            AND tablename = 'scrape_cache'
            AND indexname LIKE 'idx_%'
            ORDER BY indexname;
        """))
        indexes = {row[0] for row in result}

        expected_indexes = {
            'idx_scrape_cache_url',
            'idx_scrape_cache_scraped_at',
            'idx_scrape_cache_expires_at',
            'idx_scrape_cache_cache_key',
            'idx_scrape_cache_cleanup'
        }

        assert expected_indexes.issubset(indexes), \
            f"Missing indexes: {expected_indexes - indexes}"

    async def test_insert_minimal_record(self, db_session: AsyncSession) -> None:
        """Test inserting a minimal valid record."""
        await db_session.execute(text("""
            INSERT INTO webhook.scrape_cache (
                url,
                url_hash,
                source,
                cache_key,
                raw_content
            ) VALUES (
                'https://example.com/test',
                '5d41402abc4b2a76b9719d911017c592',
                'firecrawl',
                'abc123def456',
                '<html><body>Test content</body></html>'
            )
        """))
        await db_session.commit()

        # Verify defaults were applied
        result = await db_session.execute(text("""
            SELECT access_count, scraped_at
            FROM webhook.scrape_cache
            WHERE url_hash = '5d41402abc4b2a76b9719d911017c592';
        """))
        row = result.first()
        assert row is not None
        assert row[0] == 0, "access_count should default to 0"
        assert row[1] is not None, "scraped_at should have server default"

    async def test_insert_full_record(self, db_session: AsyncSession) -> None:
        """Test inserting a complete record with all fields."""
        now = datetime.now(UTC)
        expires = now + timedelta(days=2)

        await db_session.execute(text("""
            INSERT INTO webhook.scrape_cache (
                url,
                url_hash,
                raw_content,
                cleaned_content,
                extracted_content,
                extract_query,
                source,
                content_type,
                content_length_raw,
                content_length_cleaned,
                content_length_extracted,
                screenshot,
                screenshot_format,
                strategy_used,
                scrape_options,
                scraped_at,
                expires_at,
                cache_key,
                access_count,
                last_accessed_at
            ) VALUES (
                'https://example.com/full',
                'full_test_hash_456',
                '<html><body>Full content</body></html>',
                '# Full Content\n\nThis is cleaned.',
                'Author: John Doe',
                'extract the author name',
                'firecrawl',
                'text/html',
                100,
                50,
                15,
                decode('89504e470d0a1a0a', 'hex'),
                'image/png',
                'firecrawl_default',
                '{"timeout": 60000}'::jsonb,
                :scraped_at,
                :expires_at,
                'full_cache_key_789',
                5,
                :accessed_at
            )
        """), {
            'scraped_at': now,
            'expires_at': expires,
            'accessed_at': now
        })
        await db_session.commit()

        # Verify all fields were stored
        result = await db_session.execute(text("""
            SELECT
                extract_query,
                content_length_raw,
                scrape_options->>'timeout' as timeout,
                screenshot IS NOT NULL as has_screenshot
            FROM webhook.scrape_cache
            WHERE url_hash = 'full_test_hash_456';
        """))
        row = result.first()
        assert row is not None
        assert row[0] == 'extract the author name'
        assert row[1] == 100
        assert row[2] == '60000'
        assert row[3] is True

    async def test_url_hash_uniqueness(self, db_session: AsyncSession) -> None:
        """Verify url_hash unique constraint prevents duplicates."""
        await db_session.execute(text("""
            INSERT INTO webhook.scrape_cache (
                url, url_hash, source, cache_key
            ) VALUES (
                'https://example.com/dup',
                'dup_hash',
                'firecrawl',
                'key1'
            )
        """))
        await db_session.commit()

        # Attempt duplicate insert
        with pytest.raises(Exception) as exc_info:
            await db_session.execute(text("""
                INSERT INTO webhook.scrape_cache (
                    url, url_hash, source, cache_key
                ) VALUES (
                    'https://example.com/dup2',
                    'dup_hash',
                    'native',
                    'key2'
                )
            """))
            await db_session.commit()

        assert 'uq_scrape_cache_url_hash' in str(exc_info.value).lower() or \
               'duplicate key' in str(exc_info.value).lower()

    async def test_cache_key_uniqueness(self, db_session: AsyncSession) -> None:
        """Verify cache_key unique constraint prevents duplicates."""
        await db_session.execute(text("""
            INSERT INTO webhook.scrape_cache (
                url, url_hash, source, cache_key
            ) VALUES (
                'https://example.com/cache1',
                'hash1',
                'firecrawl',
                'same_cache_key'
            )
        """))
        await db_session.commit()

        # Attempt duplicate cache_key
        with pytest.raises(Exception) as exc_info:
            await db_session.execute(text("""
                INSERT INTO webhook.scrape_cache (
                    url, url_hash, source, cache_key
                ) VALUES (
                    'https://example.com/cache2',
                    'hash2',
                    'native',
                    'same_cache_key'
                )
            """))
            await db_session.commit()

        assert 'uq_scrape_cache_cache_key' in str(exc_info.value).lower() or \
               'duplicate key' in str(exc_info.value).lower()

    async def test_expiration_query_performance(self, db_session: AsyncSession) -> None:
        """Verify expired entries can be efficiently queried."""
        now = datetime.now(UTC)
        past = now - timedelta(days=1)
        future = now + timedelta(days=1)

        # Insert expired entry
        await db_session.execute(text("""
            INSERT INTO webhook.scrape_cache (
                url, url_hash, source, cache_key, expires_at
            ) VALUES (
                'https://example.com/expired',
                'expired_hash',
                'firecrawl',
                'expired_key',
                :expires_at
            )
        """), {'expires_at': past})

        # Insert active entry
        await db_session.execute(text("""
            INSERT INTO webhook.scrape_cache (
                url, url_hash, source, cache_key, expires_at
            ) VALUES (
                'https://example.com/active',
                'active_hash',
                'firecrawl',
                'active_key',
                :expires_at
            )
        """), {'expires_at': future})

        await db_session.commit()

        # Query expired entries
        result = await db_session.execute(text("""
            SELECT COUNT(*)
            FROM webhook.scrape_cache
            WHERE expires_at IS NOT NULL
            AND expires_at < now();
        """))
        expired_count = result.scalar()
        assert expired_count >= 1, "Should find at least one expired entry"

    async def test_jsonb_column_functionality(self, db_session: AsyncSession) -> None:
        """Verify JSONB scrape_options column supports queries."""
        await db_session.execute(text("""
            INSERT INTO webhook.scrape_cache (
                url, url_hash, source, cache_key, scrape_options
            ) VALUES (
                'https://example.com/json',
                'json_hash',
                'firecrawl',
                'json_key',
                '{"timeout": 30000, "proxy": "stealth", "formats": ["markdown", "html"]}'::jsonb
            )
        """))
        await db_session.commit()

        # Query JSONB field
        result = await db_session.execute(text("""
            SELECT
                scrape_options->>'timeout' as timeout,
                scrape_options->>'proxy' as proxy,
                jsonb_array_length(scrape_options->'formats') as format_count
            FROM webhook.scrape_cache
            WHERE url_hash = 'json_hash';
        """))
        row = result.first()
        assert row is not None
        assert row[0] == '30000'
        assert row[1] == 'stealth'
        assert row[2] == 2
