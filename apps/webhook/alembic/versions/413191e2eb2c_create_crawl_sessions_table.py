"""restructure_crawl_sessions_for_v2_api

Revision ID: 413191e2eb2c
Revises: 376d1cbc1ea8
Create Date: 2025-11-14 20:42:42.238795

Adapts crawl_sessions table for unified Firecrawl v2 proxy architecture.
Changes job_id (was crawl_id) to be the primary foreign key field.
Adds operation_type, base_url, and auto_index fields.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '413191e2eb2c'
down_revision: Union[str, Sequence[str], None] = '376d1cbc1ea8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Drop existing FK constraint to allow column renames
    op.drop_constraint(
        'fk_operation_metrics_crawl_id',
        'operation_metrics',
        schema='webhook',
        type_='foreignkey'
    )

    # Rename crawl_id to job_id in crawl_sessions (more accurate for v2 API)
    op.alter_column(
        'crawl_sessions',
        'crawl_id',
        new_column_name='job_id',
        schema='webhook'
    )

    # Rename crawl_url to base_url (more generic for all operations)
    op.alter_column(
        'crawl_sessions',
        'crawl_url',
        new_column_name='base_url',
        schema='webhook'
    )

    # Add new columns for v2 API support
    op.add_column(
        'crawl_sessions',
        sa.Column('operation_type', sa.String(50), nullable=True),
        schema='webhook'
    )
    op.add_column(
        'crawl_sessions',
        sa.Column('total_urls', sa.Integer(), nullable=False, server_default='0'),
        schema='webhook'
    )
    op.add_column(
        'crawl_sessions',
        sa.Column('completed_urls', sa.Integer(), nullable=False, server_default='0'),
        schema='webhook'
    )
    op.add_column(
        'crawl_sessions',
        sa.Column('failed_urls', sa.Integer(), nullable=False, server_default='0'),
        schema='webhook'
    )
    op.add_column(
        'crawl_sessions',
        sa.Column('auto_index', sa.Boolean(), nullable=False, server_default='true'),
        schema='webhook'
    )
    op.add_column(
        'crawl_sessions',
        sa.Column('expires_at', sa.TIMESTAMP(timezone=True), nullable=True),
        schema='webhook'
    )
    op.add_column(
        'crawl_sessions',
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        schema='webhook'
    )

    # Set default operation_type for existing records
    op.execute("UPDATE webhook.crawl_sessions SET operation_type = 'crawl' WHERE operation_type IS NULL")

    # Make operation_type non-nullable now that defaults are set
    op.alter_column(
        'crawl_sessions',
        'operation_type',
        nullable=False,
        schema='webhook'
    )

    # Recreate FK constraint with new column name
    op.create_foreign_key(
        'fk_operation_metrics_crawl_id',
        'operation_metrics', 'crawl_sessions',
        ['crawl_id'], ['job_id'],
        source_schema='webhook',
        referent_schema='webhook',
        ondelete='SET NULL'
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Drop FK constraint
    op.drop_constraint(
        'fk_operation_metrics_crawl_id',
        'operation_metrics',
        schema='webhook',
        type_='foreignkey'
    )

    # Drop new columns
    op.drop_column('crawl_sessions', 'updated_at', schema='webhook')
    op.drop_column('crawl_sessions', 'expires_at', schema='webhook')
    op.drop_column('crawl_sessions', 'auto_index', schema='webhook')
    op.drop_column('crawl_sessions', 'failed_urls', schema='webhook')
    op.drop_column('crawl_sessions', 'completed_urls', schema='webhook')
    op.drop_column('crawl_sessions', 'total_urls', schema='webhook')
    op.drop_column('crawl_sessions', 'operation_type', schema='webhook')

    # Rename columns back
    op.alter_column(
        'crawl_sessions',
        'base_url',
        new_column_name='crawl_url',
        schema='webhook'
    )
    op.alter_column(
        'crawl_sessions',
        'job_id',
        new_column_name='crawl_id',
        schema='webhook'
    )

    # Recreate original FK constraint
    op.create_foreign_key(
        'fk_operation_metrics_crawl_id',
        'operation_metrics', 'crawl_sessions',
        ['crawl_id'], ['crawl_id'],
        source_schema='webhook',
        referent_schema='webhook',
        ondelete='SET NULL'
    )
