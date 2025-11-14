"""add_crawl_sessions_table

Revision ID: d4a3f655d912
Revises: 20251113_add_fk
Create Date: 2025-11-14 02:46:22.906838

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd4a3f655d912'
down_revision: Union[str, Sequence[str], None] = '20251113_add_fk'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Only create crawl_sessions table (other tables already exist)
    op.create_table('crawl_sessions',
    sa.Column('id', postgresql.UUID(), nullable=False),
    sa.Column('crawl_id', sa.String(length=255), nullable=False),
    sa.Column('crawl_url', sa.String(length=500), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('status', sa.String(length=50), nullable=False, server_default='in_progress'),
    sa.Column('success', sa.Boolean(), nullable=True),
    sa.Column('total_pages', sa.Integer(), nullable=False, server_default='0'),
    sa.Column('pages_indexed', sa.Integer(), nullable=False, server_default='0'),
    sa.Column('pages_failed', sa.Integer(), nullable=False, server_default='0'),
    sa.Column('total_chunking_ms', sa.Float(), nullable=False, server_default='0.0'),
    sa.Column('total_embedding_ms', sa.Float(), nullable=False, server_default='0.0'),
    sa.Column('total_qdrant_ms', sa.Float(), nullable=False, server_default='0.0'),
    sa.Column('total_bm25_ms', sa.Float(), nullable=False, server_default='0.0'),
    sa.Column('duration_ms', sa.Float(), nullable=True),
    sa.Column('initiated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('e2e_duration_ms', sa.Float(), nullable=True),
    sa.Column('extra_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('error_message', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('crawl_id'),
    schema='webhook'
    )
    op.create_index(op.f('ix_webhook_crawl_sessions_started_at'), 'crawl_sessions', ['started_at'], unique=False, schema='webhook')
    op.create_index(op.f('ix_webhook_crawl_sessions_status'), 'crawl_sessions', ['status'], unique=False, schema='webhook')


def downgrade() -> None:
    """Downgrade schema."""
    # Only drop crawl_sessions table
    op.drop_index(op.f('ix_webhook_crawl_sessions_status'), table_name='crawl_sessions', schema='webhook')
    op.drop_index(op.f('ix_webhook_crawl_sessions_started_at'), table_name='crawl_sessions', schema='webhook')
    op.drop_table('crawl_sessions', schema='webhook')
