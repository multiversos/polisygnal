"""Add market_outcomes table for manual resolution and evaluation."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0005_market_outcomes"
down_revision = "0004_predictions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "market_outcomes",
        sa.Column("market_id", sa.Integer(), nullable=False),
        sa.Column("resolved_outcome", sa.String(length=16), nullable=False),
        sa.Column(
            "resolution_source",
            sa.String(length=32),
            nullable=False,
            server_default=sa.text("'manual'"),
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "resolved_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint(
            "resolved_outcome IN ('yes', 'no', 'cancelled')",
            name="ck_market_outcomes_resolved_outcome",
        ),
        sa.ForeignKeyConstraint(["market_id"], ["markets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("market_id"),
    )


def downgrade() -> None:
    op.drop_table("market_outcomes")
