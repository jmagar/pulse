"""add_foreign_key_crawl_id

Revision ID: 376d1cbc1ea8
Revises: 3a4d9b64ac20
Create Date: 2025-11-13 22:03:39.559473

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '376d1cbc1ea8'
down_revision: Union[str, Sequence[str], None] = '3a4d9b64ac20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add FK constraint from operation_metrics.crawl_id to crawl_sessions.crawl_id."""
    op.create_foreign_key(
        "fk_operation_metrics_crawl_id",
        "operation_metrics",
        "crawl_sessions",
        ["crawl_id"],
        ["crawl_id"],
        source_schema="webhook",
        referent_schema="webhook",
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Remove FK constraint."""
    op.drop_constraint(
        "fk_operation_metrics_crawl_id",
        "operation_metrics",
        schema="webhook",
        type_="foreignkey"
    )
