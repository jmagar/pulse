"""Add webhook schema and migrate tables

Revision ID: 20251109_100516
Revises: 57f2f0e22bad
Create Date: 2025-11-09 10:05:16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '20251109_100516'
down_revision: Union[str, Sequence[str], None] = '57f2f0e22bad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create webhook schema
    op.execute('CREATE SCHEMA IF NOT EXISTS webhook')

    # Move request_metrics table to webhook schema
    op.execute('ALTER TABLE public.request_metrics SET SCHEMA webhook')

    # Move operation_metrics table to webhook schema
    op.execute('ALTER TABLE public.operation_metrics SET SCHEMA webhook')


def downgrade() -> None:
    """Downgrade schema."""
    # Move tables back to public schema
    op.execute('ALTER TABLE webhook.request_metrics SET SCHEMA public')
    op.execute('ALTER TABLE webhook.operation_metrics SET SCHEMA public')

    # Drop webhook schema (CASCADE will drop any remaining objects)
    op.execute('DROP SCHEMA IF EXISTS webhook CASCADE')
