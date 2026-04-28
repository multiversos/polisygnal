"""Expand manual market outcome states for backtesting."""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "0012_outcome_states"
down_revision = "0011_market_tags"
branch_labels = None
depends_on = None


NEW_OUTCOME_CHECK = "resolved_outcome IN ('yes', 'no', 'cancelled', 'invalid', 'unknown')"
OLD_OUTCOME_CHECK = "resolved_outcome IN ('yes', 'no', 'cancelled')"


def upgrade() -> None:
    with op.batch_alter_table("market_outcomes") as batch_op:
        batch_op.drop_constraint(
            "ck_market_outcomes_resolved_outcome",
            type_="check",
        )
        batch_op.create_check_constraint(
            "ck_market_outcomes_resolved_outcome",
            NEW_OUTCOME_CHECK,
        )


def downgrade() -> None:
    op.execute(
        "UPDATE market_outcomes "
        "SET resolved_outcome = 'cancelled' "
        "WHERE resolved_outcome IN ('invalid', 'unknown')"
    )
    with op.batch_alter_table("market_outcomes") as batch_op:
        batch_op.drop_constraint(
            "ck_market_outcomes_resolved_outcome",
            type_="check",
        )
        batch_op.create_check_constraint(
            "ck_market_outcomes_resolved_outcome",
            OLD_OUTCOME_CHECK,
        )
