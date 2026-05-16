"""copy trading demo positions

Revision ID: 0019_copy_trading_demo_positions
Revises: 0018_copy_trading_wallets
Create Date: 2026-05-15 00:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0019_copy_trading_demo_positions"
down_revision = "0018_copy_trading_wallets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "copy_demo_positions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("wallet_id", sa.String(length=36), nullable=False),
        sa.Column("opening_order_id", sa.String(length=36), nullable=False),
        sa.Column("closing_order_id", sa.String(length=36), nullable=True),
        sa.Column("condition_id", sa.String(length=128), nullable=True),
        sa.Column("asset", sa.String(length=160), nullable=True),
        sa.Column("outcome", sa.String(length=160), nullable=True),
        sa.Column("market_title", sa.Text(), nullable=True),
        sa.Column("market_slug", sa.String(length=320), nullable=True),
        sa.Column("entry_action", sa.String(length=16), nullable=False),
        sa.Column("entry_price", sa.Numeric(18, 8), nullable=False),
        sa.Column("entry_amount_usd", sa.Numeric(12, 2), nullable=False),
        sa.Column("entry_size", sa.Numeric(18, 8), nullable=False),
        sa.Column("exit_price", sa.Numeric(18, 8), nullable=True),
        sa.Column("exit_value_usd", sa.Numeric(12, 2), nullable=True),
        sa.Column("realized_pnl_usd", sa.Numeric(12, 2), nullable=True),
        sa.Column("close_reason", sa.String(length=80), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="open", nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("entry_action in ('buy', 'sell')", name="ck_copy_demo_positions_entry_action"),
        sa.CheckConstraint("status in ('open', 'closed')", name="ck_copy_demo_positions_status"),
        sa.CheckConstraint("entry_amount_usd > 0", name="ck_copy_demo_positions_entry_amount_positive"),
        sa.CheckConstraint("entry_size > 0", name="ck_copy_demo_positions_entry_size_positive"),
        sa.CheckConstraint("entry_price > 0", name="ck_copy_demo_positions_entry_price_positive"),
        sa.CheckConstraint("exit_price is null or exit_price >= 0", name="ck_copy_demo_positions_exit_price_non_negative"),
        sa.CheckConstraint(
            "exit_value_usd is null or exit_value_usd >= 0",
            name="ck_copy_demo_positions_exit_value_non_negative",
        ),
        sa.ForeignKeyConstraint(["wallet_id"], ["copy_wallets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["opening_order_id"], ["copy_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["closing_order_id"], ["copy_orders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_copy_demo_positions_wallet_id", "copy_demo_positions", ["wallet_id"])
    op.create_index("ix_copy_demo_positions_status", "copy_demo_positions", ["status"])
    op.create_index("ix_copy_demo_positions_opened_at", "copy_demo_positions", ["opened_at"])
    op.create_index("ix_copy_demo_positions_closed_at", "copy_demo_positions", ["closed_at"])


def downgrade() -> None:
    op.drop_index("ix_copy_demo_positions_closed_at", table_name="copy_demo_positions")
    op.drop_index("ix_copy_demo_positions_opened_at", table_name="copy_demo_positions")
    op.drop_index("ix_copy_demo_positions_status", table_name="copy_demo_positions")
    op.drop_index("ix_copy_demo_positions_wallet_id", table_name="copy_demo_positions")
    op.drop_table("copy_demo_positions")
