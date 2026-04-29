"""Add controlled refresh run audit trail."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0014_refresh_runs"
down_revision = "0013_decision_logs"
branch_labels = None
depends_on = None


REFRESH_TYPE_CHECK = "refresh_type IN ('snapshot', 'metadata')"
MODE_CHECK = "mode IN ('dry_run', 'apply')"
STATUS_CHECK = "status IN ('success', 'partial', 'failed')"


def upgrade() -> None:
    op.create_table(
        "refresh_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("refresh_type", sa.String(length=32), nullable=False),
        sa.Column("mode", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("markets_checked", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("markets_updated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("errors_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("summary_json", sa.JSON(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(REFRESH_TYPE_CHECK, name="ck_refresh_runs_refresh_type"),
        sa.CheckConstraint(MODE_CHECK, name="ck_refresh_runs_mode"),
        sa.CheckConstraint(STATUS_CHECK, name="ck_refresh_runs_status"),
    )
    op.create_index("ix_refresh_runs_refresh_type", "refresh_runs", ["refresh_type"])
    op.create_index("ix_refresh_runs_mode", "refresh_runs", ["mode"])
    op.create_index("ix_refresh_runs_status", "refresh_runs", ["status"])
    op.create_index("ix_refresh_runs_started_at", "refresh_runs", ["started_at"])


def downgrade() -> None:
    op.drop_index("ix_refresh_runs_started_at", table_name="refresh_runs")
    op.drop_index("ix_refresh_runs_status", table_name="refresh_runs")
    op.drop_index("ix_refresh_runs_mode", table_name="refresh_runs")
    op.drop_index("ix_refresh_runs_refresh_type", table_name="refresh_runs")
    op.drop_table("refresh_runs")
