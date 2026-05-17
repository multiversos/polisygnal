"""wallet analysis base

Revision ID: 0022_wallet_analysis_base
Revises: 0021_copy_worker_state
Create Date: 2026-05-17 18:10:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0022_wallet_analysis_base"
down_revision = "0021_copy_worker_state"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wallet_profiles",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("wallet_address", sa.String(length=42), nullable=False),
        sa.Column("alias", sa.String(length=160), nullable=True),
        sa.Column("status", sa.String(length=24), server_default="candidate", nullable=False),
        sa.Column("score", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("confidence", sa.String(length=16), server_default="low", nullable=False),
        sa.Column("roi_30d_status", sa.String(length=16), server_default="unavailable", nullable=False),
        sa.Column("roi_30d_value", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("win_rate_30d_status", sa.String(length=16), server_default="unavailable", nullable=False),
        sa.Column("win_rate_30d_value", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("pnl_30d_status", sa.String(length=16), server_default="unavailable", nullable=False),
        sa.Column("pnl_30d_value", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("trades_30d", sa.Integer(), nullable=True),
        sa.Column("volume_30d", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("drawdown_30d_status", sa.String(length=16), server_default="unavailable", nullable=False),
        sa.Column("drawdown_30d_value", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("markets_traded_30d", sa.Integer(), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("discovered_from_market", sa.String(length=320), nullable=True),
        sa.Column("discovered_from_url", sa.String(length=512), nullable=True),
        sa.Column("discovered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reasons_json", sa.JSON(), nullable=True),
        sa.Column("risks_json", sa.JSON(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status in ('candidate', 'watching', 'demo_follow', 'paused', 'rejected')",
            name="ck_wallet_profiles_status",
        ),
        sa.CheckConstraint("confidence in ('low', 'medium', 'high')", name="ck_wallet_profiles_confidence"),
        sa.CheckConstraint(
            "roi_30d_status in ('verified', 'estimated', 'unavailable')",
            name="ck_wallet_profiles_roi_status",
        ),
        sa.CheckConstraint(
            "win_rate_30d_status in ('verified', 'estimated', 'unavailable')",
            name="ck_wallet_profiles_win_rate_status",
        ),
        sa.CheckConstraint(
            "pnl_30d_status in ('verified', 'estimated', 'unavailable')",
            name="ck_wallet_profiles_pnl_status",
        ),
        sa.CheckConstraint(
            "drawdown_30d_status in ('verified', 'estimated', 'unavailable')",
            name="ck_wallet_profiles_drawdown_status",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("wallet_address"),
    )
    op.create_index("ix_wallet_profiles_wallet_address", "wallet_profiles", ["wallet_address"])
    op.create_index("ix_wallet_profiles_score", "wallet_profiles", ["score"])
    op.create_index("ix_wallet_profiles_status", "wallet_profiles", ["status"])
    op.create_index("ix_wallet_profiles_updated_at", "wallet_profiles", ["updated_at"])

    op.create_table(
        "wallet_analysis_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source_url", sa.String(length=512), nullable=False),
        sa.Column("normalized_url", sa.String(length=512), nullable=False),
        sa.Column("market_slug", sa.String(length=256), nullable=True),
        sa.Column("event_slug", sa.String(length=256), nullable=True),
        sa.Column("condition_id", sa.String(length=180), nullable=True),
        sa.Column("market_title", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), server_default="pending", nullable=False),
        sa.Column("outcomes_json", sa.JSON(), nullable=True),
        sa.Column("token_ids_json", sa.JSON(), nullable=True),
        sa.Column("wallets_found", sa.Integer(), server_default="0", nullable=False),
        sa.Column("wallets_analyzed", sa.Integer(), server_default="0", nullable=False),
        sa.Column("wallets_with_sufficient_history", sa.Integer(), server_default="0", nullable=False),
        sa.Column("yes_wallets", sa.Integer(), server_default="0", nullable=False),
        sa.Column("no_wallets", sa.Integer(), server_default="0", nullable=False),
        sa.Column("current_batch", sa.Integer(), server_default="0", nullable=False),
        sa.Column("result_json", sa.JSON(), nullable=True),
        sa.Column("warnings_json", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status in ('pending', 'resolving_market', 'discovering_wallets', 'analyzing_wallets', 'scoring', 'completed', 'partial', 'failed', 'cancelled')",
            name="ck_wallet_analysis_jobs_status",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wallet_analysis_jobs_created_at", "wallet_analysis_jobs", ["created_at"])
    op.create_index("ix_wallet_analysis_jobs_market_slug", "wallet_analysis_jobs", ["market_slug"])
    op.create_index("ix_wallet_analysis_jobs_status", "wallet_analysis_jobs", ["status"])

    op.create_table(
        "wallet_analysis_candidates",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("job_id", sa.String(length=36), nullable=False),
        sa.Column("wallet_address", sa.String(length=42), nullable=False),
        sa.Column("outcome", sa.String(length=160), nullable=True),
        sa.Column("side", sa.String(length=160), nullable=True),
        sa.Column("token_id", sa.String(length=180), nullable=True),
        sa.Column("observed_market_position_usd", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("score", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("confidence", sa.String(length=16), server_default="low", nullable=False),
        sa.Column("roi_30d_status", sa.String(length=16), server_default="unavailable", nullable=False),
        sa.Column("roi_30d_value", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("win_rate_30d_status", sa.String(length=16), server_default="unavailable", nullable=False),
        sa.Column("win_rate_30d_value", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("pnl_30d_status", sa.String(length=16), server_default="unavailable", nullable=False),
        sa.Column("pnl_30d_value", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("trades_30d", sa.Integer(), nullable=True),
        sa.Column("volume_30d", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("markets_traded_30d", sa.Integer(), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reasons_json", sa.JSON(), nullable=True),
        sa.Column("risks_json", sa.JSON(), nullable=True),
        sa.Column("raw_summary_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("confidence in ('low', 'medium', 'high')", name="ck_wallet_analysis_candidates_confidence"),
        sa.CheckConstraint(
            "roi_30d_status in ('verified', 'estimated', 'unavailable')",
            name="ck_wallet_analysis_candidates_roi_status",
        ),
        sa.CheckConstraint(
            "win_rate_30d_status in ('verified', 'estimated', 'unavailable')",
            name="ck_wallet_analysis_candidates_win_rate_status",
        ),
        sa.CheckConstraint(
            "pnl_30d_status in ('verified', 'estimated', 'unavailable')",
            name="ck_wallet_analysis_candidates_pnl_status",
        ),
        sa.ForeignKeyConstraint(["job_id"], ["wallet_analysis_jobs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("job_id", "wallet_address", "token_id", name="uq_wallet_analysis_candidates_job_wallet_token"),
    )
    op.create_index("ix_wallet_analysis_candidates_job_id", "wallet_analysis_candidates", ["job_id"])
    op.create_index("ix_wallet_analysis_candidates_outcome", "wallet_analysis_candidates", ["outcome"])
    op.create_index("ix_wallet_analysis_candidates_side", "wallet_analysis_candidates", ["side"])
    op.create_index("ix_wallet_analysis_candidates_wallet_address", "wallet_analysis_candidates", ["wallet_address"])


def downgrade() -> None:
    op.drop_index("ix_wallet_analysis_candidates_wallet_address", table_name="wallet_analysis_candidates")
    op.drop_index("ix_wallet_analysis_candidates_side", table_name="wallet_analysis_candidates")
    op.drop_index("ix_wallet_analysis_candidates_outcome", table_name="wallet_analysis_candidates")
    op.drop_index("ix_wallet_analysis_candidates_job_id", table_name="wallet_analysis_candidates")
    op.drop_table("wallet_analysis_candidates")

    op.drop_index("ix_wallet_analysis_jobs_status", table_name="wallet_analysis_jobs")
    op.drop_index("ix_wallet_analysis_jobs_market_slug", table_name="wallet_analysis_jobs")
    op.drop_index("ix_wallet_analysis_jobs_created_at", table_name="wallet_analysis_jobs")
    op.drop_table("wallet_analysis_jobs")

    op.drop_index("ix_wallet_profiles_updated_at", table_name="wallet_profiles")
    op.drop_index("ix_wallet_profiles_status", table_name="wallet_profiles")
    op.drop_index("ix_wallet_profiles_score", table_name="wallet_profiles")
    op.drop_index("ix_wallet_profiles_wallet_address", table_name="wallet_profiles")
    op.drop_table("wallet_profiles")
