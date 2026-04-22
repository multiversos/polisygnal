"""Add predictions table for scoring v1."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0004_predictions"
down_revision = "0003_evidence_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "predictions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("market_id", sa.Integer(), nullable=False),
        sa.Column(
            "run_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("model_version", sa.String(length=64), nullable=False),
        sa.Column("yes_probability", sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column("no_probability", sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column("confidence_score", sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column("edge_signed", sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column("edge_magnitude", sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column("edge_class", sa.String(length=32), nullable=False),
        sa.Column("opportunity", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("review_confidence", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("review_edge", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("explanation_json", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["market_id"], ["markets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_predictions_market_id", "predictions", ["market_id"], unique=False)
    op.create_index("ix_predictions_run_at", "predictions", ["run_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_predictions_run_at", table_name="predictions")
    op.drop_index("ix_predictions_market_id", table_name="predictions")
    op.drop_table("predictions")
