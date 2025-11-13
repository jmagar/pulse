"""Add foreign key constraints

Revision ID: 20251113_add_fk
Revises: 20251110_000000
Create Date: 2025-11-13 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = "20251113_add_fk"
down_revision = "20251110_000000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add foreign key constraints."""
    conn = op.get_bind()

    # Step 1: Clean up orphaned records
    # Set request_id to NULL for operation_metrics that reference non-existent requests
    print("Cleaning up orphaned operation_metrics records...")
    result = conn.execute(text("""
        UPDATE webhook.operation_metrics
        SET request_id = NULL
        WHERE request_id IS NOT NULL
        AND NOT EXISTS (
            SELECT 1
            FROM webhook.request_metrics
            WHERE request_metrics.request_id = operation_metrics.request_id
        )
    """))
    print(f"Cleaned up {result.rowcount} orphaned records")

    # Step 2: Add unique constraint on request_metrics.request_id
    # This allows it to be referenced by a foreign key
    # Note: request_id is nullable, so this creates a unique constraint that allows multiple NULLs
    op.create_unique_constraint(
        "uq_request_metrics_request_id",
        "request_metrics",
        ["request_id"],
        schema="webhook"
    )

    # Step 3: Add FK: operation_metrics.request_id -> request_metrics.request_id
    # ON DELETE SET NULL allows orphaned operation metrics if request is deleted
    op.create_foreign_key(
        "fk_operation_metrics_request_id",
        "operation_metrics",
        "request_metrics",
        ["request_id"],
        ["request_id"],
        source_schema="webhook",
        referent_schema="webhook",
        ondelete="SET NULL"
    )


def downgrade() -> None:
    """Remove foreign key constraints."""
    # Drop FK first
    op.drop_constraint(
        "fk_operation_metrics_request_id",
        "operation_metrics",
        schema="webhook",
        type_="foreignkey"
    )

    # Then drop unique constraint
    op.drop_constraint(
        "uq_request_metrics_request_id",
        "request_metrics",
        schema="webhook",
        type_="unique"
    )
