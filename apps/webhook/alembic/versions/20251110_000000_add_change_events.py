"""Add change_events table

Revision ID: 20251110_000000
Revises: 20251109_100516
Create Date: 2025-11-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20251110_000000'
down_revision = '20251109_100516'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'change_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('watch_id', sa.String(255), nullable=False),
        sa.Column('watch_url', sa.Text(), nullable=False),
        sa.Column(
            'detected_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('NOW()'),
            nullable=False,
        ),
        sa.Column('diff_summary', sa.Text(), nullable=True),
        sa.Column('snapshot_url', sa.Text(), nullable=True),
        sa.Column('rescrape_job_id', sa.String(255), nullable=True),
        sa.Column('rescrape_status', sa.String(50), nullable=True),
        sa.Column('indexed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('NOW()'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
        schema='webhook'
    )
    op.create_index(
        'idx_change_events_watch_id',
        'change_events',
        ['watch_id'],
        schema='webhook'
    )
    op.create_index(
        'idx_change_events_detected_at',
        'change_events',
        ['detected_at'],
        schema='webhook',
        postgresql_using='btree'
    )


def downgrade():
    op.drop_index('idx_change_events_detected_at', table_name='change_events', schema='webhook')
    op.drop_index('idx_change_events_watch_id', table_name='change_events', schema='webhook')
    op.drop_table('change_events', schema='webhook')
