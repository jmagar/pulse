"""Add timing metrics tables

Revision ID: 57f2f0e22bad
Revises:
Create Date: 2025-11-08 08:21:25.271350

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '57f2f0e22bad'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create request_metrics table
    op.create_table(
        'request_metrics',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('method', sa.String(length=10), nullable=False),
        sa.Column('path', sa.String(length=500), nullable=False),
        sa.Column('status_code', sa.Integer(), nullable=False),
        sa.Column('duration_ms', sa.Float(), nullable=False),
        sa.Column('request_id', sa.String(length=100), nullable=True),
        sa.Column('client_ip', sa.String(length=50), nullable=True),
        sa.Column('user_agent', sa.String(length=500), nullable=True),
        sa.Column('extra_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes for request_metrics
    op.create_index(op.f('ix_request_metrics_timestamp'), 'request_metrics', ['timestamp'], unique=False)
    op.create_index(op.f('ix_request_metrics_method'), 'request_metrics', ['method'], unique=False)
    op.create_index(op.f('ix_request_metrics_path'), 'request_metrics', ['path'], unique=False)
    op.create_index(op.f('ix_request_metrics_status_code'), 'request_metrics', ['status_code'], unique=False)
    op.create_index(op.f('ix_request_metrics_duration_ms'), 'request_metrics', ['duration_ms'], unique=False)
    op.create_index(op.f('ix_request_metrics_request_id'), 'request_metrics', ['request_id'], unique=False)

    # Create operation_metrics table
    op.create_table(
        'operation_metrics',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('operation_type', sa.String(length=50), nullable=False),
        sa.Column('operation_name', sa.String(length=100), nullable=False),
        sa.Column('duration_ms', sa.Float(), nullable=False),
        sa.Column('success', sa.Boolean(), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('request_id', sa.String(length=100), nullable=True),
        sa.Column('job_id', sa.String(length=100), nullable=True),
        sa.Column('document_url', sa.String(length=500), nullable=True),
        sa.Column('extra_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes for operation_metrics
    op.create_index(op.f('ix_operation_metrics_timestamp'), 'operation_metrics', ['timestamp'], unique=False)
    op.create_index(op.f('ix_operation_metrics_operation_type'), 'operation_metrics', ['operation_type'], unique=False)
    op.create_index(op.f('ix_operation_metrics_operation_name'), 'operation_metrics', ['operation_name'], unique=False)
    op.create_index(op.f('ix_operation_metrics_duration_ms'), 'operation_metrics', ['duration_ms'], unique=False)
    op.create_index(op.f('ix_operation_metrics_success'), 'operation_metrics', ['success'], unique=False)
    op.create_index(op.f('ix_operation_metrics_request_id'), 'operation_metrics', ['request_id'], unique=False)
    op.create_index(op.f('ix_operation_metrics_job_id'), 'operation_metrics', ['job_id'], unique=False)
    op.create_index(op.f('ix_operation_metrics_document_url'), 'operation_metrics', ['document_url'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    # Drop operation_metrics table and indexes
    op.drop_index(op.f('ix_operation_metrics_document_url'), table_name='operation_metrics')
    op.drop_index(op.f('ix_operation_metrics_job_id'), table_name='operation_metrics')
    op.drop_index(op.f('ix_operation_metrics_request_id'), table_name='operation_metrics')
    op.drop_index(op.f('ix_operation_metrics_success'), table_name='operation_metrics')
    op.drop_index(op.f('ix_operation_metrics_duration_ms'), table_name='operation_metrics')
    op.drop_index(op.f('ix_operation_metrics_operation_name'), table_name='operation_metrics')
    op.drop_index(op.f('ix_operation_metrics_operation_type'), table_name='operation_metrics')
    op.drop_index(op.f('ix_operation_metrics_timestamp'), table_name='operation_metrics')
    op.drop_table('operation_metrics')

    # Drop request_metrics table and indexes
    op.drop_index(op.f('ix_request_metrics_request_id'), table_name='request_metrics')
    op.drop_index(op.f('ix_request_metrics_duration_ms'), table_name='request_metrics')
    op.drop_index(op.f('ix_request_metrics_status_code'), table_name='request_metrics')
    op.drop_index(op.f('ix_request_metrics_path'), table_name='request_metrics')
    op.drop_index(op.f('ix_request_metrics_method'), table_name='request_metrics')
    op.drop_index(op.f('ix_request_metrics_timestamp'), table_name='request_metrics')
    op.drop_table('request_metrics')
