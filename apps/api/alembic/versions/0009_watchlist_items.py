"""Add manual watchlist items."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0009_watchlist_items"
down_revision = "0008_external_market_signals"
branch_labels = None
depends_on = None

WATCHLIST_STATUSES = ("watching", "investigating", "reviewed", "dismissed")


def upgrade() -> None:
    op.create_table(
        "watchlist_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "market_id",
            sa.Integer(),
            sa.ForeignKey("markets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(length=32),
            server_default="watching",
            nullable=False,
        ),
        sa.Column("note", sa.Text(), nullable=True),
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
        sa.CheckConstraint(
            "status in ('watching', 'investigating', 'reviewed', 'dismissed')",
            name="ck_watchlist_items_status",
        ),
        sa.UniqueConstraint("market_id", name="uq_watchlist_items_market_id"),
    )
    op.create_index("ix_watchlist_items_market_id", "watchlist_items", ["market_id"])
    op.create_index("ix_watchlist_items_status", "watchlist_items", ["status"])
    op.create_index("ix_watchlist_items_created_at", "watchlist_items", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_watchlist_items_created_at", table_name="watchlist_items")
    op.drop_index("ix_watchlist_items_status", table_name="watchlist_items")
    op.drop_index("ix_watchlist_items_market_id", table_name="watchlist_items")
    op.drop_table("watchlist_items")
