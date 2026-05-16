"""copy trading demo position resolution

Revision ID: 0020_copy_trading_demo_settle
Revises: 0019_copy_trading_demo_positions
Create Date: 2026-05-16 16:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0020_copy_trading_demo_settle"
down_revision = "0019_copy_trading_demo_positions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "copy_demo_positions",
        sa.Column("resolution_source", sa.String(length=64), nullable=True),
    )
    op.drop_constraint("ck_copy_demo_positions_status", "copy_demo_positions", type_="check")
    op.create_check_constraint(
        "ck_copy_demo_positions_status",
        "copy_demo_positions",
        "status in ('open', 'waiting_resolution', 'unknown_resolution', 'closed', 'cancelled')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_copy_demo_positions_status", "copy_demo_positions", type_="check")
    op.create_check_constraint(
        "ck_copy_demo_positions_status",
        "copy_demo_positions",
        "status in ('open', 'closed')",
    )
    op.drop_column("copy_demo_positions", "resolution_source")
