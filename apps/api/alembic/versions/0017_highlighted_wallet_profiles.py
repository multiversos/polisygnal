"""add highlighted wallet profiles

Revision ID: 0017_highlighted_wallet_profiles
Revises: 0016_add_polymarket_identifiers
Create Date: 2026-05-14 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0017_highlighted_wallet_profiles"
down_revision = "0016_add_polymarket_identifiers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "highlighted_wallet_profiles",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("wallet_address", sa.String(length=42), nullable=False),
        sa.Column("short_address", sa.String(length=32), nullable=True),
        sa.Column("profile_url", sa.String(length=512), nullable=True),
        sa.Column("pseudonym", sa.String(length=120), nullable=True),
        sa.Column("public_name", sa.String(length=120), nullable=True),
        sa.Column("profile_image_url", sa.String(length=1024), nullable=True),
        sa.Column("x_username", sa.String(length=120), nullable=True),
        sa.Column("verified_badge", sa.Boolean(), nullable=True),
        sa.Column("win_rate", sa.Numeric(8, 6), nullable=True),
        sa.Column("closed_markets", sa.Integer(), nullable=True),
        sa.Column("wins", sa.Integer(), nullable=True),
        sa.Column("losses", sa.Integer(), nullable=True),
        sa.Column("realized_pnl", sa.Numeric(18, 6), nullable=True),
        sa.Column("unrealized_pnl", sa.Numeric(18, 6), nullable=True),
        sa.Column("observed_capital_usd", sa.Numeric(18, 6), nullable=True),
        sa.Column("qualifies", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("qualification_reason", sa.Text(), nullable=True),
        sa.Column("no_longer_qualifies", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("source", sa.String(length=120), server_default="wallet_intelligence", nullable=False),
        sa.Column("source_market_title", sa.String(length=256), nullable=True),
        sa.Column("source_market_slug", sa.String(length=256), nullable=True),
        sa.Column("source_market_url", sa.String(length=512), nullable=True),
        sa.Column("source_sport", sa.String(length=64), nullable=True),
        sa.Column("market_history", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("warnings", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("limitations", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("first_detected_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_refreshed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("wallet_address ~ '^0x[a-f0-9]{40}$'", name="ck_highlighted_wallet_profiles_wallet"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("wallet_address", name="uq_highlighted_wallet_profiles_wallet_address"),
    )
    op.create_index("ix_highlighted_wallet_profiles_wallet_address", "highlighted_wallet_profiles", ["wallet_address"])
    op.create_index("ix_highlighted_wallet_profiles_qualifies", "highlighted_wallet_profiles", ["qualifies"])
    op.create_index("ix_highlighted_wallet_profiles_win_rate", "highlighted_wallet_profiles", ["win_rate"])
    op.create_index("ix_highlighted_wallet_profiles_closed_markets", "highlighted_wallet_profiles", ["closed_markets"])
    op.create_index("ix_highlighted_wallet_profiles_last_seen_at", "highlighted_wallet_profiles", ["last_seen_at"])
    op.create_index(
        "ix_highlighted_wallet_profiles_observed_capital_usd",
        "highlighted_wallet_profiles",
        ["observed_capital_usd"],
    )


def downgrade() -> None:
    op.drop_index("ix_highlighted_wallet_profiles_observed_capital_usd", table_name="highlighted_wallet_profiles")
    op.drop_index("ix_highlighted_wallet_profiles_last_seen_at", table_name="highlighted_wallet_profiles")
    op.drop_index("ix_highlighted_wallet_profiles_closed_markets", table_name="highlighted_wallet_profiles")
    op.drop_index("ix_highlighted_wallet_profiles_win_rate", table_name="highlighted_wallet_profiles")
    op.drop_index("ix_highlighted_wallet_profiles_qualifies", table_name="highlighted_wallet_profiles")
    op.drop_index("ix_highlighted_wallet_profiles_wallet_address", table_name="highlighted_wallet_profiles")
    op.drop_table("highlighted_wallet_profiles")
