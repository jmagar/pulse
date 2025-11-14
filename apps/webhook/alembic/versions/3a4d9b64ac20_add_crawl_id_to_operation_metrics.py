"""add_crawl_id_to_operation_metrics

Revision ID: 3a4d9b64ac20
Revises: d4a3f655d912
Create Date: 2025-11-14 02:54:19.076779

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '3a4d9b64ac20'
down_revision: Union[str, Sequence[str], None] = 'd4a3f655d912'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add crawl_id column to operation_metrics table."""
    # Add crawl_id column
    op.add_column(
        'operation_metrics',
        sa.Column('crawl_id', sa.String(length=255), nullable=True),
        schema='webhook'
    )
    # Create index on crawl_id for fast lookups
    op.create_index(
        op.f('ix_webhook_operation_metrics_crawl_id'),
        'operation_metrics',
        ['crawl_id'],
        unique=False,
        schema='webhook'
    )


def downgrade() -> None:
    """Remove crawl_id column from operation_metrics table."""
    # Drop index
    op.drop_index(
        op.f('ix_webhook_operation_metrics_crawl_id'),
        table_name='operation_metrics',
        schema='webhook'
    )
    # Drop column
    op.drop_column('operation_metrics', 'crawl_id', schema='webhook')
