"""add_scraped_content_table

Revision ID: 04f2514440fd
Revises: 413191e2eb2c
Create Date: 2025-11-15 01:16:13.332710

Add scraped_content table for permanent Firecrawl content storage.
Stores original markdown/HTML from all Firecrawl operations (scrape, map, crawl, search, extract).
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '04f2514440fd'
down_revision: str | Sequence[str] | None = '413191e2eb2c'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Main content storage table
    op.create_table(
        'scraped_content',
        sa.Column('id', sa.BigInteger(), primary_key=True),

        # Foreign key to crawl_sessions.job_id (String, NOT UUID)
        sa.Column('crawl_session_id', sa.String(255), nullable=False),
        sa.Column('url', sa.Text(), nullable=False),
        sa.Column('source_url', sa.Text(), nullable=True),

        # Use String instead of ENUM
        sa.Column('content_source', sa.String(50), nullable=False),

        # Content fields (NO raw_html - Firecrawl doesn't provide it)
        sa.Column('markdown', sa.Text(), nullable=True),
        sa.Column('html', sa.Text(), nullable=True),
        sa.Column('links', JSONB, nullable=True),
        sa.Column('screenshot', sa.Text(), nullable=True),

        # Metadata from Firecrawl
        sa.Column('metadata', JSONB, nullable=False, server_default='{}'),

        # Deduplication
        sa.Column('content_hash', sa.String(64), nullable=False),

        # Timestamps (NO trigger needed - SQLAlchemy onupdate handles it)
        sa.Column('scraped_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),

        # Foreign key constraint
        sa.ForeignKeyConstraint(
            ['crawl_session_id'],
            ['webhook.crawl_sessions.job_id'],
            name='fk_scraped_content_crawl_session',
            ondelete='CASCADE'
        ),

        # Unique constraint
        sa.UniqueConstraint(
            'crawl_session_id',
            'url',
            'content_hash',
            name='uq_content_per_session_url'
        ),

        schema='webhook'
    )

    # Indexes (using idx_ prefix to match existing pattern)
    op.create_index(
        'idx_scraped_content_url',
        'scraped_content',
        ['url'],
        schema='webhook'
    )
    op.create_index(
        'idx_scraped_content_session',
        'scraped_content',
        ['crawl_session_id'],
        schema='webhook'
    )
    op.create_index(
        'idx_scraped_content_hash',
        'scraped_content',
        ['content_hash'],
        schema='webhook'
    )
    op.create_index(
        'idx_scraped_content_created',
        'scraped_content',
        ['created_at'],
        schema='webhook'
    )

    # Composite index for URL + created_at
    op.create_index(
        'idx_scraped_content_url_created',
        'scraped_content',
        ['url', sa.text('created_at DESC')],
        schema='webhook'
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('scraped_content', schema='webhook')
