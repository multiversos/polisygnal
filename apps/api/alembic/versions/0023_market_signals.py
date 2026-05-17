"""market signals

Revision ID: 0023_market_signals
Revises: 0022_wallet_analysis_base
Create Date: 2026-05-17 18:45:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0023_market_signals"
down_revision = "0022_wallet_analysis_base"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "polysignal_market_signals",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("job_id", sa.String(length=36), nullable=True),
        sa.Column("source_url", sa.String(length=512), nullable=True),
        sa.Column("market_slug", sa.String(length=256), nullable=True),
        sa.Column("event_slug", sa.String(length=256), nullable=True),
        sa.Column("condition_id", sa.String(length=180), nullable=True),
        sa.Column("market_title", sa.Text(), nullable=True),
        sa.Column("outcomes_json", sa.JSON(), nullable=True),
        sa.Column("token_ids_json", sa.JSON(), nullable=True),
        sa.Column("predicted_side", sa.String(length=160), nullable=True),
        sa.Column("predicted_outcome", sa.String(length=160), nullable=True),
        sa.Column("polysignal_score", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("confidence", sa.String(length=16), server_default="low", nullable=False),
        sa.Column("yes_score", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("no_score", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("outcome_scores_json", sa.JSON(), nullable=True),
        sa.Column("wallets_analyzed", sa.Integer(), nullable=True),
        sa.Column("wallets_with_sufficient_history", sa.Integer(), nullable=True),
        sa.Column("top_wallets_json", sa.JSON(), nullable=True),
        sa.Column("warnings_json", sa.JSON(), nullable=True),
        sa.Column("signal_status", sa.String(length=32), server_default="pending_resolution", nullable=False),
        sa.Column("final_outcome", sa.String(length=160), nullable=True),
        sa.Column("final_resolution_source", sa.String(length=160), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("confidence in ('low', 'medium', 'high')", name="ck_polysignal_market_signals_confidence"),
        sa.CheckConstraint(
            "signal_status in ('pending_resolution', 'resolved_hit', 'resolved_miss', 'cancelled', 'unknown', 'no_clear_signal')",
            name="ck_polysignal_market_signals_status",
        ),
        sa.ForeignKeyConstraint(["job_id"], ["wallet_analysis_jobs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_polysignal_market_signals_condition_id", "polysignal_market_signals", ["condition_id"])
    op.create_index("ix_polysignal_market_signals_created_at", "polysignal_market_signals", ["created_at"])
    op.create_index("ix_polysignal_market_signals_job_id", "polysignal_market_signals", ["job_id"])
    op.create_index("ix_polysignal_market_signals_market_slug", "polysignal_market_signals", ["market_slug"])
    op.create_index("ix_polysignal_market_signals_signal_status", "polysignal_market_signals", ["signal_status"])


def downgrade() -> None:
    op.drop_index("ix_polysignal_market_signals_signal_status", table_name="polysignal_market_signals")
    op.drop_index("ix_polysignal_market_signals_market_slug", table_name="polysignal_market_signals")
    op.drop_index("ix_polysignal_market_signals_job_id", table_name="polysignal_market_signals")
    op.drop_index("ix_polysignal_market_signals_created_at", table_name="polysignal_market_signals")
    op.drop_index("ix_polysignal_market_signals_condition_id", table_name="polysignal_market_signals")
    op.drop_table("polysignal_market_signals")
