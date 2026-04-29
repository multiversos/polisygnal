"""Add manual market decision logs."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0013_decision_logs"
down_revision = "0012_outcome_states"
branch_labels = None
depends_on = None


DECISION_CHECK = (
    "decision IN ("
    "'monitor', "
    "'investigate_more', "
    "'ignore', "
    "'possible_opportunity', "
    "'dismissed', "
    "'waiting_for_data'"
    ")"
)

CONFIDENCE_CHECK = "confidence_label IS NULL OR confidence_label IN ('low', 'medium', 'high')"


def upgrade() -> None:
    op.create_table(
        "market_decision_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "market_id",
            sa.Integer(),
            sa.ForeignKey("markets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("decision", sa.String(length=40), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("confidence_label", sa.String(length=20), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(DECISION_CHECK, name="ck_market_decision_logs_decision"),
        sa.CheckConstraint(
            CONFIDENCE_CHECK,
            name="ck_market_decision_logs_confidence_label",
        ),
    )
    op.create_index(
        "ix_market_decision_logs_market_id",
        "market_decision_logs",
        ["market_id"],
    )
    op.create_index(
        "ix_market_decision_logs_created_at",
        "market_decision_logs",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_market_decision_logs_created_at", table_name="market_decision_logs")
    op.drop_index("ix_market_decision_logs_market_id", table_name="market_decision_logs")
    op.drop_table("market_decision_logs")
