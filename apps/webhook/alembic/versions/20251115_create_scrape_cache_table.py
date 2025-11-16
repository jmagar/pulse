"""create scrape_cache table

Revision ID: 20251115_scrape_cache
Revises: 20251113_add_foreign_keys
Create Date: 2025-11-15 18:45:00.000000

"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "20251115_scrape_cache"
down_revision = "20251113_add_foreign_keys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Create webhook.scrape_cache table for storing scraped content.

    This table provides intelligent caching for the /api/v2/scrape endpoint,
    storing raw HTML, cleaned Markdown, and LLM-extracted content with
    cache invalidation based on URL and scraping options.
    """
    op.create_table(
        "scrape_cache",
        sa.Column("id", sa.BigInteger(), nullable=False, autoincrement=True),
        sa.Column("url", sa.Text(), nullable=False, comment="Full URL that was scraped"),
        sa.Column(
            "url_hash", sa.Text(), nullable=False, comment="SHA-256 hash of URL for fast lookups"
        ),
        # Content versions (all optional based on processing pipeline)
        sa.Column("raw_content", sa.Text(), nullable=True, comment="Raw HTML/text from scraper"),
        sa.Column(
            "cleaned_content",
            sa.Text(),
            nullable=True,
            comment="Cleaned Markdown/text after processing",
        ),
        sa.Column("extracted_content", sa.Text(), nullable=True, comment="LLM-extracted content"),
        sa.Column(
            "extract_query",
            sa.Text(),
            nullable=True,
            comment="LLM extraction query used (for cache key)",
        ),
        # Metadata
        sa.Column(
            "source", sa.String(50), nullable=False, comment="Scraping source: firecrawl, native"
        ),
        sa.Column("content_type", sa.String(100), nullable=True, comment="MIME type of content"),
        sa.Column(
            "content_length_raw",
            sa.Integer(),
            nullable=True,
            comment="Length of raw_content in characters",
        ),
        sa.Column(
            "content_length_cleaned",
            sa.Integer(),
            nullable=True,
            comment="Length of cleaned_content in characters",
        ),
        sa.Column(
            "content_length_extracted",
            sa.Integer(),
            nullable=True,
            comment="Length of extracted_content in characters",
        ),
        # Screenshot support
        sa.Column(
            "screenshot",
            sa.LargeBinary(),
            nullable=True,
            comment="Base64 decoded screenshot binary",
        ),
        sa.Column(
            "screenshot_format",
            sa.String(20),
            nullable=True,
            comment="Screenshot MIME type: image/png",
        ),
        # Scraping details
        sa.Column(
            "strategy_used",
            sa.String(50),
            nullable=True,
            comment="Specific strategy that succeeded",
        ),
        sa.Column(
            "scrape_options",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment="Full request options for debugging",
        ),
        # Cache control
        sa.Column(
            "scraped_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
            comment="When content was scraped",
        ),
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Computed expiration time (scraped_at + maxAge)",
        ),
        sa.Column(
            "cache_key",
            sa.Text(),
            nullable=False,
            comment="SHA-256 hash of (url + extract_query + key scraping options)",
        ),
        # Tracking
        sa.Column(
            "access_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
            comment="Number of times cached content was accessed",
        ),
        sa.Column(
            "last_accessed_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Last time this cache entry was used",
        ),
        # Primary key
        sa.PrimaryKeyConstraint("id", name="pk_scrape_cache"),
        # Unique constraints
        sa.UniqueConstraint("url_hash", name="uq_scrape_cache_url_hash"),
        sa.UniqueConstraint("cache_key", name="uq_scrape_cache_cache_key"),
        schema="webhook",
        comment="Cache for scraped content with intelligent invalidation",
    )

    # Indexes for query performance
    op.create_index("idx_scrape_cache_url", "scrape_cache", ["url"], schema="webhook", unique=False)

    op.create_index(
        "idx_scrape_cache_scraped_at",
        "scrape_cache",
        [sa.text("scraped_at DESC")],
        schema="webhook",
        unique=False,
    )

    # Partial index for expired entries (only index non-null expires_at)
    op.create_index(
        "idx_scrape_cache_expires_at",
        "scrape_cache",
        ["expires_at"],
        schema="webhook",
        unique=False,
        postgresql_where=sa.text("expires_at IS NOT NULL"),
    )

    op.create_index(
        "idx_scrape_cache_cache_key", "scrape_cache", ["cache_key"], schema="webhook", unique=False
    )

    # Index for cleanup queries (find expired entries)
    op.create_index(
        "idx_scrape_cache_cleanup",
        "scrape_cache",
        [sa.text("expires_at ASC")],
        schema="webhook",
        unique=False,
        postgresql_where=sa.text("expires_at IS NOT NULL AND expires_at < now()"),
    )


def downgrade() -> None:
    """Drop scrape_cache table and all indexes."""
    op.drop_index("idx_scrape_cache_cleanup", table_name="scrape_cache", schema="webhook")
    op.drop_index("idx_scrape_cache_cache_key", table_name="scrape_cache", schema="webhook")
    op.drop_index("idx_scrape_cache_expires_at", table_name="scrape_cache", schema="webhook")
    op.drop_index("idx_scrape_cache_scraped_at", table_name="scrape_cache", schema="webhook")
    op.drop_index("idx_scrape_cache_url", table_name="scrape_cache", schema="webhook")
    op.drop_table("scrape_cache", schema="webhook")
