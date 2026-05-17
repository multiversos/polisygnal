"""copy worker state

Revision ID: 0021_copy_worker_state
Revises: 0020_copy_trading_demo_settle
Create Date: 2026-05-17 00:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0021_copy_worker_state"
down_revision = "0020_copy_trading_demo_settle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "copy_worker_state",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("owner_id", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), server_default="idle", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stopped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_loop_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_loop_finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("last_result_json", sa.JSON(), nullable=True),
        sa.Column("consecutive_errors", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status in ('idle', 'running', 'stopped', 'error')",
            name="ck_copy_worker_state_status",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_copy_worker_state_status", "copy_worker_state", ["status"])
    op.create_index("ix_copy_worker_state_updated_at", "copy_worker_state", ["updated_at"])


def downgrade() -> None:
    op.drop_index("ix_copy_worker_state_updated_at", table_name="copy_worker_state")
    op.drop_index("ix_copy_worker_state_status", table_name="copy_worker_state")
    op.drop_table("copy_worker_state")
