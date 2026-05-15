"""copy trading wallets

Revision ID: 0018_copy_trading_wallets
Revises: 0017_highlighted_wallet_profiles
Create Date: 2026-05-15 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0018_copy_trading_wallets"
down_revision = "0017_highlighted_wallet_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "copy_wallets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("label", sa.String(length=160), nullable=True),
        sa.Column("profile_url", sa.String(length=1024), nullable=True),
        sa.Column("proxy_wallet", sa.String(length=42), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("mode", sa.String(length=16), server_default="demo", nullable=False),
        sa.Column("real_trading_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("copy_buys", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("copy_sells", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("copy_amount_mode", sa.String(length=16), server_default="preset", nullable=False),
        sa.Column("copy_amount_usd", sa.Numeric(12, 2), server_default="5", nullable=False),
        sa.Column("max_trade_usd", sa.Numeric(12, 2), server_default="20", nullable=True),
        sa.Column("max_daily_usd", sa.Numeric(12, 2), server_default="100", nullable=True),
        sa.Column("max_slippage_bps", sa.Integer(), server_default="300", nullable=True),
        sa.Column("max_delay_seconds", sa.Integer(), server_default="10", nullable=True),
        sa.Column("sports_only", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("last_scan_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_trade_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("mode in ('demo', 'real')", name="ck_copy_wallets_mode"),
        sa.CheckConstraint(
            "copy_amount_mode in ('preset', 'custom')",
            name="ck_copy_wallets_copy_amount_mode",
        ),
        sa.CheckConstraint("copy_amount_usd > 0", name="ck_copy_wallets_copy_amount_positive"),
        sa.CheckConstraint("max_trade_usd is null or max_trade_usd > 0", name="ck_copy_wallets_max_trade_positive"),
        sa.CheckConstraint("max_daily_usd is null or max_daily_usd > 0", name="ck_copy_wallets_max_daily_positive"),
        sa.CheckConstraint(
            "max_slippage_bps is null or max_slippage_bps >= 0",
            name="ck_copy_wallets_max_slippage_non_negative",
        ),
        sa.CheckConstraint(
            "max_delay_seconds is null or max_delay_seconds >= 0",
            name="ck_copy_wallets_max_delay_non_negative",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("proxy_wallet", name="uq_copy_wallets_proxy_wallet"),
    )
    op.create_index("ix_copy_wallets_created_at", "copy_wallets", ["created_at"])
    op.create_index("ix_copy_wallets_mode", "copy_wallets", ["mode"])
    op.create_index("ix_copy_wallets_proxy_wallet", "copy_wallets", ["proxy_wallet"])

    op.create_table(
        "copy_detected_trades",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("wallet_id", sa.String(length=36), nullable=False),
        sa.Column("source_transaction_hash", sa.String(length=160), nullable=True),
        sa.Column("dedupe_key", sa.String(length=320), nullable=False),
        sa.Column("source_proxy_wallet", sa.String(length=42), nullable=False),
        sa.Column("condition_id", sa.String(length=128), nullable=True),
        sa.Column("asset", sa.String(length=160), nullable=True),
        sa.Column("outcome", sa.String(length=160), nullable=True),
        sa.Column("market_title", sa.Text(), nullable=True),
        sa.Column("market_slug", sa.String(length=320), nullable=True),
        sa.Column("side", sa.String(length=16), nullable=False),
        sa.Column("source_price", sa.Numeric(18, 8), nullable=True),
        sa.Column("source_size", sa.Numeric(18, 8), nullable=True),
        sa.Column("source_amount_usd", sa.Numeric(18, 8), nullable=True),
        sa.Column("source_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("detected_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["wallet_id"], ["copy_wallets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("wallet_id", "dedupe_key", name="uq_copy_detected_trades_wallet_dedupe"),
    )
    op.create_index("ix_copy_detected_trades_detected_at", "copy_detected_trades", ["detected_at"])
    op.create_index("ix_copy_detected_trades_wallet_id", "copy_detected_trades", ["wallet_id"])

    op.create_table(
        "copy_orders",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("wallet_id", sa.String(length=36), nullable=False),
        sa.Column("detected_trade_id", sa.String(length=36), nullable=True),
        sa.Column("mode", sa.String(length=16), nullable=False),
        sa.Column("action", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("reason", sa.String(length=160), nullable=True),
        sa.Column("intended_amount_usd", sa.Numeric(12, 2), nullable=True),
        sa.Column("intended_size", sa.Numeric(18, 8), nullable=True),
        sa.Column("limit_price", sa.Numeric(18, 8), nullable=True),
        sa.Column("simulated_price", sa.Numeric(18, 8), nullable=True),
        sa.Column("filled_price", sa.Numeric(18, 8), nullable=True),
        sa.Column("filled_size", sa.Numeric(18, 8), nullable=True),
        sa.Column("polymarket_order_id", sa.String(length=160), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("mode in ('demo', 'real')", name="ck_copy_orders_mode"),
        sa.CheckConstraint("action in ('buy', 'sell')", name="ck_copy_orders_action"),
        sa.CheckConstraint(
            "status in ('pending', 'simulated', 'skipped', 'blocked', 'submitted', 'filled', 'partial_failed', 'failed')",
            name="ck_copy_orders_status",
        ),
        sa.ForeignKeyConstraint(["detected_trade_id"], ["copy_detected_trades.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["wallet_id"], ["copy_wallets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_copy_orders_created_at", "copy_orders", ["created_at"])
    op.create_index("ix_copy_orders_status", "copy_orders", ["status"])
    op.create_index("ix_copy_orders_wallet_id", "copy_orders", ["wallet_id"])

    op.create_table(
        "copy_bot_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("wallet_id", sa.String(length=36), nullable=True),
        sa.Column("level", sa.String(length=16), nullable=False),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("level in ('info', 'warning', 'error')", name="ck_copy_bot_events_level"),
        sa.ForeignKeyConstraint(["wallet_id"], ["copy_wallets.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_copy_bot_events_created_at", "copy_bot_events", ["created_at"])
    op.create_index("ix_copy_bot_events_wallet_id", "copy_bot_events", ["wallet_id"])


def downgrade() -> None:
    op.drop_index("ix_copy_bot_events_wallet_id", table_name="copy_bot_events")
    op.drop_index("ix_copy_bot_events_created_at", table_name="copy_bot_events")
    op.drop_table("copy_bot_events")
    op.drop_index("ix_copy_orders_wallet_id", table_name="copy_orders")
    op.drop_index("ix_copy_orders_status", table_name="copy_orders")
    op.drop_index("ix_copy_orders_created_at", table_name="copy_orders")
    op.drop_table("copy_orders")
    op.drop_index("ix_copy_detected_trades_wallet_id", table_name="copy_detected_trades")
    op.drop_index("ix_copy_detected_trades_detected_at", table_name="copy_detected_trades")
    op.drop_table("copy_detected_trades")
    op.drop_index("ix_copy_wallets_proxy_wallet", table_name="copy_wallets")
    op.drop_index("ix_copy_wallets_mode", table_name="copy_wallets")
    op.drop_index("ix_copy_wallets_created_at", table_name="copy_wallets")
    op.drop_table("copy_wallets")
